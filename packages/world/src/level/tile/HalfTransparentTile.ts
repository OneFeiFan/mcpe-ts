import { Tile } from "./Tile";
import { Material } from "../material/Material";
import type { LevelSource } from "../LevelSource";

export class HalfTransparentTile extends Tile {
  private readonly allowSame: boolean;

  /** C++ HalfTransparentTile::HalfTransparentTile(int id, int tex, const Material* material, bool allowSame) */
  constructor(id: number, tex: number, material: Material, allowSame: boolean) {
    super(id, tex, material);
    this.allowSame = allowSame;
  }

  /** C++ HalfTransparentTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_BLEND;
  }

  /** C++ HalfTransparentTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ HalfTransparentTile::shouldRenderFace(LevelSource*, int, int, int, int) */
  override shouldRenderFace(
    level: LevelSource,
    x: number, y: number, z: number,
    face: number,
  ): boolean {
    // 局部 id 遮蔽 this.id，对应 C++ 的局部变量 id
    const id = level.getTile(x, y, z);
    if (!this.allowSame && id === this.id) return false;
    return super.shouldRenderFace(level, x, y, z, face);
  }

  /** C++ HalfTransparentTile::blocksLight() */
  blocksLight(): boolean {
    return false;
  }
}