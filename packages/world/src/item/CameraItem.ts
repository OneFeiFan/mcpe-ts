// 1:1 移植自 src/world/item/CameraItem.h（S11 阶段 A，部分移植）。部分：生成三脚架相机实体（TripodCamera，计划外）DEFERRED(Entity)。
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';

export class CameraItem extends Item {
  constructor(id: number) {
    super(id);
  }

  override use(itemInstance: ItemInstance, _level: Level, _player: Player): ItemInstance {
    // DEFERRED(Entity): level->addEntity( new TripodCamera(level, player, player->x, player->y, player->z) );
    return itemInstance;
  }
}
