// 1:1 移植自 src/world/item/CameraItem.h（S11 阶段 A；D5 接线完成）。
// D5：生成三脚架相机实体的那句接上了，全类已无 DEFERRED。
//
// 【注意没有 `!level->isClientSide` 守卫】原句就是直接 addEntity —— 客户端也会造这个实体。
// 照抄，别"顺手"加上守卫。
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';
import { TripodCamera } from '../entity/item/TripodCamera';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';

export class CameraItem extends Item {
  constructor(id: number) {
    super(id);
  }

  override use(itemInstance: ItemInstance, level: Level, player: Player): ItemInstance {
    level.addEntity(new TripodCamera(level, player, player.x, player.y, player.z));
    return itemInstance;
  }
}
