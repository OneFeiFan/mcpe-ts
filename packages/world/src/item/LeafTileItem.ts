// 1:1 移植自 src/world/item/LeafTileItem.h（S3）。依赖 LeafTile 的静态常量，所以要在 LeafTile.ts 移植后加入。
import { FoliageColor } from '../level/FoliageColor';
import { LeafTile } from '../level/tile/LeafTile';
import { Tile } from '../level/tile/Tile';
import { TileItem } from './TileItem';

export class LeafTileItem extends TileItem {
  constructor(id: number) {
    super(id);
    this.setMaxDamage(0);
    this.setStackedByData(true);
  }

  override getLevelDataForAuxValue(auxValue: number): number {
    return auxValue | LeafTile.PERSISTENT_LEAF_BIT;
  }

  override getIconForAux(itemAuxValue: number): number {
    return Tile.leaves.getTexture(0, itemAuxValue);
  }

  getColor(data: number): number {
    if ((data & LeafTile.EVERGREEN_LEAF) === LeafTile.EVERGREEN_LEAF) return FoliageColor.getEvergreenColor();
    if ((data & LeafTile.BIRCH_LEAF) === LeafTile.BIRCH_LEAF) return FoliageColor.getBirchColor();
    return FoliageColor.getDefaultColor();
  }
}
