// 1:1 移植自 src/client/gui/screens/crafting/StonecutterScreen.h/.cpp：切石机——3×3、只有一个分类（建筑，图标 5），只列切石机配方
import { ItemCategory, Recipe } from '@mcpe/world';
import { CraftingFilters } from './CraftingFilters';
import { PaneCraftingScreen } from './PaneCraftingScreen';

export class StonecutterScreen extends PaneCraftingScreen {
  constructor() {
    super(Recipe.SIZE_3X3);
    this.setSingleCategoryAndIcon(ItemCategory.Structures, 5);
  }

  protected filterRecipe(r: Recipe): boolean {
    return CraftingFilters.isStonecutterItem(r.getResultItem());
  }
}
