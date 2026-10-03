import { DiggerItem } from './DiggerItem';
import { Tile } from '../level/tile/Tile';
import type { Tier } from './Item';

export class ShovelItem extends DiggerItem {
  /** C++ ShovelItem::ShovelItem(int id, const Tier& tier) */
  constructor(id: number, tier: Tier) {
    super(id, 1, tier);

    const d: Tile[] = [];
    d.push(Tile.grass);
    d.push(Tile.dirt);
    d.push(Tile.sand);
    d.push(Tile.gravel);
    d.push(Tile.topSnow);
    d.push(Tile.snow);
    d.push(Tile.clay);
    d.push(Tile.farmland);

    this.setTiles(d);
  }

  /** C++ ShovelItem::canDestroySpecial(const Tile* tile) const */
  override canDestroySpecial(tile: Tile | null): boolean {
    if (tile === Tile.topSnow) return true;
    if (tile === Tile.snow) return true;
    return false;
  }
}
