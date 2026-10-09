/**
 * 1:1 移植自 src/world/item/crafting/Recipes.h 与 Recipes.cpp（合成）：全部合成配方的注册表（单例）。
 * 构造顺序：工具 → 武器 → 矿块 → 食物 → 建筑 → 盔甲 → 染色羊毛 → 本文件里的其余配方（纸、书、栅栏……下界反应核）。
 * 配方里的材料类型（Recipes::Type）：Item → ItemInstance(item)（aux 0）；Tile → 有形状时 ItemInstance(tile, 1, ANY_AUX_VALUE)、
 *   无形状时 ItemInstance(tile)（aux 0）；直接给 ItemInstance 就用它。
 * R10：addShapedRecipe 的 4 个重载（1/2/3 行字符串或 RowList）合并为 `addShapedRecipe(result, rows | ...strings, types)`；
 *   Shape 的 3 个重载合并为可变参数；模板 definition(c0, t, c1, u, …) 写成 `definition(...pairs)`。
 */
import { LOGE, LOGI } from '@mcpe/platform';
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import type { CraftingContainer } from '../../inventory/CraftingContainer';
import { CoalItem } from '../CoalItem';
import { Tile } from '../../level/tile/Tile';
import { StoneSlabTile } from '../../level/tile/StoneSlabTile';
import { Recipe } from './Recipe';
import { ShapedRecipe } from './ShapedRecipe';
import { ShapelessRecipe } from './ShapelessRecipe';
import { ArmorRecipes } from './ArmorRecipes';
import { ClothDyeRecipes } from './ClothDyeRecipes';
import { FoodRecipes } from './FoodRecipes';
import { FurnaceRecipes } from './FurnaceRecipes';
import { OreRecipes } from './OreRecipes';
import { StructureRecipes } from './StructureRecipes';
import { ToolRecipes } from './ToolRecipes';
import { WeaponRecipes } from './WeaponRecipes';

export type RowList = string[];

/** C++ 的 Recipes::Type */
export class RecipeType {
  item: Item | null = null;
  tile: Tile | null = null;
  itemInstance = new ItemInstance();
  constructor(
    public c: string,
    what: Item | Tile | ItemInstance,
  ) {
    if (what instanceof ItemInstance) this.itemInstance = new ItemInstance(what);
    else if (what instanceof Item) this.item = what;
    else this.tile = what;
  }
  isItem(): boolean {
    return this.item !== null;
  }
}
export type TypeList = RecipeType[];

/** C++ 的模板 definition(char c0, T t, char c1, U u, …)；无形状配方的 c 是 0 */
export function definition(...pairs: (string | number | Item | Tile | ItemInstance)[]): TypeList {
  const list: TypeList = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const c = pairs[i]!;
    list.push(new RecipeType(typeof c === 'number' ? String.fromCharCode(c) : (c as string), pairs[i + 1] as Item | Tile | ItemInstance));
  }
  return list;
}

export class Recipes {
  private static instance: Recipes | null = null;
  private recipes: Recipe[] = [];

  static getInstance(): Recipes {
    if (!Recipes.instance) Recipes.instance = new Recipes();
    return Recipes.instance;
  }

  getRecipes(): readonly Recipe[] {
    return this.recipes;
  }

  static teardownRecipes(): void {
    Recipes.instance = null;
    FurnaceRecipes.teardownFurnaceRecipes();
  }

  static Shape(...rows: string[]): RowList {
    return [...rows];
  }

