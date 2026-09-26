import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Random, WeighedRandom, WeighedRandomItem } from '@mcpe/util';
import {
  Biome, DataLayer, Dimension, GameType, initBiomes, LevelChunk, LevelData, LevelSettings, LightLayer, Material,
  MemoryChunkStorage, MemoryLevelStorage, MobCategory, MobTypes, Tile,
} from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles();
  MobCategory.initMobCategories();
  initBiomes();
  LevelChunk.ChunkBlockCount = 32768; // NinecraftApp::init 里设置；C++ 的静态初值是 0
});

describe('DataLayer', () => {
  it('每个方块 4 位，按 x << 11 | z << 7 | y 打包', () => {
    const d = new DataLayer(32768);
    d.set(1, 2, 3, 9);
    d.set(1, 3, 3, 15);
    expect([d.get(1, 2, 3), d.get(1, 3, 3), d.get(0, 0, 0)]).toEqual([9, 15, 0]);
    expect(d.data![((1 << 11) | (3 << 7) | 2) >> 1]).toBe(0xf9);
    expect(d.get((1 << 11) | (3 << 7) | 3)).toBe(15); // 单参数重载
  });
  it('setAll 照 C++ 原样：写的是 br & (br << 4)，所以 setAll(15) 实际写入 0', () => {
    const d = new DataLayer(64);
    d.setAll(15);
    expect(Array.from(d.data!)).toEqual(new Array(32).fill(0));
  });
});

/** 平坦地形：y=0 基岩，1..59 石头，60..62 泥土，63 草 */
function flatChunk(level: FakeLevel): LevelChunk {
  const blocks = new Uint8Array(32768);
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      const p = (x << 11) | (z << 7);
      blocks[p] = 7;
      for (let y = 1; y <= 59; y++) blocks[p + y] = 1;
      for (let y = 60; y <= 62; y++) blocks[p + y] = 3;
      blocks[p + 63] = 2;
    }
  return new LevelChunk(level, blocks, 8, 8);
}

describe('LevelChunk', () => {
  it('recalcHeightmap：高度 64，天空光在地表以上为 15、以下为 0', () => {
    const c = flatChunk(new FakeLevel());
    c.recalcHeightmap();
    expect([c.getHeightmap(0, 0), c.getHeightmap(15, 15), c.minHeight]).toEqual([64, 64, 64]);
    expect([c.getBrightness(LightLayer.Sky, 3, 127, 3), c.getBrightness(LightLayer.Sky, 3, 64, 3), c.getBrightness(LightLayer.Sky, 3, 63, 3)]).toEqual([15, 15, 0]);
    expect([c.isSkyLit(0, 64, 0), c.isSkyLit(0, 63, 0)]).toEqual([true, false]);
    expect([c.xt, c.zt, c.getTile(0, 63, 0), c.getTile(0, 0, 0)]).toEqual([128, 128, 2, 7]);
  });

  it('setTile：放方块抬高高度图并标记已修改；相同方块返回 false', () => {
    const lv = new FakeLevel();
    const c = flatChunk(lv);
    c.recalcHeightmap();
    lv.lightUpdates.length = 0;
    expect(c.setTile(2, 64, 3, 1)).toBe(true);
    expect([c.getTile(2, 64, 3), c.getHeightmap(2, 3), c.unsaved]).toEqual([1, 65, true]);
    expect(c.updateMap[2 | (3 << 4)]).toBe(1 << (64 >> 4));
    expect(lv.lightUpdates.some(([layer]) => layer === LightLayer.Sky)).toBe(true);
    expect(c.setTile(2, 64, 3, 1)).toBe(false);
    c.setTile(2, 64, 3, 0);
    expect(c.getHeightmap(2, 3)).toBe(64);
  });

  it('setTileAndData：同方块同数据返回 false，否则写入数据', () => {
    const c = flatChunk(new FakeLevel());
    c.recalcHeightmap();
    expect(c.setTileAndData(0, 63, 0, 2, 0)).toBe(false);
    expect(c.setTileAndData(0, 64, 0, 44, 8)).toBe(true);
    expect([c.getTile(0, 64, 0), c.getData(0, 64, 0)]).toEqual([44, 8]);
  });

  it('getRawBrightness：天空光减去衰减后与方块光取大，读到天空光时置 touchedSky', () => {
    const c = flatChunk(new FakeLevel());
    c.recalcHeightmap();
    c.setBrightness(LightLayer.Block, 0, 70, 0, 12);
    LevelChunk.touchedSky = false;
    expect(c.getRawBrightness(0, 70, 0, 11)).toBe(12);
    expect(c.getRawBrightness(0, 70, 1, 11)).toBe(4);
    expect(LevelChunk.touchedSky).toBe(true);
  });

  it('getBlocksAndData / setBlocksAndData 往返', () => {
    const a = flatChunk(new FakeLevel());
    a.recalcHeightmap();
    a.setData(1, 63, 1, 5);
    const buf = new Uint8Array(16 * 16 * 128 * 5 / 2);
    const n = a.getBlocksAndData(buf, 0, 0, 0, 16, 128, 16, 0);
    expect(n).toBe(buf.length);
    const b = new LevelChunk(new FakeLevel(), new Uint8Array(32768), 8, 8);
    expect(b.setBlocksAndData(buf, 0, 0, 0, 16, 128, 16, 0)).toBe(n);
    expect([b.getTile(3, 63, 3), b.getData(1, 63, 1), b.getBrightness(LightLayer.Sky, 3, 100, 3), b.getHeightmap(5, 5)]).toEqual([2, 5, 15, 64]);
    expect(b.countEntities()).toBe(0);
  });
});

