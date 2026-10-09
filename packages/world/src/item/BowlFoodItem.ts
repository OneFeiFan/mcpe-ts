// 1:1 移植自 src/world/item/BowlFoodItem.h
import { FoodItem } from './FoodItem';
import { ItemInstance } from './ItemInstance';
import { Item } from './Item';
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';

export class BowlFoodItem extends FoodItem {
  constructor(id: number, nutrition: number) {
    super(id, nutrition, false);
    this.setMaxStackSize(1);
  }

  override useTimeDepleted(instance: ItemInstance, level: Level, player: Player): ItemInstance {
    // 1. 先调用父类，返回值丢弃，与 C++ 一致
    super.useTimeDepleted(instance, level, player);

    // 2. 用 ItemInstance(Item.bowl) 覆盖 instance
    //    C++: *instance = ItemInstance(Item::bowl)
    //    等价于逐字段赋值：id = bowl.id, count = 1, auxValue = 0
    const bowl = new ItemInstance(Item.bowl);
    instance.id = bowl.id;
    instance.count = bowl.count;
    instance.setAuxValue(bowl.getAuxValue());

    // 3. 返回副本，与 C++ 的 return *instance 对应
    return instance.copy();
  }
}
