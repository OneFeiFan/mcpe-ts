import { TileItem } from './TileItem';
import { Tile } from '../level/tile/Tile';
import { ClothTile } from '../level/tile/ClothTile';
import { DyePowderItem } from './DyePowderItem';
import { ItemInstance } from './ItemInstance';

export class ClothTileItem extends TileItem {
  constructor(id: number) {
    super(id);
    this.setMaxDamage(0);
    this.setStackedByData(true);
  }

  /** C++ ClothTileItem::getIcon(int itemAuxValue) */
  override getIcon(itemAuxValue: number): number;
  // C++ Item::getIcon(const ItemInstance* itemInstance)
  override getIcon(itemInstance: ItemInstance): number;
  override getIcon(a: number | ItemInstance): number {
    if (typeof a === 'number') {
      return Tile.cloth.getTexture(2, ClothTile.getTileDataForItemAuxValue(a));
    }
    return Tile.cloth.getTexture(2, ClothTile.getTileDataForItemAuxValue(a.getAuxValue()));
  }

  /** C++ ClothTileItem::getLevelDataForAuxValue(int auxValue) */
  override getLevelDataForAuxValue(auxValue: number): number {
    return auxValue;
  }

  /** C++ ClothTileItem::getDescriptionId(const ItemInstance* instance) */
  override getDescriptionId(instance: ItemInstance): string;
  override getDescriptionId(): string;
  override getDescriptionId(instance?: ItemInstance): string {
    if (instance === undefined) {
      // super::getDescriptionId() 的无参重载
      return super.getDescriptionId();
    }
    return (
      super.getDescriptionId() +
      '.' +
      DyePowderItem.COLOR_DESCS[ClothTile.getTileDataForItemAuxValue(instance.getAuxValue())]
    );
  }
}
