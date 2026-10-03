/**
 * 1:1 移植自 src/client/gui/components/InventoryPane.h 与 InventoryPane.cpp（S13 阶段 C：物品选择界面的格子）。
 * C++ 的 namespace Touch。IInventoryPaneCallback 写成接口。
 * 注意 C++ 的原样行为：_clickArea 构造为 RectangleArea(0, 0, 0, 0) 之后从不更新（调整的是基类的 area）。
 */
import type { ItemInstance } from '@mcpe/world';
import type { Minecraft } from '../../Minecraft';
import type { IArea } from '../../player/input/touchscreen/TouchAreaModel';
import { RectangleArea } from '../../player/input/touchscreen/TouchAreaModel';
import { ItemRenderer } from '../../renderer/entity/ItemRenderer';
import { GL_ALPHA_TEST, GL_BLEND, GL_SCISSOR_TEST, GL_TEXTURE_2D, glDisable2, glEnable2, glScissor } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { Gui } from '../Gui';
import { IntRectangle } from './ImageButton';
import { type GridItem, type ScrollBar, ScrollingPane, ScrollingPaneFlags } from './ScrollingPane';

export interface IInventoryPaneCallback {
  addItem(forPane: InventoryPane, index: number): boolean;
  isAllowed(slot: number): boolean;
  getItems(forPane: InventoryPane): (ItemInstance | null)[];
}

/** InventoryPane.cpp 的 static const int By */
const By = 6;

export class InventoryPane extends ScrollingPane {
  rect: IntRectangle;
  paneWidth: number;
  _clickArea: IArea;
  screen: IInventoryPaneCallback;
  mc: Minecraft;
  fillMarginX = 2;
  fillMarginY = 4;
  markerType = 1;
  markerIndex = -1;
  markerShare = 0;
  private lastItemIndex = -1;
  private lastItemTicks = -1;
  private BorderPixels: number;
  private renderDecorations = true;
  private bg = new IntRectangle();

  constructor(screen: IInventoryPaneCallback, mc: Minecraft, rect: IntRectangle, paneWidth: number, clickMarginH: number, numItems: number, itemSize: number, itemBorderSize: number) {
    super(
      ScrollingPaneFlags.SF_LockX | ScrollingPaneFlags.SF_ShowScrollbar | ScrollingPaneFlags.SF_NoHoldSelect,
      rect,
      new IntRectangle(0, 0, itemSize, itemSize),
      0,
      numItems,
      Gui.GuiScale,
    );
    this.screen = screen;
    this.mc = mc;
    this.paneWidth = paneWidth;
    this.rect = new IntRectangle(rect.x, rect.y, rect.w, rect.h);
    this.BorderPixels = itemBorderSize;
    this._clickArea = new RectangleArea(0, 0, 0, 0);
    this.area._x0 = rect.x - clickMarginH;
    this.area._x1 = rect.x + rect.w + clickMarginH;
    this.area._y0 -= By;
    this.area._y1 += By;
  }