describe('Biome', () => {
  it('刷怪表与权重、按类别取表（身份比较）', () => {
    expect([Biome.defaultTotalEnemyWeight, Biome.defaultTotalFriendlyWeight]).toEqual([30, 40]);
    expect(Biome.forest.getMobs(MobCategory.creature).map((m) => m.mobClassId)).toEqual([MobTypes.Sheep, MobTypes.Pig, MobTypes.Chicken, MobTypes.Cow]);
    expect(Biome.desert.getMobs(MobCategory.creature)).toEqual([]);
    expect(Biome.desert.getMobs(MobCategory.monster)).toHaveLength(4);
    expect(Biome.forest.getCreatureProbability()).toBe(Math.fround(0.08));
  });
  it('名字、颜色、地表方块（沙漠的沙子那两行 DEFERRED，仍是草和泥土）', () => {
    expect([Biome.taiga.name, Biome.taiga.color, Biome.taiga.leafColor]).toEqual(['Taiga', 0x2eb153, 0x7bb731]);
    expect([Biome.desert.topMaterial, Biome.desert.material]).toEqual([Tile.grass.id, Tile.dirt.id]);
    expect(Number.isInteger(Biome.plains.getSkyColor(0.5))).toBe(true);
  });
});

describe('LevelData / LevelSettings', () => {
  it('默认构造与按设置构造', () => {
    const d = new LevelData();
    expect([d.getXSpawn(), d.getYSpawn(), d.getZSpawn(), d.getGameType(), d.getSpawnMobs(), d.getDimension(), d.getStorageVersion()])
      .toEqual([128, 64, 128, GameType.Creative, false, Dimension.NORMAL, 0]);
    const s = new LevelData(new LevelSettings(12345, GameType.Survival), 'demo');
    expect([s.getSeed(), s.getGameType(), s.getSpawnMobs(), s.getLevelName(), s.getGeneratorVersion()]).toEqual([12345, 0, true, 'demo', 0]);
  });
  it('拷贝构造与 assign 复制字段，但不复制 sizeOnDisk（与 C++ 相同）', () => {
    const a = new LevelData(new LevelSettings(7, GameType.Creative), 'a');
    a.setSpawn(1, 2, 3);
    a.setTime(999);
    a.setSizeOnDisk(4096);
    a.playerData.pos.x = 5;
    const b = new LevelData(a);
    expect([b.getSeed(), b.getXSpawn(), b.getTime(), b.getSizeOnDisk(), b.playerData.pos.x]).toEqual([7, 1, 999, 0, 5]);
    expect(b.playerData.pos).not.toBe(a.playerData.pos);
    const c = new LevelData().assign(a);
    expect([c.getLevelName(), c.getSizeOnDisk()]).toEqual(['a', 0]);
  });
  it('LevelSettings 的静态函数', () => {
    expect([LevelSettings.validateGameType(5), LevelSettings.validateGameType(0), LevelSettings.gameTypeToString(1)]).toEqual([1, 0, 'Creative']);
    expect(LevelSettings.None().getSeed()).toBe(-1);
  });
});

describe('MemoryLevelStorage', () => {
  it('创建 MemoryChunkStorage；第二次创建会警告；其余都是空操作', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const st = new MemoryLevelStorage();
    const dim = { ultraWarm: false, hasCeiling: false } as Dimension;
    expect(st.createChunkStorage(dim)).toBeInstanceOf(MemoryChunkStorage);
    st.createChunkStorage(dim);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(st.prepareLevel(new FakeLevel())).toBeNull();
    const spy = vi.spyOn(st, 'saveLevelData$2');
    st.saveLevelData(new LevelData());
    expect(spy).toHaveBeenCalledWith(expect.any(LevelData), null); // 单参数重载转给 $2，players 为 null
    expect(st.loadPlayer({} as never)).toBe(false);
    warn.mockRestore();
  });
});

describe('MobCategory / WeighedRandom', () => {
  it('initMobCategories 之后的刷怪材质', () => {
    expect(MobCategory.values).toHaveLength(3);
    expect([MobCategory.monster.getSpawnPositionMaterial(), MobCategory.waterCreature.getSpawnPositionMaterial()]).toEqual([Material.air, Material.water]);
    expect([MobCategory.creature.isFriendly(), MobCategory.monster.getMaxInstancesPerChunk()]).toEqual([true, 10]);
  });
  it('按权重抽取', () => {
    const items = [new WeighedRandomItem(1), new WeighedRandomItem(3), new WeighedRandomItem(6)];
    expect(WeighedRandom.getTotalWeight(items)).toBe(10);
    const r1 = new Random(42), r2 = new Random(42);
    for (let i = 0; i < 20; i++) {
      let sel = r2.nextInt(10);
      let want = -1;
      for (let k = 0; k < items.length; k++) if ((sel -= items[k]!.randomWeight) < 0) { want = k; break; }
      expect(WeighedRandom.getRandomItemIndex(r1, items)).toBe(want);
    }
    expect(new WeighedRandomItem().isValid()).toBe(false);
  });
});