  private constructor() {
    ToolRecipes.addRecipes(this);
    WeaponRecipes.addRecipes(this);
    OreRecipes.addRecipes(this);
    FoodRecipes.addRecipes(this);
    StructureRecipes.addRecipes(this);
    ArmorRecipes.addRecipes(this);
    ClothDyeRecipes.addRecipes(this);
    this.addShapedRecipe(new ItemInstance(Item.paper, 3), '###', definition('#', Item.reeds));
    this.addShapedRecipe(new ItemInstance(Item.book, 1), '#', '#', '#', definition('#', Item.paper));
    this.addShapedRecipe(new ItemInstance(Tile.fence, 2), '###', '###', definition('#', Item.stick));
    this.addShapedRecipe(new ItemInstance(Tile.fenceGate, 1), '#W#', '#W#', definition('#', Item.stick, 'W', Tile.wood));
    this.addShapedRecipe(new ItemInstance(Tile.bookshelf, 1), '###', 'XXX', '###', definition('#', Tile.wood, 'X', Item.book));
    this.addShapedRecipe(new ItemInstance(Tile.snow, 1), '##', '##', definition('#', Item.snowBall));
    this.addShapedRecipe(new ItemInstance(Tile.clay, 1), '##', '##', definition('#', Item.clay));
    this.addShapedRecipe(new ItemInstance(Tile.redBrick, 1), '##', '##', definition('#', Item.brick));
    this.addShapedRecipe(new ItemInstance(Tile.lightGem, 1), '##', '##', definition('#', Item.yellowDust));
    this.addShapedRecipe(new ItemInstance(Tile.cloth, 1), '##', '##', definition('#', Item.string));
    this.addShapedRecipe(new ItemInstance(Tile.tnt, 1), 'X#X', '#X#', 'X#X', definition('X', Item.sulphur, '#', Tile.sand));
    this.addShapedRecipe(new ItemInstance(Tile.stoneSlabHalf, 6, StoneSlabTile.COBBLESTONE_SLAB), '###', definition('#', Tile.stoneBrick));
    this.addShapedRecipe(new ItemInstance(Tile.stoneSlabHalf, 6, StoneSlabTile.STONE_SLAB), '###', definition('#', Tile.rock));
    this.addShapedRecipe(new ItemInstance(Tile.stoneSlabHalf, 6, StoneSlabTile.SAND_SLAB), '###', definition('#', Tile.sandStone));
    this.addShapedRecipe(new ItemInstance(Tile.stoneSlabHalf, 6, StoneSlabTile.WOOD_SLAB), '###', definition('#', Tile.wood));
    this.addShapedRecipe(new ItemInstance(Tile.stoneSlabHalf, 6, StoneSlabTile.BRICK_SLAB), '###', definition('#', Tile.redBrick));
    this.addShapedRecipe(new ItemInstance(Tile.stoneSlabHalf, 6, StoneSlabTile.SMOOTHBRICK_SLAB), '###', definition('#', Tile.stoneBrickSmooth));
    this.addShapedRecipe(new ItemInstance(Tile.ladder, 2), '# #', '###', '# #', definition('#', Item.stick));
    this.addShapedRecipe(new ItemInstance(Item.door_wood, 1), '##', '##', '##', definition('#', Tile.wood));
    this.addShapedRecipe(new ItemInstance(Tile.trapdoor, 2), '###', '###', definition('#', Tile.wood));
    this.addShapedRecipe(new ItemInstance(Item.sign, 1), '###', '###', ' X ', definition('#', Tile.wood, 'X', Item.stick));
    this.addShapedRecipe(new ItemInstance(Item.sugar, 1), '#', definition('#', Item.reeds));
    this.addShapedRecipe(new ItemInstance(Tile.wood, 4), '#', definition('#', Tile.treeTrunk));
    this.addShapedRecipe(new ItemInstance(Item.stick, 4), '#', '#', definition('#', Tile.wood));
    this.addShapedRecipe(new ItemInstance(Tile.torch, 4), 'X', '#', definition('X', Item.coal, '#', Item.stick));
    this.addShapedRecipe(new ItemInstance(Tile.torch, 4), 'X', '#', definition('X', new ItemInstance(Item.coal, 1, CoalItem.CHAR_COAL), '#', Item.stick));
    this.addShapedRecipe(new ItemInstance(Item.bowl, 4), '# #', ' # ', definition('#', Tile.wood));
    this.addShapedRecipe(new ItemInstance(Item.flintAndSteel, 1), 'A ', ' B', definition('A', Item.ironIngot, 'B', Item.flint));
    this.addShapedRecipe(new ItemInstance(Item.bread, 1), '###', definition('#', Item.wheat));
    this.addShapedRecipe(new ItemInstance(Tile.stairs_wood, 4), '#  ', '## ', '###', definition('#', Tile.wood));
    this.addShapedRecipe(new ItemInstance(Tile.stairs_stone, 4), '#  ', '## ', '###', definition('#', Tile.stoneBrick));
    this.addShapedRecipe(new ItemInstance(Tile.stairs_brick, 4), '#  ', '## ', '###', definition('#', Tile.redBrick));
    this.addShapedRecipe(new ItemInstance(Tile.stairs_stoneBrickSmooth, 4), '#  ', '## ', '###', definition('#', Tile.stoneBrickSmooth));
    this.addShapedRecipe(new ItemInstance(Tile.stairs_netherBricks, 4), '#  ', '## ', '###', definition('#', Tile.netherBrick));
    this.addShapedRecipe(new ItemInstance(Item.painting, 1), '###', '#X#', '###', definition('#', Item.stick, 'X', Tile.cloth));
    this.addShapedRecipe(new ItemInstance(Item.bed, 1), '###', 'XXX', definition('#', Tile.cloth, 'X', Tile.wood));
    this.addShapedRecipe(new ItemInstance(Tile.netherReactor, 1), 'X#X', 'X#X', 'X#X', definition('#', Item.emerald, 'X', Item.ironIngot));
    LOGI(`${this.recipes.length} recipes\n`);
  }

