// 1:1 移植自 src/world/item/EggItem.h（S11 阶段 A；D10c 接线完成）。
// D10c：生成 ThrownEgg 那句接上了，全类已无 DEFERRED。
// 播放声音时的 Item::random 调用照常保留。
import type { Player } from '../entity/player/Player';
import { ThrownEgg } from '../entity/projectile/ThrownEgg';
import type { Level } from '../level/Level';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';

export class EggItem extends Item {
  constructor(id: number) {
    super(id);
    this.maxStackSize = 16;
  }

  override use(instance: ItemInstance, level: Level, player: Player): ItemInstance {
    if (!player.abilities.instabuild) instance.count--;
    level.playSound(player, 'random.bow', 0.5, 0.4 / (Item.random.nextFloat() * 0.4 + 0.8));
    if (!level.isClientSide) level.addEntity(new ThrownEgg(level, player));
    return instance;
  }
}
