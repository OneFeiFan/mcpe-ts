/**
 * 1:1 移植自 src/client/gui/screens/crafting/PaneCraftingScreen.h 与 .cpp（合成界面）：手机版风格的合成界面（工作台、切石机、背包合成共用）。
 * 不需要在格子里摆形状：统计背包（快捷栏之外）里的材料，列出当前分类下所有配方，能做的亮、做不了的暗；
 *   选中一项右侧显示所需材料（“已有/需要”）与说明，点合成按钮扣材料、给产物（背包满了就扔在地上）。
 * 分类：工具、武器/弓、食物/盔甲、建筑/其他（按 Item.category 的位 1、2、4、8）；子类可只留一个分类（切石机）。
 * 原样保留：
 *   - 列表按 sortText 稳定排序（羊毛前缀 "Wool "、染料前缀 "ZDye "）；
 *   - 扣沙岩时，若配方要求“任意 aux”，先扣 aux 0 的再扣其余（C++ 那段特判）；
 *   - setupPositions 末尾“点一下”当前分类按钮来重建列表；
 *   - 联网时的 WantCreatePacket 与每刻比对背包变化：单机 isOnline() 为假，不执行（DEFERRED(Network)）；
 *   - 没有玩家时（不会发生）用随机材料填充 ItemPack（randomlyFillItemPack），照抄。
 * C++ 的静态 guiPaneFrame（文件内静态指针）→ 实例字段；Stopwatch 计时省略。
 * C++ 的两个 onItemSelected 重载：IItemPaneCallback 的 (pane, index) 保持原名，私有的 (buttonIndex, CItem*) 命名为 selectItemInCategory（R10）。
 */
import { I18n } from '@mcpe/locale';
import { Keyboard } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import { Inventory, Item, ItemInstance, ItemPack, Recipe, Recipes, Tile } from '@mcpe/world';
import type { Minecraft } from '../../../Minecraft';
import { ItemRenderer } from '../../../renderer/entity/ItemRenderer';
import { GL_ALPHA_TEST, glEnable2 } from '../../../renderer/gles';
import { Tesselator } from '../../../renderer/Tesselator';
import type { Textures } from '../../../renderer/Textures';
import type { Button } from '../../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../../components/ImageButton';
import { CItem, type IItemPaneCallback, ItemPane, ReqItem } from '../../components/ItemPane';
import { type NinePatchLayer, NinePatchFactory } from '../../components/NinePatch';
import { Gui } from '../../Gui';
import { Screen } from '../../Screen';

const f = Math.fround;
const BorderPixels = f(6.0);
const descFrameWidth = 100;
const rgbActive = 0xfff0f0f0 | 0;
const rgbInactive = 0xc0635558 | 0;
const rgbInactiveShadow = 0xc0aaaaaa | 0;

class CategoryButton extends ImageButton {
  constructor(
    id: number,
    private selectedPtr: () => ImageButton | null,
    private stateNormal: NinePatchLayer,
    private statePressed: NinePatchLayer,
  ) {
    super(id, '');
  }

  protected override renderBg(minecraft: Minecraft, xm: number, ym: number): void {
    const hovered = this.active && (minecraft.useTouchscreen() ? this._currentlyDown && xm >= this.x && ym >= this.y && xm < this.x + this.width && ym < this.y + this.height : this.isInside(xm, ym));
    if (hovered || this.selectedPtr() === this) this.statePressed.draw(Tesselator.instance, this.x, this.y);
    else this.stateNormal.draw(Tesselator.instance, this.x, this.y);
  }

  protected override isSecondImage(_hovered: boolean): boolean {
    return false;
  }
}

export class CraftButton extends ImageButton {
  private bg: NinePatchLayer | null = null;
  private bgSelected: NinePatchLayer | null = null;
  private numItems = 0;

  constructor(id: number) {
    super(id, '');
  }

  initTextures(textures: Textures): void {
    const builder = new NinePatchFactory(textures, 'gui/spritesheet.png');
    this.bg = builder.createSymmetrical(new IntRectangle(112, 0, 8, 67), 2, 2);
    this.bgSelected = builder.createSymmetrical(new IntRectangle(120, 0, 8, 67), 2, 2);
  }

