import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { AABB } from '../../phys/AABB';
import { Vec3 } from '../../phys/Vec3';
import { HitResult } from '../../phys/HitResult';
import { Entity } from '../../entity/Entity';
import { Facing } from '../../Facing';
import { Mth, Random } from '@mcpe/util';
import type { LevelSource, Player } from '../..';
import type { Mob } from '../../entity/Mob';

export class StairTile extends Tile {
  static readonly UPSIDEDOWN_BIT = 4;
  static readonly DIR_EAST = 0;
  static readonly DIR_WEST = 1;
  static readonly DIR_SOUTH = 2;
  static readonly DIR_NORTH = 3;

  static readonly DEAD_SPACES: readonly (readonly [number, number])[] = [
    [2, 6],
    [3, 7],
    [2, 3],
    [6, 7],
    [0, 4],
    [1, 5],
    [0, 1],
    [4, 5],
  ];

  private readonly base: Tile;

  private isClipping = false;
  private clipStep = 0;
  private baseData = 0;

  /** C++ StairTile::StairTile(int id, Tile* base) */
  constructor(id: number, base: Tile) {
    super(id, base.tex, base.material);
    this.base = base;
    this.setDestroyTime(base.destroySpeed);
    this.setExplodeable(base.explosionResistance / 3);
    this.setSoundType(base.soundType!);
    this.setLightBlock(255);
  }

  /** C++ StairTile::clip(Level*, int, int, int, const Vec3&, const Vec3&) */
  override clip(level: Level, xt: number, yt: number, zt: number, a: Vec3, b: Vec3): HitResult {
    const results: HitResult[] = new Array(8);
    const data = level.getData(xt, yt, zt);
    const dir = data & 0x3;
    const upsideDown = (data & StairTile.UPSIDEDOWN_BIT) === StairTile.UPSIDEDOWN_BIT;
    const deadSpaces = StairTile.DEAD_SPACES[dir + (upsideDown ? 4 : 0)];

    this.isClipping = true;
    for (let i = 0; i < 8; i++) {
      this.clipStep = i;
      results[i] = super.clip(level, xt, yt, zt, a, b);
    }
    this.isClipping = false;

    // 把两个"死空间"结果重置为空命中
    results[deadSpaces![0]] = new HitResult();
    results[deadSpaces![1]] = new HitResult();

    let closest: HitResult | null = null;
    let closestDist = 0;
    for (let r = 0; r < 8; r++) {
      const result = results[r]!;
      if (result.isHit()) {
        const dist = result.pos.distanceToSqr(b.x, b.y, b.z);
        // 注意：是 > 不是 <，选的是最远的命中
        if (dist > closestDist) {
          closest = result;
          closestDist = dist;
        }
      }
    }
    if (closest === null) return new HitResult();
    return closest;
  }

  /** C++ StairTile::updateShape(LevelSource*, int, int, int) */
  override updateShape(_level: LevelSource, _x: number, _y: number, _z: number): void {
    if (this.isClipping) {
      const k = this.clipStep;
      this.setShape(
        0.5 * (k % 2),
        0.5 * (Math.floor(k / 2) % 2),
        0.5 * (Math.floor(k / 4) % 2),
        0.5 + 0.5 * (k % 2),
        0.5 + 0.5 * (Math.floor(k / 2) % 2),
        0.5 + 0.5 * (Math.floor(k / 4) % 2),
      );
    } else {
      this.setShape(0, 0, 0, 1, 1, 1);
    }
  }

  /** C++ StairTile::setBaseShape(LevelSource*, int, int, int) */
  setBaseShape(level: LevelSource, x: number, y: number, z: number): void {
    const data = level.getData(x, y, z);
    if ((data & StairTile.UPSIDEDOWN_BIT) !== 0) {
      this.setShape(0, 0.5, 0, 1, 1, 1);
    } else {
      this.setShape(0, 0, 0, 1, 0.5, 1);
    }
  }

  /** C++ StairTile::isStairs(int id) — static */
  static isStairs(id: number): boolean {
    return id > 0 && Tile.tiles[id]!.getRenderShape() === Tile.SHAPE_STAIRS;
  }

  /** C++ StairTile::isLockAttached(LevelSource*, int, int, int, int) */
  isLockAttached(level: LevelSource, x: number, y: number, z: number, data: number): boolean {
    const lockTile = level.getTile(x, y, z);
    if (StairTile.isStairs(lockTile) && level.getData(x, y, z) === data) {
      return true;
    }
    return false;
  }

