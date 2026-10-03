import { describe, expect, it } from 'vitest';
import {
  SEEK_CUR,
  SEEK_END,
  SEEK_SET,
  VirtualFS,
  type VfsBackend,
  type VfsSnapshot,
} from '@mcpe/platform';

/** 把 Uint8Array 转成普通数组，断言输出好看一点 */
const bytes = (u: Uint8Array): number[] => [...u];

/** 纯内存的假持久层：单测不碰 IndexedDB（B0：单元测试里用纯内存的 VirtualFS） */
class MemoryBackend implements VfsBackend {
  readonly store = new Map<string, Uint8Array>();
  dirs = new Set<string>(['/']);
  readonly removed: string[] = [];

  async loadAll(): Promise<VfsSnapshot> {
    return { files: new Map(this.store), dirs: [...this.dirs] };
  }
  async put(path: string, data: Uint8Array): Promise<void> {
    this.store.set(path, data.slice()); // 拷一份，模拟真正落盘
  }
  async remove(path: string): Promise<void> {
    this.store.delete(path);
    this.removed.push(path);
  }
  async setDirs(dirs: string[]): Promise<void> {
    this.dirs = new Set(dirs);
  }
}

/** 逐级建出 path 的所有祖先目录（mkdir 是单级的，open 又要求父目录存在，所以要一层层来） */
function mkdirp(vfs: VirtualFS, path: string): void {
  const parts = VirtualFS.normalize(path)
    .split('/')
    .filter((s) => s !== '');
  let cur = '';
  for (const p of parts) {
    cur += '/' + p;
    if (!vfs.exists(cur)) vfs.mkdir(cur);
  }
}

/** 建好中间目录、写一个文件的常用套路 */
function vfsWith(path: string, data: number[], mode: 'wb' | 'w+b' = 'wb'): VirtualFS {
  const vfs = new VirtualFS();
  mkdirp(vfs, path.slice(0, path.lastIndexOf('/')));
  const f = vfs.open(path, mode)!;
  f.write(new Uint8Array(data), 1, data.length);
  f.close();
  return vfs;
}

