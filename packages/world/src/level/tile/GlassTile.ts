import { HalfTransparentTile } from "./HalfTransparentTile";
import { Material } from "../material/Material";
import type { Random } from "@mcpe/util";
import { Tile } from "./Tile";

export class GlassTile extends HalfTransparentTile {
  /** C++ GlassTile::GlassTile(int id, int tex, const Material* material, bool allowSame) */
  constructor(id: number, tex: number, material: Material, allowSame: boolean) {
    super(id, tex, material, allowSame);
  }

  /** C++ GlassTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 0;
  }

  /** C++ GlassTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }
}