  /** C++ StairTile::setStepShape(LevelSource*, int, int, int) */
  setStepShape(level: LevelSource, x: number, y: number, z: number): boolean {
    const data = level.getData(x, y, z);
    const dir = data & 0x3;

    let bottom = 0.5;
    let top = 1.0;
    if ((data & StairTile.UPSIDEDOWN_BIT) !== 0) {
      bottom = 0;
      top = 0.5;
    }

    let west = 0;
    let east = 1;
    let north = 0;
    let south = 0.5;

    let checkInnerPiece = true;

    if (dir === StairTile.DIR_EAST) {
      west = 0.5;
      south = 1;

      const backTile = level.getTile(x + 1, y, z);
      const backData = level.getData(x + 1, y, z);
      if (
        StairTile.isStairs(backTile) &&
        (data & StairTile.UPSIDEDOWN_BIT) === (backData & StairTile.UPSIDEDOWN_BIT)
      ) {
        const backDir = backData & 0x3;
        if (backDir === StairTile.DIR_NORTH && !this.isLockAttached(level, x, y, z + 1, data)) {
          south = 0.5;
          checkInnerPiece = false;
        } else if (
          backDir === StairTile.DIR_SOUTH &&
          !this.isLockAttached(level, x, y, z - 1, data)
        ) {
          north = 0.5;
          checkInnerPiece = false;
        }
      }
    } else if (dir === StairTile.DIR_WEST) {
      east = 0.5;
      south = 1;

      const backTile = level.getTile(x - 1, y, z);
      const backData = level.getData(x - 1, y, z);
      if (
        StairTile.isStairs(backTile) &&
        (data & StairTile.UPSIDEDOWN_BIT) === (backData & StairTile.UPSIDEDOWN_BIT)
      ) {
        const backDir = backData & 0x3;
        if (backDir === StairTile.DIR_NORTH && !this.isLockAttached(level, x, y, z + 1, data)) {
          south = 0.5;
          checkInnerPiece = false;
        } else if (
          backDir === StairTile.DIR_SOUTH &&
          !this.isLockAttached(level, x, y, z - 1, data)
        ) {
          north = 0.5;
          checkInnerPiece = false;
        }
      }
    } else if (dir === StairTile.DIR_SOUTH) {
      north = 0.5;
      south = 1;

      const backTile = level.getTile(x, y, z + 1);
      const backData = level.getData(x, y, z + 1);
      if (
        StairTile.isStairs(backTile) &&
        (data & StairTile.UPSIDEDOWN_BIT) === (backData & StairTile.UPSIDEDOWN_BIT)
      ) {
        const backDir = backData & 0x3;
        if (backDir === StairTile.DIR_WEST && !this.isLockAttached(level, x + 1, y, z, data)) {
          east = 0.5;
          checkInnerPiece = false;
        } else if (
          backDir === StairTile.DIR_EAST &&
          !this.isLockAttached(level, x - 1, y, z, data)
        ) {
          west = 0.5;
          checkInnerPiece = false;
        }
      }
    } else if (dir === StairTile.DIR_NORTH) {
      const backTile = level.getTile(x, y, z - 1);
      const backData = level.getData(x, y, z - 1);
      if (
        StairTile.isStairs(backTile) &&
        (data & StairTile.UPSIDEDOWN_BIT) === (backData & StairTile.UPSIDEDOWN_BIT)
      ) {
        const backDir = backData & 0x3;
        if (backDir === StairTile.DIR_WEST && !this.isLockAttached(level, x + 1, y, z, data)) {
          east = 0.5;
          checkInnerPiece = false;
        } else if (
          backDir === StairTile.DIR_EAST &&
          !this.isLockAttached(level, x - 1, y, z, data)
        ) {
          west = 0.5;
          checkInnerPiece = false;
        }
      }
    }

    this.setShape(west, bottom, north, east, top, south);
    return checkInnerPiece;
  }

