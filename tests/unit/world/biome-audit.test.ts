import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Biome,
  MobCategory,
  MobSpawnerData,
  MobTypes,
  TallgrassFeature,
  Tile,
  initBiomes,
} from '@mcpe/world';
import { Random, f2i } from '@mcpe/util';
import { initTestTiles } from '../../helpers/initTestTiles';

// 全量审核 W80–W81（packages/world/src/level/biome/Biome.ts、BiomeInclude.ts）。
// W80-1 修复了 adjustScale / adjustDepth 的 float 形参入口舍入；其余是行为锁定。

const f = Math.fround;

/** Biome 的构造函数是 protected，测试用一个不加重写的子类 */
class TestBiome extends Biome {
  constructor() {
    super();
  }
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles(); // 构造函数要读 Tile.grass、Tile.dirt
  initBiomes();
});

describe('Biome 审核（W80）', () => {
  it('W80-1：adjustScale / adjustDepth 在 float 形参入口先舍入', () => {
    const b = new TestBiome();
    const d = 0.1; // 不是 float 可精确表示的值
    expect(b.adjustScale(d)).toBe(f(d));
    expect(b.adjustDepth(d)).toBe(f(d));
    expect(b.adjustScale(f(0.1))).toBe(f(0.1));
  });

  it('W80：构造函数的怪物表与 C++ 相同，并重算两个总权重', () => {
    const b = new TestBiome();
    const rows = (list: MobSpawnerData[]): number[][] =>
      list.map((m) => [m.mobClassId, m.randomWeight, m.minCount, m.maxCount]);

    expect(rows(b.getMobs(MobCategory.creature))).toEqual([
      [MobTypes.Sheep, 12, 2, 3],
      [MobTypes.Pig, 10, 1, 3],
      [MobTypes.Chicken, 10, 2, 4],
      [MobTypes.Cow, 8, 2, 3],
    ]);
    expect(rows(b.getMobs(MobCategory.monster))).toEqual([
      [MobTypes.Spider, 8, 2, 3],
      [MobTypes.Zombie, 12, 2, 4],
      [MobTypes.Skeleton, 6, 1, 3],
      [MobTypes.Creeper, 4, 1, 1],
    ]);
    expect(b.getMobs(MobCategory.waterCreature)).toEqual([]);
    expect(Biome.defaultTotalEnemyWeight).toBe(30); // 8+12+6+4
    expect(Biome.defaultTotalFriendlyWeight).toBe(40); // 12+10+10+8
  });

  it('W80：initBiomes 的 11 个群系名字、颜色、叶色与 C++ 逐个相同', () => {
    const biomes = [
      Biome.rainForest,
      Biome.swampland,
      Biome.seasonalForest,
      Biome.forest,
      Biome.savanna,
      Biome.shrubland,
      Biome.taiga,
      Biome.desert,
      Biome.plains,
      Biome.iceDesert,
      Biome.tundra,
    ];
    expect(biomes.map((b) => b.name)).toEqual([
      'Rainforest',
      'Swampland',
      'Seasonal Forest',
      'Forest',
      'Savanna',
      'Shrubland',
      'Taiga',
      'Desert',
      'Plains',
      'Ice Desert',
      'Tundra',
    ]);
    expect(biomes.map((b) => b.color)).toEqual([
      0x08fa36, 0x07f9b2, 0x9be023, 0x056621, 0xd9e023, 0xa1ad20, 0x2eb153, 0xfa9418, 0xffd910,
      0xffed93, 0x57ebf9,
    ]);
    expect(biomes.map((b) => b.leafColor)).toEqual([
      0x1ff458, 0x8baf48, 0x4ee031, 0x4eba31, 0x4ee031, 0x4ee031, 0x7bb731, 0x4ee031, 0x4ee031,
      0xc4d339, 0xc4d339,
    ]);
  });

  it('W80：desert / iceDesert 的 clearMobs 参数组合与 C++ 相同', () => {
    expect([
      Biome.desert.getMobs(MobCategory.creature).length,
      Biome.desert.getMobs(MobCategory.monster).length,
      Biome.desert.getMobs(MobCategory.waterCreature).length,
    ]).toEqual([0, 4, 0]); // clearMobs(true, true, false)：清友军与水生物，保留敌人
    expect([
      Biome.iceDesert.getMobs(MobCategory.creature).length,
      Biome.iceDesert.getMobs(MobCategory.monster).length,
    ]).toEqual([0, 4]); // clearMobs(true, false, false)：只清友军
    expect(Biome.plains.getMobs(MobCategory.creature).length).toBe(4);
  });

  it('W80：recalc 把沙漠与冰原的地表换成沙子，其余群系仍是草/土', () => {
    expect([Biome.desert.topMaterial, Biome.desert.material]).toEqual([Tile.sand.id, Tile.sand.id]);
    expect([Biome.iceDesert.topMaterial, Biome.iceDesert.material]).toEqual([
      Tile.sand.id,
      Tile.sand.id,
    ]);
    expect([Biome.forest.topMaterial, Biome.forest.material]).toEqual([
      Tile.grass.id,
      Tile.dirt.id,
    ]);
  });

  it('W80：getBiome 用截断后的下标查 64×64 表，与 _getBiome 对应', () => {
    const t = 0.7;
    const d = 0.3;
    const a = f2i(f(f(t) * 63));
    const b = f2i(f(f(d) * 63));
    expect(Biome.getBiome(t, d)).toBe(Biome._getBiome(f(a / 63), f(b / 63)));
  });

  it('W80：getCreatureProbability 返回 float 0.08；getGrassFeature 返回高草', () => {
    const b = new TestBiome();
    expect(b.getCreatureProbability()).toBe(f(0.08));
    expect(b.getGrassFeature(new Random(0))).toBeInstanceOf(TallgrassFeature);
  });

  it('W80：MobSpawnerData 无参构造取 0，randomWeight 沿用 WeighedRandomItem 的 -128', () => {
    // C++ 的三个 int 未初始化（ADAPTED(Safety)），randomWeight 由基类默认构造设为 -128
    const m = new MobSpawnerData();
    expect([m.mobClassId, m.minCount, m.maxCount, m.randomWeight]).toEqual([0, 0, 0, -128]);
  });
});
