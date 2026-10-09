// 1:1 移植自 src/world/item/crafting/FurnaceRecipes.h/.cpp：熔炉配方（原料 id → 产物）；std::map 按键有序，getRecipes 按 id 排序返回
import { CoalItem } from '../CoalItem';
import { DyePowderItem } from '../DyePowderItem';
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import { Tile } from '../../level/tile/Tile';

export class FurnaceRecipes {
  private static instance: FurnaceRecipes | null = null;
  private recipes = new Map<number, ItemInstance>();

  static teardownFurnaceRecipes(): void {
    FurnaceRecipes.instance = null;
  }

  static getInstance(): FurnaceRecipes {
    if (!FurnaceRecipes.instance) FurnaceRecipes.instance = new FurnaceRecipes();
    return FurnaceRecipes.instance;
  }

  isFurnaceItem(itemId: number): boolean {
    return this.recipes.has(itemId);
  }

  getResult(itemId: number): ItemInstance {
    const r = this.recipes.get(itemId);
    return r ? new ItemInstance(r) : new ItemInstance();
  }

  getRecipes(): [number, ItemInstance][] {
    return [...this.recipes.entries()].sort((a, b) => a[0] - b[0]);
  }

  private constructor() {
    this.addFurnaceRecipe(Tile.ironOre.id, new ItemInstance(Item.ironIngot));
    this.addFurnaceRecipe(Tile.goldOre.id, new ItemInstance(Item.goldIngot));
    this.addFurnaceRecipe(Tile.emeraldOre.id, new ItemInstance(Item.emerald));
    this.addFurnaceRecipe(Tile.sand.id, new ItemInstance(Tile.glass));
    this.addFurnaceRecipe(Item.porkChop_raw.id, new ItemInstance(Item.porkChop_cooked));
    this.addFurnaceRecipe(Item.beef_raw.id, new ItemInstance(Item.beef_cooked));
    this.addFurnaceRecipe(Item.chicken_raw.id, new ItemInstance(Item.chicken_cooked));
    this.addFurnaceRecipe(Tile.stoneBrick.id, new ItemInstance(Tile.rock));
    this.addFurnaceRecipe(Item.clay.id, new ItemInstance(Item.brick));
    this.addFurnaceRecipe(
      Tile.cactus.id,
      new ItemInstance(Item.dye_powder, 1, DyePowderItem.GREEN),
    );
    this.addFurnaceRecipe(
      Tile.mushroom2.id,
      new ItemInstance(Item.dye_powder, 1, DyePowderItem.RED),
    );
    this.addFurnaceRecipe(Tile.treeTrunk.id, new ItemInstance(Item.coal, 1, CoalItem.CHAR_COAL));
    this.addFurnaceRecipe(Tile.netherrack.id, new ItemInstance(Item.netherbrick));
  }

  private addFurnaceRecipe(itemId: number, result: ItemInstance): void {
    if (!this.recipes.has(itemId)) this.recipes.set(itemId, new ItemInstance(result)); // std::map::insert 不覆盖
  }
}