describe('platform/vfs', () => {
  describe('路径与目录', () => {
    it('normalize 合并重复的 /、去掉末尾 /，不解析 . 和 ..', () => {
      expect(VirtualFS.normalize('a/b')).toBe('/a/b');
      expect(VirtualFS.normalize('/a//b///c')).toBe('/a/b/c');
      expect(VirtualFS.normalize('/a/b/')).toBe('/a/b');
      expect(VirtualFS.normalize('/')).toBe('/');
      expect(VirtualFS.normalize('')).toBe('/');
      // 故意不解析：参考源码里没有 . / .. 的用法，真解析反而会掩盖路径拼接错误
      expect(VirtualFS.normalize('/a/../b')).toBe('/a/../b');
    });

    it('区分大小写', () => {
      const vfs = new VirtualFS();
      vfs.mkdir('/W');
      expect(vfs.exists('/W')).toBe(true);
      expect(vfs.exists('/w')).toBe(false);
    });

    it('mkdir 是单级的：父目录不存在就失败（C 的 mkdir 语义）', () => {
      const vfs = new VirtualFS();
      expect(vfs.mkdir('/a')).toBe(true);
      expect(vfs.mkdir('/a/b')).toBe(true);
      expect(vfs.mkdir('/x/y')).toBe(false); // /x 不存在
      expect(vfs.mkdir('/a')).toBe(false); // 已存在
      expect(vfs.mkdir('/')).toBe(false);
    });

    it('exists 对文件和空目录都成立', () => {
      const vfs = vfsWith('/w/a.dat', [1]);
      vfs.mkdir('/w/empty');
      expect(vfs.exists('/w/a.dat')).toBe(true);
      expect(vfs.exists('/w/empty')).toBe(true); // 空目录也算存在
      expect(vfs.exists('/w/nope')).toBe(false);
      expect(vfs.isDirectory('/w/empty')).toBe(true);
      expect(vfs.isDirectory('/w/a.dat')).toBe(false);
    });

    it('listDir 只列直接子项的名字，且排序（C++ 的 readdir 顺序未定义，这里定死以便复现）', () => {
      const vfs = vfsWith('/w/b.dat', [1]);
      const f = vfs.open('/w/a.dat', 'wb')!;
      f.close();
      vfs.mkdir('/w/sub');
      expect(vfs.listDir('/w')).toEqual(['a.dat', 'b.dat', 'sub']);
      expect(vfs.listDir('/')).toEqual(['w']);
      expect(vfs.listDir('/nope')).toEqual([]);
    });

    it('remove 删文件可以，删非空目录失败（ENOTEMPTY）', () => {
      const vfs = vfsWith('/w/a.dat', [1]);
      vfs.mkdir('/w/empty');
      expect(vfs.remove('/w/empty')).toBe(true);
      expect(vfs.exists('/w/empty')).toBe(false);
      expect(vfs.remove('/w')).toBe(false); // 还有 a.dat
      expect(vfs.remove('/w/a.dat')).toBe(true);
      expect(vfs.remove('/w')).toBe(true);
      expect(vfs.remove('/nope')).toBe(false);
      expect(vfs.remove('/')).toBe(false);
    });

    it('deleteDirectory 照抄 C++ 的怪癖：它不是真递归，遇到子目录会失败', () => {
      // 参考实现（src/platform/file.h）对目录里每一项调 remove()，而 remove() 删不掉非空目录。
      // 所以世界目录里还有 region/ 这种带文件的子目录时，这一步失败、调用方走兜底分支。
      // 改成真递归会让兜底分支永远不执行，与原版不一致 —— 这条测试就是把该行为钉住。
      const vfs = vfsWith('/w/level.dat', [1]);
      vfs.mkdir('/w/region');
      const f = vfs.open('/w/region/r.0.0.mcr', 'wb')!;
      f.close();
      expect(vfs.deleteDirectory('/w')).toBe(false); // region/ 非空，删不掉
      expect(vfs.exists('/w/region/r.0.0.mcr')).toBe(true);
      expect(vfs.exists('/w/level.dat')).toBe(false); // 平级的文件还是被删了
    });
  });

  describe('重命名', () => {
    it('重命名文件；目标已存在时覆盖（「写临时文件再改名」依赖这一点）', () => {
      const vfs = vfsWith('/w/old.dat', [1, 2, 3]);
      const f = vfs.open('/w/new.dat', 'wb')!;
      f.write(new Uint8Array([9]), 1, 1);
      f.close();

      expect(vfs.rename('/w/old.dat', '/w/new.dat')).toBe(true);
      expect(vfs.exists('/w/old.dat')).toBe(false);
      const r = vfs.open('/w/new.dat', 'rb')!;
      const buf = new Uint8Array(8);
      expect(r.read(buf, 1, 8)).toBe(3);
      expect(bytes(buf.subarray(0, 3))).toEqual([1, 2, 3]); // 覆盖成功，不是旧的 [9]
      r.close();
    });

    it('重命名整个目录子树（ExternalFileLevelStorageSource 改世界名就靠这个）', () => {
      const vfs = vfsWith('/games/w1/level.dat', [7]);
      vfs.mkdir('/games/w1/region');
      const f = vfs.open('/games/w1/region/r.mcr', 'wb')!;
      f.write(new Uint8Array([1, 2]), 1, 2);
      f.close();

      expect(vfs.rename('/games/w1', '/games/w2')).toBe(true);
      expect(vfs.exists('/games/w1')).toBe(false);
      expect(vfs.exists('/games/w2/region/r.mcr')).toBe(true);
      const r = vfs.open('/games/w2/region/r.mcr', 'rb')!;
      const buf = new Uint8Array(2);
      expect(r.read(buf, 1, 2)).toBe(2);
      expect(bytes(buf)).toEqual([1, 2]);
      r.close();
    });

    it('不许把目录搬进它自己的子目录（否则整棵子树凭空消失）', () => {
      const vfs = new VirtualFS();
      vfs.mkdir('/a');
      vfs.mkdir('/a/b');
      expect(vfs.rename('/a', '/a/b/c')).toBe(false);
      expect(vfs.exists('/a/b')).toBe(true);
    });

    it('目标父目录不存在时失败', () => {
      const vfs = vfsWith('/w/a.dat', [1]);
      expect(vfs.rename('/w/a.dat', '/nope/a.dat')).toBe(false);
      expect(vfs.exists('/w/a.dat')).toBe(true);
    });
  });

  describe('CFile 读写：照 C 标准库的语义', () => {
    it('write/read 的基本往返', () => {
      const vfs = vfsWith('/w/a.dat', [1, 2, 3, 4, 5]);
      const f = vfs.open('/w/a.dat', 'rb')!;
      const buf = new Uint8Array(5);
      expect(f.read(buf, 1, 5)).toBe(5);
      expect(bytes(buf)).toEqual([1, 2, 3, 4, 5]);
      expect(f.tell()).toBe(5);
      f.close();
    });

    it('read 返回的是【元素个数】而不是字节数 —— 移植 RegionFile 全靠这个', () => {
      // 参考源码：logAssert(fread(offsets, sizeof(int), SECTOR_INTS, file), SECTOR_INTS);
      // 比的是 SECTOR_INTS，不是 SECTOR_INTS * 4
      const vfs = vfsWith('/w/a.dat', [1, 2, 3, 4, 5, 6, 7, 8]);
      const f = vfs.open('/w/a.dat', 'rb')!;
      const buf = new Uint8Array(8);
      expect(f.read(buf, 4, 2)).toBe(2); // 8 字节 ÷ 每元素 4 字节 = 2 个元素
      f.seek(0, SEEK_SET);
      expect(f.read(buf, 4, 1)).toBe(1); // 读 4 字节 = 1 个元素，不是 4
      expect(f.read(buf, 1, 4)).toBe(4); // size=1 时元素数才等于字节数
      f.close();
    });

    it('能直接读写 Int32Array —— 不要踩 TypedArray.set 的逐元素拷贝陷阱', () => {
      // C++ 里 int offsets[1024] 对应 TS 的 Int32Array。若实现直接 dest.set(src)，
      // 而两者元素宽度不同，TypedArray.set 会按【元素】拷：0x04030201 会被截断成 1。
      // 这里把「4 个 int 的往返」钉住，B3 移植 RegionFile 时全靠它。
      const vfs = new VirtualFS();
      vfs.mkdir('/w');
      const f = vfs.open('/w/a.dat', 'w+b')!;
      const src = new Int32Array([0x04030201, -2, 0x7fffffff, 0]);
      expect(f.write(src, 4, 4)).toBe(4);
      f.close();

      const r = vfs.open('/w/a.dat', 'rb')!;
      const dst = new Int32Array(4);
      expect(r.read(dst, 4, 4)).toBe(4);
      expect([...dst]).toEqual([0x04030201, -2, 0x7fffffff, 0]);
      r.close();

      // 取数组元素地址（等价于 C 的 &arr[i]）：零拷贝的字节视图
      const r2 = vfs.open('/w/a.dat', 'r+b')!;
      r2.seek(4, SEEK_SET);
      r2.write(new Uint8Array(src.buffer, 4, 4), 4, 1); // 把第二项原样写回去
      r2.close();
      const r3 = vfs.open('/w/a.dat', 'rb')!;
      const dst3 = new Int32Array(4);
      r3.read(dst3, 4, 4);
      expect([...dst3]).toEqual([0x04030201, -2, 0x7fffffff, 0]);
      r3.close();
    });

    it('read 读不满一个元素时：字节照样进缓冲区、位置照样前进，但不计入返回值', () => {
      const vfs = vfsWith('/w/a.dat', [10, 20, 30, 40, 50]); // 5 字节
      const f = vfs.open('/w/a.dat', 'rb')!;
      const buf = new Uint8Array(8);
      expect(f.read(buf, 4, 2)).toBe(1); // 只凑出 1 个完整元素
      expect(bytes(buf.subarray(0, 5))).toEqual([10, 20, 30, 40, 50]); // 尾部那 1 字节仍被读出
      expect(f.tell()).toBe(5); // 位置也前进了
      expect(f.read(buf, 4, 2)).toBe(0); // 到底了
      f.close();
    });

    it('seek 越过末尾后再写，中间补 0（C 的稀疏语义）', () => {
      const vfs = vfsWith('/w/a.dat', [1, 2]);
      const f = vfs.open('/w/a.dat', 'r+b')!;
      expect(f.seek(5, SEEK_SET)).toBe(0);
      expect(f.write(new Uint8Array([9]), 1, 1)).toBe(1);
      f.close();

      const r = vfs.open('/w/a.dat', 'rb')!;
      const buf = new Uint8Array(6);
      expect(r.read(buf, 1, 6)).toBe(6);
      expect(bytes(buf)).toEqual([1, 2, 0, 0, 0, 9]); // 中间三个洞补 0
      r.close();
    });

    it('r+b 是覆盖写、不截断；w+b 会先截断', () => {
      const vfs = vfsWith('/w/a.dat', [1, 2, 3, 4]);
      const rw = vfs.open('/w/a.dat', 'r+b')!;
      rw.write(new Uint8Array([9]), 1, 1);
      rw.close();
      const r1 = vfs.open('/w/a.dat', 'rb')!;
      const b1 = new Uint8Array(4);
      expect(r1.read(b1, 1, 4)).toBe(4);
      expect(bytes(b1)).toEqual([9, 2, 3, 4]); // 长度不变，首字节被覆盖
      r1.close();

      const w = vfs.open('/w/a.dat', 'w+b')!;
      w.close();
      const r2 = vfs.open('/w/a.dat', 'rb')!;
      const b2 = new Uint8Array(4);
      expect(r2.read(b2, 1, 4)).toBe(0); // 截断成空
      r2.close();
    });

    it('追加：先 seek 到末尾再写（C 里用 "ab" 的地方，参考源码其实没用过 ab）', () => {
      const vfs = vfsWith('/w/a.dat', [1, 2]);
      const f = vfs.open('/w/a.dat', 'r+b')!;
      f.seek(0, SEEK_END);
      f.write(new Uint8Array([3, 4]), 1, 2);
      f.seek(-1, SEEK_CUR); // 顺手覆盖 SEEK_CUR
      f.write(new Uint8Array([9]), 1, 1);
      f.close();

      const r = vfs.open('/w/a.dat', 'rb')!;
      const buf = new Uint8Array(4);
      expect(r.read(buf, 1, 4)).toBe(4);
      expect(bytes(buf)).toEqual([1, 2, 3, 9]);
      r.close();
    });

    it('open 失败的情形返回 null（对应 C 的 FILE* == NULL）', () => {
      const vfs = vfsWith('/w/a.dat', [1]);
      expect(vfs.open('/w/nope.dat', 'rb')).toBeNull(); // 不存在
      expect(vfs.open('/nope/a.dat', 'wb')).toBeNull(); // 父目录不存在（C 的 ENOENT）
      expect(vfs.open('/w', 'rb')).toBeNull(); // 目录不能当文件打开
      expect(vfs.open('/w/a.dat', 'rb')).not.toBeNull();
    });

    it('只读模式不能写，只写模式不能读（照 C）', () => {
      const vfs = vfsWith('/w/a.dat', [1, 2]);
      const r = vfs.open('/w/a.dat', 'rb')!;
      expect(r.write(new Uint8Array([9]), 1, 1)).toBe(0);
      r.close();

      const w = vfs.open('/w/b.dat', 'wb')!;
      expect(w.read(new Uint8Array(4), 1, 4)).toBe(0);
      w.close();
    });

    it('close 之后的操作安静地失败（C 里是 UB，按 PITFALLS 第 20 条不复刻）', () => {
      const vfs = vfsWith('/w/a.dat', [1, 2]);
      const f = vfs.open('/w/a.dat', 'rb')!;
      f.close();
      expect(f.read(new Uint8Array(2), 1, 2)).toBe(0);
      expect(f.seek(0, SEEK_SET)).toBe(-1);
      expect(f.tell()).toBe(-1);
    });

    it('seek 到负数返回 -1，位置不变', () => {
      const vfs = vfsWith('/w/a.dat', [1, 2]);
      const f = vfs.open('/w/a.dat', 'rb')!;
      f.seek(1, SEEK_SET);
      expect(f.seek(-5, SEEK_SET)).toBe(-1);
      expect(f.tell()).toBe(1);
      expect(f.seek(0, 99)).toBe(-1); // 非法 whence
      f.close();
    });
  });

  describe('与持久层同步', () => {
    it('load 把持久层的文件读进内存，并补齐中间目录', async () => {
      const backend = new MemoryBackend();
      backend.store.set('/games/w1/level.dat', new Uint8Array([1, 2, 3]));

      const vfs = new VirtualFS();
      await vfs.load(backend);
      expect(vfs.exists('/games')).toBe(true); // 中间目录被补齐，否则 exists 会漏
      expect(vfs.exists('/games/w1')).toBe(true);
      expect(vfs.listDir('/games/w1')).toEqual(['level.dat']);
    });

    it('空目录也要活过刷新 —— 目录是单独存的，不能靠文件路径反推', async () => {
      // C++ 建世界时会 createFolderIfNotExists(levelPath + "/players")，没存过档时它就是空的。
      // 如果只把文件落盘，刷新后这个目录会消失，listDir / exists 的结果与原版不一致。
      const backend = new MemoryBackend();
      const vfs1 = new VirtualFS();
      await vfs1.load(backend);
      vfs1.mkdir('/games');
      vfs1.mkdir('/games/w1');
      vfs1.mkdir('/games/w1/players'); // 空目录
      await vfs1.flush();

      const vfs2 = new VirtualFS();
      await vfs2.load(backend);
      expect(vfs2.exists('/games/w1/players')).toBe(true);
      expect(vfs2.isDirectory('/games/w1/players')).toBe(true);
      expect(vfs2.listDir('/games/w1')).toEqual(['players']);
    });

    it('flush 只写变动过的文件', async () => {
      const backend = new MemoryBackend();
      const vfs = new VirtualFS();
      await vfs.load(backend);

      vfs.mkdir('/w');
      const f = vfs.open('/w/a.dat', 'wb')!;
      f.write(new Uint8Array([1, 2]), 1, 2);
      f.close();

      await vfs.flush();
      expect([...backend.store.keys()]).toEqual(['/w/a.dat']);
      expect(bytes(backend.store.get('/w/a.dat')!)).toEqual([1, 2]);

      await vfs.flush(); // 没有新改动时是空操作
      expect([...backend.store.keys()]).toEqual(['/w/a.dat']);
    });

    it('删掉的文件在 flush 时从持久层移除', async () => {
      const backend = new MemoryBackend();
      backend.store.set('/w/a.dat', new Uint8Array([1]));

      const vfs = new VirtualFS();
      await vfs.load(backend);
      expect(vfs.remove('/w/a.dat')).toBe(true);
      await vfs.flush();
      expect(backend.store.has('/w/a.dat')).toBe(false);
      expect(backend.removed).toEqual(['/w/a.dat']);
    });

    it('rename 之后 flush：新路径写进去，旧路径从持久层删掉', async () => {
      const backend = new MemoryBackend();
      backend.store.set('/w/old.dat', new Uint8Array([1, 2]));

      const vfs = new VirtualFS();
      await vfs.load(backend);
      expect(vfs.rename('/w/old.dat', '/w/new.dat')).toBe(true);
      await vfs.flush();
      expect(backend.store.has('/w/old.dat')).toBe(false);
      expect(bytes(backend.store.get('/w/new.dat')!)).toEqual([1, 2]);
    });
  });
});
