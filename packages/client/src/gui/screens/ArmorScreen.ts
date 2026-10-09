/**
 * 1:1 移植自 src/client/gui/screens/ArmorScreen.h 与 ArmorScreen.cpp（护甲界面）。
 * 左边：背包（快捷栏之外）里所有护甲的格子（Touch::InventoryPane）；点一件就穿上（原来那件放回背包，放不下就扔地上）。
 * 中间：4 个护甲槽（头、胸、腿、脚），点一下脱下；空槽画 items.png 第 15 列的轮廓图标。
 * 右边：缓慢摆动的玩家模型（EntityRenderDispatcher 直接画，临时改玩家的朝向和走路动画、画完复原）。
 * 原样保留：burnResult、descWidth、_items、currentItemDesc 声明了但不使用（从熔炉界面复制来的）；isAllowed 恒为真。
 * C++ 的 Touch::InventoryPane / Touch::THeader 在 TS 里是 InventoryPane / THeader。C++ 的无参 init() 是 initScreen（R10）。
 */
import { SharedConstants } from '@mcpe/core';
import { getTimeS } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import { type ArmorItem, Inventory, ItemInstance, type Player } from '@mcpe/world';
import { EntityRenderDispatcher } from '../../renderer/entity/EntityRenderDispatcher';
import { ItemRenderer } from '../../renderer/entity/ItemRenderer';
import {
  GL_ALPHA_TEST, GL_TEXTURE_2D, glColor4f2, glDisable2, glEnable2, glPopMatrix, glPushMatrix, glRotatef, glScalef, glTranslatef,
} from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import type { Button } from '../components/Button';
import { BlankButton, THeader } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { type IInventoryPaneCallback, InventoryPane } from '../components/InventoryPane';
import { type NinePatchLayer, NinePatchFactory } from '../components/NinePatch';
import { Screen } from '../Screen';

const f = Math.fround;
const BorderPixels = 4;
const BlockPixels = 24;
const ItemSize = Math.trunc(BlockPixels + 2 * BorderPixels);
const Bx = 10;
const By = 6;

function setIfNotSet(ref: { v: boolean }, condition: boolean): void {
  ref.v = ref.v || condition;
}

export class ArmorScreen extends Screen implements IInventoryPaneCallback {
  private static readonly NUM_ARMORBUTTONS = 4;
  private btnClose = new ImageButton(4, '');
  private btnArmor0 = new BlankButton(0);
  private btnArmor1 = new BlankButton(1);
  private btnArmor2 = new BlankButton(2);
  private btnArmor3 = new BlankButton(3);
  private armorButtons: BlankButton[] = [];
  private bHeader = new THeader(5, 'Armor');
  private inventoryPane: InventoryPane | null = null;
  private inventoryPaneRect = new IntRectangle();
  private guiPlayerBgRect = new IntRectangle();
  private armorItems: (ItemInstance | null)[] = [];
  private doRecreatePane = { v: false };
  private guiBackground: NinePatchLayer | null = null;
  private guiSlot: NinePatchLayer | null = null;
  private guiPaneFrame: NinePatchLayer | null = null;
  private guiPlayerBg: NinePatchLayer | null = null;
  private player!: Player;
  private descWidth = 90; // C++ 声明并初始化，但不使用

  protected override initScreen(): void {
    super.initScreen();
    this.player = this.minecraft.player!;
    const def = new ImageDef();
    def.name = 'gui/spritesheet.png';
    def.x = 0;
    def.y = 1;
    def.width = def.height = 18;
    def.setSrc(new IntRectangle(60, 0, 18, 18));
    this.btnClose.setImageDef(def, true);
    this.btnClose.scaleWhenPressed = false;
    this.buttons.push(this.bHeader);
    this.buttons.push(this.btnClose);
    this.armorButtons = [this.btnArmor0, this.btnArmor1, this.btnArmor2, this.btnArmor3];
    for (const b of this.armorButtons) this.buttons.push(b);
    const builder = new NinePatchFactory(this.minecraft.textures!, 'gui/spritesheet.png');
    this.guiBackground = builder.createSymmetrical(new IntRectangle(0, 0, 16, 16), 4, 4);
    this.guiSlot = builder.createSymmetrical(new IntRectangle(0, 32, 8, 8), 3, 3, 20, 20);
    this.guiPaneFrame = builder.createSymmetrical(new IntRectangle(28, 42, 4, 4), 1, 1).setExcluded(1 << 4);
    this.guiPlayerBg = builder.createSymmetrical(new IntRectangle(0, 20, 8, 8), 3, 3);
    this.updateItems();
  }

