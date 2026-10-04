// 1:1 移植自 src/world/item/HangingEntityItem.h 与 HangingEntityItem.cpp（S11 阶段 A；D7 接线完成）。
// D7：createEntity 里 new Painting 那句接上了，局部那个 `interface HangingEntity` 也换成真类。
import { Direction } from '../Direction';
import { EntityTypes } from '../entity/EntityTypes';
import type { HangingEntity } from '../entity/HangingEntity';
import { Painting } from '../entity/Painting';
import type { Player } from '../entity/player/Player';
import { Facing } from '../Facing';
import type { Level } from '../level/Level';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';

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
          level.addEntity(entity);
        }
        itemInstance.count--;
      }
    }
    return true;
  }

  private createEntity(
    level: Level,
    x: number,
    y: number,
    z: number,
    dir: number,
  ): HangingEntity | null {
    switch (this.entityType) {
      case EntityTypes.IdPainting:
        return new Painting(level, x, y, z, dir);
    }
    return null;
  }
}
