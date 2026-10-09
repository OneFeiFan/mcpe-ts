/**
 * 1:1 移植自 src/client/gui/components/ScrolledSelectionList.h 与 .cpp：经典风格的竖向可拖动列表（选世界界面用）。
 * 按住拖动滚动、松手有惯性；按下后 300 毫秒内松开且没怎么移动就算点选。上下两条“洞口”背景盖住列表外的部分，边缘有 4 像素的渐隐。
 * 原样保留：ignoreY 在 C++ 构造函数里没有初始化（这里取 0）；selectItem 的 doubleClick 恒为 false。
 */
import { Mouse, MouseAction, getTimeMs } from '@mcpe/platform';
import type { Minecraft } from '../../Minecraft';
import {
  GL_ALPHA_TEST, GL_BLEND, GL_DEPTH_TEST, GL_FLAT, GL_ONE_MINUS_SRC_ALPHA, GL_SMOOTH, GL_SRC_ALPHA, GL_TEXTURE_2D, glBlendFunc2, glColor4f2,
  glDisable2, glEnable2, glShadeModel2,
} from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { GuiComponent } from '../GuiComponent';

const f = Math.fround;
const NO_DRAG = -1;
const DRAG_OUTSIDE = -2;
const DRAG_NORMAL = 0;
const DRAG_SKIP = 1;

export abstract class ScrolledSelectionList extends GuiComponent {
  protected minecraft: Minecraft;
  protected y0: number;
  protected y1: number;
  protected itemHeight: number;
  private width: number;
  private height: number;
  private x1: number;
  private x0 = 0;
  private ignoreY = 0;
  private dragState = DRAG_OUTSIDE;
  private yDrag = 0;
  private yo = 0;
  private yInertia = 0;
  private selectionY = -1;
  private lastSelectionTime = 0;
  private renderSelection = true;
  private doRenderHeader = false;
  private headerHeight = 0;

  constructor(minecraft: Minecraft, width: number, height: number, y0: number, y1: number, itemHeight: number) {
    super();
    this.minecraft = minecraft;
    this.width = width;
    this.height = height;
    this.y0 = f(y0);
    this.y1 = f(y1);
    this.itemHeight = itemHeight;
    this.x1 = f(width);
  }

  setRenderSelection(renderSelection: boolean): void {
    this.renderSelection = renderSelection;
  }

  protected setRenderHeader(renderHeader: boolean, headerHeight: number): void {
    this.doRenderHeader = renderHeader;
    this.headerHeight = headerHeight;
    if (!this.doRenderHeader) this.headerHeight = 0;
  }

  protected abstract getNumberOfItems(): number;
  protected abstract selectItem(item: number, doubleClick: boolean): void;
  protected abstract isSelectedItem(item: number): boolean;
  protected getMaxPosition(): number {
    return this.getNumberOfItems() * this.itemHeight + this.headerHeight;
  }
  protected abstract renderItem(i: number, x: number, y: number, h: number, t: Tesselator): void;
  protected renderHeader(_x: number, _y: number, _t: Tesselator): void {}
  protected abstract renderBackground(): void;
  protected renderDecorations(_mouseX: number, _mouseY: number): void {}
  protected clickedHeader(_headerMouseX: number, _headerMouseY: number): void {}

  getItemAtPosition(x: number, y: number): number {
    const x0 = Math.trunc(this.width / 2) - (92 + 16 + 2);
    const x1 = Math.trunc(this.width / 2) + (92 + 16 + 2);
    const clickSlotPos = Math.trunc(y - this.y0 - this.headerHeight + Math.trunc(this.yo) - 4);
    const slot = Math.trunc(clickSlotPos / this.itemHeight);
    if (x >= x0 && x <= x1 && slot >= 0 && clickSlotPos >= 0 && slot < this.getNumberOfItems()) {
      return slot;
    }
    return -1;
  }

  capYPosition(): void {
    let max = f(this.getMaxPosition() - f(f(this.y1 - this.y0) - 4));
    if (max < 0) max = f(max / 2);
    if (this.yo < 0) this.yo = 0;
    if (this.yo > max) this.yo = max;
  }

