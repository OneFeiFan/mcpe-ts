import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BiomeSource, initBiomes, type Level } from '@mcpe/world';
import { initTestTiles } from '../helpers/initTestTiles';

// 真值来自 tools/golden/harness_biomesource.cpp（参考源码 BiomeSource.cpp，替身 Level、Biome、ChunkPos，x86-64 上生成）
type Case = { seed: string } & Record<
  'blockA_t' | 'blockA_d' | 'blockB_t' | 'blockB_d' | 'rawTemp' | 'tempBlock' | 'downBlock',
  number[]
>;
const G: Case[] = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/biomesource.json', import.meta.url), 'utf8'),
);
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (x: number): number => {
  f32[0] = x;
  return u32[0]!;
};
const allBits = (a: Float32Array | null, n: number): number[] =>
  Array.from(a!.subarray(0, n), bits);

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles(); // Biome 的构造函数要读 Tile.grass、Tile.dirt
  initBiomes();
});

describe('BiomeSource 与 C++ 逐位一致（种子链）', () => {
  for (const c of G) {
    it(`种子 ${c.seed}：两个 16×16 区块的温度与降水、原始温度、温度块、降水块`, () => {
      const bs = new BiomeSource({ getSeed: () => Number(c.seed) } as unknown as Level);
      bs.getBiomeBlock(7 * 16, 7 * 16, 16, 16);
      expect(allBits(bs.temperatures, 256)).toEqual(c.blockA_t);
      expect(allBits(bs.downfalls, 256)).toEqual(c.blockA_d);
      const biomes = bs.getBiomeBlock(-37, 1000, 16, 16);
      expect(allBits(bs.temperatures, 256)).toEqual(c.blockB_t);
      expect(allBits(bs.downfalls, 256)).toEqual(c.blockB_d);
      expect(biomes.every((b) => b !== null)).toBe(true);
      expect(bits(bs.getTemperature(100, -50))).toBe(c.rawTemp[0]);
      expect(allBits(bs.getTemperatureBlock(null, 0, 0, 16, 16), 256)).toEqual(c.tempBlock);
      expect(allBits(bs.getDownfallBlock(null, 5, 5, 16, 16), 256)).toEqual(c.downBlock);
    });
  }
});
