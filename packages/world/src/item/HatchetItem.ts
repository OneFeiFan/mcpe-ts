// 1:1 移植自 src/world/item/HatchetItem.h 与 HatchetItem.cpp
import { DiggerItem } from './DiggerItem';
import { ItemInstance } from './ItemInstance';
import { Tile } from '../level/tile/Tile';
import { Material } from '../level/material/Material';
import type { Tier } from './Item';

export class HatchetItem extends DiggerItem {
  /** C++ HatchetItem::HatchetItem(int id, const Tier& tier) */
  constructor(id: number, tier: Tier) {
    super(id, 3, tier);

    const d: Tile[] = [];
    d.push(Tile.wood);
    d.push(Tile.bookshelf);
    d.push(Tile.treeTrunk);
    d.push(Tile.chest);
    d.push(Tile.stoneSlab);
    d.push(Tile.stoneSlabHalf);
    // d.push(Tile.pumpkin);       // C++ 里注释掉了
    // d.push(Tile.litPumpkin);    // C++ 里注释掉了

    this.setTiles(d);
  }

  /** C++ HatchetItem::getDestroySpeed(ItemInstance*, Tile*) */
  override getDestroySpeed(itemInstance: ItemInstance, tile: Tile | null): number {
    if (tile !== null && tile.material === Material.wood) {
      return this.speed;
    }
    return super.getDestroySpeed(itemInstance, tile!);
  }
}