  override setupPositions(): void {
    this.bHeader.x = this.bHeader.y = 0;
    this.bHeader.width = this.width;
    this.btnClose.width = this.btnClose.height = 19;
    this.btnClose.x = this.width - this.btnClose.width;
    this.btnClose.y = 0;
    const maxWidth = Math.trunc(f(this.width / f(1.8))) - Bx - Bx;
    const InventoryColumns = Math.trunc(maxWidth / ItemSize);
    const realWidth = InventoryColumns * ItemSize;
    const paneWidth = realWidth + Bx + Bx;
    const realBx = Math.trunc((paneWidth - realWidth) / 2);
    this.inventoryPaneRect = new IntRectangle(realBx, 26 + By, realWidth, this.height - By - By - 28);
    for (let i = 0; i < ArmorScreen.NUM_ARMORBUTTONS; ++i) {
      const b = this.armorButtons[i]!;
      b.x = paneWidth;
      b.y = this.inventoryPaneRect.y + 24 * i;
      b.width = 20;
      b.height = 20;
    }
    this.guiPlayerBgRect.y = this.inventoryPaneRect.y;
    const xx = this.armorButtons[0]!.x + this.armorButtons[0]!.width;
    const xw = this.width - xx;
    this.guiPlayerBgRect.x = xx + Math.trunc(xw / 10);
    this.guiPlayerBgRect.w = xw - Math.trunc(xw / 10) * 2;
    this.guiPlayerBgRect.h = this.inventoryPaneRect.h;
    this.guiPaneFrame!.setSize(this.inventoryPaneRect.w + 2, this.inventoryPaneRect.h + 2);
    this.guiPlayerBg!.setSize(this.guiPlayerBgRect.w, this.guiPlayerBgRect.h);
    this.guiBackground!.setSize(this.width, this.height);
    this.updateItems();
    this.setupInventoryPane();
  }

  override tick(): void {
    if (this.inventoryPane) this.inventoryPane.tick();
    if (this.doRecreatePane.v) {
      this.updateItems();
      this.setupInventoryPane();
      this.doRecreatePane.v = false;
    }
  }

  private handleRenderPane(pane: InventoryPane | null, t: Tesselator, xm: number, ym: number, a: number): void {
    if (pane) {
      pane.render(xm, ym, a);
      this.guiPaneFrame!.draw(t, pane.rect.x - 1, pane.rect.y - 1);
    }
  }

  override render(xm: number, ym: number, a: number): void {
    const t = Tesselator.instance;
    t.addOffset(0, 0, -500);
    this.guiBackground!.draw(t, 0, 0);
    t.addOffset(0, 0, 500);
    glEnable2(GL_ALPHA_TEST);
    super.render(xm, ym, a);
    this.handleRenderPane(this.inventoryPane, t, xm, ym, a);
    t.colorABGR(0xffffffff | 0);
    glColor4f2(1, 1, 1, 1);
    t.addOffset(0, 0, -490);
    this.guiPlayerBg!.draw(t, this.guiPlayerBgRect.x, this.guiPlayerBgRect.y);
    t.addOffset(0, 0, 490);
    this.renderPlayer(this.guiPlayerBgRect.x + Math.trunc(this.guiPlayerBgRect.w / 2), f(f(0.85) * this.height));
    for (let i = 0; i < ArmorScreen.NUM_ARMORBUTTONS; ++i) {
      this.drawSlotItemAt(t, i, this.player.getArmor(i), this.armorButtons[i]!.x, this.armorButtons[i]!.y);
    }
    glDisable2(GL_ALPHA_TEST);
  }

  protected override buttonClicked(button: Button): void {
    if (button === this.btnClose) {
      this.minecraft.setScreen(null);
    }
    if (button.id >= 0 && button.id <= 3) {
      this.takeAndClearSlot(button.id);
    }
  }

  addItem(_forPane: InventoryPane, itemIndex: number): boolean {
    const instance = this.armorItems[itemIndex] ?? null;
    if (!ItemInstance.isArmorItem(instance)) return false;
    const item = instance!.getItem() as ArmorItem;
    const old = this.player.getArmor(item.slot);
    let oldArmor = new ItemInstance();
    if (ItemInstance.isArmorItem(old)) {
      oldArmor = new ItemInstance(old!);
    }
    this.player.setArmor(item.slot, instance);
    this.player.inventory.removeItemInstance(instance!);
    this.armorItems[itemIndex] = null;
    if (!oldArmor.isNull()) {
      if (!this.player.inventory.add(oldArmor)) {
        this.player.drop(new ItemInstance(oldArmor), false);
      }
    }
    this.doRecreatePane.v = true;
    return true;
  }

