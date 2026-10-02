import { FoodConstants } from "./FoodConstants";
import { FoodItem } from "../item/FoodItem";
import { Mth } from "@mcpe/util";
import type { Player } from "../entity/player/Player";

export class SimpleFoodData {
  private foodLevel: number;

  /** C++ SimpleFoodData::SimpleFoodData() */
  constructor() {
    this.foodLevel = 0;
  }

  /** C++ SimpleFoodData::eat(int food) */
  eat(food: number): void;
  /** C++ SimpleFoodData::eat(FoodItem* item) */
  eat(item: FoodItem): void;
  eat(a: number | FoodItem): void {
    if (typeof a === "number") {
      this.foodLevel = Mth.Min(a + this.foodLevel, FoodConstants.MAX_FOOD);
    } else {
      this.eat(a.getNutrition());
    }
  }

  /** C++ SimpleFoodData::tick(Player* player) */
  tick(player: Player): void {
    if (this.foodLevel > 0 && player.isHurt()) {
      // C++ 里 healAmount = foodLevel（不是 foodLevel / 2，那行被注释掉了）
      const healAmount = this.foodLevel;
      player.heal(healAmount);
      this.foodLevel = 0;
      // C++ 里有一段 SetHealthPacket 的网络包逻辑，被注释掉了，不要加
    }
  }

  /** 供 Player 序列化/查询时使用，C++ 里是 private 但通常有 getter */
  getFoodLevel(): number {
    return this.foodLevel;
  }
}