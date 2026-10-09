/**
 * 地物生成：树苗长树（Sapling.growTree 用 TreeFeature / BirchFeature / SpruceFeature，doUpdate = true）。
 * 钉住：普通树苗长出橡树（树干 data = NORMAL_TRUNK，顶上有树叶）；白桦树苗长白桦；云杉树苗长云杉；
 * C++ 里 `nextInt(10) == 0` 时 f 为 NULL（BasicTree 被注释掉）——这里按放置失败处理，树苗原样留着。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import { initItems, initTileEntities, type Level, LeafTile, type Sapling, Tile, TreeTile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

let level: Level;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

/** 找一个种子：第一次 nextInt(10) 不为 0（普通树苗才会去 new TreeFeature） */
function seedNotNull(): number {
  for (let s = 1; ; s++) if (new Random(s).nextInt(10) !== 0) return s;
}

function grow(x: number, z: number, data: number, seed: number): void {
  level.setTileAndData(x, 64, z, Tile.sapling.id, data);
  (Tile.sapling as unknown as Sapling).growTree(level, x, 64, z, new Random(seed));
}

describe('树苗长树', () => {
  it('普通树苗：长出橡树（树干 NORMAL_TRUNK，上方有树叶）', () => {
    grow(120, 120, 0, seedNotNull());
    expect(level.getTile(120, 64, 120)).toBe(Tile.treeTrunk.id);
    expect(level.getData(120, 64, 120)).toBe(TreeTile.NORMAL_TRUNK);
    let leaves = 0;
    for (let y = 66; y < 72; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (level.getTile(120 + dx, y, 120 + dz) === Tile.leaves.id) leaves++;
    expect(leaves).toBeGreaterThan(10);
  });

  it('白桦树苗 → 白桦树干；云杉树苗 → 云杉（深色）树干', () => {
    grow(130, 120, LeafTile.BIRCH_LEAF, 7);
    expect([level.getTile(130, 64, 120), level.getData(130, 64, 120)]).toEqual([Tile.treeTrunk.id, TreeTile.BIRCH_TRUNK]);
    grow(140, 120, LeafTile.EVERGREEN_LEAF, 7);
    expect([level.getTile(140, 64, 120), level.getData(140, 64, 120)]).toEqual([Tile.treeTrunk.id, TreeTile.DARK_TRUNK]);
  });

  it('nextInt(10) == 0（C++ 空指针）：按放置失败处理，树苗原样留着', () => {
    let s = 1;
    while (new Random(s).nextInt(10) !== 0) s++;
    grow(150, 120, 0, s);
    expect(level.getTile(150, 64, 120)).toBe(Tile.sapling.id);
  });
});
