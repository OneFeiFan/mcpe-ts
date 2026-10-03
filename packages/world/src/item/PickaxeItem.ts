import { DiggerItem } from './DiggerItem';
import { ItemInstance } from './ItemInstance';
import { Tile } from '../level/tile/Tile';
import { Material } from '../level/material/Material';
import type { Tier } from './Item';

export class PickaxeItem extends DiggerItem {
  /** C++ PickaxeItem::PickaxeItem(int id, const Tier& tier) */
  constructor(id: number, tier: Tier) {
    super(id, 2, tier);

    const d: Tile[] = [];
    d.push(Tile.stoneBrick);
    d.push(Tile.stoneSlab);
    d.push(Tile.stoneSlabHalf);
    d.push(Tile.rock);
    d.push(Tile.sandStone);
    d.push(Tile.mossStone);
    d.push(Tile.ironOre);
    d.push(Tile.ironBlock);
    d.push(Tile.coalOre);
    d.push(Tile.goldBlock);
    d.push(Tile.goldOre);
    d.push(Tile.emeraldOre);
    d.push(Tile.emeraldBlock);
    d.push(Tile.ice);
    // d.push(Tile.hellRock);       // C++ 里注释掉了
    d.push(Tile.lapisOre);
    d.push(Tile.lapisBlock);
    d.push(Tile.redStoneOre);
    d.push(Tile.redStoneOre_lit);
    // d.push(Tile.rail);           // C++ 里注释掉了
    // d.push(Tile.detectorRail);   // C++ 里注释掉了
    // d.push(Tile.goldenRail);     // C++ 里注释掉了

    this.setTiles(d);
  }

  /** C++ PickaxeItem::canDestroySpecial(const Tile* tile) const */
  override canDestroySpecial(tile: Tile | null): boolean {
    if (tile === Tile.obsidian) return this.tier.getLevel() === 3;
    if (tile === Tile.emeraldBlock || tile === Tile.emeraldOre) return this.tier.getLevel() >= 2;
    if (tile === Tile.goldBlock || tile === Tile.goldOre) return this.tier.getLevel() >= 2;
    if (tile === Tile.ironBlock || tile === Tile.ironOre) return this.tier.getLevel() >= 1;
    if (tile === Tile.lapisBlock || tile === Tile.lapisOre) return this.tier.getLevel() >= 1;
    if (tile === Tile.redStoneOre || tile === Tile.redStoneOre_lit)
      return this.tier.getLevel() >= 2;

    // C++ 里此处未判空，tile == null 是 UB；TS 里抛 TypeError，属不可避免差异
    if (tile!.material === Material.stone) return true;
    if (tile!.material === Material.metal) return true;
    return false;
  }

  /** C++ PickaxeItem::getDestroySpeed(ItemInstance*, Tile*) */
  override getDestroySpeed(itemInstance: ItemInstance, tile: Tile | null): number {
    if (tile !== null && (tile.material === Material.metal || tile.material === Material.stone)) {
      return this.speed;
    }
    return super.getDestroySpeed(itemInstance, tile!);
  }
}
