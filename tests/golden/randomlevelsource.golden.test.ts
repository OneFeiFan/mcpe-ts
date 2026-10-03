import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BiomeSource,
  initBiomes,
  LevelConstants,
  RandomLevelSource,
  type Level,
} from '@mcpe/world';
import type { Random } from '@mcpe/util';
import { initTestTiles } from '../helpers/initTestTiles';

// 真值来自 tools/golden/harness_randomlevelsource.cpp（参考源码 RandomLevelSource.cpp，
// 用**真实的 Level**：GoldenStorage:MemoryLevelStorage + DimensionFactory 拿 NormalDayCycleDimension，
// 所以 getBiomeSource() 出来的 temperatures/downfalls 是真货）。
//
// 【这个夹具分五段】高度场 / prepareHeights 后 / buildSurfaces 后 / **洞穴后** / 洞穴+峡谷后 ——
// 因为 getChunk 是一整块出来的，不分段的话中间哪一步错了都只能看到"最后不一样"。
// 本文件（C-4）比到"洞穴后"；最后一段（含峡谷）是 C-5 的事。
//
// 夹具里还有一个 replayMatchesGetChunk 自检位 —— 那是 harness 自己的体检（拿真的 getChunk
// 跟重放结果逐字节比），不属于 TS 要对的东西，但下面顺手断言一下，
// 免得哪天真重新生成了一个"重放不忠实"的坏夹具还当判据用。
type ChunkCase = {
  x: number;
  z: number;
  heights: string;
  afterPrepareHeights: string;
  afterBuildSurfaces: string;
  afterCaves: string;
  afterFeatures: string;
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

/** 夹具里那种十六进制，每 2 个字符是一个字节；方块数组直接按字节比 */
const hexToBytes = (hex: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 2 <= hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
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

// `getHeights` 与 `random` 在 C++ 里都是 private；TS 也保持 private，这里用类型断言取它们
// （参考实现的 harness 用的是 `#define private public`，同一个思路）。
type PrivateAccess = {
  random: Random;
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

/**
 * 按参考 harness（也就是 C++ 的 getChunk）**同样的顺序**把前三段跑出来。
 *
 * 顺序不能动：`getBiomeBlock` 必须排在读 temperatures 之前；
 * `random.setSeed` 必须在构造之后、`prepareHeights` 之前。
 * 后一条尤其要紧 —— `buildSurfaces` 会大量消耗随机流（每列光基岩那层就是 128 次 `nextInt(5)`），
 * 起始位置差一点，方块数组就全不一样。
 */
const runStages = (c: ChunkCase) => {
  const xChunks = Math.trunc(16 / LevelConstants.CHUNK_WIDTH);
  const xSize = xChunks + 1;
  const ySize = Math.trunc(128 / RandomLevelSource.CHUNK_HEIGHT) + 1;
  const zSize = xChunks + 1;

  const { level, biomeSource } = makeLevel(G.seed);
  const biomes = biomeSource.getBiomeBlock(c.x * 16, c.z * 16, 16, 16);
  const temperatures = biomeSource.temperatures!;

  const src = new RandomLevelSource(level, G.seed, G.generatorVersion, G.spawnMobs);
  // C++ 的 getChunk 在动手之前有这么一句（.cpp:548）：random.setSeed((long)(xOffs * 341872712l + zOffs * 132899541l));
  (src as unknown as PrivateAccess).random.setSeed(c.x * 341872712 + c.z * 132899541);

  const blocks = new Uint8Array(G.chunkBlockCount);
  const heights = new Float32Array(xSize * ySize * zSize);
  (src as unknown as PrivateAccess).getHeights(
    heights,
    c.x * xChunks,
    0,
    c.z * xChunks,
    xSize,
    ySize,
    zSize,
  );
  src.prepareHeights(c.x, c.z, blocks, null, temperatures);
  const afterPrepareHeights = Uint8Array.from(blocks);
  src.buildSurfaces(c.x, c.z, blocks, biomes);
  const afterBuildSurfaces = Uint8Array.from(blocks);

  // C++ 的 getChunk 紧接着就是这两句（洞穴、峡谷）。**C-4 只做洞穴**，
  // 所以这里到洞穴为止 —— 最后一段（含峡谷）是 C-5 的事。
  src.caveFeature.apply(src, level, c.x, c.z, blocks, G.chunkBlockCount);

  return { heights, afterPrepareHeights, afterBuildSurfaces, afterCaves: blocks };
};

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles(); // Biome 的构造函数要读 Tile.grass、Tile.dirt，buildSurfaces 也要读 Tile.sand 等
  initBiomes();
});

describe('RandomLevelSource 与 C++ 逐位一致（G15-1）', () => {
  it('夹具本身是好的：每个区块的"重放 vs 真 getChunk"自检都通过', () => {
    expect(G.chunks.length).toBeGreaterThan(0);
    for (const c of G.chunks) {
      expect(c.replayMatchesGetChunk, `区块 (${c.x},${c.z}) 的重放与真 getChunk 对不上`).toBe(true);
    }
  });

  for (const c of G.chunks) {
    const at = `区块 (${c.x}, ${c.z})`;

    it(`${at}：getHeights 那 2×17×2 个 float 逐位相同`, () => {
      const { heights } = runStages(c);
      expect(Array.from(heights, bits)).toEqual(hexToU32(c.heights));
    });

    it(`${at}：prepareHeights 之后的 32768 个方块逐字节相同`, () => {
      const { afterPrepareHeights } = runStages(c);
      expect(Array.from(afterPrepareHeights)).toEqual(hexToBytes(c.afterPrepareHeights));
    });

    it(`${at}：buildSurfaces 之后的 32768 个方块逐字节相同`, () => {
      const { afterBuildSurfaces } = runStages(c);
      expect(Array.from(afterBuildSurfaces)).toEqual(hexToBytes(c.afterBuildSurfaces));
    });

    it(`${at}：洞穴之后的 32768 个方块逐字节相同`, () => {
      const { afterCaves } = runStages(c);
      expect(Array.from(afterCaves)).toEqual(hexToBytes(c.afterCaves));
    });
  }
});
