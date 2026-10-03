/**
 * 1:1 移植自 src/client/gui/components/RolledSelectionListH.h 与 .cpp（B8a）。
 *
 * 名字里的 H 是 horizontal：内容沿 X 轴排开、拖的是 X 轴，选中的那一项居中放大 ——
 * 就是选世界界面那种左右"翻牌"的列表。使用方是 C++ 的 Touch::WorldSelectionList（B8d 才移植）。
 *
 * 【它跟 ScrolledSelectionList 没有继承关系】别被名字骗了 —— 那个是**纵向**版的另一份实现，
 * 两者在 C++ 里就是两份几乎逐行相同的代码（一个排 Y、一个排 X）。全仓库只有 JoinGameScreen
 * （联机，OMIT(Network)）用纵向那份，所以这里只移植横向的，也不去抽公共基类 —— 照抄原结构。
 *
 * 部分：无 DEFERRED —— 依赖（Mouse / Mth / Tesselator / Textures / gles）都齐。
 * 渲染部分只能在浏览器里看，单元测试盖的是纯逻辑（取项、夹边界、惯性积分）。
 */
import { Mouse, MouseAction, getTimeMs } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import type { Minecraft } from '../../Minecraft';
import {
  GL_DEPTH_TEST,
  GL_TEXTURE_2D,
  glColor4f2,
  glDisable2,
  glEnable2,
} from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { GuiComponent } from '../GuiComponent';

// C++ 的类内 `static const int`（三个常量只在类里用，TS 放模块级）
const NO_DRAG = -1;
const DRAG_OUTSIDE = -2;
const DRAG_NORMAL = 0;

export abstract class RolledSelectionListH extends GuiComponent {
  protected minecraft: Minecraft;
  protected x0: number;
  protected x1: number;
  protected itemWidth: number;
  protected width: number;
  protected height: number;
  protected y0: number;
  protected y1: number;
  protected dragState: number;
  protected xDrag: number;
  protected xo: number;
  protected xoo: number;
  protected xInertia: number;
  protected _xinertia: number;
  protected selectionX: number;
  protected renderSelection: boolean;
  protected _componentSelected: boolean;
  protected _renderTopBorder: boolean;
  protected _renderBottomBorder: boolean;

  private headerWidth: number;
  private doRenderHeader: boolean;
  private lastSelectionTime: number;
  private lastSelection: number;
  private _lastxoo: number;

  constructor(
    minecraft: Minecraft,
    width: number,
    height: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    itemWidth: number,
  ) {
    super();
    this.minecraft = minecraft;
    this.width = width;
    this.height = height;
    this.x0 = x0;
    this.x1 = x1;
    this.y0 = y0;
    this.y1 = y1;
    this.itemWidth = itemWidth;
    this.selectionX = -1;
    this.lastSelectionTime = 0;
    this.lastSelection = -1;
    this.renderSelection = true;
    this.doRenderHeader = false;
    this.headerWidth = 0;
    this.dragState = DRAG_OUTSIDE;
    this.xDrag = 0.0;
    this.xo = 0.0;
    this.xoo = 0.0;
    this.xInertia = 0.0;
    this._componentSelected = false;
    this._renderTopBorder = true;
    this._renderBottomBorder = true;
    this._lastxoo = 0;
    this._xinertia = 0;
    // 一开始把内容居中：(itemWidth - width) * 0.5f
    this.xo = this.xoo = (this.itemWidth - this.width) * 0.5;
    this._lastxoo = this.xoo;
  }

  setRenderSelection(_renderSelection: boolean): void {
    this.renderSelection = _renderSelection;
  }

  setComponentSelected(selected: boolean): void {
    this._componentSelected = selected;
  }

  protected setRenderHeader(_renderHeader: boolean, _headerHeight: number): void {
    this.doRenderHeader = _renderHeader;
    // 【参数名叫 headerHeight，赋给的却是 headerWidth】C++ 就这么写的 —— 横向版把它当"横向留白"用
    this.headerWidth = _headerHeight;
    if (!this.doRenderHeader) {
      this.headerWidth = 0;
    }
  }

