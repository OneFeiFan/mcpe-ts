import { Tile } from "./Tile";
import { Material } from "../material/Material";
import { Facing } from "../../Facing";

export class QuartzBlockTile extends Tile {
  static readonly TYPE_DEFAULT = 0;
  static readonly TYPE_CHISELED = 1;
  static readonly TYPE_LINES = 2;

  /** C++ QuartzBlockTile::QuartzBlockTile(int id) */
  constructor(id: number) {
    super(id, 4 + 13 * 16, Material.stone);
  }

  /** C++ QuartzBlockTile::getTexture(int face, int data) */
  override getTextureForData(face: number, data: number): number {
    if (face === Facing.UP || face === Facing.DOWN) {
      if (data === QuartzBlockTile.TYPE_CHISELED) return 6 + 12 * 16;
      if (data === QuartzBlockTile.TYPE_LINES) return 5 + 12 * 16;
      if (face === Facing.DOWN) return 3 + 13 * 16;
      return 4 + 12 * 16;
    }
    if (data === QuartzBlockTile.TYPE_CHISELED) return 6 + 13 * 16;
    if (data === QuartzBlockTile.TYPE_LINES) return 5 + 13 * 16;
    return this.tex;
  }

  /** C++ QuartzBlockTile::getTileDataForItemAuxValue(int auxValue) */
  static getTileDataForItemAuxValue(auxValue: number): number {
    return auxValue & 0xf;
  }

  /** C++ QuartzBlockTile::getSpawnResourcesAuxValue(int data) */
  protected override getSpawnResourcesAuxValue(data: number): number {
    return data;
  }
}