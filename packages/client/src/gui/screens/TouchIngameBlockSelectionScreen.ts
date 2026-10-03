/**
 * 1:1 移植自 src/client/gui/screens/touch/TouchIngameBlockSelectionScreen.h 与 .cpp（S13 阶段 C）。C++ 的 Touch::IngameBlockSelectionScreen。
 * 默认的菜单风格（OPTIONS_MENU_STYLE = 0）下，ScreenChooser 为物品选择界面创建的就是这个类。
 * 部分：生存模式的“合成”“护甲”按钮打开的 WorkbenchScreen、ArmorScreen 未移植（DEFERRED(Gui)）；
 *   放入快捷栏时的音效 DEFERRED(Sound)。
 */
import { Inventory, type ItemInstance } from '@mcpe/world';
import { GL_BLEND, GL_DEPTH_TEST, GL_ONE_MINUS_SRC_ALPHA, GL_SRC_ALPHA, glBlendFunc2, glColor4f2, glDisable2, glEnable2 } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import type { Button } from '../components/Button';
import { TButton, THeader } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { type IInventoryPaneCallback, InventoryPane } from '../components/InventoryPane';
import { Gui } from '../Gui';
import { Screen } from '../Screen';
import { ScreenId } from './ScreenChooser';

const BorderPixels = 4;
const BlockPixels = 24;
const ItemSize = Math.trunc(BlockPixels + 2 * BorderPixels);
const Bx = 10;
const By = 6;

export class TouchIngameBlockSelectionScreen extends Screen implements IInventoryPaneCallback {
  private selectedItem = 0;
  private _pendingClose = false;
  private _blockList: InventoryPane | null = null;
  private bHeader = new THeader(0, 'Select blocks');
  private bDone = new ImageButton(3, '');
  private bCraft = new TButton(1, 'Craft');
  private bArmor = new TButton(4, 'Armor');
  private bMenu = new TButton(2, 'Menu');
  private clippingArea = new IntRectangle();
  private InventoryRows = 0;
  private InventorySize = 0;
  private InventoryColumns = 0;

  protected override initScreen(): void {
    const inventory = this.minecraft.player!.inventory;
    const maxWidth = this.width - Bx - Bx;
    this.InventoryColumns = Math.trunc(maxWidth / ItemSize);
    const realWidth = this.InventoryColumns * ItemSize;
    const realBx = Math.trunc((this.width - realWidth) / 2);
    const rect = new IntRectangle(realBx, 24 + By, realWidth, this.height - By - By - 20 - 24);
    this._blockList = new InventoryPane(this, this.minecraft, rect, this.width, BorderPixels, inventory.getContainerSize() - Inventory.MAX_SELECTION_SIZE, ItemSize, Math.trunc(BorderPixels));
    this._blockList.fillMarginX = realBx;
    this.InventorySize = inventory.getContainerSize() - Inventory.MAX_SELECTION_SIZE;
    this.InventoryRows = 1 + Math.trunc((this.InventorySize - 1) / this.InventoryColumns);
    const def = new ImageDef();
    def.name = 'gui/spritesheet.png';
    def.x = 0;
    def.y = 1;
    def.width = def.height = 18;
    def.setSrc(new IntRectangle(60, 0, 18, 18));
    this.bDone.setImageDef(def, true);
    this.bDone.width = this.bDone.height = 19;
    this.bDone.scaleWhenPressed = false;
    this.buttons.push(this.bHeader);
    this.buttons.push(this.bDone);
    if (!this.minecraft.isCreativeMode()) {
      this.buttons.push(this.bCraft);
      this.buttons.push(this.bArmor);
    }
  }

  override setupPositions(): void {
    const { bHeader, bDone, bCraft, bArmor } = this;
    bHeader.y = bDone.y = bCraft.y = 0;
    bDone.x = this.width - bDone.width;
    bCraft.x = 0;
    bCraft.width = bArmor.width = 48;
    bArmor.x = bCraft.width;
    if (this.minecraft.isCreativeMode()) {
      bHeader.x = 0;
      bHeader.width = this.width;
      bHeader.xText = Math.trunc(this.width / 2);
    } else {
      bHeader.x = bCraft.width + bArmor.width;
      bHeader.width = this.width - bCraft.width - bArmor.width;
      bHeader.xText = bHeader.x + Math.trunc((bHeader.width - bDone.width) / 2);
    }
    this.clippingArea.x = 0;
    this.clippingArea.w = this.minecraft.width;
    this.clippingArea.y = 0;
    this.clippingArea.h = Math.trunc(Gui.GuiScale * 24);
  }