  /** C++ StairTile::setInnerPieceShape(LevelSource*, int, int, int) */
  setInnerPieceShape(level: LevelSource, x: number, y: number, z: number): boolean {
    const data = level.getData(x, y, z);
    const dir = data & 0x3;

    let bottom = 0.5;
    let top = 1.0;
    if ((data & StairTile.UPSIDEDOWN_BIT) !== 0) {
      bottom = 0;
      top = 0.5;
    }

    let west = 0;
    let east = 0.5;
    let north = 0.5;
    let south = 1.0;

    let hasInnerPiece = false;

    if (dir === StairTile.DIR_EAST) {
      const frontTile = level.getTile(x - 1, y, z);
      const frontData = level.getData(x - 1, y, z);
      if (
        StairTile.isStairs(frontTile) &&
        (data & StairTile.UPSIDEDOWN_BIT) === (frontData & StairTile.UPSIDEDOWN_BIT)
      ) {
        const frontDir = frontData & 0x3;
        if (frontDir === StairTile.DIR_NORTH && !this.isLockAttached(level, x, y, z - 1, data)) {
          north = 0;
          south = 0.5;
          hasInnerPiece = true;
        } else if (
          frontDir === StairTile.DIR_SOUTH &&
          !this.isLockAttached(level, x, y, z + 1, data)
        ) {
          north = 0.5;
          south = 1;
          hasInnerPiece = true;
        }
      }
    } else if (dir === StairTile.DIR_WEST) {
      const frontTile = level.getTile(x + 1, y, z);
      const frontData = level.getData(x + 1, y, z);
      if (
        StairTile.isStairs(frontTile) &&
        (data & StairTile.UPSIDEDOWN_BIT) === (frontData & StairTile.UPSIDEDOWN_BIT)
      ) {
        west = 0.5;
        east = 1.0;
        const frontDir = frontData & 0x3;
        if (frontDir === StairTile.DIR_NORTH && !this.isLockAttached(level, x, y, z - 1, data)) {
          north = 0;
          south = 0.5;
          hasInnerPiece = true;
        } else if (
          frontDir === StairTile.DIR_SOUTH &&
          !this.isLockAttached(level, x, y, z + 1, data)
        ) {
          north = 0.5;
          south = 1;
          hasInnerPiece = true;
        }
      }
    } else if (dir === StairTile.DIR_SOUTH) {
      const frontTile = level.getTile(x, y, z - 1);
      const frontData = level.getData(x, y, z - 1);
      if (
        StairTile.isStairs(frontTile) &&
        (data & StairTile.UPSIDEDOWN_BIT) === (frontData & StairTile.UPSIDEDOWN_BIT)
      ) {
        north = 0;
        south = 0.5;

        const frontDir = frontData & 0x3;
        if (frontDir === StairTile.DIR_WEST && !this.isLockAttached(level, x - 1, y, z, data)) {
          hasInnerPiece = true;
        } else if (
          frontDir === StairTile.DIR_EAST &&
          !this.isLockAttached(level, x + 1, y, z, data)
        ) {
          west = 0.5;
          east = 1.0;
          hasInnerPiece = true;
        }
      }
    } else if (dir === StairTile.DIR_NORTH) {
      const frontTile = level.getTile(x, y, z + 1);
      const frontData = level.getData(x, y, z + 1);
      if (
        StairTile.isStairs(frontTile) &&
        (data & StairTile.UPSIDEDOWN_BIT) === (frontData & StairTile.UPSIDEDOWN_BIT)
      ) {
        const frontDir = frontData & 0x3;
        if (frontDir === StairTile.DIR_WEST && !this.isLockAttached(level, x - 1, y, z, data)) {
          hasInnerPiece = true;
        } else if (
          frontDir === StairTile.DIR_EAST &&
          !this.isLockAttached(level, x + 1, y, z, data)
        ) {
          west = 0.5;
          east = 1.0;
          hasInnerPiece = true;
        }
      }
    }

    if (hasInnerPiece) {
      this.setShape(west, bottom, north, east, top, south);
    }
    return hasInnerPiece;
  }

  /** C++ StairTile::addAABBs(Level*, int, int, int, const AABB*, std::vector<AABB>&) */
  override addAABBs(level: Level, x: number, y: number, z: number, box: AABB, boxes: AABB[]): void {
    this.setBaseShape(level, x, y, z);
    super.addAABBs(level, x, y, z, box, boxes);

    const checkInnerPiece = this.setStepShape(level, x, y, z);
    super.addAABBs(level, x, y, z, box, boxes);

    if (checkInnerPiece) {
      if (this.setInnerPieceShape(level, x, y, z)) {
        super.addAABBs(level, x, y, z, box, boxes);
      }
    }
    this.setShape(0, 0, 0, 1, 1, 1);
  }

