import { afterEach, describe, expect, it } from 'vitest';
import { SharedConstants } from '@mcpe/core';
import { CompoundTag, NbtIo } from '@mcpe/nbt';
import { SEEK_END, SEEK_SET, VirtualFS, getVfs, setVfs } from '@mcpe/platform';
import { BitStream, RakDataInput } from '@mcpe/util';
import {
  type Entity,
  ExternalFileLevelStorage,
  GameType,
  ItemEntity,
  ItemInstance,
  LevelChunk,
  LevelConstants,
  LevelData,
  Player,
  RegionFile,
  type TileEntity,
  type Level,
} from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// ExternalFileLevelStorage 的构造函数与玩家读写（B5a-2）。
// saveLevelData 那套"写临时文件→挪旧的→改名"的流程由黄金样本 G14-4 逐字节盖住，
// 这里只测黄金样本看不到的：目录创建、读回、以及玩家文件的往返。

const DIR = '/w';
const PLAYERS = DIR + '/players';

function freshVfs(): VirtualFS {
  const vfs = new VirtualFS();
  setVfs(vfs);
  return vfs;
}

/**
 * 造一份写进 level.dat 用的 LevelData（字段取几个好认的值）。
 *
 * 【storageVersion 必须显式设】LevelData 的默认值是 0，而 readLevelData 只认
 * `version === 1`（v1 裸字节）与 `version >= 2`（NBT）两条路 —— 版本 0 **两条都不走，
 * 于是静默什么都不读**（`loadedLevelData` 停在全默认值）。真实路径不会有这个值：
 * saveLevelData 在写之前会强制 setStorageVersion(SharedConstants.StorageVersion)。
 */
function sample(): LevelData {
  const d = new LevelData();
  d.setSeed(4242);
  d.setSpawn(7, 8, 9);
  d.setTime(555);
  d.setGameType(GameType.Survival);
  d.setLevelName('ReadBack');
  d.setAllowCheats(false);
  d.setStorageVersion(SharedConstants.StorageVersion);
  return d;
}

afterEach(() => {
  setVfs(null); // 模块级状态，用例之间必须清掉
});

describe('world/ExternalFileLevelStorage 的构造与玩家读写', () => {
  describe('构造函数', () => {
    it('把世界目录和 players 子目录都建出来', () => {
      const vfs = freshVfs();
      new ExternalFileLevelStorage('w1', DIR);
      expect(vfs.isDirectory(DIR)).toBe(true);
      expect(vfs.isDirectory(PLAYERS)).toBe(true);
    });

    it('读得到已有的 level.dat，prepareLevel 把它交出来', () => {
      const vfs = freshVfs();
      vfs.mkdir(DIR);
      expect(ExternalFileLevelStorage.writeLevelData(DIR + '/level.dat', sample(), null)).toBe(
        true,
      );

      const ext = new ExternalFileLevelStorage('w1', DIR);
      const ld = ext.prepareLevel(levelStub());
      expect(ld).not.toBeNull();
      expect(ld!.getSeed()).toBe(4242);
      expect(ld!.getLevelName()).toBe('ReadBack');
      expect(ld!.getStorageVersion()).toBe(sample().getStorageVersion());
    });

    it('两个文件都没有时 prepareLevel 返回 null（C++ 的 delete loadedLevelData）', () => {
      freshVfs();
      const ext = new ExternalFileLevelStorage('w1', DIR);
      expect(ext.prepareLevel(levelStub())).toBeNull();
    });

    it('level.dat 打不开时回退读 level.dat_old', () => {
      const vfs = freshVfs();
      vfs.mkdir(DIR);
      expect(ExternalFileLevelStorage.writeLevelData(DIR + '/level.dat_old', sample(), null)).toBe(
        true,
      );

      const ext = new ExternalFileLevelStorage('w1', DIR);
      expect(ext.prepareLevel(levelStub())!.getLevelName()).toBe('ReadBack');
    });
  });

  describe('savePlayer / loadPlayer', () => {
    it('存下去再读回来，位置一致', () => {
      // 【位置要取在合法范围内】Entity.load 会把 x/z **夹进世界边界**
      // （padding = bbWidth*0.5 + 0.001，玩家是 0.301），y 不夹。
      // 这里 z 取正数、x 也别贴着 0，免得测出来的差异其实来自那个 clamp 而不是存档往返。
      const vfs = freshVfs();
      vfs.mkdir(DIR);
      vfs.mkdir(PLAYERS);
      const player = makePlayer();
      player.setPos(1.5, 70.25, 12.5);

      ExternalFileLevelStorage.savePlayerTo(player, DIR);
      expect(vfs.exists(PLAYERS + '/Steve.dat')).toBe(true);

      player.setPos(0, 0, 0);
      expect(ExternalFileLevelStorage.loadPlayerFrom(player, DIR)).toBe(true);
      expect([player.x, player.y, player.z]).toEqual([1.5, 70.25, 12.5]);
    });

    it('文件不存在时返回 false（照 C++ 的 is_open 判断）', () => {
      freshVfs();
      expect(ExternalFileLevelStorage.loadPlayerFrom(makePlayer(), DIR)).toBe(false);
    });

    it('players 目录不存在时什么都不写，也不报错（对应 ofstream 打不开就静默失败）', () => {
      const vfs = freshVfs();
      vfs.mkdir(DIR); // 故意不建 players 子目录
      ExternalFileLevelStorage.savePlayerTo(makePlayer(), DIR);
      expect(vfs.exists(PLAYERS)).toBe(false);
      expect(vfs.listDir(DIR)).toEqual([]);
    });

    it('路径里会有双斜杠（worldDir 末尾带 / 时），normalize 会合并掉', () => {
      const vfs = freshVfs();
      vfs.mkdir(DIR);
      vfs.mkdir(PLAYERS);
      // saveLevelData 传给 savePlayer 的就是这种末尾带 / 的目录
      ExternalFileLevelStorage.savePlayerTo(makePlayer(), DIR + '/');
      expect(vfs.exists(PLAYERS + '/Steve.dat')).toBe(true);
    });
  });
});

