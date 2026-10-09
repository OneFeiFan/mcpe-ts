// 1:1 移植自 src/world/item/crafting/ClothDyeRecipes.h：染色羊毛（跳过黑、棕、淡灰、灰、白五种染料）与各种染料的混合
import { DyePowderItem as D } from '../DyePowderItem';
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import { ClothTile } from '../../level/tile/ClothTile';
import { Tile } from '../../level/tile/Tile';
import { definition, type Recipes } from './Recipes';

export class ClothDyeRecipes {
  static addRecipes(r: Recipes): void {
    for (let i = 0; i < 16; i++) {
      if (i === D.BLACK || i === D.BROWN || i === D.SILVER || i === D.GRAY || i === D.WHITE) continue;
      r.addShapelessRecipe(
        new ItemInstance(Tile.cloth, 1, ClothTile.getTileDataForItemAuxValue(i)),
        definition(0, new ItemInstance(Item.dye_powder, 1, i), 0, new ItemInstance(Item.items[Tile.cloth.id]!, 1, 0)),
      );
    }
    const dye = (n: number, aux: number): ItemInstance => new ItemInstance(Item.dye_powder, n, aux);
    r.addShapelessRecipe(dye(2, D.YELLOW), definition(0, Tile.flower));
    r.addShapelessRecipe(dye(3, D.WHITE), definition(0, Item.bone));
    r.addShapelessRecipe(dye(2, D.PINK), definition(0, dye(1, D.RED), 0, dye(1, D.WHITE)));
    r.addShapelessRecipe(dye(2, D.ORANGE), definition(0, dye(1, D.RED), 0, dye(1, D.YELLOW)));
    r.addShapelessRecipe(dye(2, D.LIME), definition(0, dye(1, D.GREEN), 0, dye(1, D.WHITE)));
    r.addShapelessRecipe(dye(2, D.LIGHT_BLUE), definition(0, dye(1, D.BLUE), 0, dye(1, D.WHITE)));
    r.addShapelessRecipe(dye(2, D.CYAN), definition(0, dye(1, D.BLUE), 0, dye(1, D.GREEN)));
    r.addShapelessRecipe(dye(2, D.PURPLE), definition(0, dye(1, D.BLUE), 0, dye(1, D.RED)));
    r.addShapelessRecipe(dye(4, D.MAGENTA), definition(0, dye(1, D.BLUE), 0, dye(1, D.RED), 0, dye(1, D.RED), 0, dye(1, D.WHITE)));
  }
}
