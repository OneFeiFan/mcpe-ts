/**
 * 1:1 移植自 src/client/gui/screens/FurnaceScreen.h 与 FurnaceScreen.cpp（熔炉界面）。
 * 左边：背包里能当燃料或能烧的物品（Touch::InventoryPane）；右边：原料、燃料、产物 3 个格子 + 火焰与箭头进度。
 * 先点原料格或燃料格选中它（白框），再点左边的物品放进去：点一下放 1 个；按住会充能（进度条），按满就放进去一叠里按比例的数量。
 * 再点一次已选中的格子就取回；点产物格取走产物。产物格空时，用淡色画出“会烧出什么”和它的说明。
 * 原样保留：
 *   - 文件内静态 heldMs、percent（按住的时间与百分比）→ 模块级状态；
 *   - drawSlotItemAt 里 `(selected ? guiSlot : guiSlot)`：两边是同一张图（guiSlotMarked 建了没用）；
 *   - addItem 放进去之后，如果原来那格还有东西，就找第一个已经空了的格子当作“被移走的那一项”（LOGI 打印）；
 *   - 联网时的 ContainerSetSlotPacket（单机 isClientSide 为假，不发送，DEFERRED(Network)）。
 * C++ 的无参 init() 是 initScreen（R10）；queryHoldTime(int*, int*) 在 TS 里返回 [ok, id, ms]。
 */
import { I18n } from '@mcpe/locale';
import { LOGI } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import {
  FurnaceMenu,
  FurnaceRecipes,
  FurnaceTileEntity,
  Inventory,
  ItemInstance,
  type Player,
} from '@mcpe/world';
import { ItemRenderer } from '../../renderer/entity/ItemRenderer';
import { GL_ALPHA_TEST, GL_BLEND, glDisable2, glEnable2 } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import type { Button } from '../components/Button';
import { BlankButton, THeader } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { type IInventoryPaneCallback, InventoryPane } from '../components/InventoryPane';
import { CItem } from '../components/ItemPane';
import { type NinePatchLayer, NinePatchFactory } from '../components/NinePatch';
import { BaseContainerScreen } from './BaseContainerScreen';

const f = Math.fround;
/** FurnaceScreen.cpp 的文件内静态变量 */
const holdState = { heldMs: -1, percent: -1 };
const MaxHoldMs = 500.0;
const MinChargeMs = 200;
const rgbActive = 0xfff0f0f0 | 0;
const BorderPixels = 4;
const BlockPixels = 24;
const ItemSize = Math.trunc(BlockPixels + 2 * BorderPixels);
const Bx = 10;
const By = 6;

export class FurnaceScreen extends BaseContainerScreen implements IInventoryPaneCallback {
  private currentItemDesc = '';
  private burnResult = new ItemInstance();
  private descWidth = 90;
  private btnClose = new ImageButton(4, '');
  private btnIngredient = new BlankButton(FurnaceTileEntity.SLOT_INGREDIENT);
  private btnFuel = new BlankButton(FurnaceTileEntity.SLOT_FUEL);
  private btnResult = new BlankButton(FurnaceTileEntity.SLOT_RESULT);
  private bHeader = new THeader(5, 'Furnace');
  private inventoryPane: InventoryPane | null = null;
  private inventoryPaneRect = new IntRectangle();
  private listFuel: CItem[] = [];
  private listIngredient: CItem[] = [];
  private inventorySlots: number[] = [];
  private inventoryItems: (ItemInstance | null)[] = [];
  private doRecreatePane = false;
  private selectedSlot = FurnaceTileEntity.SLOT_INGREDIENT;
  private lastBurnTypeId = 0;
  private guiBackground: NinePatchLayer | null = null;
  private guiSlot: NinePatchLayer | null = null;
  protected guiSlotMarked: NinePatchLayer | null = null;
  private guiSlotMarker: NinePatchLayer | null = null;
  private guiPaneFrame: NinePatchLayer | null = null;
  private player: Player;
  private furnace: FurnaceTileEntity;