  isAllowed(_slot: number): boolean {
    return true;
  }

  override renderGameBehind(): boolean {
    return false;
  }

  getItems(_forPane: InventoryPane): (ItemInstance | null)[] {
    return this.armorItems;
  }

  private updateItems(): void {
    this.armorItems = [];
    const inv = this.minecraft.player!.inventory;
    for (let i = Inventory.MAX_SELECTION_SIZE; i < inv.getContainerSize(); ++i) {
      const item = inv.getItem(i);
      if (ItemInstance.isArmorItem(item)) this.armorItems.push(item);
    }
  }

  /** C++ 的 canMoveToSlot（没有调用方） */
  protected canMoveToSlot(slot: number, item: ItemInstance | null): boolean {
    return ItemInstance.isArmorItem(item) && (item!.getItem() as ArmorItem).slot === slot;
  }

  private setupInventoryPane(): void {
    this.inventoryPane = new InventoryPane(this, this.minecraft, this.inventoryPaneRect, this.inventoryPaneRect.w, BorderPixels, this.armorItems.length, ItemSize, Math.trunc(BorderPixels));
    this.inventoryPane.fillMarginX = 0;
    this.inventoryPane.fillMarginY = 0;
  }

  private drawSlotItemAt(t: Tesselator, slot: number, item: ItemInstance | null, x: number, y: number): void {
    const xx = x;
    const yy = y;
    this.guiSlot!.draw(t, xx, yy);
    if (item && !item.isNull()) {
      ItemRenderer.renderGuiItem(this.minecraft.font, this.minecraft.textures!, item, xx + 2, yy, true);
      glDisable2(GL_TEXTURE_2D);
      ItemRenderer.renderGuiItemDamage(item, xx + 2, yy + 3); // C++ 的 renderGuiItemDecorations(item, x, y)（R10）
      glEnable2(GL_TEXTURE_2D);
    } else {
      this.minecraft.textures!.loadAndBindTexture('gui/items.png');
      this.blit(x + 2, y, 15 * 16, slot * 16, 16, 16, 16, 16);
    }
  }

  private takeAndClearSlot(slot: number): void {
    const item = this.player.getArmor(slot);
    if (!item) return;
    const inv = this.minecraft.player!.inventory;
    const oldSize = inv.getNumEmptySlots();
    if (!inv.add(item)) this.minecraft.player!.drop(new ItemInstance(item), false);
    this.player.setArmor(slot, null);
    const newSize = inv.getNumEmptySlots();
    setIfNotSet(this.doRecreatePane, newSize !== oldSize);
  }

  private renderPlayer(xo: number, yo: number): void {
    glPushMatrix();
    glTranslatef(xo, yo, -200);
    const ss = 45;
    glScalef(-ss, ss, ss);
    glRotatef(180, 0, 0, 1);
    const player = this.minecraft.player! as Player;
    const oybr = player.yBodyRot;
    const oyr = player.yRot;
    const oxr = player.xRot;
    const t = f(getTimeS());
    const xd = f(10 * Mth.sin(t));
    const yd = f(10 * Mth.cos(f(t * f(0.05))));
    glRotatef(45 + 90, 0, 1, 0);
    glRotatef(-45 - 90, 0, 1, 0);
    const xtan = f(f(Mth.atan(f(xd / 40.0))) * +20);
    const ytan = f(f(Mth.atan(f(yd / 40.0))) * -20);
    glRotatef(ytan, 1, 0, 0);
    player.yBodyRot = xtan;
    player.yRot = f(xtan + xtan);
    player.xRot = ytan;
    glTranslatef(0, player.heightOffset, 0);
    const oldWAP = player.walkAnimPos;
    const oldWAS = player.walkAnimSpeed;
    const oldWASO = player.walkAnimSpeedO;
    player.walkAnimSpeedO = player.walkAnimSpeed = f(0.25);
    player.walkAnimPos = f(f(f(getTimeS()) * player.walkAnimSpeed) * SharedConstants.TicksPerSecond);
    const rd = EntityRenderDispatcher.getInstance();
    rd.playerRotY = 180;
    rd.renderAt(player, 0, 0, 0, 0, 1);
    player.walkAnimPos = oldWAP;
    player.walkAnimSpeed = oldWAS;
    player.walkAnimSpeedO = oldWASO;
    player.yBodyRot = oybr;
    player.yRot = oyr;
    player.xRot = oxr;
    glPopMatrix();
  }
}
