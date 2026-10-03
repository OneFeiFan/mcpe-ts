/**
 * 内存虚拟文件系统（ADAPTED(Web)，非移植）。
 *
 * 为什么要它：参考 C++ 用同步的 FILE*（fopen/fread/fwrite/fseek/fclose）读写磁盘，而浏览器没有同步
 * 文件 API（IndexedDB / OPFS 都是异步的）。所以这里在内存里放一张 Map<路径, Uint8Array>，对外提供
 * 同步接口，让存档代码（B3 RegionFile、B5 ExternalFileLevelStorage）能把 FILE* 一一对应地换掉，
 * 不用改写算法结构。落盘由 VfsBackend 负责，是异步的、发生在写入之后的某个时刻。
 * 对应 PITFALLS 第 26 条：C++ 的同步文件读写 → 改成「内存缓存 + 异步落盘」。
 *
 * 与 C 的对应关系（B1 实测参考源码存档目录里的实际用法）：
 *  - 文件模式只用过 rb(5) / wb(2) / r+b(1) / w+b(1)；**ab 一次都没用过，故意不实现**。
 *  - `exists` 对应 `access(name, 0) == 0`，文件或目录都算存在。
 *  - `mkdir` 对应 C 的 mkdir：**单级创建，父目录不存在就失败**（FolderMethods 的 createTree 逐级拼路径，
 *    正是因为这个语义）。C 成功返回 0、失败返回 -1，这里换成 boolean。
 *  - `remove` 对应 C 的 remove：删文件，或删**空**目录；非空目录失败（ENOTEMPTY）。
 *  - `rename` 对应 C 的 rename：**目标文件已存在时会覆盖**（ExternalFileLevelStorage 的
 *    「写临时文件再改名」依赖这一点），目录则不能覆盖已存在的目标。
 *
 * 路径：内部一律用「以 / 开头的绝对路径」做键。normalize 只合并重复的 / 并去掉末尾的 /，
 * **不解析 . 和 ..**（参考源码里没有这种用法，真解析反而会掩盖拼接错误）。区分大小写。
 */
import { CFile, type FsMode } from './CFile.js';

/** 持久层里存着的东西：文件内容 + 目录集合 */
export interface VfsSnapshot {
  files: Map<string, Uint8Array>;
  dirs: string[];
}

/**
 * 持久层。B1b 由 apps/web 的 IndexedDbBackend 实现；单元测试里用内存假实现。
 *
 * 注意 `put` 的实现必须**立刻拷贝或序列化** data，不要保留这个引用 ——
 * 游戏在 await 期间还会继续往这块内存里写。
 */
export interface VfsBackend {
  /** 启动时把所有已存文件与目录读进内存 */
  loadAll(): Promise<VfsSnapshot>;
  /** 单个文件落盘 */
  put(path: string, data: Uint8Array): Promise<void>;
  /** 删除落盘的文件 */
  remove(path: string): Promise<void>;
  /**
   * 目录集合整体同步。目录必须单独存：C++ 会建 `<世界>/players` 这种可能是空的目录，
   * 而 exists() 要对它成立、listDir() 要能列出它 —— 光靠文件路径反推会把空目录弄丢，
   * 刷新之后"新建但没存过盘的世界"行为就变了。目录数量很少，整存最简单也最不容易错。
   */
  setDirs(dirs: string[]): Promise<void>;
}

export class VirtualFS {
  private readonly files = new Map<string, Uint8Array>();
  /** 目录显式记录：空目录的 exists 要成立、mkdir 要检查父目录、rename 要搬整个子树 */
  private readonly dirs = new Set<string>(['/']);
  /** 改动过、还没落盘的文件 */
  private readonly dirty = new Set<string>();
  /** 删掉过、还没从持久层移除的文件 */
  private readonly removed = new Set<string>();
  /** 目录集合变过、还没同步给持久层 */
  private dirsDirty = false;
  private backend: VfsBackend | null = null;
  private autoFlushMs = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- 路径 ----

  /** 合并重复的 /，去掉末尾的 /（根目录除外）；不含前导 / 的按绝对路径补上 */
  static normalize(path: string): string {
    const collapsed = path.replace(/\/+/g, '/');
    const absolute = collapsed.startsWith('/') ? collapsed : '/' + collapsed;
    return absolute.length > 1 && absolute.endsWith('/') ? absolute.slice(0, -1) : absolute;
  }

  /** 上一级目录；"/a" → "/"，"/" → "/" */
  private static parentOf(path: string): string {
    const i = path.lastIndexOf('/');
    return i <= 0 ? '/' : path.slice(0, i);
  }

  /** 把 path 及其所有祖先目录登记进 dirs（load 时用，保证 exists 对中间层级成立） */
  private addAncestors(path: string): void {
    for (let d = VirtualFS.parentOf(path); d !== '/'; d = VirtualFS.parentOf(d)) this.dirs.add(d);
  }