  protected getMaxPosition(): number {
    return this.getNumberOfItems() * this.itemWidth + this.headerWidth;
  }

  getItemAtPosition(x: number, y: number): number {
    // C++：(int)(x - x0 - headerWidth + (int) xo - 4) —— 最后一次性截断，中间的 (int) xo 单独截断
    const clickSlotPos = Math.trunc(x - this.x0 - this.headerWidth + Math.trunc(this.xo) - 4);
    const isInsideY = y >= this.y0 && y <= this.y1;
    return isInsideY ? this.getItemAtXPositionRaw(clickSlotPos) : -1;
  }

  protected getItemAtXPositionRaw(x: number): number {
    // C++ 是整数除法，向零截断
    const slot = Math.trunc(x / this.itemWidth);
    const isInsideX = slot >= 0 && x >= 0 && slot < this.getNumberOfItems();
    return isInsideX ? slot : -1;
  }

  capXPosition(): boolean {
    const MinX = (this.itemWidth - this.width) / 2;
    const MaxX = MinX + (this.getNumberOfItems() - 1) * this.itemWidth;
    if (this.xo < MinX) {
      this.xo = MinX;
      this.xInertia = 0;
      return true;
    }
    if (this.xo > MaxX) {
      this.xo = MaxX;
      this.xInertia = 0;
      return true;
    }
    return false;
  }

  tick(): void {
    this._xinertia = this._lastxoo - this.xoo;
    this._lastxoo = this.xoo;
    this.xoo = this.xo - this.xInertia;
  }

  protected getPos(alpha: number): number {
    return this.xoo - this.xInertia * alpha;
  }