/**
 * prepareLevel 只是把参数存下来再返回 loadedLevelData，参数本身没被读到 ——
 * 这里给个空替身，免得为了测它去建整个 Level。
 */
function levelStub(): Level {
  return null as unknown as Level;
}

function makePlayer(): Player {
  const p = new TestPlayer(createFlatLevel(), false);
  p.name = 'Steve';
  return p;
}

/**
 * Player 在 TS 里**显式声明成 abstract**（`export abstract class Player extends Mob`），直接 new 是
 * 类型错误 —— 注意 vitest 用 esbuild 剥类型、不做检查，所以运行期照样能跑，只有 tsc 会报。
 *
 * 它那几个抽象成员（getEntityTypeId / readAdditionalSaveData / addAdditonalSaveData）其实都已经
 * 实现了（在 Player 或它的祖先里），所以给个空的具体子类就能实例化。对应 C++ 那边：
 * Player 同样是抽象基类，具体的是 LocalPlayer。
 */
class TestPlayer extends Player {}

// ---------------------------------------------------------------------------
// B5b-2：tick 的节拍、待保存列表、saveAll
// ---------------------------------------------------------------------------

/**
 * tick 只会对 level 调两件事：`getChunk(x, z)`（收待保存区块）与 `entities`/`tileEntities`
 * （B5c-1 起接上了 saveEntities）。所以给它一个只有这三样东西的替身就够了 ——
 * 用真 Level 的话，tick 每轮扫 16×16 会让平坦世界当场生成 256 个区块，又慢又跟被测的点无关。
 */
function stubLevel(chunks: Map<string, LevelChunk>): Level {
  return {
    getChunk: (x: number, z: number): LevelChunk | null => chunks.get(`${x},${z}`) ?? null,
    entities: [],
    tileEntities: [],
  } as unknown as Level;
}

/** 造一个区块（内容全是空气，这里只关心它有没有被写进 chunks.dat） */
function plainChunk(level: Level, x: number, z: number): LevelChunk {
  return new LevelChunk(level, new Uint8Array(LevelConstants.CHUNK_BLOCK_COUNT), x, z);
}

