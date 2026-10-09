/**
 * 黄金样本 G17-1（地物生成，tools/golden/harness_features.cpp）：RandomLevelSource.postProcess。
 * 与 harness 同样建一个真实的 Level（普通维度），按同样的顺序取区块（x、z 从 3 到 9），
 * 由 ChunkCache 在邻居齐了之后自动 postProcess；比较中心 3×3 个区块的方块与数据（FNV-1a 哈希），
 * 对不上时用方块 id 直方图指出差在哪种方块（树干 17、树叶 18、草丛 31、矿石、岩浆 10/11……）。
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SharedConstants } from '@mcpe/core';
import { GameType, initItems, initTileEntities, Level, LevelSettings, MemoryLevelStorage } from '@mcpe/world';
import { createFlatLevel } from '../helpers/headlessLevel';

type ChunkRec = { x: number; z: number; hash: number; hist: Record<string, number> };
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/features.json', import.meta.url), 'utf8')) as { seed: number; order: [number, number]; chunks: ChunkRec[] };

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel(); // initHeadless：材质、方块、生物群系、区块大小
  initItems();
  initTileEntities();
  level = new Level(new MemoryLevelStorage(), 'golden', new LevelSettings(G.seed, GameType.Creative), SharedConstants.GeneratorVersion);
  const [a, b] = G.order;
  for (let cz = a; cz <= b; cz++) for (let cx = a; cx <= b; cx++) level.getChunk(cx, cz);
}, 120000);

describe('G17-1 地物生成（postProcess）', () => {
  for (const c of G.chunks) {
    it(`区块 (${c.x}, ${c.z})：方块与数据逐个相同`, () => {
      let h = 2166136261;
      const hist: Record<string, number> = {};
      for (let x = 0; x < 16; x++)
        for (let z = 0; z < 16; z++)
          for (let y = 0; y < 128; y++) {
            const wx = c.x * 16 + x;
            const wz = c.z * 16 + z;
            const t = level.getTile(wx, y, wz);
            const d = level.getData(wx, y, wz);
            h = Math.imul(h ^ (t & 0xff), 16777619) >>> 0;
            h = Math.imul(h ^ (d & 0xff), 16777619) >>> 0;
            hist[String(t)] = (hist[String(t)] ?? 0) + 1;
          }
      expect(hist, '方块 id 直方图').toEqual(c.hist);
      expect(h, '方块与数据的哈希').toBe(c.hash);
    });
  }
});
