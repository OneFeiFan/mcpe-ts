import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CompoundTag, NbtIo } from '@mcpe/nbt';
import { SEEK_END, SEEK_SET, VirtualFS, getVfs, setVfs } from '@mcpe/platform';
import { BitStream, RakDataInput } from '@mcpe/util';
import {
  ExternalFileLevelStorage,
  ItemEntity,
  ItemInstance,
  initTileEntities,
  SignTileEntity,
  Tile,
  type Level,
} from '@mcpe/world';
import { createFlatLevel } from '../helpers/headlessLevel';

// G14-6：实体文件 entities.dat（ExternalFileLevelStorage::saveEntities）。夹具由
// tools/golden/harness_entities.cpp 用参考 C++ 生成，禁止手改。
//
// 【这不是 RegionFile，是平文件】任务单原文写的"RegionFile 的第二个实例"是错的 ——
// entitiesFile 那个字段 C++ 里从没被用过。真实布局：
//
//     "ENT\0"     4 字节
//     int32       version   ← 写死 1
//     int32       numBytes  ← 后面 NBT 的字节数
//     byte[]      NBT
//
// 【这个样本真正钉住的东西】同一个文件里有**两套端序路径**：头部那两个 int32 走
// `fwrite(&x, sizeof(int), 1, fp)` —— 直接倒内存，小端；紧跟其后的 NBT 走 BitStream。
// B2 那个 bug 就是把这俩弄混了（v1 载荷因此一直错着），所以这里比的是**整个文件**的字节。
interface EntSpec {
  name: string;
  pos: number[];
  motion: number[];
  rot: number[];
  fallDistance: number;
  onFire: number;
  airSupply: number;
  onGround: number;
  age: number;
  item: number[];
  removed: number;
}
interface TeSpec {
  name: string;
  pos: number[];
  text: string[];
}
interface Case {
  name: string;
  numBytes: number;
  version: number;
  bytesLen: number;
  bytesHex: string;
}
interface LoadedState {
  entityCount: number;
  entities: { type: number; pos: number[]; item?: number[]; age?: number }[];
  tePresent: number[];
}
interface Fixture {
  magicHex: string;
  version: number;
  input: { entities: EntSpec[]; tileEntities: TeSpec[] };
  cases: Case[];
  roundTrip: { firstLoad: LoadedState; secondLoad: LoadedState; truncated: LoadedState };
}

const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/entities.json', import.meta.url), 'utf8'),
) as Fixture;

const DIR_EMPTY = '/empty';
const DIR_FULL = '/full';
const FN = '/entities.dat';

const hex = (u: Uint8Array): string => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

function caseOf(name: string): Case {
  const c = fixture.cases.find((x) => x.name === name);
  if (!c) throw new Error(`夹具里没有用例 ${name}`);
  return c;
}

/** 按夹具里的表造一个掉落物。**每个会进 NBT 的字段都要显式设死** —— ItemEntity 的构造函数
 *  里有四处 Mth::random()，其中 yRot/xd/zd 是会被序列化的，不覆盖掉就会依赖随机数状态。 */
function buildItemEntity(level: Level, s: EntSpec): ItemEntity {
  const e = new ItemEntity(level);
  e.item = new ItemInstance(s.item[0]!, s.item[1]!, s.item[2]!);
  e.age = s.age;
  e.setPos(s.pos[0]!, s.pos[1]!, s.pos[2]!);
  e.xd = s.motion[0]!;
  e.yd = s.motion[1]!;
  e.zd = s.motion[2]!;
  e.yRot = s.rot[0]!;
  e.xRot = s.rot[1]!;
  e.fallDistance = s.fallDistance;
  e.onFire = s.onFire;
  e.airSupply = s.airSupply;
  e.onGround = s.onGround !== 0;
  e.removed = s.removed !== 0;
  return e;
}

function buildSign(s: TeSpec): SignTileEntity {
  const e = new SignTileEntity();
  e.x = s.pos[0]!;
  e.y = s.pos[1]!;
  e.z = s.pos[2]!;
  for (let i = 0; i < SignTileEntity.NUM_LINES; i++) e.messages[i] = s.text[i]!;
  return e;
}

/** 造一个实体文件，返回整个文件的字节 */
function saveInto(dir: string, level: Level): Uint8Array {
  new ExternalFileLevelStorage('w', dir).saveEntities(level, null);
  // 必须从同一个 vfs 取（getVfs 就是 C++ 那边 fopen 是全局函数的对应物）
  const f = getVfs().open(dir + FN, 'rb');
  if (!f) throw new Error(`没写出 ${dir}${FN}`);
  // CFile 没有 size()，按 C 的老办法量长度
  f.seek(0, SEEK_END);
  const size = f.tell();
  f.seek(0, SEEK_SET);
  const buf = new Uint8Array(size);
  f.read(buf, 1, size);
  f.close();
  return buf;
}

