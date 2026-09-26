// 1:1 移植自 src/world/level/tile/FarmTile.h（S3）
import type { Random } from '@mcpe/util';
import type { AABB } from '../../phys/AABB';
import { idOf } from '../../Unregistered';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class FarmTile extends Tile {
  constructor(id: number) {
    super(id, Material.dirt);
    this.tex = 7 + 5 * 16;
    this.setTicking(true);
    this.setShape(0, 0, 0, 1, 15 / 16.0, 1);
    this.setLightBlock(255);
  }

  override getAABB(_level: Level, x: number, y: number, z: number): AABB | null {
    const bb = this.tmpBB;
    bb.x0 = x;
    bb.y0 = y;
    bb.z0 = z;
    bb.x1 = x + 1;
    bb.y1 = y + 1;
    bb.z1 = z + 1;
    return bb;
  }

  override isSolidRender(): boolean {
    return false;
  }

  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ getTexture(int face, int data) */
  override getTexture$2(face: number, data: number): number {
    if (face === 1 && data > 0) return this.tex - 1;
    if (face === 1) return this.tex;
    return 2;
  }

  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (this.isNearWater(level, x, y, z)) {
      level.setData(x, y, z, 7);
    } else {
      const moisture = level.getData(x, y, z);
      if (moisture > 0) {
        level.setData(x, y, z, moisture - 1);
      } else {
        if (!this.isUnderCrops(level, x, y, z)) {
          level.setTile(x, y, z, Tile.dirt.id);
        }
      }
    }
  }

  // OMIT(Entity): fallOn(level, x, y, z, entity, fallDistance)  FarmTile.h:62

  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    super.neighborChanged(level, x, y, z, type);
    const above = level.getMaterial(x, y + 1, z);
    if (above.isSolid()) {
      level.setTile(x, y, z, Tile.dirt.id);
    }
  }

  /** C++ 在这里新增的非 virtual 方法 */
  blocksLight(): boolean {
    return true;
  }

  override getResource(_data: number, random: Random): number {
    return Tile.dirt.getResource(0, random);
  }

  private isUnderCrops(level: Level, x: number, y: number, z: number): boolean {
    const r = 0;
    for (let xx = x - r; xx <= x + r; xx++)
      for (let zz = z - r; zz <= z + r; zz++) {
        // ADAPTED(DeferredTile): == Tile::crops->id —— crops 未注册时恒为 false
        if (level.getTile(xx, y + 1, zz) === idOf(Tile.crops)) {
          return true;
        }
      }
    return false;
  }

  private isNearWater(level: Level, x: number, y: number, z: number): boolean {
    for (let xx = x - 4; xx <= x + 4; xx++) {
      for (let yy = y; yy <= y + 1; yy++) {
        for (let zz = z - 4; zz <= z + 4; zz++) {
          if (level.getMaterial(xx, yy, zz) === Material.water) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
