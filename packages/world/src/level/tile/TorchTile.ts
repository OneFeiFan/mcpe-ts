import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { AABB } from '../../phys/AABB';
import { Vec3 } from '../../phys/Vec3';
import { HitResult } from '../../phys/HitResult';
import { ParticleType } from '../../entity/EntityTypes';
import type { Random } from '@mcpe/util';

export class TorchTile extends Tile {
  /** C++ TorchTile::TorchTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.decoration);
    this.setTicking(true);
  }

  /** C++ TorchTile::getAABB(Level*, int, int, int) */
  override getAABB(_level: Level, _x: number, _y: number, _z: number): AABB | null {
    return null;
  }

  /** C++ TorchTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ TorchTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ TorchTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_TORCH;
  }

  /** C++ TorchTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ TorchTile::mayPlace(Level*, int, int, int) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean {
    if (level.isSolidBlockingTile(x - 1, y, z)) return true;
    else if (level.isSolidBlockingTile(x + 1, y, z)) return true;
    else if (level.isSolidBlockingTile(x, y, z - 1)) return true;
    else if (level.isSolidBlockingTile(x, y, z + 1)) return true;
    else if (this.isConnection(level, x, y - 1, z)) return true;
    return false;
  }

  /** C++ TorchTile::getPlacedOnFaceDataValue(Level*, int, int, int, int, float, float, float, int) */
  override getPlacedOnFaceDataValue(
    level: Level,
    x: number,
    y: number,
    z: number,
    face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
    itemValue: number,
  ): number {
    let dir = itemValue;

    // 5 个独立 if，不是 else if；顺序与 C++ 一致
    if (face === 1 && this.isConnection(level, x, y - 1, z)) dir = 5;
    if (face === 2 && level.isSolidBlockingTile(x, y, z + 1)) dir = 4;
    if (face === 3 && level.isSolidBlockingTile(x, y, z - 1)) dir = 3;
    if (face === 4 && level.isSolidBlockingTile(x + 1, y, z)) dir = 2;
    if (face === 5 && level.isSolidBlockingTile(x - 1, y, z)) dir = 1;

    return dir;
  }

  /** C++ TorchTile::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, random: Random): void {
    super.tick(level, x, y, z, random);
    if (level.getData(x, y, z) === 0) this.onPlace(level, x, y, z);
  }

  /** C++ TorchTile::onPlace(Level*, int, int, int) */
  override onPlace(level: Level, x: number, y: number, z: number): void {
    if (level.isSolidBlockingTile(x - 1, y, z)) {
      level.setData(x, y, z, 1);
    } else if (level.isSolidBlockingTile(x + 1, y, z)) {
      level.setData(x, y, z, 2);
    } else if (level.isSolidBlockingTile(x, y, z - 1)) {
      level.setData(x, y, z, 3);
    } else if (level.isSolidBlockingTile(x, y, z + 1)) {
      level.setData(x, y, z, 4);
    } else if (this.isConnection(level, x, y - 1, z)) {
      level.setData(x, y, z, 5);
    }
    this.checkCanSurvive(level, x, y, z);
  }

  /** C++ TorchTile::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, _type: number): void {
    if (this.checkCanSurvive(level, x, y, z)) {
      const dir = level.getData(x, y, z);
      let replace = false;

      if (!level.isSolidBlockingTile(x - 1, y, z) && dir === 1) replace = true;
      if (!level.isSolidBlockingTile(x + 1, y, z) && dir === 2) replace = true;
      if (!level.isSolidBlockingTile(x, y, z - 1) && dir === 3) replace = true;
      if (!level.isSolidBlockingTile(x, y, z + 1) && dir === 4) replace = true;
      if (!this.isConnection(level, x, y - 1, z) && dir === 5) replace = true;

      if (replace) {
        this.spawnResources(level, x, y, z, level.getData(x, y, z));
        level.setTile(x, y, z, 0);
      }
    }
    // C++ 不调 super.neighborChanged
  }

  /** C++ TorchTile::clip(Level*, int, int, int, const Vec3&, const Vec3&) */
  override clip(level: Level, x: number, y: number, z: number, a: Vec3, b: Vec3): HitResult {
    const dir = level.getData(x, y, z) & 7;

    let r = 0.15;
    if (dir === 1) {
      this.setShape(0, 0.2, 0.5 - r, r * 2, 0.8, 0.5 + r);
    } else if (dir === 2) {
      this.setShape(1 - r * 2, 0.2, 0.5 - r, 1, 0.8, 0.5 + r);
    } else if (dir === 3) {
      this.setShape(0.5 - r, 0.2, 0, 0.5 + r, 0.8, r * 2);
    } else if (dir === 4) {
      this.setShape(0.5 - r, 0.2, 1 - r * 2, 0.5 + r, 0.8, 1);
    } else {
      r = 0.1;
      this.setShape(0.5 - r, 0.0, 0.5 - r, 0.5 + r, 0.6, 0.5 + r);
    }

    return super.clip(level, x, y, z, a, b);
  }

  /** C++ TorchTile::animateTick(Level*, int, int, int, Random*) */
  override animateTick(level: Level, xt: number, yt: number, zt: number, _random: Random): void {
    const dir = level.getData(xt, yt, zt);
    const x = xt + 0.5;
    const y = yt + 0.7;
    const z = zt + 0.5;
    const h = 0.22;
    const r = 0.27;

    if (dir === 1) {
      level.addParticle(ParticleType.smoke, x - r, y + h, z, 0, 0, 0);
      level.addParticle(ParticleType.flame, x - r, y + h, z, 0, 0, 0);
    } else if (dir === 2) {
      level.addParticle(ParticleType.smoke, x + r, y + h, z, 0, 0, 0);
      level.addParticle(ParticleType.flame, x + r, y + h, z, 0, 0, 0);
    } else if (dir === 3) {
      level.addParticle(ParticleType.smoke, x, y + h, z - r, 0, 0, 0);
      level.addParticle(ParticleType.flame, x, y + h, z - r, 0, 0, 0);
    } else if (dir === 4) {
      level.addParticle(ParticleType.smoke, x, y + h, z + r, 0, 0, 0);
      level.addParticle(ParticleType.flame, x, y + h, z + r, 0, 0, 0);
    } else {
      level.addParticle(ParticleType.smoke, x, y, z, 0, 0, 0);
      level.addParticle(ParticleType.flame, x, y, z, 0, 0, 0);
    }
  }

  /** C++ TorchTile::isConnection(Level*, int, int, int) — private */
  private isConnection(level: Level, x: number, y: number, z: number): boolean {
    if (level.isSolidBlockingTile(x, y, z)) return true;

    const tile = level.getTile(x, y, z);
    if (tile === Tile.fence.id || tile === Tile.glass.id /* || tile === Tile.cobbleWall.id */) {
      return true;
    }
    return false;
  }

  /** C++ TorchTile::checkCanSurvive(Level*, int, int, int) — private */
  private checkCanSurvive(level: Level, x: number, y: number, z: number): boolean {
    if (!this.mayPlace(level, x, y, z)) {
      if (level.getTile(x, y, z) === this.id) {
        this.spawnResources(level, x, y, z, level.getData(x, y, z));
        level.setTile(x, y, z, 0);
      }
      return false;
    }
    return true;
  }
}
