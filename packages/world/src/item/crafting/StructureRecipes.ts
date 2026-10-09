// 1:1 移植自 src/world/item/crafting/StructureRecipes.h：箱子、熔炉、工作台、切石机、沙岩（三种）、石砖、玻璃板、下界砖块、石英块
import { Item } from '../Item';
import { ItemInstance } from '../ItemInstance';
import { SandStoneTile } from '../../level/tile/SandStoneTile';
import { StoneSlabTile } from '../../level/tile/StoneSlabTile';
import { Tile } from '../../level/tile/Tile';
import { definition, type Recipes } from './Recipes';

export class StructureRecipes {
  static addRecipes(r: Recipes): void {
    r.addShapedRecipe(new ItemInstance(Tile.chest), '###', '# #', '###', definition('#', Tile.wood));
    r.addShapedRecipe(new ItemInstance(Tile.furnace), '###', '# #', '###', definition('#', Tile.stoneBrick));
    r.addShapedRecipe(new ItemInstance(Tile.workBench), '##', '##', definition('#', Tile.wood));
    r.addShapedRecipe(new ItemInstance(Tile.stonecutterBench), '##', '##', definition('#', Tile.stoneBrick));
    r.addShapedRecipe(new ItemInstance(Tile.sandStone), '##', '##', definition('#', Tile.sand));
    r.addShapedRecipe(new ItemInstance(Tile.sandStone, 4, SandStoneTile.TYPE_SMOOTHSIDE), '##', '##', definition('#', Tile.sandStone));
    r.addShapedRecipe(new ItemInstance(Tile.sandStone, 1, SandStoneTile.TYPE_HEIROGLYPHS), '#', '#', definition('#', new ItemInstance(Tile.stoneSlabHalf, 1, StoneSlabTile.SAND_SLAB)));
    r.addShapedRecipe(new ItemInstance(Tile.stoneBrickSmooth, 4), '##', '##', definition('#', Tile.rock));
    r.addShapedRecipe(new ItemInstance(Tile.thinGlass, 16), '###', '###', definition('#', Tile.glass));
    r.addShapedRecipe(new ItemInstance(Tile.netherBrick, 1), 'NN', 'NN', definition('N', Item.netherbrick));
    r.addShapedRecipe(new ItemInstance(Tile.quartzBlock, 1), 'NN', 'NN', definition('N', Item.netherQuartz));
  }
}
