// 1:1 移植自 src/world/level/tile/DirtTile.h
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class DirtTile extends Tile {
  constructor(id: number, tex: number) {
    super(id, tex, Material.dirt);
  }
}