  /** C++ 的 4 个重载：(result, r0[, r1[, r2]], types) 与 (result, RowList, types) */
  addShapedRecipe(result: ItemInstance, ...args: (string | RowList | TypeList)[]): void {
    const types = args[args.length - 1] as TypeList;
    const rows: RowList = args.length === 2 && Array.isArray(args[0]) ? (args[0] as RowList) : (args.slice(0, -1) as string[]);
    if (rows.length === 0) {
      LOGE('Recipes::addShapedRecipe: adding an empty recipe!\n');
      return;
    }
    const map = rows.join('');
    const width = rows[0]!.length;
    const height = rows.length;
    const mappings = new Map<string, ItemInstance>();
    for (const type of types) {
      const from = type.c;
      let to = new ItemInstance();
      if (type.item) {
        to = new ItemInstance(type.item);
      } else if (type.tile) {
        to = new ItemInstance(type.tile, 1, Recipe.ANY_AUX_VALUE);
      } else if (!type.itemInstance.isNull()) {
        to = new ItemInstance(type.itemInstance);
      }
      if (!mappings.has(from)) mappings.set(from, to); // std::map::insert 不覆盖
    }
    const ids: ItemInstance[] = [];
    for (let i = 0; i < width * height; i++) {
      const ch = map[i]!;
      const m = mappings.get(ch);
      ids.push(m ? new ItemInstance(m) : new ItemInstance());
    }
    this.recipes.push(new ShapedRecipe(width, height, ids, result));
  }

  addShapelessRecipe(result: ItemInstance, types: TypeList): void {
    const ingredients: ItemInstance[] = [];
    for (const type of types) {
      if (type.item) {
        ingredients.push(new ItemInstance(type.item));
      } else if (type.tile) {
        ingredients.push(new ItemInstance(type.tile));
      } else if (!type.itemInstance.isNull()) {
        ingredients.push(new ItemInstance(type.itemInstance));
      } else {
        LOGE('addShapeLessRecipe: Incorrect shapeless recipe!\n');
      }
    }
    this.recipes.push(new ShapelessRecipe(result, ingredients));
  }

  getRecipeFor(result: ItemInstance): Recipe | null {
    for (const recipe of this.recipes) {
      const res = recipe.getResultItem();
      if (result.id !== res.id) continue;
      if ((result.count === 0 && result.getAuxValue() === res.getAuxValue()) || (result.count === res.count && result.getAuxValue() === res.getAuxValue())) return recipe;
    }
    return null;
  }

  /** C++ 私有的 getItemFor（工具修复 + 逐个配方 matches）；这一版没有调用方 */
  private getItemFor(craftSlots: CraftingContainer): ItemInstance {
    let count = 0;
    let first: ItemInstance | null = null;
    let second: ItemInstance | null = null;
    for (let i = 0; i < craftSlots.getContainerSize(); i++) {
      const item = craftSlots.getItem(i);
      if (item) {
        if (count === 0) first = item;
        if (count === 1) second = item;
        count++;
      }
    }
    if (count === 2 && first!.id === second!.id && first!.count === 1 && second!.count === 1 && Item.items[first!.id]!.canBeDepleted()) {
      const item = Item.items[first!.id]!;
      const remaining1 = item.getMaxDamage() - first!.getDamageValue();
      const remaining2 = item.getMaxDamage() - second!.getDamageValue();
      const remaining = remaining1 + remaining2 + Math.trunc((item.getMaxDamage() * 10) / 100);
      let resultDamage = item.getMaxDamage() - remaining;
      if (resultDamage < 0) resultDamage = 0;
      return new ItemInstance(first!.id, 1, resultDamage);
    }
    for (const r of this.recipes) {
      if (r.matches(craftSlots)) return r.assemble(craftSlots);
    }
    return new ItemInstance();
  }
}
void (Recipes.prototype as unknown as { getItemFor: unknown }).getItemFor;
