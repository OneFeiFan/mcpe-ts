import { MultiTextureTile } from './MultiTextureTile';
import { Material } from '../material/Material';
import { Facing } from '../../Facing';

export class SandStoneTile extends MultiTextureTile {
  static readonly TYPE_DEFAULT = 0;
  static readonly TYPE_HEIROGLYPHS = 1;
  static readonly TYPE_SMOOTHSIDE = 2;

  /** C++ SandStoneTile::SandStoneTile(int id, const int* textures, int texCount) */
  constructor(id: number, textures: readonly number[], texCount: number) {
    super(id, textures, texCount, Material.stone);
  }

  /** C++ SandStoneTile::getTexture(int face, int data) */
  override getTextureForData(face: number, data: number): number {
    if (face === Facing.UP || (face === Facing.DOWN && data > 0)) {
      return 11 * 16;
    }
    if (face === Facing.DOWN) {
      return 13 * 16;
    }
    return super.getTextureForData(face, data);
  }
}
