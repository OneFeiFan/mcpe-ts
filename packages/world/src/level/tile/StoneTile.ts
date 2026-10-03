import { Random } from '@mcpe/util';
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class StoneTile extends Tile {
  constructor(id: number, tex: number) {
    super(id, tex, Material.stone);
  }

  override getResource(data: number, random: Random): number {
    return Tile.stoneBrick.id;
  }
}