  constructor(player: Player, furnace: FurnaceTileEntity) {
    super(new FurnaceMenu(furnace));
    this.player = player;
    this.furnace = furnace;
  }

  protected override initScreen(): void {
    super.initScreen();
    const def = new ImageDef();
    def.name = 'gui/spritesheet.png';
    def.x = 0;
    def.y = 1;
    def.width = def.height = 18;
    def.setSrc(new IntRectangle(60, 0, 18, 18));
    this.btnClose.setImageDef(def, true);
    this.btnClose.scaleWhenPressed = false;
    this.buttons.push(
      this.bHeader,
      this.btnIngredient,
      this.btnFuel,
      this.btnResult,
      this.btnClose,
    );
    const builder = new NinePatchFactory(this.minecraft.textures!, 'gui/spritesheet.png');
    this.guiBackground = builder.createSymmetrical(new IntRectangle(0, 0, 16, 16), 4, 4);
    this.guiSlot = builder.createSymmetrical(new IntRectangle(0, 32, 8, 8), 3, 3);
    this.guiSlotMarked = builder.createSymmetrical(new IntRectangle(0, 44, 8, 8), 3, 3);
    this.guiSlotMarker = builder.createSymmetrical(new IntRectangle(10, 42, 16, 16), 5, 5);
    this.guiPaneFrame = builder
      .createSymmetrical(new IntRectangle(28, 42, 4, 4), 1, 1)
      .setExcluded(1 << 4);
    this.recheckRecipes();
  }

  override setupPositions(): void {
    const { bHeader, btnClose, btnIngredient, btnFuel, btnResult } = this;
    bHeader.x = bHeader.y = 0;
    bHeader.width = this.width;
    btnClose.width = btnClose.height = 19;
    btnClose.x = this.width - btnClose.width;
    btnClose.y = 0;
    const maxWidth = Math.trunc(this.width / 2) - Bx - Bx;
    const InventoryColumns = Math.trunc(maxWidth / ItemSize);
    const realWidth = InventoryColumns * ItemSize;
    const paneWidth = realWidth + Bx + Bx;
    const realBx = Math.trunc((paneWidth - realWidth) / 2);
    this.inventoryPaneRect = new IntRectangle(
      realBx,
      26 + By,
      realWidth,
      this.height - By - By - 28,
    );
    {
      const cx = this.inventoryPaneRect.x + this.inventoryPaneRect.w;
      const rightWidth = this.width - cx;
      btnIngredient.width = btnFuel.width = btnResult.width = Math.trunc(this.guiSlot!.getWidth());
      btnIngredient.height =
        btnFuel.height =
        btnResult.height =
          Math.trunc(this.guiSlot!.getHeight());
      const space = rightWidth - (2 * btnFuel.width + 40);
      const margin = Math.trunc(space / 2);
      const bx0 = cx + margin;
      const bx1 = this.width - margin - btnFuel.width;
      btnIngredient.x = btnFuel.x = bx0;
      this.descWidth = Mth.Min(90, this.width - bx1 + 24 - 4);
      const by = 36;
      btnIngredient.y = by;
      btnFuel.y = by + 20 + btnFuel.height;
      btnResult.x = bx1;
      btnResult.y = Math.trunc((btnIngredient.y + btnFuel.y) / 2);
      this.guiBackground!.setSize(this.width, this.height);
      this.guiSlotMarker!.setSize(btnFuel.width + 4, btnFuel.height + 4);
      this.recheckRecipes();
      this.setupInventoryPane();
    }
  }

  override tick(): void {
    if (this.inventoryPane) this.inventoryPane.tick();
    if (this.doRecreatePane) {
      this.recheckRecipes();
      this.setupInventoryPane();
      this.doRecreatePane = false;
    }
  }

