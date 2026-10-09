// 1:1 移植自 src/world/level/tile/ReedTile.h
import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { AABB } from '../../phys/AABB';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import type { Random } from '@mcpe/util';

export class ReedTile extends Tile {
  /** C++ ReedTile::ReedTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, Material.plant);
    this.tex = tex;
    const ss = 6 / 16.0;
    this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, 1, 0.5 + ss);
    this.setTicking(true);
  }

  /** C++ ReedTile::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (level.isEmptyTile(x, y + 1, z)) {
      let height = 1;
      while (level.getTile(x, y - height, z) === this.id) {
        height++;
      }
      if (height < 3) {
        const age = level.getData(x, y, z);
        if (age === 15) {
          level.setTile(x, y + 1, z, this.id);
          level.setData(x, y, z, 0);
        } else {
          level.setData(x, y, z, age + 1);
        }
      }
    }
  }

  /** C++ ReedTile::mayPlace(Level*, int, int, int) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean {
    const below = level.getTile(x, y - 1, z);
    if (below === this.id) return true;
    if (below !== Tile.grass.id && below !== Tile.dirt.id && below !== Tile.sand.id) {
      return false;
    }
    if (level.getMaterial(x - 1, y - 1, z) === Material.water) return true;
    if (level.getMaterial(x + 1, y - 1, z) === Material.water) return true;
    if (level.getMaterial(x, y - 1, z - 1) === Material.water) return true;
    if (level.getMaterial(x, y - 1, z + 1) === Material.water) return true;
    return false;
  }

  /** C++ ReedTile::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, _type: number): void {
    this.checkAlive(level, x, y, z);
    // C++ does NOT call super.neighborChanged
  }

  /** C++ ReedTile::canSurvive(Level*, int, int, int) */
  override canSurvive(level: Level, x: number, y: number, z: number): boolean {
    return this.mayPlace(level, x, y, z);
  }

  /** C++ ReedTile::getAABB(Level*, int, int, int) */
  override getAABB(_level: Level, _x: number, _y: number, _z: number): AABB | null {
    return null;
  }

  /** C++ ReedTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Item.reeds.id;
  }

  /** C++ ReedTile::blocksLight() */
  blocksLight(): boolean {
    return false;
  }

  /** C++ ReedTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ ReedTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ ReedTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_CROSS_TEXTURE;
  }

  /** C++ ReedTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ ReedTile::checkAlive(Level*, int, int, int) — protected */
  protected checkAlive(level: Level, x: number, y: number, z: number): void {
    if (!this.canSurvive(level, x, y, z)) {
      this.popResource(level, x, y, z, new ItemInstance(Item.reeds));
      level.setTile(x, y, z, 0);
    }
  }
}
