import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharedConstants } from '@mcpe/core';
import { VirtualFS, setVfs } from '@mcpe/platform';
import {
  ExternalFileLevelStorage,
  ExternalFileLevelStorageSource,
  GameType,
  LevelData,
  LevelStorageSource,
  levelSummaryLess,
  type LevelSummary,
} from '@mcpe/world';

// ExternalFileLevelStorageSource（B6）：一个存档"来源" —— 管着整个世界目录
// （列举、挑一个进来、删掉、改名）。
//
// 目录层全都落在 VirtualFS 上（ADAPTED(Web)），B1 造 VirtualFS 时就已经为这个类准备好了
// deleteDirectory 的语义，所以这里测的主要是**它怎么用这些原语**，以及两处原样保留的怪癖。

const EXT = '/ext';
const TMP = '/tmpfs';
const BASE = EXT + '/games/com.mojang/minecraftWorlds';
const TMP_BASE = TMP + '/games/com.mojang/minecraftWorlds';

function freshVfs(): VirtualFS {
  const vfs = new VirtualFS();
  setVfs(vfs);
  return vfs;
}

const source = (tmp = EXT): ExternalFileLevelStorageSource =>
  new ExternalFileLevelStorageSource(EXT, tmp);

/**
 * 在 base 下造一个像样的世界目录：一个 level.dat，名字叫 name，磁盘占用 size。
 *
 * 【storageVersion 必须显式设】LevelData 的默认值是 0，而 readLevelData 只认
 * `version === 1`（v1 裸字节）与 `version >= 2`（NBT）两条路 —— 版本 0 **两条都不走，
 * 静默什么都不读**，于是读回来全是对默认值。真实路径不会有这个值：saveLevelData 写之前会强制
 * 设成 SharedConstants.StorageVersion。（B5a-2 就踩过这条，这里又踩了一次。）
 */
function makeWorld(vfs: VirtualFS, base: string, id: string, name: string, size = 0): string {
  const dir = base + '/' + id;
  vfs.mkdir(dir);
  const ld = new LevelData();
  ld.setLevelName(name);
  ld.setSizeOnDisk(size);
  ld.setGameType(GameType.Survival);
  ld.setStorageVersion(SharedConstants.StorageVersion);
  expect(ExternalFileLevelStorage.writeLevelData(dir + '/level.dat', ld, null)).toBe(true);
  return dir;
}

afterEach(() => {
  setVfs(null);
});