  // ---- 查询 ----

  exists(path: string): boolean {
    const p = VirtualFS.normalize(path);
    return this.files.has(p) || this.dirs.has(p);
  }

  isDirectory(path: string): boolean {
    return this.dirs.has(VirtualFS.normalize(path));
  }

  /** 直接子项的名字（不含路径前缀）。参考 C++ 用的是 readdir，顺序未定义；这里排序，保证可复现。 */
  listDir(path: string): string[] {
    const p = VirtualFS.normalize(path);
    if (!this.dirs.has(p)) return [];
    const prefix = p === '/' ? '/' : p + '/';
    const out = new Set<string>();
    const add = (full: string): void => {
      const rest = full.slice(prefix.length);
      if (rest === '') return;
      const i = rest.indexOf('/');
      out.add(i === -1 ? rest : rest.slice(0, i));
    };
    for (const f of this.files.keys()) if (f.startsWith(prefix)) add(f);
    for (const d of this.dirs) if (d !== '/' && d.startsWith(prefix)) add(d);
    return [...out].sort();
  }

  // ---- 修改 ----

  /** C 的 mkdir：单级创建；父目录不存在、或已存在同名项都失败 */
  mkdir(path: string): boolean {
    const p = VirtualFS.normalize(path);
    if (p === '/' || this.exists(p)) return false;
    if (!this.dirs.has(VirtualFS.parentOf(p))) return false;
    this.dirs.add(p);
    this.dirsDirty = true;
    return true;
  }

  /** C 的 remove：删文件，或删空目录 */
  remove(path: string): boolean {
    const p = VirtualFS.normalize(path);
    if (p === '/') return false;
    if (this.files.has(p)) {
      this.files.delete(p);
      this.dirty.delete(p);
      this.removed.add(p);
      return true;
    }
    if (this.dirs.has(p)) {
      if (this.listDir(p).length > 0) return false; // ENOTEMPTY
      this.dirs.delete(p);
      this.dirsDirty = true;
      return true;
    }
    return false;
  }

  /**
   * 对应 C++ 的 DeleteDirectory（src/platform/file.h）。
   *
   * 【原样保留的怪癖，不要"顺手修好"】参考实现并不是真递归：它对目录里每一项调 remove()，
   * 而 remove() 删不掉非空目录。所以世界目录里若还有 region/ 这种带文件的子目录，这一步会失败，
   * 调用方（ExternalFileLevelStorageSource::deleteLevel）据此走"逐个删 chunks.dat/player.dat/level.dat"
   * 的兜底分支。改成真递归会让兜底分支永远不执行，与原版行为不一致。
   */
  deleteDirectory(path: string): boolean {
    const p = VirtualFS.normalize(path);
    if (!this.dirs.has(p)) return false;
    for (const name of this.listDir(p)) this.remove(p === '/' ? '/' + name : p + '/' + name);
    return this.remove(p);
  }

  /** C 的 rename：文件可覆盖已存在的目标文件；目录不能覆盖已存在的项 */
  rename(from: string, to: string): boolean {
    const a = VirtualFS.normalize(from);
    const b = VirtualFS.normalize(to);
    if (a === b) return true;
    if (a === '/' || b === '/') return false;
    // 把目录搬进它自己的子目录里，会让整棵子树凭空消失
    if (this.dirs.has(a) && b.startsWith(a + '/')) return false;
    if (!this.dirs.has(VirtualFS.parentOf(b))) return false;

    const data = this.files.get(a);
    if (data !== undefined) {
      this.files.delete(a);
      this.dirty.delete(a);
      this.removed.add(a);
      this.files.set(b, data);
      this.dirty.add(b);
      this.removed.delete(b);
      return true;
    }

    if (this.dirs.has(a)) {
      if (this.exists(b)) return false;
      // 先收集再改，避免边遍历边改 Map/Set
      const files: Array<[string, string]> = [];
      for (const f of this.files.keys())
        if (f.startsWith(a + '/')) files.push([f, b + f.slice(a.length)]);
      const dirs: Array<[string, string]> = [];
      for (const d of this.dirs) if (d.startsWith(a + '/')) dirs.push([d, b + d.slice(a.length)]);
      for (const [f, g] of files) {
        const v = this.files.get(f)!;
        this.files.delete(f);
        this.dirty.delete(f);
        this.removed.add(f);
        this.files.set(g, v);
        this.dirty.add(g);
        this.removed.delete(g);
      }
      for (const [d, e] of dirs) {
        this.dirs.delete(d);
        this.dirs.add(e);
      }
      this.dirs.delete(a);
      this.dirs.add(b);
      this.dirsDirty = true;
      return true;
    }
    return false;
  }

  // ---- 文件句柄 ----