  private handleRenderPane(
    pane: InventoryPane | null,
    t: Tesselator,
    xm: number,
    ym: number,
    a: number,
  ): void {
    if (pane) {
      pane.markerIndex = -1;
      const [held, id, ms] = pane.queryHoldTime();
      if (held) {
        holdState.heldMs = ms;
        const item = this.inventoryItems[id] ?? null;
        const count = item && !item.isNull() ? item.count : 0;
        const maxHoldMs = item ? 700 + 10 * item.count : MaxHoldMs;
        if (count > 1 && this.canMoveToFurnace(id, item)) {
          const share = f((holdState.heldMs - MinChargeMs) / maxHoldMs);
          pane.markerType = 1;
          pane.markerIndex = id;
          pane.markerShare = Mth.Max(share, 0.0);
          holdState.percent = Math.trunc(Mth.clamp(f(100.0 * share), 0.0, 100.0));
          if (holdState.percent >= 100) {
            this.addItem(pane, id);
          }
        }
      }
      pane.render(xm, ym, a);
      this.guiPaneFrame!.draw(t, pane.rect.x - 1, pane.rect.y - 1);
    }
  }

  override render(xm: number, ym: number, a: number): void {
    this.updateResult(this.furnace.getItem(FurnaceTileEntity.SLOT_INGREDIENT));
    const t = Tesselator.instance;
    this.guiBackground!.draw(t, 0, 0);
    glEnable2(GL_ALPHA_TEST);
    super.render(xm, ym, a);
    this.handleRenderPane(this.inventoryPane, t, xm, ym, a);
    t.colorABGR(0xffffffff | 0);
    const { btnIngredient, btnFuel, btnResult } = this;
    this.drawSlotItemAt(
      t,
      this.furnace.getItem(btnIngredient.id),
      btnIngredient.x,
      btnIngredient.y,
      btnIngredient.id === this.selectedSlot,
    );
    this.drawSlotItemAt(
      t,
      this.furnace.getItem(btnFuel.id),
      btnFuel.x,
      btnFuel.y,
      btnFuel.id === this.selectedSlot,
    );
    const resultSlotItem = this.furnace.getItem(btnResult.id);
    this.drawSlotItemAt(
      t,
      resultSlotItem,
      btnResult.x,
      btnResult.y,
      btnResult.id === this.selectedSlot,
    );
    if (!this.burnResult.isNull()) {
      if (!resultSlotItem || resultSlotItem.isNull()) {
        glEnable2(GL_BLEND);
        t.beginOverride();
        t.colorABGR(0x33ffffff);
        t.noColor();
        ItemRenderer.renderGuiItem(
          this.minecraft.font,
          this.minecraft.textures!,
          this.burnResult,
          btnResult.x + 7,
          btnResult.y + 8,
          true,
        );
        t.endOverrideAndDraw();
        glDisable2(GL_BLEND);
      }
      this.minecraft.font!.drawWordWrap(
        this.currentItemDesc,
        btnResult.x - 24,
        btnResult.y + btnResult.height + 6,
        this.descWidth,
        rgbActive,
      );
    }
    this.minecraft.textures!.loadAndBindTexture('gui/spritesheet.png');
    const yy = btnResult.y + 8;
    const fpx = this.furnace.getLitProgress(14) + 2;
    const xx0 = btnIngredient.x + 8;
    this.blit(xx0, yy, 80, 40, 16, 16, 32, 32);
    this.blit(xx0, yy + 16 - fpx, 112, 40 + 32 - fpx - fpx, 16, fpx, 32, fpx + fpx);
    const bpx = this.furnace.getBurnProgress(24);
    const xx1 = btnIngredient.x + 40;
    this.blit(xx1, yy, 144, 40, 24, 16, 48, 32);
    this.blit(xx1, yy, 144, 72, bpx, 16, bpx + bpx, 32);
  }

  protected override buttonClicked(button: Button): void {
    const slot = button.id;
    if (button === this.btnClose) {
      this.minecraft.player!.closeContainer();
    }
    if (slot >= FurnaceTileEntity.SLOT_INGREDIENT && slot <= FurnaceTileEntity.SLOT_RESULT) {
      const oldSlot = this.selectedSlot;
      if (slot !== FurnaceTileEntity.SLOT_RESULT) this.selectedSlot = slot;
      if (oldSlot === this.selectedSlot) this.takeAndClearSlot(slot);
    }
  }