describe('world/ExternalFileLevelStorageSource', () => {
  describe('构造函数', () => {
    it('把 /games/com.mojang/minecraftWorlds 这三级目录建出来', () => {
      const vfs = freshVfs();
      source();
      expect(vfs.isDirectory(EXT + '/games')).toBe(true);
      expect(vfs.isDirectory(EXT + '/games/com.mojang')).toBe(true);
      expect(vfs.isDirectory(BASE)).toBe(true);
    });

    it('临时目录路径与外部路径不同时，两棵树都建', () => {
      const vfs = freshVfs();
      source(TMP);
      expect(vfs.isDirectory(BASE)).toBe(true);
      expect(vfs.isDirectory(TMP_BASE)).toBe(true);
    });

    it('两条路径一样时不建第二棵（C++ 的 _hasTempDirectory = temporaryFilesPath != externalPath）', () => {
      const vfs = freshVfs();
      source(EXT);
      // 没有临时目录这回事，所以 TMP_BASE 只在 tmp 不同时才会出现
      expect(vfs.isDirectory(TMP_BASE)).toBe(false);
    });
  });

  describe('getLevelList', () => {
    it('只认目录，逐个读 level.dat 生成摘要', () => {
      const vfs = freshVfs();
      const s = source();
      makeWorld(vfs, BASE, 'w1', 'World One', 111);
      makeWorld(vfs, BASE, 'w2', 'World Two', 222);
      // 一个同名但**不是目录**的东西 —— C++ 靠 d_type == DT_DIR 把它排除掉
      const f = vfs.open(BASE + '/not-a-world', 'wb')!;
      f.write(new Uint8Array([1, 2, 3]), 1, 3);
      f.close();

      const dest: LevelSummary[] = [];
      s.getLevelList(dest);

      expect(dest.map((x) => x.id).sort()).toEqual(['w1', 'w2']);
      const w1 = dest.find((x) => x.id === 'w1')!;
      expect(w1.name).toBe('World One');
      expect(w1.sizeOnDisk).toBe(111);
      expect(w1.gameType).toBe(GameType.Survival);
      // 写 level.dat 时 LastPlayed 取的是当前时间（C++ 的 getEpochTimeS），所以只断言非 0
      expect(w1.lastPlayed).toBeGreaterThan(0);
    });

    /**
     * 【原样保留】readLevelData 是"两个文件都打不开才返回 false"，所以"目录在、level.dat
     * 有但内容是坏的"这条路**照样会塞一条摘要进去**，而且字段全是默认值（名字空）。
     * 世界列表因此可能出现一个空白名字的条目 —— 这是真实行为，不是 bug。
     */
    it('level.dat 坏了也照样列出来（摘要字段取默认值）', () => {
      const vfs = freshVfs();
      const s = source();
      vfs.mkdir(BASE + '/broken');
      const f = vfs.open(BASE + '/broken/level.dat', 'wb')!;
      f.write(new Uint8Array([9, 9, 9, 9, 9]), 1, 5);
      f.close();

      const dest: LevelSummary[] = [];
      s.getLevelList(dest);
      expect(dest).toHaveLength(1);
      expect(dest[0]!.id).toBe('broken');
      expect(dest[0]!.name).toBe('');
      expect(dest[0]!.lastPlayed).toBe(0);
      expect(dest[0]!.sizeOnDisk).toBe(0);
    });

    it('目录里完全没有 level.dat 时不列（readLevelData 两个文件都打不开）', () => {
      const vfs = freshVfs();
      const s = source();
      vfs.mkdir(BASE + '/empty');
      const dest: LevelSummary[] = [];
      s.getLevelList(dest);
      expect(dest).toEqual([]);
    });

    it('basePath 整个不存在时什么都不列，也不抛', () => {
      const vfs = freshVfs();
      const s = source();
      vfs.remove(EXT + '/games/com.mojang');
      vfs.remove(EXT + '/games');
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const dest: LevelSummary[] = [];
      expect(() => s.getLevelList(dest)).not.toThrow();
      expect(dest).toEqual([]);
      spy.mockRestore();
    });
  });

  /** C++ 是 `bool LevelSummary::operator<`，比较的是 `lastPlayed > rhs.lastPlayed` —— 倒序 */
  it('levelSummaryLess 是倒序（最近玩的排前面）', () => {
    const mk = (lastPlayed: number): LevelSummary => ({
      id: 'x',
      name: 'x',
      lastPlayed,
      gameType: 0,
      sizeOnDisk: 0,
    });
    const list = [mk(100), mk(300), mk(200)];
    list.sort((a, b) => (levelSummaryLess(a, b) ? -1 : 1));
    expect(list.map((x) => x.lastPlayed)).toEqual([300, 200, 100]);
  });

  describe('selectLevel', () => {
    it('返回一个指向 basePath/<id> 的 ExternalFileLevelStorage，并建好 players/', () => {
      const vfs = freshVfs();
      const s = source();
      const store = s.selectLevel('w1', true);
      expect(store).toBeInstanceOf(ExternalFileLevelStorage);
      expect(vfs.isDirectory(BASE + '/w1')).toBe(true);
      expect(vfs.isDirectory(BASE + '/w1/players')).toBe(true);
    });

    it('createPlayerDir 参数没人读（C++ 也是这样，建目录的是存储对象自己的构造函数）', () => {
      const vfs = freshVfs();
      source().selectLevel('w1', false);
      expect(vfs.isDirectory(BASE + '/w1/players')).toBe(true);
    });
  });

  describe('deleteLevel', () => {
    it('普通世界（目录里只有文件）整个目录都没了', () => {
      const vfs = freshVfs();
      const s = source();
      const dir = makeWorld(vfs, BASE, 'w1', 'One');
      s.deleteLevel('w1');
      expect(vfs.exists(dir)).toBe(false);
    });

    /**
     * 【原样保留：兜底分支不是死代码】`deleteDirectory` **不是真递归**（B1 就照 C++ 造好的）：
     * 它把目录里每一项交给 remove，而 remove 删不掉非空子目录。所以只要世界目录里还有
     * `region/` 这种带文件的子目录，整目录删就失败，转到"逐个删三个文件"的兜底 ——
     * 而那三个 remove **不会**碰子目录，于是留下一个残缺的世界目录。
     */
    it('目录里有非空子目录时走兜底分支：三个文件删掉，子目录留下', () => {
      const vfs = freshVfs();
      const s = source();
      const dir = makeWorld(vfs, BASE, 'w1', 'One');
      vfs.mkdir(dir + '/region');
      const f = vfs.open(dir + '/region/chunks.dat', 'wb')!;
      f.write(new Uint8Array([1]), 1, 1);
      f.close();
      // 再造一个要一起删掉的
      const p = vfs.open(dir + '/player.dat', 'wb')!;
      p.write(new Uint8Array([2]), 1, 1);
      p.close();

      s.deleteLevel('w1');

      expect(vfs.exists(dir + '/level.dat'), 'level.dat 被兜底分支删了').toBe(false);
      expect(vfs.exists(dir + '/player.dat'), 'player.dat 被兜底分支删了').toBe(false);
      expect(vfs.exists(dir), '但目录本身还在（region/ 撑着）').toBe(true);
      expect(vfs.exists(dir + '/region/chunks.dat')).toBe(true);
    });
  });

  describe('renameLevel', () => {
    it('改目录名，并把 level.dat 里的 LevelName 换成新名字', () => {
      const vfs = freshVfs();
      const s = source();
      makeWorld(vfs, BASE, 'w1', 'Old Name');

      s.renameLevel('w1', 'New Name');

      expect(vfs.exists(BASE + '/w1')).toBe(false);
      expect(vfs.isDirectory(BASE + '/New Name')).toBe(true);
      // 读回来确认 LevelName 真的换了
      const ld = new LevelData();
      expect(ExternalFileLevelStorage.readLevelData(BASE + '/New Name', ld)).toBe(true);
      expect(ld.getLevelName()).toBe('New Name');
    });

    it('目录名剔掉非法字符，但 level.dat 里的显示名原样保留', () => {
      const vfs = freshVfs();
      const s = source();
      makeWorld(vfs, BASE, 'w1', 'Old');

      // 斜杠、问号、冒号、反斜杠都在 ILLEGAL_FILE_CHARACTERS 里
      s.renameLevel('w1', 'a/b?c:d\\e');

      expect(vfs.isDirectory(BASE + '/abcde'), '目录名只剩合法字符').toBe(true);
      const ld = new LevelData();
      expect(ExternalFileLevelStorage.readLevelData(BASE + '/abcde', ld)).toBe(true);
      expect(ld.getLevelName(), '显示名没修过').toBe('a/b?c:d\\e');
    });

    it('前后空格会被 stringTrim 掉（目录名），显示名保留空格', () => {
      const vfs = freshVfs();
      const s = source();
      makeWorld(vfs, BASE, 'w1', 'Old');

      s.renameLevel('w1', '  spaced  ');

      expect(vfs.isDirectory(BASE + '/spaced')).toBe(true);
      const ld = new LevelData();
      ExternalFileLevelStorage.readLevelData(BASE + '/spaced', ld);
      expect(ld.getLevelName()).toBe('  spaced  ');
    });

    it('名字撞车时一直加 "-"（getUniqueLevelName）', () => {
      const vfs = freshVfs();
      const s = source();
      makeWorld(vfs, BASE, 'w1', 'Old');
      makeWorld(vfs, BASE, 'taken', 'Taken');
      makeWorld(vfs, BASE, 'taken-', 'Taken-');

      s.renameLevel('w1', 'taken');

      expect(vfs.isDirectory(BASE + '/taken--'), 'taken 与 taken- 都占了，于是退到 taken--').toBe(
        true,
      );
    });

    it('世界不存在时直接返回，什么都不做', () => {
      const vfs = freshVfs();
      const s = source();
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(() => s.renameLevel('nope', 'whatever')).not.toThrow();
      expect(vfs.isDirectory(BASE + '/whatever')).toBe(false);
      spy.mockRestore();
    });

    /**
     * 【原样保留：那个 if 是个空块】
     *
     *     bool couldRename = false;
     *     if (hasTempDirectory() && isTempFile) {
     *     }
     *       couldRename = couldRename || rename(_renFULLPATH(old), _renFULLPATH(new)) == 0;
     *
     * 花括号里什么都没有，改名在**外面**、无条件执行；而 `_renFULLPATH` 只拼 basePath，
     * **根本不看 tmpBasePath**。所以临时世界（`_LastJoinedServer`）的改名也发生在 basePath 里。
     *
     * 这条用例造出"两棵树下同名目录都存在"的局面（访问检查看的是 tmpBasePath 那一份），
     * 于是能直接看出：被改的是 basePath 那一份，tmpBasePath 那份纹丝不动。
     */
    it('临时世界的改名走 basePath，不看 tmpBasePath（空 if 的后果）', () => {
      const vfs = freshVfs();
      const s = source(TMP);
      const id = LevelStorageSource.TempLevelId;
      makeWorld(vfs, BASE, id, 'Temp Base');
      makeWorld(vfs, TMP_BASE, id, 'Temp Tmp');

      s.renameLevel(id, 'Renamed');

      expect(vfs.isDirectory(BASE + '/Renamed'), 'basePath 那份被改名了').toBe(true);
      expect(vfs.exists(BASE + '/' + id)).toBe(false);
      expect(vfs.isDirectory(TMP_BASE + '/' + id), 'tmpBasePath 那份没动').toBe(true);
      expect(vfs.isDirectory(TMP_BASE + '/Renamed')).toBe(false);
    });
  });

  describe('几个恒定的实现', () => {
    it('getName / getDataTagFor / isNewLevelIdAcceptable / isConvertible / requiresConversion / convertLevel / clearAll', () => {
      freshVfs();
      const s = source();
      expect(s.getName()).toBe('External File Level Storage');
      expect(s.getDataTagFor('w1')).toBeNull();
      expect(s.isNewLevelIdAcceptable('!!! 什么都行 !!!')).toBe(true);
      expect(s.isConvertible('w1')).toBe(false);
      expect(s.requiresConversion('w1')).toBe(false);
      expect(s.convertLevel('w1', null)).toBe(false);
      expect(() => s.clearAll()).not.toThrow();
    });

    it('TempLevelId 就是 "_LastJoinedServer"', () => {
      expect(LevelStorageSource.TempLevelId).toBe('_LastJoinedServer');
      // 顺带钉住：默认的 StorageVersion 是 3，renameLevel 写回 level.dat 时用的是它
      expect(SharedConstants.StorageVersion).toBe(3);
    });
  });
});
