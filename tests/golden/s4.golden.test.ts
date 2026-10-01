import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import { Biome, Dimension, initBiomes, LevelChunk, NormalDayCycleDimension, type Level } from '@mcpe/world';
import { initTestTiles } from '../helpers/initTestTiles';

// 真值来自 tools/golden/harness_s4.cpp（Biome.cpp 与 LevelChunk::getRandom 的原样代码，x86-64 上生成）
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/s4.json', import.meta.url), 'utf8'));
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const fl = (b: number): number => { u32[0] = b; return f32[0]!; };
const ORDER = ['rainForest', 'swampland', 'seasonalForest', 'forest', 'savanna', 'shrubland', 'taiga', 'desert', 'plains', 'iceDesert', 'tundra'] as const;
const indexOf = (b: Biome): number => ORDER.findIndex((n) => Biome[n] === b);

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {}); // 缺 category 的 3 条日志
  initTestTiles();
  initBiomes();
});

describe('Biome 的选择与 C++ 逐位一致（种子链）', () => {
  it('recalc 生成的 64×64 表', () => {
    expect(Biome._mapForTest().map(indexOf)).toEqual(G.map);
  });
  it('比较常量本身及其上下相邻 float 的 900 个边界点', () => {
    const bad = (G.edges as [number, number, number][]).find(([t, d, r]) => indexOf(Biome._getBiome(fl(t), fl(d))) !== r);
    expect(bad).toBeUndefined();
  });
  it('3000 个随机点：_getBiome 与查表的 getBiome', () => {
    const bad = (G.random as [number, number, number, number][]).find(
      ([t, d, r1, r2]) => indexOf(Biome._getBiome(fl(t), fl(d))) !== r1 || indexOf(Biome.getBiome(fl(t), fl(d))) !== r2);
    expect(bad).toBeUndefined();
  });
});

describe('LevelChunk.getRandom 与 C++ 逐位一致（种子链）', () => {
  it('2268 组（种子含 64 位值、坐标含会让 int 溢出的 46341）', () => {
    LevelChunk.ChunkBlockCount = 32768;
    const bad = (G.chunkRandom as [string, number, number, string, number, number, number][]).find(([seed, x, z, l, a, b, c]) => {
      const level = { getSeed: () => Number(seed) } as unknown as Level;
      const chunk = new LevelChunk(level, x, z); // 不带方块数组的构造函数只做 init()
      const r: Random = chunk.getRandom(Number(l));
      return r.nextInt() !== a || r.nextInt() !== b || r.nextInt() !== c;
    });
    expect(bad).toBeUndefined();
  });
});

describe('Dimension 与 C++ 逐位一致', () => {
  const bits = (x: number): number => { f32[0] = x; return u32[0]!; };
  it('brightnessRamp（光照等级 → 亮度，Dimension.cpp 的 updateLightRamp）', () => {
    const d = new Dimension();
    d.init({ getSeed: () => 0 } as unknown as Level); // init 会用种子创建 BiomeSource
    expect(Array.from(d.brightnessRamp, bits)).toEqual(G.brightnessRamp);
  });
  it('NormalDayCycleDimension.getTimeOfDay（float 语义、C 库 cos）', () => {
    const d = new NormalDayCycleDimension();
    const bad = (G.timeOfDay as [number, number, number][]).find(([t, a, r]) => bits(d.getTimeOfDay(t, fl(a))) !== r);
    expect(bad).toBeUndefined();
  });
});
