// 1:1 移植自 src/world/item/HangingEntityItem.h 与 HangingEntityItem.cpp（S11 阶段 A，部分移植）。
// 部分：createEntity 里 new Painting（画，计划外）DEFERRED(Entity)，暂时返回 NULL；useOn 因此走“entity 为空”的分支，返回 true。
import { Direction } from '../Direction';
import type { Entity } from '../entity/Entity';
import { EntityTypes } from '../entity/EntityTypes';
import type { Player } from '../entity/player/Player';
import { Facing } from '../Facing';
import type { Level } from '../level/Level';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';

/** FORWARD-DECL(HangingEntity) 的最小形状：只用到 survives() */
interface HangingEntity extends Entity {
  survives(): boolean;
}

export class HangingEntityItem extends Item {
  private entityType: number;

  constructor(id: number, type: number) {
    super(id);
    this.entityType = type;
  }

  override useOnByPlayer(
    itemInstance: ItemInstance,
    _player: Player,
    level: Level,
    x: number,
    y: number,
    z: number,
    face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
  ): boolean {
    if (face === Facing.DOWN) return false;
    if (face === Facing.UP) return false;
    const dir = Direction.FACING_DIRECTION[face]!;
    const entity = this.createEntity(level, x, y, z, dir);
    if (entity !== null) {
      if (entity.survives()) {
        if (!level.isClientSide) {
          // DEFERRED(Entity): level->addEntity(entity);
        }
        itemInstance.count--;
      }
    }
    return true;
  }

  private createEntity(
    _level: Level,
    _x: number,
    _y: number,
    _z: number,
    _dir: number,
  ): HangingEntity | null {
    switch (this.entityType) {
      case EntityTypes.IdPainting:
        // DEFERRED(Entity): return new Painting(level, x, y, z, dir);
        return null;
    }
    return null;
  }
}
