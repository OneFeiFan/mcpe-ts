import { TileItem } from "./TileItem";
import { Tile } from "../level/tile/Tile";
import type { ItemInstance } from "./ItemInstance";

export class SaplingTileItem extends TileItem {
  /** C++ SaplingTileItem::SaplingTileItem(int id) */
  constructor(id: number) {
    super(id);
    this.setMaxDamage(0);
    this.setStackedByData(true);
  }

  /** C++ SaplingTileItem::getLevelDataForAuxValue(int auxValue) */
  override getLevelDataForAuxValue(auxValue: number): number {
    return auxValue;
  }

  /** C++ SaplingTileItem::getIcon(int itemAuxValue) */
  override getIcon(itemAuxValue: number): number;
  // C++ Item::getIcon(const ItemInstance* itemInstance)
  override getIcon(itemInstance: ItemInstance): number;
  override getIcon(a: number | ItemInstance): number {
    if (typeof a === "number") {
      return Tile.sapling.getTexture(0, a);
    }
    return Tile.sapling.getTexture(0, a.getAuxValue());
  }
}