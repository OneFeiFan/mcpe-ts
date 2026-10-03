import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { AABB } from '../../phys/AABB';
import { Entity } from '../../entity/Entity';
import type { Random } from '@mcpe/util';

export class CactusTile extends Tile {
  /** C++ CactusTile::CactusTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.cactus);
    this.setTicking(true);
  }

  /** C++ CactusTile::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (level.isEmptyTile(x, y + 1, z)) {
      let height = 1;
      while (level.getTile(x, y - height, z) === this.id) {
        height++;
      }
      if (height < 3) {
        const age = level.getData(x, y, z);
        // C++ 里 /*15*/10，用 10（Pocket Edition 调整，不是 bug）
        if (age >= 10) {
          level.setTile(x, y + 1, z, this.id);
          level.setData(x, y, z, 0);
        } else {
          level.setData(x, y, z, age + 1);
        }
      }
    }
    // 不调 super.tick
  }

  /** C++ CactusTile::getAABB(Level*, int, int, int) */
  override getAABB(_level: Level, x: number, y: number, z: number): AABB {
    const r = 1 / 16.0;
    this.tmpBB.x0 = x + r;
    this.tmpBB.y0 = y;
    this.tmpBB.z0 = z + r;
    this.tmpBB.x1 = x + 1 - r;
    this.tmpBB.y1 = y + 1 - r; // 注意：y1 缩进 r
    this.tmpBB.z1 = z + 1 - r;
    return this.tmpBB;
  }

  /** C++ CactusTile::getTileAABB(Level*, int, int, int) */
  override getTileAABB(_level: Level, x: number, y: number, z: number): AABB {
    const r = 1 / 16.0;
    // 注意：这里 y1 = y + 1（不缩进），和 getAABB 不同；且返回新对象
    return new AABB(x + r, y, z + r, x + 1 - r, y + 1, z + 1 - r);
  }

  /** C++ CactusTile::getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face === 1) return this.tex - 1;
    if (face === 0) return this.tex + 1;
    return this.tex;
  }

  /** C++ CactusTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ CactusTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ CactusTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_CACTUS;
  }

  /** C++ CactusTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ CactusTile::mayPlace(Level*, int, int, int) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean {
    if (!super.mayPlace(level, x, y, z)) return false;
    return this.canSurvive(level, x, y, z);
  }

  /** C++ CactusTile::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, _type: number): void {
    if (!this.canSurvive(level, x, y, z)) {
      // 注意：这里 odds = 1，不是 0
      this.spawnResources(level, x, y, z, level.getData(x, y, z), 1);
      level.setTile(x, y, z, 0);
    }
    // 不调 super.neighborChanged
  }

  /** C++ CactusTile::canSurvive(Level*, int, int, int) */
  override canSurvive(level: Level, x: number, y: number, z: number): boolean {
    if (level.getMaterial(x - 1, y, z)!.isSolid()) return false;
    if (level.getMaterial(x + 1, y, z)!.isSolid()) return false;
    if (level.getMaterial(x, y, z - 1)!.isSolid()) return false;
    if (level.getMaterial(x, y, z + 1)!.isSolid()) return false;
    const below = level.getTile(x, y - 1, z);
    return below === Tile.cactus.id || below === Tile.sand.id;
  }

  /** C++ CactusTile::entityInside(Level*, int, int, int, Entity*) */
  override entityInside(_level: Level, _x: number, _y: number, _z: number, entity: Entity): void {
    entity.hurt(null, 1);
  }
}
