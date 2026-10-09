/**
 * 1:1 移植自 src/client/gui/screens/IngameBlockSelectionScreen.h 与 .cpp：经典风格（菜单风格 1、2）的物品选择界面（按 E）。
 * 背包（快捷栏之外）按快捷栏的样式一排排画出来：生存 9 列（gui.png 的整条快捷栏）、创造 13 列（拼两段）。
 * 点选一格再松开 → 把它换到快捷栏第 0 格并选中、闪一下、播点击声、关闭；点到网格外面松开就关闭；
 * 方向键（前后左右的按键绑定）移动选择，“确定 / 取消”键选中或关闭；滚轮上下移一行。生存模式左下有“护甲”“合成”两个按钮。
 * 原样保留：
 *   - 两个按钮的 id 都是 1（buttonClicked 按对象比较，不受影响）；
 *   - init 找“当前选中物品在背包里的位置”时，循环上限用的是 InventorySize（不是容器大小），背包靠后的格子找不到；
 *   - renderDemoOverlay 是空的；demoVersionString 定义了不用。
 * C++ 的无参 init() 是 initScreen（R10）。
 */
import { Inventory, Recipe, type ItemInstance } from '@mcpe/world';
import { MouseAction } from '@mcpe/platform';
import { OptionId } from '../../Options';
import { ItemRenderer } from '../../renderer/entity/ItemRenderer';
import {
  GL_ALPHA_TEST, GL_BLEND, GL_DEPTH_TEST, GL_ONE_MINUS_SRC_ALPHA, GL_RESCALE_NORMAL, GL_SRC_ALPHA, glBlendFunc2, glColor4f2, glDisable2,
  glEnable2, glPopMatrix2, glPushMatrix2, glScalef2,
} from '../../renderer/gles';
import { Lighting } from '../../renderer/Lighting';
import { RectangleArea } from '../../player/input/touchscreen/TouchAreaModel';
import { Button } from '../components/Button';
import { Gui } from '../Gui';
import { Screen } from '../Screen';
import { ArmorScreen } from './ArmorScreen';
import { WorkbenchScreen } from './crafting/WorkbenchScreen';

const demoVersionString = 'Not available in the demo version';

export class IngameBlockSelectionScreen extends Screen {
  private InventoryCols = 1;
  private InventoryRows = 1;
  private InventorySize = 1;
  private selectedItem = 0;
  private _pendingQuit = false;
  private bArmor = new Button(1, 'Armor');
  private bCrafting = new Button(1, 'Crafting');
  private _area = new RectangleArea(0, 0, 0, 0);

  protected override initScreen(): void {
    const mc = this.minecraft;
    const inventory = mc.player!.inventory;
    this.InventoryCols = mc.isCreativeMode() ? 13 : 9;
    this.InventorySize = inventory.getContainerSize() - Inventory.MAX_SELECTION_SIZE;
    this.InventoryRows = 1 + Math.trunc((this.InventorySize - 1) / this.InventoryCols);
    this._area = new RectangleArea(this.getSlotPosX(0) - 4, this.getSlotPosY(0) - 4, this.getSlotPosX(this.InventoryCols) + 4, this.getSlotPosY(this.InventoryRows) + 4);
    if (!mc.isCreativeMode()) {
      this.bArmor.width = 42;
      this.bCrafting.width = 42;
      this.bArmor.x = 0;
      this.bArmor.y = this.height - this.bArmor.height;
      this.bCrafting.x = 0;
      this.bCrafting.y = this.height - this.bCrafting.height - 30;
      this.buttons.push(this.bArmor, this.bCrafting);
    }
    const selected = inventory.getSelected();
    if (!selected || selected.isNull()) {
      this.selectedItem = 0;
      return;
    }
    for (let i = Inventory.MAX_SELECTION_SIZE; i < this.InventorySize; i++) {
      if (selected === inventory.getItem(i)) {
        this.selectedItem = i - Inventory.MAX_SELECTION_SIZE;
        break;
      }
    }
    if (!this.isAllowed(this.selectedItem)) this.selectedItem = 0;
  }

