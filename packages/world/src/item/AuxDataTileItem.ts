// 1:1 移植自 src/world/item/AuxDataTileItem.h
import type { Tile } from '../level/tile/Tile';
import type { ItemInstance } from './ItemInstance';
import { TileItem } from './TileItem';

export class AuxDataTileItem extends TileItem {
  private readonly parentTile: Tile;

  constructor(id: number, parentTile: Tile) {
    super(id);
    this.parentTile = parentTile;

    this.setMaxDamage(0);
    this.setStackedByData(true);
  }

  override getIcon(itemAuxValue: number): number;
  // C++ Item::getIcon(const ItemInstance* itemInstance)
  override getIcon(itemInstance: ItemInstance): number;
  override getIcon(a: number | ItemInstance): number {
    if (typeof a === 'number') {
      return this.parentTile.getTexture(2, a);
    }
    return this.parentTile.getTexture(2, a.getAuxValue());
  }

  override getLevelDataForAuxValue(auxValue: number): number {
    return auxValue;
  }
}
