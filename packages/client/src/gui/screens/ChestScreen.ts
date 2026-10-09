/**
 * 1:1 移植自 src/client/gui/screens/ChestScreen.h 与 ChestScreen.cpp（箱子界面）。
 * 左边背包（快捷栏之外）、右边箱子，各一个 Touch::InventoryPane；点一格就把它移到另一边（点一下 1 个，按住充能按比例），
 * 物品“飞过去”的动画（FlyingItem，0.3 秒，二次缓动，限制在两个面板的范围里）。
 * 原样保留：
 *   - 文件内静态 heldMs、percent、flyingItems → 模块级状态；render 开头把 heldMs 置 -1；
 *   - 创造模式下从源格子不扣数量（!isCreativeMode 才扣）；
 *   - ItemDiffer::getDiff 的循环上限叫 minLen 却取的是 Max（越界读视为不同：matchesNulls(null, …)）；
 *   - drawSlotItemAt、selectedSlot、guiSlotMarked 等建了不用；
 *   - 联网时的 ContainerSetSlotPacket（DEFERRED(Network)）。
 * C++ 的 upcast<FillingContainer>：TS 的 Inventory 与 ChestTileEntity 都混入了 FillingContainer，直接按它们共有的方法调用。
 */
import { LOGI, getTimeS } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import { type ChestTileEntity, ContainerMenu, Inventory, ItemInstance, type Player } from '@mcpe/world';
import { ItemRenderer } from '../../renderer/entity/ItemRenderer';
import { GL_ALPHA_TEST, GL_BLEND, GL_SCISSOR_TEST, glColor4f, glDisable2, glEnable2 } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import type { Button } from '../components/Button';
import { THeader } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { type IInventoryPaneCallback, InventoryPane } from '../components/InventoryPane';
import { type NinePatchLayer, NinePatchFactory } from '../components/NinePatch';
import { BaseContainerScreen } from './BaseContainerScreen';

const f = Math.fround;
const MaxHoldMs = 500.0;
const MinChargeMs = 200;
const BorderPixels = 4;
const BlockPixels = 24;
const ItemSize = Math.trunc(BlockPixels + 2 * BorderPixels);
const Bx = 10;
const By = 6;

/** 背包与箱子共有的 FillingContainer 方法（C++ 的 upcast<FillingContainer>）；两个类都由 FillingContainer 混入得到，结构上都满足它 */
type FillingLike = {
  getNumLinkedSlots(): number;
  getItem(slot: number): ItemInstance | null;
  add(item: ItemInstance): boolean;
  clearSlot(slot: number): void;
  getContainerSize(): number;
};

/** C++ 的 struct FlyingItem */
type FlyingItem = { item: ItemInstance; startTime: number; sx: number; sy: number; dx: number; dy: number };

/** ChestScreen.cpp 的文件内静态变量 */
const statics = { heldMs: -1, percent: -1, flyingItems: [] as FlyingItem[] };

/** C++ 的 class ItemDiffer：记下一份快照，之后找出哪些格子变了 */
class ItemDiffer {
  private size: number;
  private base: ItemInstance[];

  constructor(v: (ItemInstance | null)[]) {
    this.size = v.length;
    this.base = v.map((it) => (it ? new ItemInstance(it) : new ItemInstance()));
  }

  getDiff(v: (ItemInstance | null)[], outIndices: number[]): number {
    const diffLen = v.length - this.size;
    const minLen = Mth.Max(v.length, this.size); // 原样：名字是 minLen，取的是 Max
    for (let i = 0; i < minLen; ++i) {
      if (!ItemInstance.matchesNulls(this.base[i] ?? null, v[i] ?? null)) outIndices.push(i);
    }
    return diffLen;
  }
}

export class ChestScreen extends BaseContainerScreen implements IInventoryPaneCallback {
  private btnClose = new ImageButton(4, '');
  private bHeader = new THeader(5, 'Inventory');
  private bHeaderChest = new THeader(6, 'Chest');
  private inventoryPane: InventoryPane | null = null;
  private chestPane: InventoryPane | null = null;
  private panesBbox = new IntRectangle();
  private inventoryItems: (ItemInstance | null)[] = [];
  private chestItems: (ItemInstance | null)[] = [];
  private doRecreatePane = false;
  protected selectedSlot = -1;
  private guiBackground: NinePatchLayer | null = null;
  private guiSlot: NinePatchLayer | null = null;
  protected guiSlotMarked: NinePatchLayer | null = null;
  private guiSlotMarker: NinePatchLayer | null = null;
  private guiPaneFrame: NinePatchLayer | null = null;
  protected player: Player;
  private chest: ChestTileEntity;

