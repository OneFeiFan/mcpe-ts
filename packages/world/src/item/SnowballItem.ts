// 1:1 移植自 src/world/item/SnowballItem.h（S11 阶段 A；D9 接线完成）。
// D9：生成 Snowball 那句接上了，全类已无 DEFERRED。
// 播放声音时的 Item::random 调用照常保留。
import type { Player } from '../entity/player/Player';
import { Snowball } from '../entity/projectile/Snowball';
import type { Level } from '../level/Level';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';

export class SnowballItem extends Item {
  constructor(id: number) {
    super(id);
    this.maxStackSize = 16;
  }

  override use(instance: ItemInstance, level: Level, player: Player): ItemInstance {
    if (!player.abilities.instabuild) instance.count--;
    level.playSound(player, 'random.bow', 0.5, 0.4 / (Item.random.nextFloat() * 0.4 + 0.8));
    if (!level.isClientSide) level.addEntity(new Snowball(level, player));
    return instance;
  }
}
