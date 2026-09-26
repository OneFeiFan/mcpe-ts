import { beforeAll, describe, expect, it } from 'vitest';
import { Mth } from '@mcpe/util';
import { initMaterials, isUnregistered, Item, StoneSlabTileItem, Tile, TileItem } from '@mcpe/world';
import { initTiles } from '../../../packages/world/src/level/tile/TileInclude';
import { LeafTileItem } from '../../../packages/world/src/item/LeafTileItem';
import { GrassTile } from '../../../packages/world/src/level/tile/GrassTile';
import { StoneTile } from '../../../packages/world/src/level/tile/StoneTile';

// S3 验收：16 个方块类按 1:1 移植完成后运行。初始化顺序照 NinecraftApp::init。
const REGISTERED = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 18, 22, 26, 43, 44, 45, 48, 51, 60, 78, 87, 95, 112, 248, 249, 254, 255];

beforeAll(() => {
  Mth.initMth();
  initMaterials();
  // MobCategory.initMobCategories();  —— S2 移植 MobCategory 后在这里加上
  initTiles();
});

describe('S3 验收：方块与物品注册表', () => {
  it('恰好注册 27 个方块，类型正确，未注册的是哨兵', () => {
    expect(Tile.tiles.map((t, i) => (t ? i : -1)).filter((i) => i >= 0)).toEqual(REGISTERED);
    expect(Tile.tiles[0]).toBeNull();
    expect(Tile.tiles[1]).toBeInstanceOf(StoneTile);
    expect(Tile.tiles[2]).toBeInstanceOf(GrassTile);
    expect(isUnregistered(Tile.sapling)).toBe(true);
  });

  it('光照表', () => {
    expect([0, 1, 2, 3, 7].map((i) => Tile.lightBlock[i])).toEqual([0, 255, 255, 255, 255]);
    expect([8, 9, 10, 11].map((i) => Tile.lightBlock[i])).toEqual([3, 3, 255, 255]);
    expect([18, 254].map((i) => Tile.lightBlock[i])).toEqual([1, 1]);
    expect([10, 11, 51].map((i) => Tile.lightEmission[i])).toEqual([15, 15, 15]);
  });

  it('物品：每个方块一个 TileItem，44 与 18 是特殊 TileItem', () => {
    for (const id of REGISTERED) expect(Item.items[id], `items[${id}]`).toBeInstanceOf(TileItem);
    expect(Item.items[44]).toBeInstanceOf(StoneSlabTileItem);
    expect(Item.items[18]).toBeInstanceOf(LeafTileItem);
  });

  it('GrassTile 的 tex 为 3（AO 路径据此只给顶面着色）', () => {
    expect(Tile.grass.tex).toBe(3);
  });
});