  setSize(w: number, h: number): void {
    this.width = Math.trunc(w);
    this.height = Math.trunc(h);
    if (this.bg && this.bgSelected) {
      this.bg.setSize(w, h);
      this.bgSelected.setSize(w, h);
    }
  }

  setNumItems(i: number): void {
    this.numItems = i;
  }

  getItemPos(_i: number): IntRectangle {
    return new IntRectangle();
  }

  protected override renderBg(minecraft: Minecraft, xm: number, ym: number): void {
    if (!this.bg || !this.bgSelected) return;
    const hovered = this.active && (minecraft.useTouchscreen() ? this._currentlyDown && xm >= this.x && ym >= this.y && xm < this.x + this.width && ym < this.y + this.height : this.isInside(xm, ym));
    if (hovered || this.selected) this.bgSelected.draw(Tesselator.instance, this.x, this.y);
    else this.bg.draw(Tesselator.instance, this.x, this.y);
  }
}

export abstract class PaneCraftingScreen extends Screen implements IItemPaneCallback {
  private _categoryButtons: ImageButton[] = [];
  private _items: CItem[] = [];
  private _categories: CItem[][] = [];
  private currentCategory = -1;
  private currentItem: CItem | null = null;
  private currentItemDesc = '';
  private currentCategoryButtons: Button[] = [];
  private btnClose = new ImageButton(2, '');
  private btnCraft = new CraftButton(1);
  private craftingSize: number;
  private pane: ItemPane | null = null;
  private paneRect = new IntRectangle();
  private numCategories = 4;
  private categoryBitmasks: number[] = [];
  private categoryIcons: number[] = [];
  private selectedCategoryButton: ImageButton | null = null;
  private guiBackground: NinePatchLayer | null = null;
  private guiSlotCategory: NinePatchLayer | null = null;
  private guiSlotCategorySelected: NinePatchLayer | null = null;
  private guiPaneFrame: NinePatchLayer | null = null;

  constructor(craftingSize: number) {
    super();
    this.craftingSize = craftingSize;
    for (let i = 0; i < this.numCategories; ++i) {
      this.categoryBitmasks.push(1 << i);
      this.categoryIcons.push(i);
    }
  }

  protected override initScreen(): void {
    const def = new ImageDef();
    def.name = 'gui/spritesheet.png';
    def.x = 0;
    def.y = 1;
    def.width = def.height = 18;
    def.setSrc(new IntRectangle(60, 0, 18, 18));
    this.btnClose.setImageDef(def, true);
    this.btnClose.scaleWhenPressed = false;
    this.btnCraft.initTextures(this.minecraft.textures!);
    this.buttons.push(this.btnCraft);
    this.buttons.push(this.btnClose);
    const builder = new NinePatchFactory(this.minecraft.textures!, 'gui/spritesheet.png');
    this.guiBackground = builder.createSymmetrical(new IntRectangle(0, 0, 16, 16), 4, 4);
    this.guiPaneFrame = builder.createSymmetrical(new IntRectangle(0, 20, 8, 8), 1, 2).setExcluded(1 << 4);
    this.guiSlotCategory = builder.createSymmetrical(new IntRectangle(8, 32, 8, 8), 2, 2);
    this.guiSlotCategorySelected = builder.createSymmetrical(new IntRectangle(0, 32, 8, 8), 2, 2);
    this.initCategories();
  }

  private initCategories(): void {
    this._categories = Array.from({ length: this.numCategories }, () => []);
    for (let i = 0; i < this.numCategories; ++i) {
      const button = new CategoryButton(100 + i, () => this.selectedCategoryButton, this.guiSlotCategory!, this.guiSlotCategorySelected!);
      this._categoryButtons.push(button);
      this.buttons.push(button);
    }
    const all = Recipes.getInstance().getRecipes();
    let filtered: Recipe[] = [];
    for (const r of all) {
      if (this.craftingSize >= r.getCraftingSize()) filtered.push(r);
    }
    filtered = this.filterRecipes(filtered);
    for (const r of filtered) this.addItem(r);
    this.recheckRecipes();
  }

