// 1:1 移植自 src/world/item/crafting/WeaponRecipes.h/.cpp：五种材料的剑；弓；箭
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import { Tile } from '../../level/tile/Tile';
import { definition, type Recipes, type RowList } from './Recipes';

const shapes: RowList[] = [['X', 'X', '#']];

export class WeaponRecipes {
  static addRecipes(r: Recipes): void {
    const materialIds = [
      Tile.wood.id,
      Tile.stoneBrick.id,
      Item.ironIngot.id,
      Item.emerald.id,
      Item.goldIngot.id,
    ];
    const map: Item[][] = [
      [Item.sword_wood, Item.sword_stone, Item.sword_iron, Item.sword_emerald, Item.sword_gold],
    ];
    for (let m = 0; m < materialIds.length; m++) {
      const mId = materialIds[m]!;
      for (let t = 0; t < shapes.length; t++) {
        const target = map[t]![m]!;
        if (mId < 256)
          r.addShapedRecipe(
            new ItemInstance(target),
            shapes[t]!,
            definition('#', Item.stick, 'X', Tile.tiles[mId]!),
          );
        else
          r.addShapedRecipe(
            new ItemInstance(target),
            shapes[t]!,
            definition('#', Item.stick, 'X', Item.items[mId]!),
          );
      }
    }
    r.addShapedRecipe(
      new ItemInstance(Item.bow, 1),
      ' #X',
      '# X',
      ' #X',
      definition('X', Item.string, '#', Item.stick),
    );
    r.addShapedRecipe(
      new ItemInstance(Item.arrow, 4),
      'X',
      '#',
      'Y',
      definition('Y', Item.feather, 'X', Item.flint, '#', Item.stick),
    );
  }
}
