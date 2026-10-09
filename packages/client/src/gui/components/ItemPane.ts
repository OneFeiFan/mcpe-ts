/**
 * 1:1 移植自 src/client/gui/components/ItemPane.h 与 ItemPane.cpp（合成界面）：可滚动的“能做什么”列表。
 * 每行一个 CItem：九宫格底框（选中时换一张）、右侧物品图标、左侧名字、右下角背包里已有的数量；不能合成的行用暗色字。
 * 竖直列表锁 X、水平列表锁 Y。字体 f 由使用它的界面设置（C++ 构造函数不初始化）。
 */
import type { ItemInstance, Recipe } from '@mcpe/world';
import type { Font } from '../Font';
import { ItemRenderer } from '../../renderer/entity/ItemRenderer';
import { GL_SCISSOR_TEST, glDisable2, glEnable2, glScissor } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import type { Textures } from '../../renderer/Textures';
import { Gui } from '../Gui';
import { IntRectangle } from './ImageButton';
import type { NinePatchLayer } from './NinePatch';
import { NinePatchFactory } from './NinePatch';
import { type GridItem, type ScrollBar, ScrollingPane, ScrollingPaneFlags } from './ScrollingPane';

const f = Math.fround;
const rgbActive = 0xfff0f0f0 | 0;
const rgbInactive = 0xc0635558 | 0;
const rgbInactiveShadow = 0xc0aaaaaa | 0;

/** C++ 的 CItem::ReqItem */
export class ReqItem {
  constructor(
    public item: ItemInstance,
    public has: number,
  ) {}
  enough(): boolean {
    return this.has >= this.item.count;
  }
}

/** C++ 的 CItem */
export class CItem {
  item: ItemInstance;
  recipe: Recipe;
  text: string;
  sortText: string;
  numBuilt = 0;
  inventoryCount = 0;
  neededItems: ReqItem[] = [];
  private _canCraft = false;

  constructor(ins: ItemInstance, recipe: Recipe, text: string) {
    this.item = ins;
    this.recipe = recipe;
    this.text = text;
    this.sortText = text;
  }

  canCraft(): boolean {
    return this._canCraft;
  }

  setCanCraft(status: boolean): void {
    this._canCraft = status;
  }
}

export interface IItemPaneCallback {
  onItemSelected(forPane: ItemPane, index: number): void;
  getItems(forPane: ItemPane): CItem[];
}

export class ItemPane extends ScrollingPane {
  f: Font | null = null;
  textures: Textures;
  screen: IItemPaneCallback;
  physicalScreenHeight: number;
  isVertical: boolean;
  guiSlotItem: NinePatchLayer;
  guiSlotItemSelected: NinePatchLayer;

  constructor(screen: IItemPaneCallback, textures: Textures, rect: IntRectangle, numItems: number, guiHeight: number, physicalScreenHeight: number, isVertical = true) {
    super(
      (isVertical ? ScrollingPaneFlags.SF_LockX : ScrollingPaneFlags.SF_LockY) | ScrollingPaneFlags.SF_ShowScrollbar,
      rect,
      isVertical ? new IntRectangle(0, 0, rect.w, 22) : new IntRectangle(0, 0, 32, rect.h),
      isVertical ? 1 : numItems,
      numItems,
      Gui.GuiScale,
    );
    this.screen = screen;
    this.textures = textures;
    this.physicalScreenHeight = physicalScreenHeight;
    this.isVertical = isVertical;
    this.area._x0 -= 4;
    this.area._x1 += 4;
    this.area._y0 = 0;
    this.area._y1 = guiHeight;
    const builder = new NinePatchFactory(textures, 'gui/spritesheet.png');
    this.guiSlotItem = builder.createSymmetrical(new IntRectangle(20, 32, 8, 8), 2, 2);
    this.guiSlotItemSelected = builder.createSymmetrical(new IntRectangle(28, 32, 8, 8), 2, 2);
    this.guiSlotItem.setSize(rect.w + 4, 22);
    this.guiSlotItemSelected.setSize(rect.w + 4, 22);
  }