  override setupPositions(): void {
    const buttonHeight = Math.trunc((this.height - 16) / Mth.Max(this.numCategories, 4));
    for (let c = 0; c < this._categoryButtons.length; ++c) {
      const button = this._categoryButtons[c]!;
      button.x = Math.trunc(BorderPixels);
      button.y = Math.trunc(BorderPixels) + c * (1 + buttonHeight);
      button.width = buttonHeight;
      button.height = buttonHeight;
      const icon = this.categoryIcons[c]!;
      const def = new ImageDef();
      def.x = 0;
      def.width = def.height = buttonHeight;
      def.name = 'gui/spritesheet.png';
      def.setSrc(new IntRectangle(32 * Math.trunc(icon / 2), 64 + (icon & 1) * 32, 32, 32));
      button.setImageDef(def, false);
    }
    const craftW = Math.trunc(100 - 2 * BorderPixels - 0);
    this.btnCraft.x = this.width - descFrameWidth + Math.trunc((descFrameWidth - craftW) / 2) - 1;
    this.btnCraft.y = 20;
    this.btnCraft.setSize(craftW, 62);
    this.btnClose.width = this.btnClose.height = 19;
    this.btnClose.x = this.width - this.btnClose.width;
    this.btnClose.y = 0;
    this.paneRect.x = buttonHeight + 2 * Math.trunc(BorderPixels);
    this.paneRect.y = Math.trunc(BorderPixels) + 2;
    this.paneRect.w = this.width - this.paneRect.x - descFrameWidth;
    this.paneRect.h = this.height - 2 * Math.trunc(BorderPixels) - 4;
    this.guiPaneFrame!.setSize(this.paneRect.w + 2, this.paneRect.h + 4);
    this.guiBackground!.setSize(this.width, this.height);
    this.guiSlotCategory!.setSize(buttonHeight, buttonHeight);
    this.guiSlotCategorySelected!.setSize(buttonHeight, buttonHeight);
    const oldCategory = this.currentCategory;
    this.currentCategory = -1;
    this.buttonClicked(this._categoryButtons[this.pane ? oldCategory : 0]!);
  }

  override tick(): void {
    // DEFERRED(Network): if (minecraft->isOnline()) { 每刻比对背包，变了就 recheckRecipes }——单机 isOnline() 为假
    if (this.pane) this.pane.tick();
  }

  override render(xm: number, ym: number, a: number): void {
    const t = Tesselator.instance;
    this.guiBackground!.draw(t, 0, 0);
    glEnable2(GL_ALPHA_TEST);
    super.render(xm, ym, a);
    this.guiPaneFrame!.draw(t, this.paneRect.x - 1, this.paneRect.y - 2);
    if (this.pane) this.pane.render(xm, ym, a);
    const slotWidth = f(this.btnCraft.width / 2.0);
    const slotHeight = f(this.btnCraft.height / 2.0);
    const slotBx = f(f(this.btnCraft.x + f(slotWidth / 2)) - 8);
    const slotBy = f(f(this.btnCraft.y + f(slotHeight / 2)) - 9);
    const cur = this.currentItem;
    if (cur) {
      t.beginOverride();
      for (let i = 0; i < cur.neededItems.length; ++i) {
        const xx = f(slotBx + f(slotWidth * (i % 2)));
        const yy = f(slotBy + f(slotHeight * Math.trunc(i / 2)));
        const req = cur.neededItems[i]!;
        const reqItem = new ItemInstance(req.item);
        if (reqItem.getAuxValue() === -1) reqItem.setAuxValue(0);
        ItemRenderer.renderGuiItemSized(null, this.minecraft.textures!, reqItem, xx, yy, 16, 16, true);
      }
      t.endOverrideAndDraw();
      const scale = f(2.0 / 3.0);
      const invScale = f(1.0 / scale);
      t.beginOverride();
      t.scale2d(scale, scale);
      const font = this.minecraft.font!;
      for (let i = 0; i < cur.neededItems.length; ++i) {
        const xx = f(4 + f(invScale * f(slotBx + f(slotWidth * (i % 2)))));
        const yy = f(23 + f(invScale * f(slotBy + f(slotHeight * Math.trunc(i / 2)))));
        const req = cur.neededItems[i]!;
        const buf = Gui.itemCountItoa(req.has) + '/' + Gui.itemCountItoa(req.item.count);
        if (req.enough()) font.drawShadow(buf, xx, yy, rgbActive);
        else {
          font.draw(buf, xx + 1, yy + 1, rgbInactiveShadow);
          font.draw(buf, xx, yy, rgbInactive);
        }
      }
      t.resetScale();
      t.endOverrideAndDraw();
      font.drawWordWrap(this.currentItemDesc, this.btnCraft.x, this.btnCraft.y + this.btnCraft.height + 6, this.btnCraft.width, rgbActive);
    }
  }

