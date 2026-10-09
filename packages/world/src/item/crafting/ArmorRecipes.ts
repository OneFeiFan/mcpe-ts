// 1:1 移植自 src/world/item/crafting/ArmorRecipes.h/.cpp：四种材料 × 头盔、胸甲、护腿、靴子
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import { definition, type Recipes, type RowList } from './Recipes';

const shapes: RowList[] = [
  ['XXX', 'X X'],
  ['X X', 'XXX', 'XXX'],
  ['XXX', 'X X', 'X X'],
  ['X X', 'X X'],
];

export class ArmorRecipes {
  static addRecipes(r: Recipes): void {
    const materialIds = [Item.leather.id, Item.ironIngot.id, Item.emerald.id, Item.goldIngot.id];
    const map: Item[][] = [
      [Item.helmet_cloth, Item.helmet_iron, Item.helmet_diamond, Item.helmet_gold],
      [Item.chestplate_cloth, Item.chestplate_iron, Item.chestplate_diamond, Item.chestplate_gold],
      [Item.leggings_cloth, Item.leggings_iron, Item.leggings_diamond, Item.leggings_gold],
      [Item.boots_cloth, Item.boots_iron, Item.boots_diamond, Item.boots_gold],
    ];
    for (let m = 0; m < materialIds.length; m++) {
      const materialId = materialIds[m]!;
      for (let t = 0; t < shapes.length; t++) {
        r.addShapedRecipe(
          new ItemInstance(map[t]![m]!),
          shapes[t]!,
          definition('X', Item.items[materialId]!),
        );
      }
    }
  }
}