  override renderBatch(items: GridItem[], _alpha: number): void {
    const cat = this.screen.getItems(this);
    if (cat.length === 0) return;
    const bbox = this.bbox;
    glEnable2(GL_SCISSOR_TEST);
    const x = Math.trunc(f(this.screenScale * bbox.x)) >>> 0;
    const y = (this.physicalScreenHeight - (Math.trunc(f(this.screenScale * (bbox.y + bbox.h))) >>> 0)) >>> 0;
    const w = Math.trunc(f(this.screenScale * bbox.w)) >>> 0;
    const h = Math.trunc(f(this.screenScale * bbox.h)) >>> 0;
    glScissor(x, y, w, h);
    const t = Tesselator.instance;
    t.beginOverride();
    for (const item of items) {
      (item.selected ? this.guiSlotItemSelected : this.guiSlotItem).draw(t, Gui.floorAlignToScreenPixel(f(item.xf - 1)), Gui.floorAlignToScreenPixel(item.yf));
    }
    t.endOverrideAndDraw();
    t.beginOverride();
    for (const item of items) {
      const citem = cat[item.id]!;
      ItemRenderer.renderGuiItemSized(null, this.textures, citem.item, Gui.floorAlignToScreenPixel(f(item.xf + this.itemBbox.w - 16)), Gui.floorAlignToScreenPixel(f(2 + item.yf)), 16, 16, false);
    }
    t.endOverrideAndDraw();
    t.beginOverride();
    const font = this.f!;
    for (const item of items) {
      const citem = cat[item.id]!;
      const buf = Gui.itemCountItoa(citem.inventoryCount);
      const c = buf.length;
      const xf = f(item.xf - 1);
      if (citem.canCraft()) {
        font.drawShadow(citem.text, Gui.floorAlignToScreenPixel(f(xf + 2)), Gui.floorAlignToScreenPixel(f(item.yf + 6)), rgbActive);
        t.scale2d(f(0.6667), f(0.6667));
        font.drawShadow(buf, Gui.floorAlignToScreenPixel(f(f(1.5) * f(xf + this.itemBbox.w - c * 4))), Gui.floorAlignToScreenPixel(f(f(1.5) * f(item.yf + this.itemBbox.h - 8))), rgbActive);
        t.resetScale();
      } else {
        font.draw(citem.text, Gui.floorAlignToScreenPixel(f(xf + 3)), Gui.floorAlignToScreenPixel(f(item.yf + 7)), rgbInactiveShadow);
        font.draw(citem.text, Gui.floorAlignToScreenPixel(f(xf + 2)), Gui.floorAlignToScreenPixel(f(item.yf + 6)), rgbInactive);
        t.scale2d(f(0.6667), f(0.6667));
        font.draw(buf, Gui.floorAlignToScreenPixel(f(f(1.5) * f(xf + this.itemBbox.w - c * 4))), Gui.floorAlignToScreenPixel(f(f(1.5) * f(item.yf + this.itemBbox.h - 8))), rgbInactive);
        t.resetScale();
      }
    }
    t.endOverrideAndDraw();
    if (this.isVertical) {
      this.fillGradient(bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + 28, 0xbb000000 | 0, 0x00000000);
      this.fillGradient(bbox.x, bbox.y + bbox.h - 28, bbox.x + bbox.w, bbox.y + bbox.h, 0x00000000, 0xbb000000 | 0);
    } else {
      this.fillHorizontalGradient(bbox.x, bbox.y, bbox.x + 28, bbox.y + bbox.h, 0xbb000000 | 0, 0x00000000);
      this.fillHorizontalGradient(bbox.x + bbox.w - 28, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h, 0x00000000, 0xbb000000 | 0);
    }
    glDisable2(GL_SCISSOR_TEST);
    this.drawScrollBar(this.hScroll);
    this.drawScrollBar(this.vScroll);
  }

  protected override onSelect(gridId: number, selected: boolean): boolean {
    if (selected) this.screen.onItemSelected(this, gridId);
    return selected;
  }

  drawScrollBar(sb: ScrollBar): void {
    if (sb.alpha <= 0) return;
    const color = (Math.trunc(f(255.0 * sb.alpha)) << 24) | 0xffffff;
    this.fill(2 + sb.x, sb.y, 2 + sb.x + sb.w, sb.y + sb.h, color);
  }
}