  override removed(): void {
    this.minecraft.gui.inventoryUpdated();
  }

  private renderSlots(): void {
    glColor4f2(1, 1, 1, 1);
    this.blitOffset = -90;
    glEnable2(GL_RESCALE_NORMAL);
    Lighting.turnOn(this.minecraft);
    this.minecraft.textures!.loadAndBindTexture('gui/gui.png');
    for (let r = 0; r < this.InventoryRows; r++) {
      const x = this.getSlotPosX(0) - 3;
      const y = this.getSlotPosY(r) - 3;
      if (this.InventoryCols === 9) {
        this.blit(x, y, 0, 0, 182, 22);
      } else {
        this.blit(x, y, 0, 0, 182 - 20, 22);
        const k = 5;
        const w = k * 20;
        this.blit(x + 162, y, 182 - w, 0, w, 22);
      }
    }
    if (this.selectedItem >= 0) {
      const x = this.getSlotPosX(this.selectedItem % this.InventoryCols) - 4;
      const y = this.getSlotPosY(Math.trunc(this.selectedItem / this.InventoryCols)) - 4;
      this.blit(x, y, 0, 22, 24, 22);
    }
    for (let r = 0; r < this.InventoryRows; r++) {
      const y = this.getSlotPosY(r);
      for (let i = 0; i < this.InventoryCols; i++) {
        const x = this.getSlotPosX(i);
        this.renderSlot(r * this.InventoryCols + i + Inventory.MAX_SELECTION_SIZE, x, y, 0);
      }
    }
    glDisable2(GL_RESCALE_NORMAL);
    Lighting.turnOff();
  }

  private getSlotPosX(slotX: number): number {
    return Math.trunc(this.width / 2) - this.InventoryCols * 10 + slotX * 20 + 2;
  }

  private getSlotPosY(slotY: number): number {
    const yy = this.InventoryCols === 9 ? 8 : 3;
    return yy + slotY * this.getSlotHeight();
  }

  private renderSlot(slot: number, x: number, y: number, _a: number): void {
    const mc = this.minecraft;
    const item: ItemInstance | null = mc.player!.inventory.getItem(slot);
    if (!item) return;
    ItemRenderer.renderGuiItem(mc.font, mc.textures!, item, x, y, true);
    if (mc.gameMode!.isCreativeType()) return;
    if (!this.isAllowed(slot - Inventory.MAX_SELECTION_SIZE)) return;
    glPushMatrix2();
    glScalef2(Gui.InvGuiScale + Gui.InvGuiScale, Gui.InvGuiScale + Gui.InvGuiScale, 1);
    const k = Math.fround(0.5 * Gui.GuiScale);
    mc.gui.renderSlotText(item, Math.fround(k * x), Math.fround(k * y), true, true);
    glPopMatrix2();
  }

  protected override keyPressed(eventKey: number): void {
    const selX = this.selectedItem % this.InventoryCols;
    const selY = Math.trunc(this.selectedItem / this.InventoryCols);
    let tmpSelectedSlot = this.selectedItem;
    const o = this.minecraft.options;
    if (eventKey === o.getIntValue(OptionId.OPTIONS_KEY_LEFT) && selX > 0) {
      tmpSelectedSlot -= 1;
    } else if (eventKey === o.getIntValue(OptionId.OPTIONS_KEY_RIGHT) && selX < this.InventoryCols - 1) {
      tmpSelectedSlot += 1;
    } else if (eventKey === o.getIntValue(OptionId.OPTIONS_KEY_BACK) && selY < this.InventoryRows - 1) {
      tmpSelectedSlot += this.InventoryCols;
    } else if (eventKey === o.getIntValue(OptionId.OPTIONS_KEY_FORWARD) && selY > 0) {
      tmpSelectedSlot -= this.InventoryCols;
    }
    if (this.isAllowed(tmpSelectedSlot)) this.selectedItem = tmpSelectedSlot;
    if (eventKey === o.getIntValue(OptionId.OPTIONS_KEY_MENU_OK)) this.selectSlotAndClose();
    if (eventKey === o.getIntValue(OptionId.OPTIONS_KEY_MENU_CANCEL)) this.minecraft.setScreen(null);
  }

