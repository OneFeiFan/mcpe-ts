import { Tile } from "./Tile";
import { Material } from "../material/Material";
import { Level } from "../Level";
import { AABB } from "../../phys/AABB";
import { Vec3 } from "../../phys/Vec3";
import { HitResult } from "../../phys/HitResult";
import { Item } from "../../item/Item";
import { GameType } from "../LevelSettings";
import type { Random } from "@mcpe/util";
import type { Player } from "../..";
import type { LevelSource } from "../LevelSource";
import { LevelEvent } from "./LevelEvent";

export class DoorTile extends Tile {
  static readonly C_DIR_MASK = 3;
  static readonly C_OPEN_MASK = 4;
  static readonly C_LOWER_DATA_MASK = 7;
  static readonly C_IS_UPPER_MASK = 8;
  static readonly C_RIGHT_HINGE_MASK = 16;

  /** C++ DoorTile::DoorTile(int id, const Material* material) */
  constructor(id: number, material: Material) {
    super(id, material);
    this.tex = 1 + 6 * 16;
    if (material === Material.metal) this.tex++;
    const r = 0.5;
    const h = 1.0;
    super.setShape(0.5 - r, 0, 0.5 - r, 0.5 + r, h, 0.5 + r);
  }

  /** C++ DoorTile::getTexture(LevelSource*, int, int, int, int) */
  override getTextureAt(level: LevelSource, x: number, y: number, z: number, face: number): number {
    if (face === 0 || face === 1) return this.tex;

    const compositeData = DoorTile.getCompositeData(level, x, y, z);
    let texture = this.tex;
    if ((compositeData & DoorTile.C_IS_UPPER_MASK) !== 0) texture -= 16;

    const dir = compositeData & DoorTile.C_DIR_MASK;
    const isOpen = (compositeData & DoorTile.C_OPEN_MASK) !== 0;
    if (isOpen) {
      if (dir === 0 && face === 2) texture = -texture;
      else if (dir === 1 && face === 5) texture = -texture;
      else if (dir === 2 && face === 3) texture = -texture;
      else if (dir === 3 && face === 4) texture = -texture;
    } else {
      if (dir === 0 && face === 5) texture = -texture;
      else if (dir === 1 && face === 3) texture = -texture;
      else if (dir === 2 && face === 4) texture = -texture;
      else if (dir === 3 && face === 2) texture = -texture;
      if ((compositeData & DoorTile.C_RIGHT_HINGE_MASK) !== 0) texture = -texture;
    }

    return texture;
  }

  /** C++ DoorTile::blocksLight() */
  blocksLight(): boolean {
    return false;
  }

  /** C++ DoorTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ DoorTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ DoorTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_DOOR;
  }

  /** C++ DoorTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ DoorTile::getTileAABB(Level*, int, int, int) */
  override getTileAABB(level: Level, x: number, y: number, z: number): AABB {
    this.updateShape(level, x, y, z);
    return super.getTileAABB(level, x, y, z);
  }

  /** C++ DoorTile::getAABB(Level*, int, int, int) */
  override getAABB(level: Level, x: number, y: number, z: number): AABB {
    this.updateShape(level, x, y, z);
    return super.getAABB(level, x, y, z)!;
  }

  /** C++ DoorTile::updateShape(LevelSource*, int, int, int) */
  override updateShape(level: LevelSource, x: number, y: number, z: number): void {
    this.setShapeForData(DoorTile.getCompositeData(level, x, y, z));
  }

  /** C++ DoorTile::setShape(int compositeData) */
  setShapeForData(compositeData: number): void {
    const r = 3 / 16.0;
    // 高度 2！跨越上下两格
    super.setShape(0, 0, 0, 1, 2, 1);

    const dir = compositeData & DoorTile.C_DIR_MASK;
    const open = (compositeData & DoorTile.C_OPEN_MASK) !== 0;
    const hasRightHinge = (compositeData & DoorTile.C_RIGHT_HINGE_MASK) !== 0;

    if (dir === 0) {
      if (open) {
        if (!hasRightHinge) super.setShape(0, 0, 0, 1, 1, r);
        else super.setShape(0, 0, 1 - r, 1, 1, 1);
      } else super.setShape(0, 0, 0, r, 1, 1);
    } else if (dir === 1) {
      if (open) {
        if (!hasRightHinge) super.setShape(1 - r, 0, 0, 1, 1, 1);
        else super.setShape(0, 0, 0, r, 1, 1);
      } else super.setShape(0, 0, 0, 1, 1, r);
    } else if (dir === 2) {
      if (open) {
        if (!hasRightHinge) super.setShape(0, 0, 1 - r, 1, 1, 1);
        else super.setShape(0, 0, 0, 1, 1, r);
      } else super.setShape(1 - r, 0, 0, 1, 1, 1);
    } else if (dir === 3) {
      if (open) {
        if (!hasRightHinge) super.setShape(0, 0, 0, r, 1, 1);
        else super.setShape(1 - r, 0, 0, 1, 1, 1);
      } else super.setShape(0, 0, 1 - r, 1, 1, 1);
    }
  }

  /** C++ DoorTile::attack(Level*, int, int, int, Player*) */
  override attack(level: Level, x: number, y: number, z: number, player: Player): void {
    this.use(level, x, y, z, player);
  }

  /** C++ DoorTile::use(Level*, int, int, int, Player*) */
  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    if (this.material === Material.metal) return true;

    const compositeData = DoorTile.getCompositeData(level, x, y, z);
    let lowerData = compositeData & DoorTile.C_LOWER_DATA_MASK;
    lowerData ^= 4;

