/**
 * 1:1 移植自 src/world/item/crafting/Recipe.h 与 Recipe.cpp（合成）：ItemPack（材料计数表）与 Recipe 基类。
 * ItemPack 的键是 `id * 512 + aux`（任意 aux 时为 -1）；std::map 按键有序——这里用 Map 并在遍历前排序。
 * isAnyAuxValue(id)：方块（id < 256）除羊毛、半砖、沙岩之外都算“任意 aux”；物品都不是。
 */
import { Mth } from '@mcpe/util';
import { ItemInstance } from '../ItemInstance';
import { Tile } from '../../level/tile/Tile';
import type { CraftingContainer } from '../../inventory/CraftingContainer';

export class ItemPack {
  private items = new Map<number, number>();

  add(id: number, count = 1): void {
    this.items.set(id, (this.items.get(id) ?? 0) + count);
  }

  getCount(id: number): number {
    return this.items.get(id) ?? 0;
  }

  /** C++ 的 print 只构造了 ItemInstance、没输出任何东西 */
  print(): void {}

  getMaxMultipliesOf(v: ItemPack): number {
    if (v.items.size === 0) return 0;
    let minCount = 99;
    for (const [id, need] of [...v.items.entries()].sort((a, b) => a[0] - b[0])) {
      if (id <= 0) continue;
      const have = this.items.get(id);
      if (have === undefined) return 0;
      if (need === 0) return 0;
      const count = Math.trunc(have / need);
      if (count === 0) return 0;
      minCount = Mth.Min(minCount, count);
    }
    return minCount;
  }

  getItemInstances(): ItemInstance[] {
    const out: ItemInstance[] = [];
    for (const [id, count] of [...this.items.entries()].sort((a, b) => a[0] - b[0])) {
      const item = ItemPack.getItemInstanceForId(id);
      item.count = count;
      out.push(item);
    }
    return out;
  }

  static getIdForItemInstance(ii: ItemInstance): number {
    const anyAuxValue = Recipe.isAnyAuxValue(ii);
    return ii.id * 512 + (anyAuxValue ? -1 : ii.getAuxValue());
  }

  static getIdForItemInstanceAnyAux(ii: ItemInstance): number {
    return ii.id * 512 - 1;
  }

  static getItemInstanceForId(id: number): ItemInstance {
    id += 256;
    return new ItemInstance(Math.trunc(id / 512), 1, (id & 511) - 256);
  }
}

export abstract class Recipe {
  static readonly SIZE_2X2 = 0;
  static readonly SIZE_3X3 = 1;
  static readonly ANY_AUX_VALUE = -1;
  protected myItems = new ItemPack();

  abstract matches(craftSlots: CraftingContainer): boolean;

  getItemPack(): ItemPack {
    return this.myItems;
  }

  abstract getMaxCraftCount(fromItems: ItemPack): number;
  abstract size(): number;
  abstract assemble(craftSlots: CraftingContainer): ItemInstance;
  abstract getResultItem(): ItemInstance;
  abstract getCraftingSize(): number;

  /** C++ 两个重载 isAnyAuxValue(const ItemInstance*)（公开）与 isAnyAuxValue(int id)（私有）合并：传 ItemInstance 或 id */
  static isAnyAuxValue(ii: ItemInstance | number): boolean {
    const id = typeof ii === 'number' ? ii : ii.id;
    const isTile = id < 256;
    if (!isTile) return false;
    if (id === Tile.cloth.id || id === Tile.stoneSlabHalf.id || id === Tile.sandStone.id)
      return false;
    return true;
  }
}