  /** C++ StairTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ StairTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ StairTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_STAIRS;
  }

  /** C++ StairTile::setPlacedBy(Level*, int, int, int, Mob*) */
  override setPlacedBy(level: Level, x: number, y: number, z: number, by: Mob): void {
    const dir = Mth.floor((by.yRot * 4) / 360 + 0.5) & 3;
    const usd = level.getData(x, y, z) & StairTile.UPSIDEDOWN_BIT;

    if (dir === 0) level.setData(x, y, z, 2 | usd);
    if (dir === 1) level.setData(x, y, z, 1 | usd);
    if (dir === 2) level.setData(x, y, z, 3 | usd);
    if (dir === 3) level.setData(x, y, z, 0 | usd);
  }

  /** C++ StairTile::getPlacedOnFaceDataValue(Level*, int, int, int, int, float, float, float, int) */
  override getPlacedOnFaceDataValue(
    _level: Level,
    _x: number,
    _y: number,
    _z: number,
    face: number,
    _clickX: number,
    clickY: number,
    _clickZ: number,
    itemValue: number,
  ): number {
    if (face === Facing.DOWN || (face !== Facing.UP && clickY > 0.5)) {
      return itemValue | StairTile.UPSIDEDOWN_BIT;
    }
    return itemValue;
  }

  // ---- DELEGATES ----

  override addLights(level: Level, x: number, y: number, z: number): void {
    this.base.addLights(level, x, y, z);
  }

  override animateTick(level: Level, x: number, y: number, z: number, random: Random): void {
    this.base.animateTick(level, x, y, z, random);
  }

  override attack(level: Level, x: number, y: number, z: number, player: Player): void {
    this.base.attack(level, x, y, z, player);
  }

  override destroy(level: Level, x: number, y: number, z: number, data: number): void {
    this.base.destroy(level, x, y, z, data);
  }

  override getBrightness(level: LevelSource, x: number, y: number, z: number): number {
    return this.base.getBrightness(level, x, y, z);
  }

  override getExplosionResistance(source: Entity): number {
    return this.base.getExplosionResistance(source);
  }

  override getRenderLayer(): number {
    return this.base.getRenderLayer();
  }

  override getResourceCount(random: Random): number {
    return this.base.getResourceCount(random);
  }

  /** C++ StairTile::getTexture(int face, int data) */
  override getTextureForData(face: number, _data: number): number {
    return this.base.getTexture(face, this.baseData);
  }

  /** C++ StairTile::getTexture(int face) */
  override getTextureForFace(face: number): number {
    return this.base.getTexture(face, this.baseData);
  }

  /** C++ StairTile::getTexture(LevelSource*, int, int, int, int) */
  override getTextureAt(
    _level: LevelSource,
    _x: number,
    _y: number,
    _z: number,
    face: number,
  ): number {
    return this.base.getTexture(face, this.baseData);
  }

  override getTickDelay(): number {
    return this.base.getTickDelay();
  }

  override getTileAABB(level: Level, x: number, y: number, z: number): AABB {
    return this.base.getTileAABB(level, x, y, z);
  }

  override handleEntityInside(
    level: Level,
    x: number,
    y: number,
    z: number,
    e: Entity,
    current: Vec3,
  ): void {
    this.base.handleEntityInside(level, x, y, z, e, current);
  }

  override mayPick(): boolean;
  override mayPick(data: number, liquid: boolean): boolean;
  override mayPick(data?: number, liquid?: boolean): boolean {
    if (data === undefined) return this.base.mayPick();
    return this.base.mayPick(data, liquid!);
  }

  override mayPlace(level: Level, x: number, y: number, z: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face?: number): boolean {
    return this.base.mayPlace(level, x, y, z);
  }

  override onPlace(level: Level, x: number, y: number, z: number): void {
    this.neighborChanged(level, x, y, z, 0);
    this.base.onPlace(level, x, y, z);
  }

  override onRemove(level: Level, x: number, y: number, z: number): void {
    this.base.onRemove(level, x, y, z);
  }

  override prepareRender(level: Level, x: number, y: number, z: number): void {
    this.base.prepareRender(level, x, y, z);
  }

  override stepOn(level: Level, x: number, y: number, z: number, entity: Entity): void {
    this.base.stepOn(level, x, y, z, entity);
  }

  override tick(level: Level, x: number, y: number, z: number, random: Random): void {
    this.base.tick(level, x, y, z, random);
  }

  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    return this.base.use(level, x, y, z, player);
  }

  override wasExploded(level: Level, x: number, y: number, z: number): void {
    this.base.wasExploded(level, x, y, z);
  }
}
