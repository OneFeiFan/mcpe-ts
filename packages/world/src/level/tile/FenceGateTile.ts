// 1:1 移植自 src/world/level/tile/FenceGateTile.h
import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { AABB } from '../../phys/AABB';
import { Direction } from '../../Direction';
import { Mth } from '@mcpe/util';
import type { Player } from '../..';
import type { Mob } from '../../entity/Mob';
import { LevelEvent } from './LevelEvent';

export class FenceGateTile extends Tile {
  static readonly DIRECTION_MASK = 3;
  static readonly OPEN_BIT = 4;

  /** C++ FenceGateTile::FenceGateTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.wood);
  }

  /** C++ FenceGateTile::mayPlace(Level*, int, int, int) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean {
    if (!level.getMaterial(x, y - 1, z)!.isSolid()) return false;
    return super.mayPlace(level, x, y, z);
  }

  /** C++ FenceGateTile::getAABB(Level*, int, int, int) */
  override getAABB(level: Level, x: number, y: number, z: number): AABB | null {
    const data = level.getData(x, y, z);
    if (FenceGateTile.isOpen(data)) {
      return null;
    }

    if (data === Direction.NORTH || data === Direction.SOUTH) {
      // z 方向薄板，高度 y..y+1.5
      this.tmpBB.set(x, y, z + 6.0 / 16.0, x + 1, y + 1.5, z + 10.0 / 16.0);
    } else {
      // x 方向薄板，高度 y..y+1.5
      this.tmpBB.set(x + 6.0 / 16.0, y, z, x + 10.0 / 16.0, y + 1.5, z + 1);
    }
    return this.tmpBB;
  }

  /** C++ FenceGateTile::blocksLight() */
  blocksLight(): boolean {
    return false;
  }

  /** C++ FenceGateTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ FenceGateTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ FenceGateTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_FENCE_GATE;
  }

  /** C++ FenceGateTile::setPlacedBy(Level*, int, int, int, Mob*) */
  override setPlacedBy(level: Level, x: number, y: number, z: number, by: Mob): void {
    // & 3 已经保证 0..3，% 4 冗余但保留以对齐 C++
    const dir = (Mth.floor((by.yRot * 4) / 360 + 0.5) & 3) % 4;
    level.setData(x, y, z, dir);
  }

  /** C++ FenceGateTile::use(Level*, int, int, int, Player*) */
  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    let data = level.getData(x, y, z);

    if (FenceGateTile.isOpen(data)) {
      // 关闭：清 open 位，保留朝向
      level.setData(x, y, z, data & ~FenceGateTile.OPEN_BIT);
    } else {
      // 打开：可能根据玩家朝向调整门的朝向
      const dir = (Mth.floor((player.yRot * 4) / 360 + 0.5) & 3) % 4;
      const current = FenceGateTile.getDirection(data);
      if (current === (dir + 2) % 4) {
        // 门的朝向正好是玩家的对面 -> 改成玩家朝向
        data = dir;
      }
      level.setData(x, y, z, data | FenceGateTile.OPEN_BIT);
    }

    level.levelEvent(player, LevelEvent.SOUND_OPEN_DOOR, x, y, z, 0);
    return true;
  }

  /** C++ FenceGateTile::isOpen(int data) — static */
  static isOpen(data: number): boolean {
    return (data & FenceGateTile.OPEN_BIT) !== 0;
  }

  /** C++ FenceGateTile::getDirection(int data) — static */
  static getDirection(data: number): number {
    return data & FenceGateTile.DIRECTION_MASK;
  }
}
