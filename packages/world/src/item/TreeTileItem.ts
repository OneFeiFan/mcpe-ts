// 1:1 移植自 src/world/item/TreeTileItem.h
import { TileItem } from './TileItem';
import { Tile } from '../level/tile/Tile';
import { ItemInstance } from './ItemInstance';

export class TreeTileItem extends TileItem {
  /** C++ TreeTileItem::TreeTileItem(int id) */
  constructor(id: number) {
    super(id);
    this.setMaxDamage(0);
    this.setStackedByData(true);
  }

  /** C++ TreeTileItem::getIcon(const ItemInstance* itemInstance) */
  override getIconForInstance(itemInstance: ItemInstance): number {
    return Tile.treeTrunk.getTexture(2, itemInstance.getAuxValue());
  }

  /** C++ TreeTileItem::getLevelDataForAuxValue(int auxValue) */
  override getLevelDataForAuxValue(auxValue: number): number {
    return auxValue;
  }
}