/** 用另一个 RegionFile 看看某个坐标到底写进去没有 */
function written(dir: string, x: number, z: number): boolean {
  const rf = new RegionFile(dir);
  rf.open();
  return rf.readChunk(x, z) !== null;
}

describe('world/ExternalFileLevelStorage 的 tick 与 saveAll', () => {
  it('savePendingUnsavedChunks 的返回值比实际存的多 1（C++ 的 ++count 先自增）', () => {
    freshVfs();
    const ext = new ExternalFileLevelStorage('w1', '/w');
    // 列表是空的也一样返回 1：`while (++count <= maxCount …)` 里 count 先变成 1 才判断
    expect(ext.savePendingUnsavedChunks(2)).toBe(1);
    expect(ext.savePendingUnsavedChunks(0)).toBe(1);
    expect(ext.savePendingUnsavedChunks(-1)).toBe(1); // -1 → 取列表长度 0，同样返回 1
  });

  it('tick 只在第 1000 的整数倍那一拍动手', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const real = createFlatLevel();
    const chunk = plainChunk(real, 0, 0);
    chunk.unsaved = true;

    const ext = new ExternalFileLevelStorage('w1', DIR);
    ext.prepareLevel(stubLevel(new Map([['0,0', chunk]])));

    for (let i = 0; i < 999; i++) ext.tick();
    expect(chunk.unsaved, '前 999 拍不该碰它').toBe(true);

    ext.tick(); // 第 1000 拍
    expect(chunk.unsaved, '第 1000 拍被收进待保存列表并清掉标记').toBe(false);
  });

  it('一拍最多存两个，按扫描顺序（时间戳打平时先碰到的算最老）', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const real = createFlatLevel();
    // 扫描是 z 外层、x 内层 —— 所以顺序是 (0,0)、(1,0)、(15,15)
    const c1 = plainChunk(real, 0, 0);
    const c2 = plainChunk(real, 1, 0);
    const c3 = plainChunk(real, 15, 15);
    for (const c of [c1, c2, c3]) c.unsaved = true;

    const ext = new ExternalFileLevelStorage('w1', DIR);
    ext.prepareLevel(
      stubLevel(
        new Map([
          ['0,0', c1],
          ['1,0', c2],
          ['15,15', c3],
        ]),
      ),
    );
    for (let i = 0; i < 1000; i++) ext.tick();

    // 三个区块在同一拍里入列，addedToList 是同一个毫秒 —— C++ 用的是严格小于，
    // 所以"最老的"就是先扫到的那个。前两个被存下去，第三个留在列表里等下一拍。
    expect(written(DIR, 0, 0)).toBe(true);
    expect(written(DIR, 1, 0)).toBe(true);
    expect(written(DIR, 15, 15)).toBe(false);
  });

  it('saveAll：传进来的区块全都存下去，再把待保存列表清空', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const real = createFlatLevel();
    const a = plainChunk(real, 2, 3);
    const b = plainChunk(real, 4, 5);

    const ext = new ExternalFileLevelStorage('w1', DIR);
    ext.saveAll(real, [a, b]);

    expect(written(DIR, 2, 3)).toBe(true);
    expect(written(DIR, 4, 5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B5c-1：saveEntities 以及它接上的那三处
// ---------------------------------------------------------------------------

/**
 * saveEntities 只读 level 的两个数组（entities / tileEntities）。
 * getChunk 是给 tick 用的 —— 传 null 就不生成区块，不然 tick 每 1000 拍会当场造 256 个。
 */
function entityStubLevel(entities: Entity[], tileEntities: TileEntity[]): Level {
  return {
    entities,
    tileEntities,
    getChunk: (): LevelChunk | null => null,
  } as unknown as Level;
}

const ENTITIES_DAT = DIR + '/entities.dat';

/** 造一个会被存下去的掉落物（Player 不行，见下面那条测试） */
function droppable(): ItemEntity {
  return new ItemEntity(createFlatLevel(), 8.5, 64, 8.5, new ItemInstance(1, 1, 0));
}

/** 把 entities.dat 解回标签树 */
function readTag(path: string): CompoundTag {
  const file = getVfs().open(path, 'rb')!;
  file.seek(0, SEEK_END);
  const size = file.tell();
  file.seek(0, SEEK_SET);
  const buf = new Uint8Array(size);
  file.read(buf, 1, size);
  file.close();

  const numBytes = new DataView(buf.buffer, buf.byteOffset).getInt32(8, true);
  const nbtBytes = buf.subarray(12, 12 + numBytes);
  return NbtIo.read(new RakDataInput(new BitStream(nbtBytes, nbtBytes.length, false)))!;
}

describe('world/ExternalFileLevelStorage 的 saveEntities', () => {
  it('saveGame 转调 saveEntities：写下 entities.dat', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const ext = new ExternalFileLevelStorage('w1', DIR);

    expect(vfs.exists(ENTITIES_DAT)).toBe(false);
    ext.saveGame(entityStubLevel([droppable()], []));
    expect(vfs.exists(ENTITIES_DAT)).toBe(true);
  });

  it('【B5b-2 记下的问题】saveEntities 会把 lastSavedEntitiesTick 重置，tick 的 60 秒分支不再每拍都成立', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const ext = new ExternalFileLevelStorage('w1', DIR);
    ext.prepareLevel(entityStubLevel([droppable()], []));
    const PERIOD = 60 * SharedConstants.TicksPerSecond; // 1200

    // 【初值 -999999 的用意就在这】第 1 拍 tickCount(1) - (-999999) 早就大于 1200 了，
    // 所以刚读进来的世界会**立刻**存一次实体，不是等 60 秒。
    ext.tick();
    expect(vfs.exists(ENTITIES_DAT), '第 1 拍就存').toBe(true);

    // 把文件删掉当"哨兵"：后面那些拍要是又存了一次，它就会重新出现
    vfs.remove(ENTITIES_DAT);
    for (let i = 0; i < PERIOD; i++) ext.tick();
    expect(vfs.exists(ENTITIES_DAT), `刚存过，接下来 ${PERIOD} 拍都不该再存`).toBe(false);

    ext.tick(); // 又够 1201 拍了
    expect(vfs.exists(ENTITIES_DAT), `再过 ${PERIOD + 1} 拍才存第二次`).toBe(true);
  });

  it('removed 的实体不进列表（Entity::save 返回 false → 走 else 分支丢掉）', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const alive = droppable();
    const dead = droppable();
    dead.removed = true;

    new ExternalFileLevelStorage('w1', DIR).saveEntities(entityStubLevel([alive, dead], []), null);

    const tag = readTag(ENTITIES_DAT);
    expect(tag.getList('Entities').size()).toBe(1);
    expect(tag.getList('TileEntities').size()).toBe(0);
  });

  /**
   * 【原样保留的行为】Player::getEntityTypeId() 返回 0，而 Entity::save 开头就是
   * `if (removed || id == 0) return false;` —— 所以**玩家永远不会被写进 entities.dat**。
   * 这不是漏了：玩家有单独的一条路（players/<名字>.dat，走 savePlayer）。
   */
  it('玩家不进 entities.dat（Player 的 typeId 是 0，Entity::save 会拒绝）', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    new ExternalFileLevelStorage('w1', DIR).saveEntities(entityStubLevel([makePlayer()], []), null);

    expect(readTag(ENTITIES_DAT).getList('Entities').size()).toBe(0);
  });

  // 【为什么要先建再删】构造函数里就有 createFolderIfNotExists(levelPath)（C++ 也是），
  // 所以"世界目录不存在"这件事在正常路径上根本发生不了。想测 fopen 打不开那条路，
  // 只能构造完再把目录拆掉。拆之前得先删 players/ —— VirtualFS.remove **删不掉非空目录**
  // （这是照抄 C++ 的怪癖，见 VirtualFS 里那段注释）。
  it('存档目录打不开时什么都不写，也不抛（对应 fopen 返回 NULL 就跳过整个写入）', () => {
    const vfs = freshVfs();
    const ext = new ExternalFileLevelStorage('w1', DIR);
    vfs.remove(DIR + '/players');
    expect(vfs.remove(DIR), 'players 删掉之后世界目录才删得掉').toBe(true);

    expect(() => ext.saveGame(entityStubLevel([droppable()], []))).not.toThrow();
    expect(vfs.exists(ENTITIES_DAT)).toBe(false);
  });
});
