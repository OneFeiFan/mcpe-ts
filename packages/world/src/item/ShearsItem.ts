// 1:1 移植自 src/world/item/ShearsItem.h
import { Item } from './Item';
import { ItemInstance } from './ItemInstance';
import { Tile } from '../level/tile/Tile';

export class ShearsItem extends Item {
  /** C++ ShearsItem::ShearsItem(int itemId) */
  constructor(itemId: number) {
    super(itemId);
    this.setMaxStackSize(1);
    this.setMaxDamage(238);
  }

  /** C++ ShearsItem::mineBlock(ItemInstance*, int, int, int, int) */
  override mineBlock(
    itemInstance: ItemInstance,
    tile: number,
    _x: number,
    _y: number,
    _z: number,
  ): boolean {
    if (
      tile === Tile.leaves.id ||
      tile === Tile.web.id ||
      tile === Tile.tallgrass.id
      // C++ 里 tile == Tile::vine->id 被注释掉了，不要加
    ) {
      itemInstance.hurt(1);
      return true;
    }
    return super.mineBlock(itemInstance, tile, _x, _y, _z);
  }

  /** C++ ShearsItem::canDestroySpecial(const Tile* tile) const */
  override canDestroySpecial(tile: Tile | null): boolean {
    // C++ 里直接 tile->id，null 是 UB；TS 里抛 TypeError，属已知差异
    return tile!.id === Tile.web.id;
  }

  /** C++ ShearsItem::getDestroySpeed(ItemInstance*, Tile*) */
  override getDestroySpeed(itemInstance: ItemInstance, tile: Tile | null): number {
    if (tile!.id === Tile.web.id || tile!.id === Tile.leaves.id) {
      return 15;
    }
    if (tile!.id === Tile.cloth.id) {
      return 5;
    }
    return super.getDestroySpeed(itemInstance, tile!);
  }
}