  protected override buttonClicked(button: Button): void {
    if (button === this.btnCraft) this.craftSelectedItem();
    if (button === this.btnClose) this.minecraft.setScreen(null);
    if (button.id >= 100 && button.id < 200) {
      const categoryId = button.id - 100;
      const cat = this._categories[categoryId]!;
      if (cat.length > 0) {
        this.selectItemInCategory(categoryId, cat[0]!);
        this.pane!.setSelected(0, true);
      }
      this.currentCategory = categoryId;
      this.selectedCategoryButton = button as ImageButton;
    }
  }

  private recheckRecipes(): void {
    const ip = new ItemPack();
    const player = this.minecraft.player;
    if (player && player.inventory) {
      const inv = player.inventory;
      for (let i = Inventory.MAX_SELECTION_SIZE; i < inv.getContainerSize(); ++i) {
        const item = inv.getItem(i);
        if (item) ip.add(ItemPack.getIdForItemInstance(item), item.count);
      }
    } else {
      randomlyFillItemPack(ip, 50);
    }
    ip.print();
    for (const item of this._items) {
      item.neededItems = [];
      item.setCanCraft(true);
      const recipe = item.recipe;
      item.inventoryCount = ip.getCount(ItemPack.getIdForItemInstance(item.item));
      const items = recipe.getItemPack().getItemInstances();
      for (const jtem of items) {
        let has = 0;
        if (!Recipe.isAnyAuxValue(jtem) && jtem.getAuxValue() === Recipe.ANY_AUX_VALUE) {
          const aux = new ItemInstance(jtem);
          for (let i = 0; i < 16; ++i) {
            aux.setAuxValue(i);
            has += ip.getCount(ItemPack.getIdForItemInstance(aux));
          }
        } else {
          has = ip.getCount(ItemPack.getIdForItemInstance(jtem));
        }
        const req = new ReqItem(jtem, has);
        item.neededItems.push(req);
        item.setCanCraft(item.canCraft() && req.enough());
      }
    }
    for (const c of this._categories) stableSortBySortText(c);
  }

  private addItem(recipe: Recipe): void {
    const instance = recipe.getResultItem();
    const item = instance.getItem()!;
    const ci = new CItem(instance, recipe, instance.getName());
    if (item.id === Tile.cloth.id) ci.sortText = 'Wool ' + ci.text;
    if (item.id === Item.dye_powder.id) ci.sortText = 'ZDye ' + ci.text;
    this._items.push(ci);
    if (item.category < 0) return;
    for (let i = 0; i < this.categoryBitmasks.length; ++i) {
      if ((this.categoryBitmasks[i]! & item.category) !== 0) this._categories[i]!.push(ci);
    }
  }

  onItemSelected(_forPane: ItemPane, itemIndexInCurrentCategory: number): void {
    if (this.currentCategory >= this._categories.length) return;
    if (itemIndexInCurrentCategory >= this._categories[this.currentCategory]!.length) return;
    this.selectItemInCategory(this.currentCategory, this._categories[this.currentCategory]![itemIndexInCurrentCategory]!);
  }