  constructor(player: Player, chest: ChestTileEntity) {
    super(new ContainerMenu(chest, chest.runningId));
    this.player = player;
    this.chest = chest;
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
    this.buttons.push(this.bHeader, this.bHeaderChest, this.btnClose);
    const builder = new NinePatchFactory(this.minecraft.textures!, 'gui/spritesheet.png');
    this.guiBackground = builder.createSymmetrical(new IntRectangle(0, 0, 16, 16), 4, 4);
    this.guiSlot = builder.createSymmetrical(new IntRectangle(0, 32, 8, 8), 3, 3);
    this.guiSlotMarked = builder.createSymmetrical(new IntRectangle(0, 44, 8, 8), 3, 3);
    this.guiSlotMarker = builder.createSymmetrical(new IntRectangle(10, 42, 16, 16), 5, 5);
    this.guiPaneFrame = builder.createSymmetrical(new IntRectangle(28, 42, 4, 4), 1, 1).exclude(4);
  }

  override setupPositions(): void {
    this.bHeader.x = 0;
    this.bHeader.y = this.bHeaderChest.y = 0;
    this.bHeader.width = this.bHeaderChest.width = Math.trunc(this.width / 2);
    this.bHeaderChest.x = this.bHeader.x + this.bHeader.width;
    this.btnClose.width = this.btnClose.height = 19;
    this.btnClose.x = this.width - this.btnClose.width;
    this.btnClose.y = 0;
    this.guiBackground!.setSize(this.width, this.height);
    this.setupPane();
  }

  override tick(): void {
    if (this.inventoryPane) this.inventoryPane.tick();
    if (this.chestPane) this.chestPane.tick();
    if (this.doRecreatePane) {
      this.setupPane();
      this.doRecreatePane = false;
    }
  }

  private containerFor(pane: InventoryPane): FillingLike {
    return pane === this.inventoryPane ? this.minecraft.player!.inventory : this.chest;
  }

  private handleRenderPane(pane: InventoryPane | null, t: Tesselator, xm: number, ym: number, a: number): void {
    if (pane) {
      pane.markerIndex = -1;
      const [held, id, ms] = pane.queryHoldTime();
      if (held) {
        statics.heldMs = ms;
        const c = this.containerFor(pane);
        const slotIndex = id + c.getNumLinkedSlots();
        const item = c.getItem(slotIndex);
        const count = item && !item.isNull() ? item.count : 0;
        const maxHoldMs = item ? 700 + 10 * item.count : MaxHoldMs;
        if (count > 1) {
          const share = f((statics.heldMs - MinChargeMs) / maxHoldMs);
          pane.markerType = 1;
          pane.markerIndex = id;
          pane.markerShare = Mth.Max(share, 0.0);
          statics.percent = Math.trunc(Mth.clamp(f(100.0 * share), 0.0, 100.0));
          if (statics.percent >= 100) {
            this.addItem(pane, id);
          }
        }
      }
      pane.render(xm, ym, a);
      this.guiPaneFrame!.draw(t, pane.rect.x - 1, pane.rect.y - 1);
    }
  }

  override render(xm: number, ym: number, a: number): void {
    const t = Tesselator.instance;
    this.guiBackground!.draw(t, 0, 0);
    glEnable2(GL_ALPHA_TEST);
    super.render(xm, ym, a);
    statics.heldMs = -1;
    this.handleRenderPane(this.inventoryPane, t, xm, ym, a);
    this.handleRenderPane(this.chestPane, t, xm, ym, a);
    const now = f(getTimeS());
    const MaxTime = f(0.3);
    const flyingToSave: FlyingItem[] = [];
    glEnable2(GL_BLEND);
    glColor4f(1, 1, 1, f(0.2));
    t.beginOverride();
    glEnable2(GL_SCISSOR_TEST);
    this.minecraft.gui.setScissorRect(this.panesBbox);
    for (const fi of statics.flyingItems) {
      const since = f(now - fi.startTime);
      if (since > MaxTime) continue;
      let tt = f(since / MaxTime);
      tt = f(tt * tt);
      const xx = Mth.lerp(fi.sx, fi.dx, tt);
      const yy = Mth.lerp(fi.sy, fi.dy, tt);
      ItemRenderer.renderGuiItem(this.minecraft.font, this.minecraft.textures!, fi.item, xx + 7, yy + 8, true);
      flyingToSave.push(fi);
    }
    t.enableColor();
    t.endOverrideAndDraw();
    glDisable2(GL_SCISSOR_TEST);
    statics.flyingItems = flyingToSave;
    t.colorABGR(0xffffffff | 0);
    glDisable2(GL_BLEND);
    this.minecraft.textures!.loadAndBindTexture('gui/spritesheet.png');
  }

  protected override buttonClicked(button: Button): void {
    if (button === this.btnClose) {
      this.minecraft.player!.closeContainer();
    }
  }

