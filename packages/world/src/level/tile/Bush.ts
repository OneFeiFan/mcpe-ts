import { Tile } from "./Tile";
import { Material } from "../material/Material";
import { Level } from "../Level";
import { AABB } from "../../phys/AABB";
import type { Random } from "@mcpe/util";

export class Bush extends Tile {
  /** C++ Bush::Bush(int id, int tex) */
  constructor(id: number, tex: number);
  /** C++ Bush::Bush(int id, int tex, const Material* material) */
  constructor(id: number, tex: number, material: Material);
  constructor(id: number, tex: number, material: Material = Material.plant) {
    super(id, material);
    this.tex = tex;
    this.setTicking(true);
    const ss = 0.2;
    this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, ss * 3, 0.5 + ss);
  }

  /** C++ Bush::mayPlace(Level*, int, int, int, unsigned char) */

  override mayPlace(level: Level, x: number, y: number, z: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face?: number): boolean {
    return this.mayPlaceOn(level.getTile(x, y - 1, z));
  }

  /** C++ Bush::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    super.neighborChanged(level, x, y, z, type);
    this.checkAlive(level, x, y, z);
  }

  /** C++ Bush::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    this.checkAlive(level, x, y, z);
  }

  /** C++ Bush::canSurvive(Level*, int, int, int) */
  override canSurvive(level: Level, x: number, y: number, z: number): boolean {
    return (
      (level.getRawBrightness(x, y, z) >= 8 || level.canSeeSky(x, y, z)) &&
      this.mayPlaceOn(level.getTile(x, y - 1, z))
    );
  }

  /** C++ Bush::getAABB(Level*, int, int, int) */
  override getAABB(_level: Level, _x: number, _y: number, _z: number): AABB | null {
    return null;
  }

  /** C++ Bush::blocksLight() */
  blocksLight(): boolean {
    return false;
  }

  /** C++ Bush::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ Bush::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ Bush::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_CROSS_TEXTURE;
  }

  /** C++ Bush::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ Bush::mayPlaceOn(int tile) — protected virtual */
  protected mayPlaceOn(tile: number): boolean {
    return tile === Tile.grass.id
        || tile === Tile.dirt.id
        || tile === Tile.farmland.id;
  }

  /** C++ Bush::checkAlive(Level*, int, int, int) — protected */
  protected checkAlive(level: Level, x: number, y: number, z: number): void {
    if (!this.canSurvive(level, x, y, z)) {
      this.spawnResources(level, x, y, z, level.getData(x, y, z));
      level.setTile(x, y, z, 0);
    }
  }
}