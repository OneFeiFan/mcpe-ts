// 1:1 移植自 src/world/item/EggItem.h（S11 阶段 A，部分移植）。部分：生成抛射物实体（ThrownEgg，计划外）DEFERRED(Entity)。
// 播放声音时的 Item::random 调用照常保留。
import type { Player } from '../entity/player/Player';
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
    // DEFERRED(Entity): if (!level->isClientSide) level->addEntity(new ThrownEgg(level, player));
    return instance;
  }
}