  render(xm: number, ym: number, _a: number): void {
    this.renderBackground();
    const itemCount = this.getNumberOfItems();
    if (Mouse.isButtonDown(MouseAction.ACTION_LEFT)) {
      if (ym >= this.y0 && ym <= this.y1 && ym !== this.ignoreY) {
        if (this.dragState === NO_DRAG) {
          this.dragState = DRAG_SKIP;
        } else if (this.dragState >= 0) {
          if (this.dragState === DRAG_SKIP) {
            this.lastSelectionTime = getTimeMs();
            this.selectionY = ym;
          } else if (this.dragState === DRAG_NORMAL) {
            this.yo = f(this.yo - f(ym - this.yDrag));
            this.yInertia = f(this.yInertia + f(ym - this.yDrag));
          }
          this.dragState = DRAG_NORMAL;
        }
        this.ignoreY = -1;
      }
    } else {
      if (this.dragState >= 0 && Math.abs(this.yInertia) < 2) {
        this.yInertia = 0.0;
      }
      if (this.dragState >= 0 && getTimeMs() - this.lastSelectionTime < 300) {
        const clickSlotPos = f(ym - this.y0 - this.headerHeight + Math.trunc(this.yo) - 4);
        const slot = Math.trunc(Math.trunc(clickSlotPos) / this.itemHeight);
        if (slot >= 0 && Math.abs(this.selectionY - ym) < this.itemHeight) {
          const doubleClick = false;
          this.selectItem(slot, doubleClick);
          this.yInertia = 0.0;
        }
      }
      this.dragState = NO_DRAG;
      this.yo = f(this.yo - this.yInertia);
    }
    this.yInertia = f(this.yInertia * f(0.75));
    this.yDrag = ym;
    this.capYPosition();
    const t = Tesselator.instance;
    this.renderDirtBackground();
    const rowX = Math.trunc(Math.trunc(this.width / 2) - 92 - 16);
    const rowBaseY = Math.trunc(f(this.y0 + 4 - Math.trunc(this.yo)));
    if (this.doRenderHeader) {
      this.renderHeader(rowX, rowBaseY, t);
    }
    for (let i = 0; i < itemCount; i++) {
      const y = rowBaseY + i * this.itemHeight + this.headerHeight;
      const h = f(this.itemHeight - 4.0);
      if (y > this.y1 || y + h < this.y0) {
        continue;
      }
      if (this.renderSelection && this.isSelectedItem(i)) {
        const x0 = f(this.width / 2.0 - (92 + 16 + 2));
        const x1 = f(this.width / 2.0 + (92 + 16 + 2));
        glColor4f2(1, 1, 1, 1);
        glDisable2(GL_TEXTURE_2D);
        t.begin();
        t.color(0x808080);
        t.vertexUV(x0, y + h + 2, 0, 0, 1);
        t.vertexUV(x1, y + h + 2, 0, 1, 1);
        t.vertexUV(x1, y - 2, 0, 1, 0);
        t.vertexUV(x0, y - 2, 0, 0, 0);
        t.color(0x000000);
        t.vertexUV(x0 + 1, y + h + 1, 0, 0, 1);
        t.vertexUV(x1 - 1, y + h + 1, 0, 1, 1);
        t.vertexUV(x1 - 1, y - 1, 0, 1, 0);
        t.vertexUV(x0 + 1, y - 1, 0, 0, 0);
        t.draw();
        glEnable2(GL_TEXTURE_2D);
      }
      this.renderItem(i, rowX, y, Math.trunc(h), t);
    }
    glDisable2(GL_DEPTH_TEST);
    const d = 4;
    this.renderHoleBackground(0, this.y0, 255, 255);
    this.renderHoleBackground(this.y1, this.height, 255, 255);
    glEnable2(GL_BLEND);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glDisable2(GL_ALPHA_TEST);
    glShadeModel2(GL_SMOOTH);
    glDisable2(GL_TEXTURE_2D);
    t.begin();
    t.color(0x000000, 0);
    t.vertexUV(this.x0, this.y0 + d, 0, 0, 1);
    t.vertexUV(this.x1, this.y0 + d, 0, 1, 1);
    t.color(0x000000, 255);
    t.vertexUV(this.x1, this.y0, 0, 1, 0);
    t.vertexUV(this.x0, this.y0, 0, 0, 0);
    t.draw();
    t.begin();
    t.color(0x000000, 255);
    t.vertexUV(this.x0, this.y1, 0, 0, 1);
    t.vertexUV(this.x1, this.y1, 0, 1, 1);
    t.color(0x000000, 0);
    t.vertexUV(this.x1, this.y1 - d, 0, 1, 0);
    t.vertexUV(this.x0, this.y1 - d, 0, 0, 0);
    t.draw();
    this.renderDecorations(xm, ym);
    glEnable2(GL_TEXTURE_2D);
    glEnable2(GL_DEPTH_TEST);
    glShadeModel2(GL_FLAT);
    glEnable2(GL_ALPHA_TEST);
    glDisable2(GL_BLEND);
  }

  renderHoleBackground(y0: number, y1: number, a0: number, a1: number): void {
    const t = Tesselator.instance;
    this.minecraft.textures!.loadAndBindTexture('gui/background.png');
    glColor4f2(1.0, 1, 1, 1);
    const s = 32;
    t.begin();
    t.color(0x505050, a1);
    t.vertexUV(0, y1, 0, 0, f(y1 / s));
    t.vertexUV(this.width, y1, 0, f(this.width / s), f(y1 / s));
    t.color(0x505050, a0);
    t.vertexUV(this.width, y0, 0, f(this.width / s), f(y0 / s));
    t.vertexUV(0, y0, 0, 0, f(y0 / s));
    t.draw();
  }

  renderDirtBackground(): void {
    const t = Tesselator.instance;
    this.minecraft.textures!.loadAndBindTexture('gui/background.png');
    glColor4f2(1.0, 1, 1, 1);
    const s = 32;
    const yo = Math.trunc(this.yo);
    t.begin();
    t.color(0x202020);
    t.vertexUV(this.x0, this.y1, 0, f(this.x0 / s), f(f(this.y1 + yo) / s));
    t.vertexUV(this.x1, this.y1, 0, f(this.x1 / s), f(f(this.y1 + yo) / s));
    t.vertexUV(this.x1, this.y0, 0, f(this.x1 / s), f(f(this.y0 + yo) / s));
    t.vertexUV(this.x0, this.y0, 0, f(this.x0 / s), f(f(this.y0 + yo) / s));
    t.draw();
  }
}
