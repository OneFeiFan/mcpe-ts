// 1:1 移植自 src/world/item/crafting/FoodRecipes.h：蘑菇煲（无形状）、西瓜块、西瓜种子
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import { Tile } from '../../level/tile/Tile';
import { definition, type Recipes } from './Recipes';

export class FoodRecipes {
  static addRecipes(r: Recipes): void {
    r.addShapelessRecipe(
      new ItemInstance(Item.mushroomStew),
      definition(0, Tile.mushroom1, 0, Tile.mushroom2, 0, Item.bowl),
    );
    r.addShapedRecipe(
      new ItemInstance(Tile.melon),
      'MMM',
      'MMM',
      'MMM',
      definition('M', Item.melon),
    );
    r.addShapedRecipe(new ItemInstance(Item.seeds_melon), 'M', definition('M', Item.melon));
  }
}
