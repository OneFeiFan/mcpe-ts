import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Item } from '../../item/Item';
import { DyePowderItem } from '../../item/DyePowderItem';
import type { Random } from '@mcpe/util';

export class OreTile extends Tile {
  /** C++ OreTile::OreTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.stone);
  }

  /** C++ OreTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    if (this.id === Tile.coalOre.id) return Item.coal.id;
    if (this.id === Tile.emeraldOre.id) return Item.emerald.id;
    if (this.id === Tile.lapisOre.id) return Item.dye_powder.id;
    return this.id;
  }

  /** C++ OreTile::getResourceCount(Random* random) */
  override getResourceCount(random: Random): number {
    if (this.id === Tile.lapisOre.id) return 4 + random.nextInt(5);
    return 1;
  }

  /** C++ OreTile::getSpawnResourcesAuxValue(int data) */
  protected override getSpawnResourcesAuxValue(_data: number): number {
    if (this.id === Tile.lapisOre.id) return DyePowderItem.BLUE;
    return 0;
  }
}