  override renderBatch(items: GridItem[], _alpha: number): void {
    const bbox = this.bbox;
    this.fill(bbox.x - this.fillMarginX - 1, bbox.y - this.fillMarginY, bbox.x + bbox.w + this.fillMarginX + 1, bbox.y + bbox.h + this.fillMarginY, 0xff333333 | 0);
    glEnable2(GL_BLEND);
    glDisable2(GL_ALPHA_TEST);
    const inventoryItems = this.screen.getItems(this);
    glEnable2(GL_SCISSOR_TEST);
    const x = Math.trunc(this.screenScale * bbox.x) >>> 0;
    const y = (this.mc.height - (Math.trunc(this.screenScale * (bbox.y + bbox.h)) >>> 0)) >>> 0;
    const w = Math.trunc(this.screenScale * bbox.w) >>> 0;
    const h = Math.trunc(this.screenScale * bbox.h) >>> 0;
    glScissor(x, y, w, h);
    const t = Tesselator.instance;
    t.beginOverride();
    t.colorABGR(0xffffffff | 0);
    for (const item of items) {
      this.blit(item.xf, item.yf, 200, 46, this.itemBbox.w, this.itemBbox.h, 16, 16);
    }
    this.mc.textures!.loadAndBindTexture('gui/gui.png');
    t.endOverrideAndDraw();
    let marked: GridItem | null = null;
    let mxx = 0;
    let myy = 0;
    t.beginOverride();
    for (const item of items) {
      const j = item.id;
      const citem = inventoryItems[j] ?? null;
      if (!citem) continue;
      let allowed = true;
      t.enableColor();
      if (!this.screen.isAllowed(j)) {
        allowed = false;
        t.colorInt(64, 64, 64);
      } else if (this.lastItemTicks > 0 && this.lastItemIndex === j) {
        const gv = 255 - this.lastItemTicks * 15;
        t.colorInt(gv, gv, gv, allowed && citem.count <= 0 ? 0x60 : 0xff);
      } else {
        t.colorInt(255, 255, 255, allowed && citem.count <= 0 ? 0x60 : 0xff);
      }
      t.noColor();
      const xx = Gui.floorAlignToScreenPixel(item.xf + this.BorderPixels + 4);
      const yy = Gui.floorAlignToScreenPixel(item.yf + this.BorderPixels + 4);
      ItemRenderer.renderGuiItemSized(null, this.mc.textures!, citem, xx, yy, 16, 16, false);
      if (j === this.markerIndex && this.markerShare >= 0) {
        marked = item;
        mxx = xx;
        myy = yy;
      }
    }
    t.endOverrideAndDraw();
    if (marked) {
      glDisable2(GL_TEXTURE_2D);
      const yy0 = myy - 5.0;
      const yy1 = yy0 + 2;
      this.fill(mxx, yy0, mxx + 16.0, yy1, 0xff606060 | 0);
      this.fill(mxx, yy0, mxx + this.markerShare * 16.0, yy1, this.markerType === 1 ? 0xff00ff00 | 0 : 0xff476543 | 0);
      glEnable2(GL_BLEND);
      glEnable2(GL_TEXTURE_2D);
    }
    if (!this.mc.isCreativeMode()) {
      const ikText = Gui.InvGuiScale + Gui.InvGuiScale;
      const kText = 0.5 * Gui.GuiScale;
      t.beginOverride();
      t.scale2d(ikText, ikText);
      for (const item of items) {
        const citem = inventoryItems[item.id] ?? null;
        if (!citem) continue;
        const tx = Gui.floorAlignToScreenPixel(kText * (item.xf + this.BorderPixels + 3));
        const ty = Gui.floorAlignToScreenPixel(kText * (item.yf + this.BorderPixels + 3));
        this.mc.gui.renderSlotText(citem, tx, ty, true, true);
      }
      t.resetScale();
      glEnable2(GL_BLEND);
      t.endOverrideAndDraw();
    }
    if (this.renderDecorations) {
      t.beginOverride();
      for (const item of items) {
        const citem = inventoryItems[item.id] ?? null;
        if (!citem || citem.isNull()) continue;
        if (citem.isDamaged()) {
          ItemRenderer.renderGuiItemDamage(citem, item.xf + 8, item.yf + 12);
        }
      }
      glDisable2(GL_TEXTURE_2D);
      t.endOverrideAndDraw();
      glEnable2(GL_TEXTURE_2D);
    }
    glDisable2(GL_SCISSOR_TEST);
    this.fillGradient(this.bg.x - this.fillMarginX, bbox.y, this.bg.w + this.fillMarginX, bbox.y + 20, 0x99000000 | 0, 0x00000000);
    this.fillGradient(this.bg.x - this.fillMarginX, bbox.y + bbox.h - 20, this.bg.w + this.fillMarginX, bbox.y + bbox.h, 0x00000000, 0x99000000 | 0);
    this.drawScrollBar(this.hScroll);
    this.drawScrollBar(this.vScroll);
  }

  protected override onSelect(gridId: number, _selected: boolean): boolean {
    if (this.screen.isAllowed(gridId))
      if (this.screen.addItem(this, gridId)) {
        this.lastItemIndex = gridId;
        this.lastItemTicks = 7;
      }
    return false;
  }

  drawScrollBar(sb: ScrollBar): void {
    if (sb.alpha <= 0) return;
    const color = (Math.trunc(255.0 * sb.alpha) << 24) | 0xaaaaaa;
    const xx = this.bbox.x + this.bbox.w;
    this.fill(xx - sb.w, sb.y, xx, sb.y + sb.h, color);
  }

  override tick(): void {
    --this.lastItemTicks;
    super.tick();
  }

  setRenderDecorations(value: boolean): void {
    this.renderDecorations = value;
  }
}
