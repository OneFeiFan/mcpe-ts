import {
  BedTile, FarmTile, FireTile, initMaterials, LeafTile, LeafTileItem, LiquidTileDynamic, LiquidTileStatic, Material,
  StoneSlabTile, StoneSlabTileItem, Tile, TileItem, type TileClasses,
} from '@mcpe/world';

/**
 * 测试用的方块注册：已移植的类用真实实现，StoneTile、DirtTile、GrassTile、InvisibleTile、TopSnowTile 还没移植，用最小替身。
 * 这 5 个类移植完、TileInclude.ts 放进仓库后，把这里换成 `initMaterials(); initTiles();`（TileInclude 导出的那个）。
 */
class Solid extends Tile {}
const STAND_INS = {
  StoneTile: class extends Solid { constructor(id: number, tex: number) { super(id, tex, Material.stone); } },
  GrassTile: class extends Solid { constructor(id: number) { super(id, Material.dirt); this.tex = 3; } },
  DirtTile: class extends Solid { constructor(id: number, tex: number) { super(id, tex, Material.dirt); } },
  InvisibleTile: class extends Solid { constructor(id: number, tex: number, m: Material) { super(id, tex, m); } },
  TopSnowTile: class extends Tile {
    constructor(id: number, tex: number) { super(id, tex, Material.topSnow); }
    override isSolidRender(): boolean { return false; }
  },
};

let done = false;
export function initTestTiles(): void {
  if (done) return;
  done = true;
  initMaterials();
  const classes: TileClasses = {
    ...STAND_INS, LiquidTileDynamic, LiquidTileStatic, LeafTile, BedTile, StoneSlabTile, FireTile, FarmTile,
    TileItem, StoneSlabTileItem, LeafTileItem,
  };
  Tile.initTiles(classes);
}