    if ((compositeData & DoorTile.C_IS_UPPER_MASK) === 0) {
      level.setData(x, y, z, lowerData);
      level.setTilesDirty(x, y, z, x, y, z);
    } else {
      level.setData(x, y - 1, z, lowerData);
      level.setTilesDirty(x, y - 1, z, x, y, z);
    }

    level.levelEvent(player, LevelEvent.SOUND_OPEN_DOOR, x, y, z, 0);
    return true;
  }

  /** C++ DoorTile::isOpen(LevelSource*, int, int, int) — static */
  static isOpen(level: LevelSource, x: number, y: number, z: number): boolean {
    return (DoorTile.getCompositeData(level, x, y, z) & DoorTile.C_OPEN_MASK) !== 0;
  }

  /** C++ DoorTile::setOpen(Level*, int, int, int, bool) */
  setOpen(level: Level, x: number, y: number, z: number, shouldOpen: boolean): void {
    const compositeData = DoorTile.getCompositeData(level, x, y, z);
    const isOpen = (compositeData & DoorTile.C_OPEN_MASK) !== 0;
    if (isOpen === shouldOpen) return;

    let lowerData = compositeData & DoorTile.C_LOWER_DATA_MASK;
    lowerData ^= 4;

    if ((compositeData & DoorTile.C_IS_UPPER_MASK) === 0) {
      level.setData(x, y, z, lowerData);
      level.setTilesDirty(x, y, z, x, y, z);
    } else {
      level.setData(x, y - 1, z, lowerData);
      level.setTilesDirty(x, y - 1, z, x, y, z);
    }

    level.levelEvent(null, LevelEvent.SOUND_OPEN_DOOR, x, y, z, 0);
  }

  /** C++ DoorTile::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    const data = level.getData(x, y, z);

    if ((data & DoorTile.C_IS_UPPER_MASK) === 0) {
      // 下半
      let spawn = false;

      if (level.getTile(x, y + 1, z) !== this.id) {
        level.setTile(x, y, z, 0);
        spawn = true;
      }

      if (!level.isSolidBlockingTile(x, y - 1, z)) {
        level.setTile(x, y, z, 0);
        spawn = true;
        if (level.getTile(x, y + 1, z) === this.id) {
          level.setTile(x, y + 1, z, 0);
        }
      }

      if (spawn) {
        if (!level.isClientSide && level.getLevelData().getGameType() !== GameType.Creative) {
          // 5-arg spawnResources, no odds
          this.spawnResources(level, x, y, z, data);
        }
      } else {
        const signal =
          level.hasNeighborSignal(x, y, z) ||
          level.hasNeighborSignal(x, y + 1, z);
        if (
          (signal || ((type > 0 && Tile.tiles[type]!.isSignalSource()) || type === 0)) &&
          type !== this.id
        ) {
          this.setOpen(level, x, y, z, signal);
        }
      }
    } else {
      // 上半
      if (level.getTile(x, y - 1, z) !== this.id) {
        level.setTile(x, y, z, 0);
        // 不掉落
      }
      if (type > 0 && type !== this.id) {
        this.neighborChanged(level, x, y - 1, z, type);
      }
    }
  }

  /** C++ DoorTile::getResource(int data, Random*) */
  override getResource(data: number, _random: Random): number {
    if ((data & DoorTile.C_IS_UPPER_MASK) !== 0) return 0;
    if (this.material === Material.metal) return Item.door_iron.id;
    return Item.door_wood.id;
  }

  /** C++ DoorTile::playerDestroy(Level*, Player*, int, int, int, int) */
  override playerDestroy(
    level: Level,
    player: Player,
    x: number, y: number, z: number,
    data: number,
  ): void {
    if ((data & DoorTile.C_IS_UPPER_MASK) === 0) {
      super.playerDestroy(level, player, x, y, z, data);
    }
  }

  /** C++ DoorTile::clip(Level*, int, int, int, const Vec3&, const Vec3&) */
  override clip(
    level: Level,
    xt: number, yt: number, zt: number,
    a: Vec3, b: Vec3,
  ): HitResult {
    this.updateShape(level, xt, yt, zt);
    return super.clip(level, xt, yt, zt, a, b);
  }

  /** C++ DoorTile::getDir(LevelSource*, int, int, int) */
  getDir(level: LevelSource, x: number, y: number, z: number): number {
    return DoorTile.getCompositeData(level, x, y, z) & DoorTile.C_DIR_MASK;
  }

  /** C++ DoorTile::mayPlace(Level*, int, int, int, unsigned char) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face?: number): boolean {
    if (y >= Level.DEPTH - 1) return false;
    return (
      level.isSolidBlockingTile(x, y - 1, z) &&
      super.mayPlace(level, x, y, z) &&
      super.mayPlace(level, x, y + 1, z)
    );
  }

  /** C++ DoorTile::getCompositeData(LevelSource*, int, int, int) — static */
  static getCompositeData(level: LevelSource, x: number, y: number, z: number): number {
    const data = level.getData(x, y, z);
    const isUpper = (data & DoorTile.C_IS_UPPER_MASK) !== 0;

    let lowerData: number;
    let upperData: number;
    if (isUpper) {
      lowerData = level.getData(x, y - 1, z);
      upperData = data;
    } else {
      lowerData = data;
      upperData = level.getData(x, y + 1, z);
    }

    const isRightHinge = (upperData & 1) !== 0;
    return (
      (lowerData & DoorTile.C_LOWER_DATA_MASK) |
      (isUpper ? 8 : 0) |
      (isRightHinge ? 16 : 0)
    );
  }
}