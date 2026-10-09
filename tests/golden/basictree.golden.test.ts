/**
 * 黄金样本 G17-2（大树 BasicTree，tools/golden/harness_basictree.cpp）：在 G17-1 同样生成的世界上，按同样的参数与种子放 6 棵大树，
 * 比较每棵的返回值、周围 25×25×128 的方块与数据（FNV-1a 哈希）以及原木、树叶数量。
 * BasicTree 在这一版里没有调用点（被注释掉），这里直接调用它。
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SharedConstants } from '@mcpe/core';
import { Random } from '@mcpe/util';
import { BasicTree, GameType, initItems, initTileEntities, Level, LevelSettings, MemoryLevelStorage, Tile } from '@mcpe/world';
import { createFlatLevel } from '../helpers/headlessLevel';

type Rec = { x: number; y: number; z: number; ok: boolean; hash: number; logs: number; leaves: number };
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/basictree.json', import.meta.url), 'utf8')) as {
  seed: number;
  order: [number, number];
  trees: Rec[];
  shape: [number, number, number][];
};
const bits = (v: number): number => new Uint32Array(new Float32Array([v]).buffer)[0]!;

let level: Level;
const got: Rec[] = [];

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel();
  initItems();
  initTileEntities();
  level = new Level(new MemoryLevelStorage(), 'golden', new LevelSettings(G.seed, GameType.Creative), SharedConstants.GeneratorVersion);
  const [a, b] = G.order;
  for (let cz = a; cz <= b; cz++) for (let cx = a; cx <= b; cx++) level.getChunk(cx, cz);
  G.trees.forEach((t, k) => {
    const y = level.getHeightmap(t.x, t.z);
    const tree = new BasicTree(false);
    tree.init(k % 2 ? 1.0 : 0.6, 1.0, k % 3 === 0 ? 1.5 : 1.0);
    const ok = tree.place(level, new Random(1000 + k), t.x, y, t.z);
    let h = 2166136261;
    let logs = 0;
    let leaves = 0;
    for (let xx = t.x - 12; xx <= t.x + 12; xx++)
      for (let zz = t.z - 12; zz <= t.z + 12; zz++)
        for (let yy = 0; yy < 128; yy++) {
          const id = level.getTile(xx, yy, zz);
          const d = level.getData(xx, yy, zz);
          h = Math.imul(h ^ (id & 0xff), 16777619) >>> 0;
          h = Math.imul(h ^ (d & 0xff), 16777619) >>> 0;
          if (id === Tile.treeTrunk.id) logs++;
          if (id === Tile.leaves.id) leaves++;
        }
    got.push({ x: t.x, y, z: t.z, ok, hash: h, logs, leaves });
  });
}, 120000);

describe('G17-2 大树 BasicTree', () => {
  G.trees.forEach((want, k) => {
    it(`第 ${k} 棵 (${want.x}, ${want.z})：返回值、原木与树叶数量、方块哈希与 C++ 相同`, () => {
      expect(got[k]).toEqual(want);
    });
  });
});

describe('G17-2 BasicTree.treeShape（不带 Mth:: 的 abs 用的是 float 重载）', () => {
  // 奇数高度时 adjacent 带 .5：若是 ::abs(int)，会先截断成整数、结果完全不同。6 棵树的哈希分辨不出这一点（换成 int 版也都通过），所以单独比这张表。
  it('高度 5–20、每个 y 的返回值逐位与 C++ 相同', () => {
    const tree = new BasicTree(false) as unknown as { height: number; treeShape(y: number): number };
    const bad = G.shape.find(([h, y, want]) => {
      tree.height = h;
      return bits(tree.treeShape(y)) !== want;
    });
    expect(bad).toBeUndefined();
  });
});