/** 世界：先存一次空的，再放东西存第二次 —— 与 harness 里同一个 Level 存两次的顺序一致 */
function freshWorld(): { vfs: VirtualFS; level: Level } {
  const vfs = new VirtualFS();
  setVfs(vfs);
  // 必须用 TileEntityInclude 那个：它先把子类注入 TileEntityFactory，再执行 C++ 的
  // TileEntity::initTileEntities。只调 TileEntity.initTileEntities 的话 id→类名 的映射有了、
  // 类名→构造器 的映射却是空的，loadStatic 会抛"尚未移植"。
  initTileEntities();
  const level = createFlatLevel();
  vfs.mkdir(DIR_EMPTY);
  vfs.mkdir(DIR_FULL);
  return { vfs, level };
}

/**
 * 准备一个"区块刚从磁盘读出来"的世界：坐标上有方块，但**还没有方块实体**。
 *
 * 【为什么不调 chunk.setTile】`LevelChunk.setTile` 末尾会调 `Tile.tiles[t].onPlace(...)`，
 * 而 `SignTile.onPlace` 正是创建方块实体并挂上去的地方 —— 走它的话等 loadEntities 跑到时
 * 那个坐标已经有方块实体了，"Adding TileEntity" 那条正常分支永远走不到（C++ 那边实测踩过）。
 * 直接写方块数组就绕开了 onPlace。harness 的区块源做的是同一件事（见 harness_entities.cpp）。
 */
function worldForLoad(): Level {
  const level = createFlatLevel();
  for (const s of fixture.input.tileEntities) {
    const c = level.getChunkAt(s.pos[0]!, s.pos[2]!);
    const idx = ((s.pos[0]! & 15) << 11) | ((s.pos[2]! & 15) << 7) | s.pos[1]!;
    c.getBlockData()![idx] = Tile.sign.id;
  }
  return level;
}

/** 与 harness 的 emitLoadedState 一一对应 */
function snapshot(level: Level): LoadedState {
  return {
    entityCount: level.entities.length,
    entities: level.entities.map((e) => {
      const o: LoadedState['entities'][number] = {
        type: e.getEntityTypeId(),
        pos: [e.x, e.y, e.z],
      };
      if (e.isItemEntity()) {
        const it = (e as ItemEntity).item;
        // auxValue 是私有的（C++ 也是），得走 getAuxValue()
        o.item = [it.id, it.count, it.getAuxValue()];
        o.age = (e as ItemEntity).age;
      }
      return o;
    }),
    tePresent: fixture.input.tileEntities.map((s) => {
      const c = level.getChunkAt(s.pos[0]!, s.pos[2]!);
      return c.hasTileEntityAt(s.pos[0]!, s.pos[1]!, s.pos[2]!) ? 1 : 0;
    }),
  };
}

const DIR_TRUNC = '/trunc';

function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** 把 fixtures 里 full 那个文件的字节砍掉尾巴 8 字节 —— 头里的 numBytes 就比剩下的多了 */
function writeTruncated(vfs: VirtualFS): void {
  vfs.mkdir(DIR_TRUNC);
  const full = fromHex(caseOf('full').bytesHex);
  const f = vfs.open(DIR_TRUNC + FN, 'wb')!;
  f.write(full.subarray(0, full.length - 8), 1, full.length - 8);
  f.close();
}

afterEach(() => {
  setVfs(null); // 模块级状态，用例之间必须清掉
});

