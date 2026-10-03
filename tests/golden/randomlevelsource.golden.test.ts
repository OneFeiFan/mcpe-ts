import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BiomeSource,
  initBiomes,
  LevelConstants,
  RandomLevelSource,
  type Level,
} from '@mcpe/world';
import { initTestTiles } from '../helpers/initTestTiles';

// 真值来自 tools/golden/harness_randomlevelsource.cpp（参考源码 RandomLevelSource.cpp，
// 用**真实的 Level**：GoldenStorage:MemoryLevelStorage + DimensionFactory 拿 NormalDayCycleDimension，
// 所以 getBiomeSource() 出来的 temperatures/downfalls 是真货）。
//
// 【这个夹具分四段】高度场 / prepareHeights 后 / buildSurfaces 后 / 洞穴峡谷后 —— 因为 getChunk 是
// 一整块出来的，不分段的话中间哪一步错了都只能看到"最后不一样"。本文件（C-2）只比第一段。
//
// 夹具里还有一份 fromGetChunk（真 getChunk 的结果）与 replayMatchesGetChunk 自检位 ——
// 那是 harness 自己的体检，不属于 TS 要对的东西，但下面顺手断言一下，
// 免得哪天真重新生成了一个"重放不忠实"的坏夹具还当判据用。
type ChunkCase = {
  x: number;
  z: number;
  heights: string;
  afterPrepareHeights: string;
  afterBuildSurfaces: string;
  afterFeatures: string;
  fromGetChunk: string;
  replayMatchesGetChunk: boolean;
};
type Fixture = {
  seed: number;
  generatorVersion: number;
  spawnMobs: boolean;
  chunkBlockCount: number;
  chunks: ChunkCase[];
};
const G: Fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/randomlevelsource.json', import.meta.url), 'utf8'),
);

/**
 * 夹具里的十六进制是**内存里的字节序**（x86-64 小端），每 8 个字符是一个 float。
 * 想跟 JS 的位模式比，得按小端拼回 uint32 —— 直接把 8 个字符当大端读会全错。
 */
const hexToU32 = (hex: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 8 <= hex.length; i += 8) {
    const b0 = Number.parseInt(hex.slice(i, i + 2), 16);
    const b1 = Number.parseInt(hex.slice(i + 2, i + 4), 16);
    const b2 = Number.parseInt(hex.slice(i + 4, i + 6), 16);
    const b3 = Number.parseInt(hex.slice(i + 6, i + 8), 16);
    out.push(((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0);
  }
  return out;
};

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (x: number): number => {
  f32[0] = x;
  return u32[0]!;
};

/**
 * 参考的 harness 是拿一个**真 Level** 建 RandomLevelSource 的；它这一路上只用 Level 的两样东西：
 * `getSeed()`（BiomeSource 的构造要用）和 `getBiomeSource()`（getHeights 读 temperatures/downfalls）。
 * 所以这里给个只有这两个方法的鸭子类型就够了 —— 与 biomesource 黄金样本同一个做法。
 */
const makeLevel = (seed: number): { level: Level; biomeSource: BiomeSource } => {
  let biomeSource!: BiomeSource;
  const level = {
    getSeed: () => seed,
    getBiomeSource: () => biomeSource,
  } as unknown as Level;
  biomeSource = new BiomeSource(level);
  return { level, biomeSource };
};

/** `RandomLevelSource::getHeights` 在 C++ 里是 private；TS 也保持 private，这里用一次类型断言取它。 */
type HeightAccess = {
  getHeights(
    buffer: Float32Array,
    x: number,
    y: number,
    z: number,
    xSize: number,
    ySize: number,
    zSize: number,
  ): Float32Array;
};

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles(); // Biome 的构造函数要读 Tile.grass、Tile.dirt
  initBiomes();
});

describe('RandomLevelSource 的高度场与 C++ 逐位一致（G15-1）', () => {
  it('夹具本身是好的：每个区块的"重放 vs 真 getChunk"自检都通过', () => {
    expect(G.chunks.length).toBeGreaterThan(0);
    for (const c of G.chunks) {
      expect(c.replayMatchesGetChunk, `区块 (${c.x},${c.z}) 的重放与真 getChunk 对不上`).toBe(true);
      expect(c.afterFeatures).toBe(c.fromGetChunk);
    }
  });

  for (const c of G.chunks) {
    it(`区块 (${c.x}, ${c.z})：getHeights 那 2×17×2 个 float 逐位相同`, () => {
      const xChunks = Math.trunc(16 / LevelConstants.CHUNK_WIDTH);
      const xSize = xChunks + 1;
      const ySize = Math.trunc(128 / RandomLevelSource.CHUNK_HEIGHT) + 1;
      const zSize = xChunks + 1;

      const { level, biomeSource } = makeLevel(G.seed);
      const src = new RandomLevelSource(level, G.seed, G.generatorVersion, G.spawnMobs);

      // 与参考 harness（也就是 C++ 的 getChunk）同一个顺序：先取生物群系块，再调 getHeights ——
      // getHeights 读的 temperatures/downfalls 正是 getBiomeBlock 填出来的。
      biomeSource.getBiomeBlock(c.x * 16, c.z * 16, 16, 16);

      const heights = new Float32Array(xSize * ySize * zSize);
      (src as unknown as HeightAccess).getHeights(
        heights,
        c.x * xChunks,
        0,
        c.z * xChunks,
        xSize,
        ySize,
        zSize,
      );

      expect(Array.from(heights, bits)).toEqual(hexToU32(c.heights));
    });
  }
});
