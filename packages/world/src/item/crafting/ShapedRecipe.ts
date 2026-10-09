/**
 * 1:1 移植自 src/world/item/crafting/ShapedRecipe.h（合成）：有形状的配方（width×height，可左右翻转、可在 3×3 里平移）。
 * ⚠ 原样保留：CraftingContainer::getItem 对空格子返回的是“null 的 ItemInstance”而不是 NULL，
 *   所以 matches 里 `(item == NULL) ^ expected.isNull()` 在“格子空、配方也空”时为真 → 返回 false。
 *   也就是说这一版的 matches 只在 3×3 每一格都与配方对上（包括配方外的格子都不能是空）时才成立——触屏合成界面不用它（用 ItemPack 计数）。
 */
import { ItemInstance } from '../ItemInstance';
import type { CraftingContainer } from '../../inventory/CraftingContainer';
import { type ItemPack, Recipe, ItemPack as ItemPackClass } from './Recipe';

export class ShapedRecipe extends Recipe {
  readonly resultId: number;
  private width: number;
  private height: number;
  private recipeItems: ItemInstance[];
  private result: ItemInstance;

  constructor(width: number, height: number, recipeItems: ItemInstance[], result: ItemInstance) {
    super();
    this.width = width;
    this.height = height;
    this.recipeItems = recipeItems;
    this.resultId = result.id;
    this.result = new ItemInstance(result);
    for (let i = 0; i < width * height; ++i)
      if (!recipeItems[i]!.isNull()) this.myItems.add(ItemPackClass.getIdForItemInstance(recipeItems[i]!));
  }

  getMaxCraftCount(fromItems: ItemPack): number {
    return fromItems.getMaxMultipliesOf(this.myItems);
  }

  getResultItem(): ItemInstance {
    return new ItemInstance(this.result);
  }

  matches(craftSlots: CraftingContainer): boolean {
    for (let xOffs = 0; xOffs <= 3 - this.width; xOffs++) {
      for (let yOffs = 0; yOffs <= 3 - this.height; yOffs++) {
        if (this.matchesAt(craftSlots, xOffs, yOffs, true)) return true;
        if (this.matchesAt(craftSlots, xOffs, yOffs, false)) return true;
      }
    }
    return false;
  }

  assemble(_craftSlots: CraftingContainer): ItemInstance {
    return new ItemInstance(this.result.id, this.result.count, this.result.getAuxValue());
  }

  size(): number {
    return this.width * this.height;
  }

  getItems(): ItemInstance[] {
    return [];
  }

  /** C++ 私有重载 matches(craftSlots, xOffs, yOffs, xFlip)（R10 情形 B） */
  private matchesAt(craftSlots: CraftingContainer, xOffs: number, yOffs: number, xFlip: boolean): boolean {
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        const xs = x - xOffs;
        const ys = y - yOffs;
        let expected = new ItemInstance();
        if (xs >= 0 && ys >= 0 && xs < this.width && ys < this.height) {
          if (xFlip) expected = this.recipeItems[this.width - xs - 1 + ys * this.width]!;
          else expected = this.recipeItems[xs + ys * this.width]!;
        }
        const item = craftSlots.getItemAt(x, y);
        if (!item && expected.isNull()) continue;
        if ((item === null) !== expected.isNull()) return false;
        if (expected.id !== item!.id) return false;
        if (expected.getAuxValue() !== Recipe.ANY_AUX_VALUE && expected.getAuxValue() !== item!.getAuxValue()) return false;
      }
    }
    return true;
  }

  getCraftingSize(): number {
    return this.width <= 2 && this.height <= 2 ? Recipe.SIZE_2X2 : Recipe.SIZE_3X3;
  }
}