describe('G14-6 entities.dat 的字节', () => {
  it('头部就是 "ENT\\0" + version=1 + numBytes', () => {
    const { level } = freshWorld();
    const bytes = saveInto(DIR_EMPTY, level);

    expect(hex(bytes.subarray(0, 4))).toBe(fixture.magicHex);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getInt32(4, true), 'version 是小端').toBe(fixture.version);
    expect(view.getInt32(8, true), 'numBytes 是小端').toBe(caseOf('empty').numBytes);
    // numBytes 记的是 **NBT 的长度**，不是文件长度：文件比它多 12 字节的头
    expect(bytes.length).toBe(caseOf('empty').numBytes + 12);
  });

  it('空世界：两个 ListTag 都是空的，逐字节一致', () => {
    const { level } = freshWorld();
    const bytes = saveInto(DIR_EMPTY, level);
    const c = caseOf('empty');
    expect(bytes.length).toBe(c.bytesLen);
    expect(hex(bytes)).toBe(c.bytesHex);
  });

  it('有实体与方块实体时逐字节一致', () => {
    const { level } = freshWorld();
    saveInto(DIR_EMPTY, level); // 与 harness 一样，先存一次空的
    for (const s of fixture.input.entities) level.entities.push(buildItemEntity(level, s));
    for (const s of fixture.input.tileEntities) level.tileEntities.push(buildSign(s));

    const bytes = saveInto(DIR_FULL, level);
    const c = caseOf('full');
    expect(bytes.length).toBe(c.bytesLen);
    expect(hex(bytes)).toBe(c.bytesHex);
  });

  // -------------------------------------------------------------------------
  // 上面三条是"字节对得上"。下面把字节解回标签树，确认结构层面也对 —— 逐字节比看不出
  // "为什么会是这个字节"，解出来才知道两个 ListTag 是平级的、被丢掉的实体确实没进去。
  // -------------------------------------------------------------------------

  it('解出来的结构：Entities / TileEntities 两个平级 ListTag，removed 的那条不在里面', () => {
    const { level } = freshWorld();
    saveInto(DIR_EMPTY, level);
    for (const s of fixture.input.entities) level.entities.push(buildItemEntity(level, s));
    for (const s of fixture.input.tileEntities) level.tileEntities.push(buildSign(s));
    const bytes = saveInto(DIR_FULL, level);

    // 跳过 12 字节的头，把剩下的 NBT 解回来（走的是 BitStream，与写的时候同一条路）
    const nbtBytes = bytes.subarray(12, 12 + caseOf('full').numBytes);
    const tag = NbtIo.read(new RakDataInput(new BitStream(nbtBytes, nbtBytes.length, false)))!;
    expect(tag.contains('Entities')).toBe(true);
    expect(tag.contains('TileEntities')).toBe(true);

    // 两个掉落物只进去了一个：第二个 removed=true，Entity::save 返回 false
    const entities = tag.getList('Entities');
    expect(entities.size()).toBe(1);
    const only = entities.get(0) as CompoundTag;
    expect(only.getInt('id')).toBe(64); // EntityTypes.IdItemEntity
    expect(only.getShort('Age')).toBe(fixture.input.entities[0]!.age);
    expect(only.getCompound('Item').getShort('id')).toBe(fixture.input.entities[0]!.item[0]);

    const te = tag.getList('TileEntities').get(0) as CompoundTag;
    expect(te.getString('id')).toBe('Sign');
    expect(te.getString('Text1')).toBe(fixture.input.tileEntities[0]!.text[0]);
    expect(te.getInt('x')).toBe(fixture.input.tileEntities[0]!.pos[0]);
  });
});

// ---------------------------------------------------------------------------
// 读回来那一半（loadEntities）
// ---------------------------------------------------------------------------

const RT = fixture.roundTrip;

describe('G14-6 loadEntities：把 entities.dat 读回世界', () => {
  /** 把夹具里 `full` 那个文件写进 dir */
  function putFullFile(vfs: VirtualFS, dir: string): void {
    const full = fromHex(caseOf('full').bytesHex);
    const f = vfs.open(dir + FN, 'wb')!;
    f.write(full, 1, full.length);
    f.close();
  }

  it('第一次读：实体进去了，方块实体也挂到了区块上', () => {
    const vfs = freshWorld().vfs;
    putFullFile(vfs, DIR_FULL);

    const level = worldForLoad();
    new ExternalFileLevelStorage('w', DIR_FULL).loadEntities(level, null);

    // 夹具里 full 写了两条掉落物，但第二条 removed=true 当时没进文件 —— 所以这里只该读回一条
    expect(snapshot(level)).toEqual(RT.firstLoad);
    expect(RT.firstLoad.tePresent, '方块实体确实挂上去了（不是被 setTileEntity 拒绝）').toEqual([
      1,
    ]);
  });

  it('再读一次：实体是新建的（id 是新的）所以又加了一遍；方块实体那个位置已占，被丢掉', () => {
    const vfs = freshWorld().vfs;
    putFullFile(vfs, DIR_FULL);

    const level = worldForLoad();
    const store = new ExternalFileLevelStorage('w', DIR_FULL);
    store.loadEntities(level, null);
    store.loadEntities(level, null);

    expect(snapshot(level)).toEqual(RT.secondLoad);
    // 第二条没被加成第二个方块实体 —— 走的是 "Already have TileEntity" 那条分支
    expect(RT.secondLoad.tePresent).toEqual([1]);
  });

  it('文件被截短（numBytes 比剩下的多）时什么都不读', () => {
    const vfs = freshWorld().vfs;
    writeTruncated(vfs);

    const level = worldForLoad();
    new ExternalFileLevelStorage('w', DIR_TRUNC).loadEntities(level, null);

    expect(snapshot(level)).toEqual(RT.truncated);
    expect(RT.truncated.entityCount).toBe(0);
  });

  it('文件不存在时什么都不做，也不抛（对应 fopen 返回 NULL）', () => {
    const vfs = freshWorld().vfs;
    vfs.mkdir('/none');
    const level = worldForLoad();
    expect(() =>
      new ExternalFileLevelStorage('w', '/none').loadEntities(level, null),
    ).not.toThrow();
    expect(level.entities.length).toBe(0);
  });
});
