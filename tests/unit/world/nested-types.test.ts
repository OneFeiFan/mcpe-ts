import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PerfTimer, Random, WeighedRandom } from '@mcpe/util';
import { Biome, initBiomes, Item, MobCategory, Tile } from '@mcpe/world';
import { initTestTiles } from '../../helpers/initTestTiles';

// C++ 的嵌套类型在 TS 里照原样写：作类型用是同名命名空间里的类型别名，作值用是类上的同名静态属性
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles();
  MobCategory.initMobCategories();
  initBiomes();
});

/** 照 RandomLevelSource::getMobsAt 的写法（RandomLevelSource.cpp:725），演示 Biome::MobList 的用法 */
function getMobsAt(biome: Biome | null, mobCategory: MobCategory): Biome.MobList {
  if (biome == null) return []; // return Biome::MobList();
  return biome.getMobs(mobCategory); // 调用方只读，直接返回即可
}

describe('C++ 嵌套类型的写法', () => {
  it('Biome.MobList / Biome.MobSpawnerData', () => {
    const list: Biome.MobList = getMobsAt(Biome.forest, MobCategory.creature);
    const first: Biome.MobSpawnerData = list[0]!;
    expect(first).toBeInstanceOf(Biome.MobSpawnerData);
    expect(getMobsAt(null, MobCategory.monster)).toEqual([]);
    // 照 Level.cpp:1104 / MobSpawner 的用法：按权重抽一个
    const picked: Biome.MobSpawnerData | null = WeighedRandom.getRandomItem(new Random(1), list);
    expect(list).toContain(picked);
  });

  it('Tile.SoundType、Item.Tier、PerfTimer.ResultField、WeighedRandom.WeighedRandomItem', () => {
    const s: Tile.SoundType = Tile.SOUND_STONE;
    const t: Item.Tier = Item.Tier.IRON;
    const r: PerfTimer.ResultField = new PerfTimer.ResultField('root', 100, 100);
    const w: WeighedRandom.WeighedRandomItem = new WeighedRandom.WeighedRandomItem(5);
    expect([s.getStepSound(), t.getUses(), r.name, w.randomWeight]).toEqual([
      'step.stone',
      250,
      'root',
      5,
    ]);
    expect(s).toBeInstanceOf(Tile.SoundType);
  });
});