  private handleAddItem(from: FillingLike, to: FillingLike, itemIndex: number): boolean {
    const itemOffset = from.getNumLinkedSlots();
    const slotIndex = itemIndex + itemOffset;
    const item = from.getItem(slotIndex);
    let added = false;
    const fromChest = from === this.chest;
    const pane = fromChest ? this.chestPane! : this.inventoryPane!;
    const toPane = fromChest ? this.inventoryPane! : this.chestPane!;
    let wantedCount = item && !item.isNull() ? Math.trunc((item.count * statics.percent) / 100) : 0;
    if (item && !item.isNull() && (!wantedCount || statics.heldMs < MinChargeMs)) {
      wantedCount = 1;
    }
    if (wantedCount > 0) {
      const takenItem = new ItemInstance(item!);
      takenItem.count = wantedCount;
      const differ = new ItemDiffer(this.getItems(toPane));
      to.add(takenItem);
      added = takenItem.count !== wantedCount;
      if (added) {
        if (!this.minecraft.isCreativeMode()) {
          item!.count -= wantedCount - takenItem.count;
        }
        const changed: number[] = [];
        const items = this.getItems(toPane);
        differ.getDiff(items, changed);
        const [, g] = pane.getGridItemFor_slow(itemIndex);
        for (const toIndex of changed) {
          const [, gTo] = toPane.getGridItemFor_slow(toIndex);
          statics.flyingItems.push({ startTime: f(getTimeS()), item: new ItemInstance(item!), sx: g.xf, sy: g.yf, dx: gTo.xf, dy: gTo.yf });
          // DEFERRED(Network): if (!fromChest && minecraft->level->isClientSide) { ContainerSetSlotPacket … }
        }
      }
      // DEFERRED(Network): if (fromChest) { ContainerSetSlotPacket(menu->containerId, slotIndex, …) }
      if (item!.count <= 0) from.clearSlot(slotIndex);
    }
    pane.markerIndex = toPane.markerIndex = -1;
    return added;
  }

  addItem(forPane: InventoryPane, itemIndex: number): boolean {
    const l2r = forPane === this.inventoryPane;
    const inv: FillingLike = this.minecraft.player!.inventory;
    const chest: FillingLike = this.chest;
    return this.handleAddItem(l2r ? inv : chest, l2r ? chest : inv, itemIndex);
  }

  isAllowed(_slot: number): boolean {
    return true;
  }

  override renderGameBehind(): boolean {
    return false;
  }

  getItems(forPane: InventoryPane): (ItemInstance | null)[] {
    if (forPane === this.inventoryPane) {
      const inv = this.minecraft.player!.inventory;
      for (let i = Inventory.MAX_SELECTION_SIZE, j = 0; i < inv.getContainerSize(); ++i, ++j) this.inventoryItems[j] = inv.getItem(i);
      return this.inventoryItems;
    } else {
      for (let i = 0; i < this.chest.getContainerSize(); ++i) this.chestItems[i] = this.chest.getItem(i);
      return this.chestItems;
    }
  }

  private setupPane(): void {
    const inv = this.minecraft.player!.inventory;
    this.inventoryItems = [];
    for (let i = Inventory.MAX_SELECTION_SIZE; i < inv.getContainerSize(); ++i) this.inventoryItems.push(inv.getItem(i));
    this.chestItems = [];
    for (let i = 0; i < this.chest.getContainerSize(); ++i) this.chestItems.push(this.chest.getItem(i));
    const maxWidth = Math.trunc(this.width / 2) - Math.trunc(Bx / 2);
    const InventoryColumns = Math.trunc(maxWidth / ItemSize);
    const realWidth = InventoryColumns * ItemSize;
    const paneWidth = realWidth;
    const realBx = Math.trunc((Math.trunc(this.width / 2) - realWidth) / 2);
    const rect = new IntRectangle(realBx, 24 + By, realWidth, this.height - By - By - 24);
    this.inventoryPane = new InventoryPane(this, this.minecraft, rect, paneWidth, BorderPixels, inv.getContainerSize() - Inventory.MAX_SELECTION_SIZE, ItemSize, Math.trunc(BorderPixels));
    this.inventoryPane.fillMarginX = 0;
    this.inventoryPane.fillMarginY = 0;
    this.guiPaneFrame!.setSize(rect.w + 2, rect.h + 2);
    this.panesBbox = new IntRectangle(rect.x, rect.y, rect.w, rect.h);
    rect.x += Math.trunc(this.width / 2);
    this.panesBbox.w += rect.x - this.panesBbox.x;
    this.chestPane = new InventoryPane(this, this.minecraft, rect, paneWidth, BorderPixels, this.chest.getContainerSize(), ItemSize, Math.trunc(BorderPixels));
    this.chestPane.fillMarginX = 0;
    this.chestPane.fillMarginY = 0;
    LOGI(`Creating new panes\n:          Inventory ${this.inventoryItems.length}\n          Chest     ${this.chestItems.length}\n`);
  }

  /** C++ 的 drawSlotItemAt（这一版没有调用方） */
  protected drawSlotItemAt(t: Tesselator, item: ItemInstance | null, x: number, y: number, selected: boolean): void {
    (selected ? this.guiSlot! : this.guiSlot!).draw(t, x, y);
    if (selected) this.guiSlotMarker!.draw(t, x - 2, y - 2);
    if (item && !item.isNull()) {
      ItemRenderer.renderGuiItem(this.minecraft.font, this.minecraft.textures!, item, x + 7, y + 8, true);
      this.minecraft.gui.renderSlotText(item, x + 3, y + 3, true, true);
    }
  }
}
