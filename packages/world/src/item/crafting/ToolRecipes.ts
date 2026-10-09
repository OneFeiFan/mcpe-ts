// 1:1 移植自 src/world/item/crafting/ToolRecipes.h/.cpp：五种材料 × 镐、锹、斧、锄；再加剪刀
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import { Tile } from '../../level/tile/Tile';
import { definition, type Recipes, type RowList } from './Recipes';

const shapes: RowList[] = [
  ['XXX', ' # ', ' # '],
  ['X', '#', '#'],
  ['XX', 'X#', ' #'],
  ['XX', ' #', ' #'],
];

export class ToolRecipes {
  static addRecipes(r: Recipes): void {
    const materialIds = [Tile.wood.id, Tile.stoneBrick.id, Item.ironIngot.id, Item.emerald.id, Item.goldIngot.id];
    const map: Item[][] = [
      [Item.pickAxe_wood, Item.pickAxe_stone, Item.pickAxe_iron, Item.pickAxe_emerald, Item.pickAxe_gold],
      [Item.shovel_wood, Item.shovel_stone, Item.shovel_iron, Item.shovel_emerald, Item.shovel_gold],
      [Item.hatchet_wood, Item.hatchet_stone, Item.hatchet_iron, Item.hatchet_emerald, Item.hatchet_gold],
      [Item.hoe_wood, Item.hoe_stone, Item.hoe_iron, Item.hoe_emerald, Item.hoe_gold],
    ];
    for (let m = 0; m < materialIds.length; m++) {
      const mId = materialIds[m]!;
      for (let t = 0; t < shapes.length; t++) {
        const target = map[t]![m]!;
        if (mId < 256) r.addShapedRecipe(new ItemInstance(target), shapes[t]!, definition('#', Item.stick, 'X', Tile.tiles[mId]!));
        else r.addShapedRecipe(new ItemInstance(target), shapes[t]!, definition('#', Item.stick, 'X', Item.items[mId]!));
      }
    }
    r.addShapedRecipe(new ItemInstance(Item.shears), ' #', '# ', definition('#', Item.ironIngot));
  }
}
