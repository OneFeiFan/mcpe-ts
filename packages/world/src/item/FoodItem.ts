// 1:1 移植自 src/world/item/FoodItem.h（S11 阶段 A，部分移植）。BowlFoodItem 继承它。
// 部分：player->foodData.eat(this) 等食物数据（SimpleFoodData，S12）DEFERRED(Player)；按值返回 *instance 的副本 DEFERRED(ItemInstance)（阶段 C）。
// 注释掉的 setEatEffect、getSaturationModifier 与效果字段不移植。
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';
import { UseAnim, type UseAnimation } from './UseAnim';

export class FoodItem extends Item {
  private static readonly EAT_DURATION = Math.trunc(20 * 1.6);

  private readonly nutrition: number;
  private readonly saturationModifier: number;
  private readonly _isMeat: boolean;
  private canAlwaysEat = false; // C++ 未初始化

  constructor(id: number, nutrition: number, isMeat: boolean, saturationMod = 0.6) {
    super(id);
    this.nutrition = nutrition;
    this._isMeat = isMeat;
    this.saturationModifier = Math.fround(saturationMod);
  }

  override isFood(): boolean {
    return true;
  }

  override useTimeDepleted(instance: ItemInstance, level: Level, player: Player): ItemInstance {
    instance.count--;
    // DEFERRED(Player): player->foodData.eat(this);
    level.playSound(player, 'random.burp', 0.5, level.random.nextFloat() * 0.1 + 0.9);
    // DEFERRED(ItemInstance): return *instance;（按值复制）
    return instance;
  }

  override getUseDuration(_itemInstance: ItemInstance): number {
    return FoodItem.EAT_DURATION;
  }

  override getUseAnimation(): UseAnimation {
    return UseAnim.eat;
  }

  override use(instance: ItemInstance, _level: Level, player: Player): ItemInstance {
    if (!player.abilities.invulnerable && player.isHurt()) {
      player.startUsingItem(instance, this.getUseDuration(instance));
    }
    return instance;
  }

  getNutrition(): number {
    return this.nutrition;
  }

  isMeat(): boolean {
    return this._isMeat;
  }

  setCanAlwaysEat(): FoodItem {
    this.canAlwaysEat = true;
    return this;
  }
}
