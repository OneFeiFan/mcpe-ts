/**
 * 1:1 移植自 src/world/item/crafting/ShapelessRecipe.h（合成）：无形状配方。
 * 原样保留：matches 里找材料时遍历的是**原始**材料表（不是剩余表），找到后从剩余表里删掉第一个与之相等（operator==：id、aux、数量）的。
 */
import { ItemInstance } from '../ItemInstance';
import type { CraftingContainer } from '../../inventory/CraftingContainer';
import { type ItemPack, Recipe, ItemPack as ItemPackClass } from './Recipe';

export class ShapelessRecipe extends Recipe {
  private readonly result: ItemInstance;
  private readonly ingredients: readonly ItemInstance[];

  constructor(result: ItemInstance, ingredients: ItemInstance[]) {
    super();
    this.result = new ItemInstance(result);
    this.ingredients = ingredients.map((i) => new ItemInstance(i));
    for (const ing of this.ingredients) if (!ing.isNull()) this.myItems.add(ItemPackClass.getIdForItemInstance(ing));
  }

  getResultItem(): ItemInstance {
    return new ItemInstance(this.result);
  }

  getMaxCraftCount(fromItems: ItemPack): number {
    return fromItems.getMaxMultipliesOf(this.myItems);
  }

  matches(craftSlots: CraftingContainer): boolean {
    const tempList = this.ingredients.map((i) => new ItemInstance(i));
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const item = craftSlots.getItemAt(x, y);
        if (item) {
          let found = false;
          for (const ingredient of this.ingredients) {
            if (item.id === ingredient.id && (ingredient.getAuxValue() === Recipe.ANY_AUX_VALUE || item.getAuxValue() === ingredient.getAuxValue())) {
              found = true;
              const k = tempList.findIndex((t) => t.equals(ingredient));
              if (k >= 0) tempList.splice(k, 1);
              break;
            }
          }
          if (!found) {
            return false;
          }
        }
      }
    }
    return tempList.length === 0;
  }

  assemble(_craftSlots: CraftingContainer): ItemInstance {
    return new ItemInstance(this.result);
  }

  size(): number {
    return this.ingredients.length;
  }

  getCraftingSize(): number {
    return this.ingredients.length > 4 ? Recipe.SIZE_3X3 : Recipe.SIZE_2X2;
  }
}