  private recheckRecipes(): void {
    this.clearItems();
    const recipes = FurnaceRecipes.getInstance();
    const player = this.minecraft.player;
    if (player && player.inventory) {
      const inv = player.inventory;
      for (let i = Inventory.MAX_SELECTION_SIZE; i < inv.getContainerSize(); ++i) {
        const item = inv.getItem(i);
        if (item) {
          if (FurnaceTileEntity.isFuel(item))
            this.listFuel.push(new CItem(new ItemInstance(item), null as never, ''));
          if (recipes.isFurnaceItem(item.id))
            this.listIngredient.push(new CItem(new ItemInstance(item), null as never, ''));
        }
      }
    }
    this.updateItems();
  }

  addItem(_forPane: InventoryPane, itemIndex: number): boolean {
    const item = this.inventoryItems[itemIndex] ?? null;
    if (!item || item.isNull()) return false;
    const changed = this.handleAddItem(this.selectedSlot, item); // setIfNotSet(ref, cond)：cond 先求值（不能被 || 短路掉）
    this.doRecreatePane = this.doRecreatePane || changed;
    if (this.doRecreatePane) {
      let slot = this.inventorySlots[itemIndex]!;
      if (this.player.inventory.getItem(slot)) {
        for (let i = 0; i < this.inventorySlots.length; ++i) {
          slot = this.inventorySlots[i]!;
          if (!this.player.inventory.getItem(slot)) {
            LOGI(`Changed! removing slot ${i} (was: ${itemIndex})\n`);
            itemIndex = i;
            break;
          }
        }
      }
      this.inventoryItems[itemIndex] = null;
    }
    return true;
  }

  isAllowed(slot: number): boolean {
    if (slot >= this.inventoryItems.length) return false;
    const item = this.inventoryItems[slot];
    if (!item) return false;
    if (this.selectedSlot === this.btnFuel.id) return FurnaceTileEntity.getBurnDuration(item) > 0;
    else if (this.selectedSlot === this.btnIngredient.id)
      return !FurnaceRecipes.getInstance().getResult(item.id).isNull();
    return false;
  }

  override renderGameBehind(): boolean {
    return false;
  }

  getItems(_forPane: InventoryPane): (ItemInstance | null)[] {
    return this.inventoryItems;
  }

  private clearItems(): void {
    this.listFuel = [];
    this.listIngredient = [];
  }

  private updateItems(): void {
    this.inventoryItems = [];
    this.inventorySlots = [];
    const inv = this.minecraft.player!.inventory;
    for (let i = Inventory.MAX_SELECTION_SIZE; i < inv.getContainerSize(); ++i) {
      const item = inv.getItem(i);
      if (!item) continue;
      let added = false;
      for (const c of this.listFuel) {
        if (ItemInstance.matches(item, c.item)) {
          this.inventorySlots.push(i);
          this.inventoryItems.push(item);
          added = true;
          break;
        }
      }
      if (added) continue;
      for (const c of this.listIngredient) {
        if (ItemInstance.matches(item, c.item)) {
          this.inventorySlots.push(i);
          this.inventoryItems.push(item);
          added = true;
          break;
        }
      }
    }
  }

  private canMoveToFurnace(inventorySlot: number, item: ItemInstance | null): boolean {
    if (!this.isAllowed(inventorySlot)) return false;
    const jitem = this.furnace.getItem(this.selectedSlot);
    if (!jitem || jitem.isNull()) return true;
    if (ItemInstance.isStackable(item!, jitem) && jitem.count < jitem.getMaxStackSize())
      return true;
    return false;
  }

  private updateResult(item: ItemInstance | null): void {
    const result = this.furnace.getItem(FurnaceTileEntity.SLOT_RESULT)!;
    if (!result.isNull()) {
      const id = result.id;
      if (id === this.lastBurnTypeId) return;
      this.currentItemDesc = I18n.getDescriptionString(result);
      this.lastBurnTypeId = id;
      this.burnResult = new ItemInstance(result);
    } else {
      const id = item ? item.id : 0;
      if (id === this.lastBurnTypeId) return;
      const burnResult = FurnaceRecipes.getInstance().getResult(id);
      if (!burnResult.isNull()) this.currentItemDesc = I18n.getDescriptionString(burnResult);
      else this.currentItemDesc = '';
      this.lastBurnTypeId = id;
      this.burnResult = burnResult;
    }
  }