  /**
   * 对应 fopen；失败返回 null，让 `if (file == NULL)` 能原样对应成 `if (file === null)`。
   * 父目录不存在同样失败（C 的 ENOENT）——参考源码都先 createFolderIfNotExists 再 fopen，
   * 保留这个检查能在移植时抓出漏掉的建目录。
   */
  open(path: string, mode: FsMode): CFile | null {
    const p = VirtualFS.normalize(path);
    if (!this.dirs.has(VirtualFS.parentOf(p))) return null;
    if (this.dirs.has(p)) return null; // 目录不能当文件打开
    if (mode !== 'w' && mode !== 'wb' && mode !== 'w+b' && !this.files.has(p)) return null;
    if (mode === 'w' || mode === 'wb' || mode === 'w+b') {
      this.files.set(p, new Uint8Array(0));
      this.markDirty(p);
    }
    return new CFile(this, p, mode);
  }

  // ---- CFile 用的底层访问（不对外） ----

  /** @internal 取文件字节；文件不存在返回 undefined */
  getBuffer(path: string): Uint8Array | undefined {
    return this.files.get(path);
  }

  /** @internal 换掉文件字节（写路径增长/截断时用），并标脏 */
  setBuffer(path: string, data: Uint8Array): void {
    this.files.set(path, data);
    this.markDirty(path);
  }

  // ---- 与持久层同步 ----

  markDirty(path: string): void {
    const p = VirtualFS.normalize(path);
    this.dirty.add(p);
    if (this.autoFlushMs > 0) this.scheduleFlush();
  }

  /**
   * 打开自动写回：markDirty 之后防抖 delayMs 调 flush()。apps/web 启动时调用。
   * 单元测试不调（纯内存，不接 IndexedDB），避免定时器让测试进程挂住。
   */
  enableAutoFlush(delayMs = 200): void {
    this.autoFlushMs = delayMs;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.autoFlushMs);
  }

  /** 立即把改动落盘。卸载（pagehide/visibilitychange）时调用，不等防抖。 */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.backend === null) return;
    if (this.dirsDirty) {
      await this.backend.setDirs([...this.dirs]);
      this.dirsDirty = false;
    }
    // 一个一个移出脏集合，而不是先清空：中间某个 put 抛异常时，没写成功的仍留在集合里等下次重试
    for (const p of [...this.removed]) {
      await this.backend.remove(p);
      this.removed.delete(p);
    }
    for (const p of [...this.dirty]) {
      const data = this.files.get(p);
      if (data !== undefined) await this.backend.put(p, data);
      this.dirty.delete(p);
    }
  }

  /** 启动时把持久层的全部文件与目录读进内存（在游戏初始化之前调用） */
  async load(backend: VfsBackend): Promise<void> {
    this.backend = backend;
    this.files.clear();
    this.dirty.clear();
    this.removed.clear();
    this.dirs.clear();
    this.dirs.add('/');
    const snapshot = await backend.loadAll();
    for (const d of snapshot.dirs) this.dirs.add(VirtualFS.normalize(d));
    for (const [k, v] of snapshot.files) {
      const p = VirtualFS.normalize(k);
      this.files.set(p, v);
      this.addAncestors(p); // 存档里可能只记了文件，中间层级要补齐
    }
    this.dirsDirty = false;
  }
}

/**
 * 模块级的默认 VirtualFS 实例。
 *
 * 为什么要有这个：C++ 里 fopen 是全局函数，移植过来的存档代码（B3 的 RegionFile、
 * B6 的 FolderMethods 那些自由函数、B5 的 ExternalFileLevelStorage）内部直接调它，
 * 没有地方接一个额外的参数。TS 这边 vfs.open 需要一个实例，所以在模块级留一个注入点。
 *
 * 做法参照项目里已有的 MouseHandler.platformHooks：启动时注入真实实例，
 * 测试里在 beforeAll 换成内存实例。放在这里而不是像那个一样挂在类上，是因为
 * 消费方（RegionFile 等）本来就要 import VirtualFS 的类型，多 import 两个函数不增加耦合。
 *
 * 网页版在 main.ts 里注入；单元测试与黄金样本测试各自注入自己的实例。
 * 测试之间必须重新注入 —— 这个变量是模块级的，会跨用例残留。
 */
let currentVfs: VirtualFS | null = null;

/** 注入全局 VirtualFS；传 null 清掉（测试收尾用） */
export function setVfs(vfs: VirtualFS | null): void {
  currentVfs = vfs;
}

/**
 * 取全局 VirtualFS。**没有注入时直接抛**，而不是悄悄返回一个空实例 ——
 * 后者会让"忘了注入"表现成"存档莫名其妙读不到"，很难查。
 */
export function getVfs(): VirtualFS {
  if (currentVfs === null) {
    throw new Error(
      '还没有注入 VirtualFS：网页启动时由 main.ts 调 setVfs()，测试里在 beforeAll 里调',
    );
  }
  return currentVfs;
}
