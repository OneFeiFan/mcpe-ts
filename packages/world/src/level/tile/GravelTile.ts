import { HeavyTile } from './HeavyTile';
import { Item } from '../../item/Item';
import type { Random } from '@mcpe/util';

export class GravelTile extends HeavyTile {
  /** C++ GravelTile::GravelTile(int type, int tex) */
  constructor(type: number, tex: number) {
    super(type, tex);
  }

  /** C++ GravelTile::getResource(int data, Random* random) */
  override getResource(_data: number, random: Random): number {
    if (random.nextInt(10) === 0) return Item.flint.id;
    return this.id;
  }
}