  /** C++ 私有的 onItemSelected(int buttonIndex, CItem* item)（R10） */
  private selectItemInCategory(buttonIndex: number, item: CItem): void {
    this.currentItem = item;
    this.currentItemDesc = I18n.getDescriptionString(item.item);
    if (buttonIndex !== this.currentCategory) {
      this.clearCategoryItems();
      const NumCategoryItems = this._categories[buttonIndex]!.length;
      this.pane = new ItemPane(this, this.minecraft.textures!, this.paneRect, NumCategoryItems, this.height, this.minecraft.height);
      this.pane.f = this.minecraft.font;
      this.currentCategory = buttonIndex;
    }
  }

  private clearCategoryItems(): void {
    this.currentCategoryButtons = [];
  }

  protected override keyPressed(eventKey: number): void {
    if (eventKey === Keyboard.KEY_ESCAPE || eventKey === Keyboard.KEY_E) {
      this.minecraft.setScreen(null);
    } else {
      super.keyPressed(eventKey);
    }
  }

  private craftSelectedItem(): void {
    const cur = this.currentItem;
    if (!cur) return;
    if (!cur.canCraft()) return;
    const resultItem = new ItemInstance(cur.item);
    const player = this.minecraft.player;
    if (player) {
      // DEFERRED(Network): if (minecraft->isOnline()) { WantCreatePacket … }
      for (const req of cur.neededItems) {
        const toRemove = new ItemInstance(req.item);
        if (Tile.sandStone.id === req.item.id && Recipe.ANY_AUX_VALUE === req.item.getAuxValue()) {
          toRemove.setAuxValue(0);
          toRemove.count = player.inventory.removeResource(toRemove, true);
          toRemove.setAuxValue(Recipe.ANY_AUX_VALUE);
        }
        if (toRemove.count > 0) {
          player.inventory.removeResource(toRemove);
        }
      }
      if (!player.inventory.add(resultItem)) {
        player.drop(new ItemInstance(resultItem), false);
      }
      this.recheckRecipes();
    }
  }

  override renderGameBehind(): boolean {
    return false;
  }

  override closeOnPlayerHurt(): boolean {
    return true;
  }

  getItems(_forPane: ItemPane): CItem[] {
    return this._categories[this.currentCategory]!;
  }

  /** C++ 的 virtual filterRecipes(RecipeList&)：从后往前删掉 filterRecipe 返回假的 */
  protected filterRecipes(recipes: Recipe[]): Recipe[] {
    for (let i = recipes.length - 1; i >= 0; --i) {
      if (!this.filterRecipe(recipes[i]!)) recipes.splice(i, 1);
    }
    return recipes;
  }

  protected abstract filterRecipe(recipe: Recipe): boolean;

  /** 只能在子类构造函数里调用（C++ 用 assert(!minecraft) 检查） */
  protected setSingleCategoryAndIcon(categoryBitmask: number, categoryIcon: number): void {
    this.numCategories = 1;
    this.categoryIcons = [categoryIcon];
    this.categoryBitmasks = [categoryBitmask];
  }
}

/** C++ 文件内的 static randomlyFillItemPack（没有玩家时用；正常不会走到） */
function randomlyFillItemPack(ip: ItemPack, numItems: number): void {
  let added = 0;
  const item = new ItemInstance(0, 1, 0);
  while (added < numItems) {
    const t = Mth.random(512);
    if (!Item.items[t]) continue;
    item.id = t;
    const id = ItemPack.getIdForItemInstance(item);
    const count = Mth.random(10);
    for (let i = 0; i < count; ++i) ip.add(id);
    ++added;
  }
}

/** std::stable_sort(…, sortCanCraftPredicate)：a.sortText < b.sortText（std::string 按字节比较） */
function stableSortBySortText(list: CItem[]): void {
  const idx = list.map((c, i) => [c, i] as const);
  idx.sort((a, b) => (a[0].sortText < b[0].sortText ? -1 : a[0].sortText > b[0].sortText ? 1 : a[1] - b[1]));
  for (let i = 0; i < list.length; i++) list[i] = idx[i]![0];
}
void (0 as unknown as Minecraft);