  private setupInventoryPane(): void {
    this.inventoryPane = new InventoryPane(
      this,
      this.minecraft,
      this.inventoryPaneRect,
      this.inventoryPaneRect.w,
      BorderPixels,
      this.inventoryItems.length,
      ItemSize,
      Math.trunc(BorderPixels),
    );
    this.inventoryPane.fillMarginX = 0;
    this.inventoryPane.fillMarginY = 0;
    this.guiPaneFrame!.setSize(this.inventoryPaneRect.w + 2, this.inventoryPaneRect.h + 2);
  }

  private drawSlotItemAt(
    t: Tesselator,
    item: ItemInstance | null,
    x: number,
    y: number,
    selected: boolean,
  ): void {
    const xx = x;
    const yy = y;
    (selected ? this.guiSlot! : this.guiSlot!).draw(t, xx, yy); // 原样：两边都是 guiSlot
    if (selected) this.guiSlotMarker!.draw(t, xx - 2, yy - 2);
    if (item && !item.isNull()) {
      ItemRenderer.renderGuiItem(
        this.minecraft.font,
        this.minecraft.textures!,
        item,
        xx + 7,
        yy + 8,
        true,
      );
      this.minecraft.gui.renderSlotText(item, xx + 3, yy + 3, true, true);
    }
  }

  private moveOver(item: ItemInstance, maxCount: number): ItemInstance {
    let wantedCount = Math.trunc((item.count * holdState.percent) / 100);
    if (!wantedCount || holdState.heldMs < MinChargeMs) wantedCount = 1;
    wantedCount = Mth.Min(wantedCount, maxCount);
    const removed = new ItemInstance(item.id, wantedCount, item.getAuxValue());
    const inv = this.minecraft.player!.inventory;
    const oldSize = inv.getNumEmptySlots();
    if (inv.removeResource(removed)) {
      const newSize = inv.getNumEmptySlots();
      this.doRecreatePane = this.doRecreatePane || newSize !== oldSize;
      return removed;
    }
    return new ItemInstance();
  }

  private takeAndClearSlot(slot: number): void {
    const oldItem = new ItemInstance(this.furnace.getItem(slot)!);
    const blank = new ItemInstance();
    this.furnace.setItem(slot, blank);
    // DEFERRED(Network): if (minecraft->level->isClientSide) { ContainerSetSlotPacket … }
    const inv = this.minecraft.player!.inventory;
    const oldSize = inv.getNumEmptySlots();
    if (!inv.add(oldItem)) this.minecraft.player!.drop(new ItemInstance(oldItem), false);
    const newSize = inv.getNumEmptySlots();
    this.doRecreatePane = this.doRecreatePane || newSize !== oldSize;
  }

  private handleAddItem(slot: number, item: ItemInstance): boolean {
    const furnaceItem = this.furnace.getItem(slot)!;
    const inv = this.minecraft.player!.inventory;
    const oldSize = inv.getNumEmptySlots();
    if (item.id === furnaceItem.id) {
      const maxMovedCount = furnaceItem.getMaxStackSize() - furnaceItem.count;
      if (maxMovedCount <= 0) return false;
      const added = this.moveOver(item, maxMovedCount);
      furnaceItem.count += added.count;
    } else {
      if (!this.furnace.isSlotEmpty(slot)) return false;
      const moved = this.moveOver(item, item.getMaxStackSize());
      this.player.containerMenu!.setSlot(slot, moved);
    }
    // DEFERRED(Network): if (minecraft->level->isClientSide) { ContainerSetSlotPacket … }
    const newSize = inv.getNumEmptySlots();
    return newSize !== oldSize;
  }
}
