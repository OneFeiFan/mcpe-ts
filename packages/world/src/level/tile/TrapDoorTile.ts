// 1:1 移植自 src/world/level/tile/TrapDoorTile.h 与 TrapDoorTile.cpp
import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { AABB } from '../../phys/AABB';
import { Vec3 } from '../../phys/Vec3';
import { HitResult } from '../../phys/HitResult';
import { ItemInstance } from '../../item/ItemInstance';
import type { Player } from '../../entity/player/Player';
import { LevelEvent } from './LevelEvent';

export interface LevelSource {
  getData(x: number, y: number, z: number): number;
  getTile(x: number, y: number, z: number): number;
}

export class TrapDoorTile extends Tile {
  /** C++ TrapDoorTile::TrapDoorTile(int id, const Material* material) */
  constructor(id: number, material: Material) {
    super(id, material);
    this.tex = 4 + 5 * 16;
    if (material === Material.metal) this.tex++;
    const r = 0.5;
    const h = 1.0;
    // 显式调父类 6 参数版本，避免递归到 this.setShapeForData
    super.setShape(0.5 - r, 0, 0.5 - r, 0.5 + r, h, 0.5 + r);
  }

  /** C++ TrapDoorTile::blocksLight() */
  blocksLight(): boolean {
    return false;
  }

  /** C++ TrapDoorTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ TrapDoorTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ TrapDoorTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_BLOCK;
  }

  /** C++ TrapDoorTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ TrapDoorTile::getTileAABB(Level*, int, int, int) */
  override getTileAABB(level: Level, x: number, y: number, z: number): AABB {
    this.updateShape(level, x, y, z);
    return super.getTileAABB(level, x, y, z);
  }

  /** C++ TrapDoorTile::getAABB(Level*, int, int, int) */
  override getAABB(level: Level, x: number, y: number, z: number): AABB {
    this.updateShape(level, x, y, z);
    return super.getAABB(level, x, y, z)!;
  }

  /** C++ TrapDoorTile::updateShape(LevelSource*, int, int, int) */
  override updateShape(level: LevelSource, x: number, y: number, z: number): void {
    this.setShapeForData(level.getData(x, y, z));
  }

  /** C++ TrapDoorTile::updateDefaultShape() */
  override updateDefaultShape(): void {
    const r = 3 / 16.0;
    super.setShape(0, 0.5 - r / 2, 0, 1, 0.5 + r / 2, 1);
  }

  /**
   * C++ TrapDoorTile::setShape(int data)
   * 注意：C++ 里它隐藏了父类的 setShape(float,...) 6 参数版本。
   * TS 里用 setShapeForData 区分。
   */
  setShapeForData(data: number): void {
    const r = 3 / 16.0;
    super.setShape(0, 0, 0, 1, r, 1);
    if (TrapDoorTile.isOpen(data)) {
      if ((data & 3) === 0) super.setShape(0, 0, 1 - r, 1, 1, 1);
      if ((data & 3) === 1) super.setShape(0, 0, 0, 1, 1, r);
      if ((data & 3) === 2) super.setShape(1 - r, 0, 0, 1, 1, 1);
      if ((data & 3) === 3) super.setShape(0, 0, 0, r, 1, 1);
    }
  }

  /** C++ TrapDoorTile::attack(Level*, int, int, int, Player*) */
  override attack(level: Level, x: number, y: number, z: number, player: Player): void {
    this.use(level, x, y, z, player);
  }

  /** C++ TrapDoorTile::use(Level*, int, int, int, Player*) */
  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    if (this.material === Material.metal) return true;

    const dir = level.getData(x, y, z);
    level.setData(x, y, z, dir ^ 4);
    level.levelEvent(player, LevelEvent.SOUND_OPEN_DOOR, x, y, z, 0);
    return true;
  }

  /** C++ TrapDoorTile::setOpen(Level*, int, int, int, bool) */
  setOpen(level: Level, x: number, y: number, z: number, shouldOpen: boolean): void {
    const dir = level.getData(x, y, z);
    const wasOpen = (dir & 4) > 0;
    if (wasOpen === shouldOpen) return;

    level.setData(x, y, z, dir ^ 4);
    level.levelEvent(null, LevelEvent.SOUND_OPEN_DOOR, x, y, z, 0);
  }

  /** C++ TrapDoorTile::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    if (level.isClientSide) return;

    const data = level.getData(x, y, z);
    let xt = x;
    let zt = z;
    if ((data & 3) === 0) zt++;
    if ((data & 3) === 1) zt--;
    if ((data & 3) === 2) xt++;
    if ((data & 3) === 3) xt--;

    if (!TrapDoorTile.attachesTo(level.getTile(xt, y, zt))) {
      level.setTile(x, y, z, 0);
      this.popResource(level, x, y, z, new ItemInstance(Tile.trapdoor));
    }

    const signal = level.hasNeighborSignal(x, y, z);
    // C++ 不检查 Tile.tiles[type] 是否非空；null 时 C++ UB、TS 抛 TypeError
    if (signal || (type > 0 && Tile.tiles[type]!.isSignalSource()) || type === 0) {
      this.setOpen(level, x, y, z, signal);
    }
    // 不调 super.neighborChanged
  }

  /** C++ TrapDoorTile::clip(Level*, int, int, int, const Vec3&, const Vec3&) */
  override clip(level: Level, xt: number, yt: number, zt: number, a: Vec3, b: Vec3): HitResult {
    this.updateShape(level, xt, yt, zt);
    return super.clip(level, xt, yt, zt, a, b);
  }

  /** C++ TrapDoorTile::getDir(int dir) */
  getDir(dir: number): number {
    if ((dir & 4) === 0) {
      return (dir - 1) & 3;
    } else {
      return dir & 3;
    }
  }

  /** C++ TrapDoorTile::getPlacedOnFaceDataValue(Level*, int, int, int, int, float, float, float, int) */
  override getPlacedOnFaceDataValue(
    _level: Level,
    _x: number,
    _y: number,
    _z: number,
    face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
    _itemValue: number,
  ): number {
    let dir = 0;
    if (face === 2) dir = 0;
    if (face === 3) dir = 1;
    if (face === 4) dir = 2;
    if (face === 5) dir = 3;
    return dir;
  }

  /** C++ TrapDoorTile::mayPlace(Level*, int, int, int, unsigned char face) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face?: number): boolean {
    if (face === 0) return false;
    if (face === 1) return false;
    if (face === 2) z++;
    if (face === 3) z--;
    if (face === 4) x++;
    if (face === 5) x--;

    return TrapDoorTile.attachesTo(level.getTile(x, y, z));
  }

  /** C++ TrapDoorTile::isOpen(int data) — static */
  static isOpen(data: number): boolean {
    return (data & 4) !== 0;
  }

  /** C++ TrapDoorTile::attachesTo(int id) — static */
  static attachesTo(id: number): boolean {
    if (id <= 0) return false;

    const tile = Tile.tiles[id] ?? null;
    const isStair = tile !== null && tile.getRenderShape() === Tile.SHAPE_STAIRS;

    return (
      (tile !== null && tile.material.isSolidBlocking() && tile.isCubeShaped()) ||
      tile === Tile.lightGem ||
      tile === Tile.stoneSlabHalf ||
      isStair
    );
  }
}
