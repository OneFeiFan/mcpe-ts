// 1:1 移植自 src/world/item/BowItem.h（S11 阶段 A，部分移植）。部分：生成箭实体（Arrow，计划外）的语句 DEFERRED(Entity)。
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';
import { UseAnim } from './UseAnim';

export class BowItem extends Item {
  static readonly MAX_DRAW_DURATION = 20 * 1;

  constructor(id: number) {
    super(id);
    this.maxStackSize = 1;
    this.setMaxDamage(384);
  }

  override releaseUsing(
    itemInstance: ItemInstance,
    level: Level,
    player: Player,
    durationLeft: number,
  ): void {
    const timeHeld = this.getUseDuration(itemInstance) - durationLeft;
    let pow = timeHeld / BowItem.MAX_DRAW_DURATION;
    pow = (pow * pow + pow * 2) / 3;
    if (pow < 0.1) return;
    if (pow > 1) pow = 1;
    itemInstance.hurt(1);
    level.playSound(
      player,
      'random.bow',
      1.0,
      1.0 / (Item.random.nextFloat() * 0.4 + 1.2) + pow * 0.5,
    );
    player.inventory.removeResource(Item.arrow.id);
    if (!level.isClientSide) {
      // DEFERRED(Entity): Arrow* arrow = new Arrow(level, player, pow * 2.0f); if (pow == 1) arrow->critArrow = true; level->addEntity(arrow);
    }
  }

  override getUseDuration(_itemInstance: ItemInstance): number {
    return 20 * 60 * 60;
  }

  override use(instance: ItemInstance, _level: Level, player: Player): ItemInstance {
    if (player.abilities.instabuild || player.hasResource(Item.arrow.id)) {
      player.startUsingItem(instance, this.getUseDuration(instance));
    }
    return instance;
  }

  override getUseAnimation(): UseAnim.UseAnimation {
    return UseAnim.bow;
  }
}
