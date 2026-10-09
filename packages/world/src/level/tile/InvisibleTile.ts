// 1:1 移植自 src/world/level/tile/InvisibleTile.h
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class InvisibleTile extends Tile {
  constructor(id: number, tex: number, material: Material) {
    super(id, tex, material);
  }

  override getRenderShape(): number {
    return InvisibleTile.SHAPE_INVISIBLE;
  }
}