  // 不写 override：C++ 的 GuiComponent 里没有 render，这是本类新开的虚函数（ScrollingPane 同理）
  render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    const itemCount = this.getNumberOfItems();
    if (Mouse.isButtonDown(MouseAction.ACTION_LEFT)) {
      this.touched();
      if (ym >= this.y0 && ym <= this.y1) {
        if (this.dragState === NO_DRAG) {
          this.lastSelectionTime = getTimeMs();
          this.lastSelection = this.getItemAtPosition(xm, Math.trunc(this.height / 2));
          this.selectStart(this.lastSelection, 0, 0);
          this.selectionX = xm;
        } else if (this.dragState >= 0) {
          this.xo -= xm - this.xDrag;
          this.xoo = this.xo;
        }
        this.dragState = DRAG_NORMAL;
      }
    } else {
      if (this.dragState >= 0) {
        // 【里外两层条件一模一样】C++ 原文就是套了两层 `if (dragState >= 0)`，照抄
        if (this.dragState >= 0) {
          this.xInertia =
            this._xinertia < 0 ? Mth.Max(-20.0, this._xinertia) : Mth.Min(20.0, this._xinertia);
        }
        if (Math.abs(this.xInertia) <= 2.0001) {
          this.xInertia = 0.0;
        }
        if (Math.abs(this.xInertia) <= 10 && getTimeMs() - this.lastSelectionTime < 300) {
          const slot = this.getItemAtPosition(xm, Math.trunc(this.height / 2));
          if (slot >= 0 && slot === this.lastSelection && Math.abs(this.selectionX - xm) < 10)
            this.selectItem(slot, false);
          else this.selectCancel();
        } else {
          this.selectCancel();
        }
      }
      this.dragState = NO_DRAG;
      this.xo = this.getPos(a);
    }
    this.xDrag = xm;
    this.capXPosition();
    const t = Tesselator.instance;
    const by0 = this._renderTopBorder ? this.y0 : 0;
    const by1 = this._renderBottomBorder ? this.y1 : this.height;
    this.minecraft.textures!.loadAndBindTexture('gui/background.png');
    glColor4f2(1.0, 1, 1, 1);
    const s = 32;
    t.begin();
    t.color(0x202020);
    t.vertexUV(this.x0, by1, 0, (this.x0 + Math.trunc(this.xo)) / s, by1 / s);
    t.vertexUV(this.x1, by1, 0, (this.x1 + Math.trunc(this.xo)) / s, by1 / s);
    t.vertexUV(this.x1, by0, 0, (this.x1 + Math.trunc(this.xo)) / s, by0 / s);
    t.vertexUV(this.x0, by0, 0, (this.x0 + Math.trunc(this.xo)) / s, by0 / s);
    t.draw();
    const HalfHeight = 48;
    if (this.getNumberOfItems() === 0) this.xo = 0;
    const rowY = Math.trunc(this.height / 2 - HalfHeight + 8);
    const rowBaseX = Math.trunc(this.x0 - Math.trunc(this.xo));
    if (this.doRenderHeader) {
      this.renderHeader(rowBaseX, rowY, t);
    }
    for (let i = 0; i < itemCount; i++) {
      const x = rowBaseX + i * this.itemWidth + this.headerWidth;
      const h = this.itemWidth;
      if (x > this.x1 || x + h < this.x0) {
        continue;
      }
      if (this.renderSelection && this.isSelectedItem(i)) {
        // 【这两个局部变量遮蔽了同名的成员 y0 / y1】C++ 里就是在 if 块内又声明了两个 float，照抄
        const sy0 = this.height / 2.0 - HalfHeight - 4;
        const sy1 = this.height / 2.0 + HalfHeight - 4;
        glColor4f2(1, 1, 1, 1);
        glDisable2(GL_TEXTURE_2D);
        let ew = 0;
        let color = 0x808080;
        if (this._componentSelected) {
          ew = 0;
          color = 0x7f89bf;
        }
        t.begin();
        t.color(color);
        t.vertex(x - 1 - ew, sy0 - ew, 0);
        t.vertex(x - 1 - ew, sy1 + ew, 0);
        t.vertex(x + h + 1 + ew, sy1 + ew, 0);
        t.vertex(x + h + 1 + ew, sy0 - ew, 0);
        t.color(0x000000);
        t.vertex(x, sy0 + 1, 0);
        t.vertex(x, sy1 - 1, 0);
        t.vertex(x + h, sy1 - 1, 0);
        t.vertex(x + h, sy0 + 1, 0);
        t.draw();
        glEnable2(GL_TEXTURE_2D);
      }
      this.renderItem(i, Math.trunc(x), rowY, Math.trunc(h), t);
    }
    glDisable2(GL_DEPTH_TEST);
    if (this._renderTopBorder) this.renderHoleBackground(0, this.y0, 255, 255);
    if (this._renderBottomBorder) this.renderHoleBackground(this.y1, this.height, 255, 255);
    glEnable2(GL_DEPTH_TEST);
  }

  renderHoleBackground(y0: number, y1: number, a0: number, a1: number): void {
    const t = Tesselator.instance;
    this.minecraft.textures!.loadAndBindTexture('gui/background.png');
    glColor4f2(1.0, 1, 1, 1);
    const s = 32;
    t.begin();
    t.color(0x505050, a1);
    t.vertexUV(0, y1, 0, 0, y1 / s);
    t.vertexUV(this.width, y1, 0, this.width / s, y1 / s);
    t.color(0x505050, a0);
    t.vertexUV(this.width, y0, 0, this.width / s, y0 / s);
    t.vertexUV(0, y0, 0, 0, y0 / s);
    t.draw();
  }

  // C++ 里是个空函数（子类 Touch::WorldSelectionList 会覆盖它）
  protected touched(): void {}

  // ---- 子类要实现/覆盖的 ----

  protected abstract getNumberOfItems(): number;
  protected abstract selectItem(item: number, doubleClick: boolean): void;
  protected abstract isSelectedItem(item: number): boolean;
  protected abstract renderItem(i: number, x: number, y: number, h: number, t: Tesselator): void;
  protected abstract renderBackground(): void;

  protected selectStart(_item: number, _localX: number, _localY: number): void {}
  protected selectCancel(): void {}
  protected renderHeader(_x: number, _y: number, _t: Tesselator): void {}
  protected renderDecorations(_mouseX: number, _mouseY: number): void {}
  protected clickedHeader(_headerMouseX: number, _headerMouseY: number): void {}
}
