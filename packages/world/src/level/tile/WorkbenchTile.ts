import { Tile } from "./Tile";
import { Material } from "../material/Material";
import type { Level } from "../Level";
import { Facing } from "../../Facing";
import type { Player } from "../../entity/player/Player";

/** Recipe::SIZE_3X3（Recipe.cpp 里定义为 1；合成系统计划外，先用同值常量） */
const RECIPE_SIZE_3X3 = 1;

export class WorkbenchTile extends Tile {
  /** C++ WorkbenchTile::WorkbenchTile(int id) */
  constructor(id: number) {
    super(id, Material.wood);
    this.tex = 11 + 16 * 3;
  }

  /** C++ WorkbenchTile::getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face === Facing.UP) return this.tex - 16;
    if (face === Facing.DOWN) return Tile.wood.getTexture(0);
    if (face === Facing.NORTH || face === Facing.WEST) return this.tex + 1;
    return this.tex;
  }

  /** C++ WorkbenchTile::use(Level*, int, int, int, Player*) */
  override use(_level: Level, x: number, y: number, z: number, player: Player): boolean {
    player.startCrafting(x, y, z, RECIPE_SIZE_3X3);
    return true;
  }
}