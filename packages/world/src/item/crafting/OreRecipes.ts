// 1:1 移植自 src/world/item/crafting/OreRecipes.h/.cpp：金、铁、钻石、青金石块 ⇄ 9 个锭/宝石/染料
import { DyePowderItem } from '../DyePowderItem';
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import { Tile } from '../../level/tile/Tile';
import { definition, type Recipes } from './Recipes';

export class OreRecipes {
  static addRecipes(r: Recipes): void {
    const map: [Tile, ItemInstance][] = [
      [Tile.goldBlock, new ItemInstance(Item.goldIngot, 9)],
      [Tile.ironBlock, new ItemInstance(Item.ironIngot, 9)],
      [Tile.emeraldBlock, new ItemInstance(Item.emerald, 9)],
      [Tile.lapisBlock, new ItemInstance(Item.dye_powder, 9, DyePowderItem.BLUE)],
    ];
    for (const [from, to] of map) {
      r.addShapedRecipe(new ItemInstance(from), '###', '###', '###', definition('#', to));
      r.addShapedRecipe(to, '#', definition('#', from));
    }
  }
}
