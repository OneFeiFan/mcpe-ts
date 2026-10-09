// 1:1 移植自 src/client/gui/screens/crafting/WorkbenchScreen.h/.cpp：工作台/背包合成——全部配方，除了切石机的（2×2 或 3×3 由参数决定）
import type { Recipe } from '@mcpe/world';
import { CraftingFilters } from './CraftingFilters';
import { PaneCraftingScreen } from './PaneCraftingScreen';

export class WorkbenchScreen extends PaneCraftingScreen {
  constructor(craftingSize: number) {
    super(craftingSize);
  }

  protected filterRecipe(r: Recipe): boolean {
    return !CraftingFilters.isStonecutterItem(r.getResultItem());
  }
}
