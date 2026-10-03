import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Item } from '../../item/Item';
import type { Random } from '@mcpe/util';

export class LightGemTile extends Tile {
  /** C++ LightGemTile::LightGemTile(int id, int tex, const Material* material) */
  constructor(id: number, tex: number, material: Material) {
    super(id, tex, material);
  }

  /** C++ LightGemTile::getResourceCount(Random* random) */
  override getResourceCount(random: Random): number {
    return 2 + random.nextInt(3);
  }

  /** C++ LightGemTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Item.yellowDust.id;
  }
}