  protected override mouseWheel(_dx: number, dy: number, _xm: number, _ym: number): void {
    if (dy === 0) return;
    const cols = this.InventoryCols;
    const maxIndex = this.InventorySize - 1;
    let idx = this.selectedItem;
    if (dy > 0) {
      if (idx >= cols) idx -= cols;
    } else {
      if (idx + cols <= maxIndex) idx += cols;
    }
    this.selectedItem = idx;
  }

  private getSelectedSlot(x: number, y: number): number {
    const left = Math.trunc(this.width / 2) - this.InventoryCols * 10;
    const top = -4 + this.getSlotPosY(0);
    if (x >= left && y >= top) {
      const xSlot = Math.trunc((x - left) / 20);
      if (xSlot < this.InventoryCols) {
        const row = Math.trunc((y - top) / this.getSlotHeight());
        return row * this.InventoryCols + xSlot;
      }
    }
    return -1;
  }

  protected override mouseClicked(x: number, y: number, buttonNum: number): void {
    if (buttonNum === MouseAction.ACTION_LEFT) {
      const slot = this.getSelectedSlot(x, y);
      if (this.isAllowed(slot)) {
        this.selectedItem = slot;
      } else {
        this._pendingQuit = !this._area.isInside(x, y) && !this.bArmor.isInside(x, y) && !this.bCrafting.isInside(x, y);
      }
    }
    if (!this._pendingQuit) super.mouseClicked(x, y, buttonNum);
  }

  protected override mouseReleased(x: number, y: number, buttonNum: number): void {
    if (buttonNum === MouseAction.ACTION_LEFT) {
      const slot = this.getSelectedSlot(x, y);
      if (this.isAllowed(slot) && slot === this.selectedItem) {
        this.selectSlotAndClose();
      } else {
        if (this._pendingQuit && !this._area.isInside(x, y)) this.minecraft.setScreen(null);
      }
    }
    if (!this._pendingQuit) super.mouseReleased(x, y, buttonNum);
  }

  private selectSlotAndClose(): void {
    const mc = this.minecraft;
    const inventory = mc.player!.inventory;
    inventory.moveToSelectionSlot(0, this.selectedItem + Inventory.MAX_SELECTION_SIZE, true);
    inventory.selectSlot(0);
    mc.gui.flashSlot(inventory.selected);
    mc.soundEngine!.playUI('random.click', 1, 1);
    mc.setScreen(null);
  }

  override render(xm: number, ym: number, a: number): void {
    glDisable2(GL_DEPTH_TEST);
    this.fill(0, 0, this.width, this.height, 0x80 << 24);
    glEnable2(GL_BLEND);
    glDisable2(GL_ALPHA_TEST);
    glEnable2(GL_BLEND);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    this.renderSlots();
    this.renderDemoOverlay();
    glEnable2(GL_ALPHA_TEST);
    glDisable2(GL_BLEND);
    glEnable2(GL_DEPTH_TEST);
    super.render(xm, ym, a);
  }

  private renderDemoOverlay(): void {}

  private isAllowed(slot: number): boolean {
    if (slot < 0 || slot >= this.InventorySize) return false;
    return true;
  }

  private getSlotHeight(): number {
    return this.InventoryCols === 9 ? 22 : 20;
  }

  protected override buttonClicked(button: Button): void {
    if (button === this.bArmor) {
      this.minecraft.setScreen(new ArmorScreen());
    }
    if (button === this.bCrafting) {
      this.minecraft.setScreen(new WorkbenchScreen(Recipe.SIZE_2X2));
    }
    super.buttonClicked(button);
  }
}
void demoVersionString;
