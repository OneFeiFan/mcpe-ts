import { beforeAll, describe, expect, it } from 'vitest';
import { Mth } from '@mcpe/util';
import { initMaterials, isUnregistered, Item, StoneSlabTileItem, Tile, TileItem } from '@mcpe/world';
import { initTiles } from '../../../packages/world/src/level/tile/TileInclude';
import { LeafTileItem } from '../../../packages/world/src/item/LeafTileItem';
import { GrassTile } from '../../../packages/world/src/level/tile/GrassTile';
import { StoneTile } from '../../../packages/world/src/level/tile/StoneTile';

// S3 验收：16 个方块类按 1:1 移植完成后运行。初始化顺序照 NinecraftApp::init。
/** C++ 注册的 89 个方块减去 S12 才注册的 20 个（依赖玩家、实体的 12 个类：网、草丛、楼梯、箱子、工作台、作物、熔炉、门、仙人掌、栅栏门、切石机、下界反应堆） */
const S12_IDS = [30,  31,  53,  54,  58,  59,  61,  62,  64,  67,  71,  81,  107,  108,  109,  114,  128,  156,  245,  247];
const REGISTERED = [1,  2,  3,  4,  5,  6,  7,  8,  9,  10,  11,  12,  13,  14,  15,  16,  17,  18,  20,  21,  22,  24,  26,  35,  37,  38,  39,  40,  41,  42,  43,  44,  45,  46,  47,  48,  49,  50,  51,  56,  57,  60,  63,  65,  68,  73,  74,  78,  79,  80,  82,  83,  85,  87,  89,  95,  96,  98,  102,  103,  105,  112,  155,  246,  248,  249,  253,  254,  255];

beforeAll(() => {
  Mth.initMth();
  initMaterials();
  // MobCategory.initMobCategories();  —— S2 移植 MobCategory 后在这里加上
  initTiles();
});

describe('S3 验收：方块与物品注册表', () => {
  it('恰好注册 69 个方块（S3 的 27 个 + S11 的 42 个），类型正确，未注册的是哨兵', () => {
    expect(Tile.tiles.map((t, i) => (t ? i : -1)).filter((i) => i >= 0)).toEqual(REGISTERED);
    expect(Tile.tiles[0]).toBeNull();
    expect(Tile.tiles[1]).toBeInstanceOf(StoneTile);
    expect(Tile.tiles[2]).toBeInstanceOf(GrassTile);
    expect(isUnregistered(Tile.chest)).toBe(true); // S12 才注册
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
