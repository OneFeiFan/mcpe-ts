// 1:1 移植自 src/world/level/tile/MetalTile.h
import { Tile } from './Tile';
import { Material } from '../material/Material';

export class MetalTile extends Tile {
  /** C++ MetalTile::MetalTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, Material.metal);
    this.tex = tex;
  }

  /** C++ MetalTile::getTexture(int face) */
  override getTextureForFace(_face: number): number {
    return this.tex;
  }
}