  override removed(): void {
    this.minecraft.gui.inventoryUpdated();
  }

  private getSlotPosX(slotX: number): number {
    return Math.trunc(this.width / 2) - this.InventoryColumns * 10 + slotX * 20 + 2;
  }

  private getSlotPosY(slotY: number): number {
    return this.height - 16 - 3 - 22 * 2 - 22 * slotY;
  }

  private getSlotHeight(): number {
    return 22;
  }

  protected override mouseClicked(x: number, y: number, buttonNum: number): void {
    this._pendingClose = this._blockList!._clickArea.isInside(x, y);
    if (!this._pendingClose) super.mouseClicked(x, y, buttonNum);
  }

  protected override mouseReleased(x: number, y: number, buttonNum: number): void {
    if (this._pendingClose && this._blockList!._clickArea.isInside(x, y)) this.minecraft.setScreen(null);
    else super.mouseReleased(x, y, buttonNum);
  }

  protected override mouseWheel(_dx: number, dy: number, _xm: number, _ym: number): void {
    if (dy === 0) return;
    if (this._blockList) {
      const amount = -dy * this.getSlotHeight();
      this._blockList.scrollBy(0, amount);
    }
    const cols = this.InventoryColumns;
    const maxIndex = this.InventorySize - 1;
    let idx = this.selectedItem;
    if (dy > 0) {
      if (idx >= cols) idx -= cols;
    } else if (idx + cols <= maxIndex) idx += cols;
    this.selectedItem = idx;
  }

  addItem(_pane: InventoryPane, itemId: number): boolean {
    const inventory = this.minecraft.player!.inventory;
    itemId += Inventory.MAX_SELECTION_SIZE;
    if (!inventory.getItem(itemId)) return false;
    inventory.moveToSelectionSlot(0, itemId, true);
    inventory.selectSlot(0);
    // DEFERRED(Sound): minecraft->soundEngine->playUI("random.pop2", 1.0f, 0.3f);
    this.minecraft.gui.flashSlot(inventory.selected);
    return true;
  }

  override tick(): void {
    this._blockList!.tick();
    super.tick();
  }

  override render(xm: number, ym: number, a: number): void {
    glDisable2(GL_DEPTH_TEST);
    glEnable2(GL_BLEND);
    super.render(xm, ym, a);
    this._blockList!.render(xm, ym, a);
    const bbox = this._blockList!.rect;
    Tesselator.instance.colorABGR(0xffffffff | 0);
    this.minecraft.textures!.loadAndBindTexture('gui/itemframe.png');
    glEnable2(GL_BLEND);
    glColor4f2(1, 1, 1, 1);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    this.blit(0, bbox.y - By, 0, 0, this.width, bbox.h + By + By, 215, 256);
    glDisable2(GL_BLEND);
    glEnable2(GL_DEPTH_TEST);
  }

  protected override buttonClicked(button: Button): void {
    if (button.id === this.bDone.id) this.minecraft.setScreen(null);
    if (button.id === this.bMenu.id) {
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_PAUSE);
    }
    if (button.id === this.bCraft.id) {
      // DEFERRED(Gui): minecraft->setScreen(new WorkbenchScreen(Recipe::SIZE_2X2));
    }
    if (button === this.bArmor) {
      // DEFERRED(Gui): minecraft->setScreen(new ArmorScreen());
    }
  }

  isAllowed(slot: number): boolean {
    const gridCount = this.minecraft.player!.inventory.getContainerSize() - Inventory.MAX_SELECTION_SIZE;
    return !(slot < 0 || slot >= gridCount);
  }

  override hasClippingArea(out: IntRectangle): boolean {
    out.x = this.clippingArea.x;
    out.y = this.clippingArea.y;
    out.w = this.clippingArea.w;
    out.h = this.clippingArea.h;
    return true;
  }

  getItems(_forPane: InventoryPane): (ItemInstance | null)[] {
    const out: (ItemInstance | null)[] = [];
    const inv = this.minecraft.player!.inventory;
    for (let i = Inventory.MAX_SELECTION_SIZE; i < inv.getContainerSize(); ++i) out.push(inv.getItem(i));
    return out;
  }

  // C++ 里的 renderDemoOverlay 为空函数
  private renderDemoOverlay(): void {}
}
void TouchIngameBlockSelectionScreen.prototype;
