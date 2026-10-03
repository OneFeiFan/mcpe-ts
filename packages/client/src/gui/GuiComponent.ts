import { GL_ALPHA_TEST, GL_BLEND, GL_FLAT, GL_ONE_MINUS_SRC_ALPHA, GL_SMOOTH, GL_SRC_ALPHA, GL_TEXTURE_2D, glBlendFunc2, glDisable2, glEnable2, glShadeModel2 } from "../renderer/gles";
import { Tesselator } from "../renderer/Tesselator";
import type { Font } from "./Font";

/** 1:1 移植自 src/client/gui/GuiComponent.h 与 GuiComponent.cpp（S13；你的单元，阶段 C 校对：blit 的 sw、sh 改为可选） */
export class GuiComponent {
  protected blitOffset = 0;

  constructor() {}

  /** C++ GuiComponent::drawCenteredString(Font*, const std::string&, int, int, int) */
  drawCenteredString(font: Font, str: string, x: number, y: number, color: number): void {
    // C++ 是 int 除法，向零截断
    const cx = x - Math.trunc(font.width(str) / 2);
    const cy = y - Math.trunc(font.height(str) / 2);
    font.drawShadow(str, cx, cy, color);
  }

  /** C++ GuiComponent::drawString(Font*, const std::string&, int, int, int) */
  drawString(font: Font, str: string, x: number, y: number, color: number): void {
    // C++ 里 y - font->height(str)/2 那部分被注释掉了
    font.drawShadow(str, x, y, color);
  }

  /** C++ GuiComponent::blit(float x, float y, int sx, int sy, float w, float h, int sw=0, int sh=0) */
  blit(x: number, y: number, sx: number, sy: number, w: number, h: number, sw?: number, sh?: number): void;
  blit(x: number, y: number, sx: number, sy: number, w: number, h: number, sw = 0, sh = 0): void {
    // C++ 的 int、float 两个重载（R10 情形 A 合并）：int 版本 sw = w，float 版本 sw = (int)w——整数参数时两者相同
    if (!sw) sw = Math.trunc(w);
    if (!sh) sh = Math.trunc(h);

    const us = 1 / 256.0;
    const vs = 1 / 256.0;

    const t = Tesselator.instance;
    t.begin();
    t.vertexUV(x,     y + h, this.blitOffset, sx * us,        (sy + sh) * vs);
    t.vertexUV(x + w, y + h, this.blitOffset, (sx + sw) * us, (sy + sh) * vs);
    t.vertexUV(x + w, y,     this.blitOffset, (sx + sw) * us, sy * vs);
    t.vertexUV(x,     y,     this.blitOffset, sx * us,        sy * vs);
    t.draw();
  }

  /** C++ GuiComponent::fill(int x0, int y0, int x1, int y1, int col) */
  protected fill(x0: number, y0: number, x1: number, y1: number, col: number): void {
    glEnable2(GL_BLEND);
	glDisable2(GL_TEXTURE_2D);
	glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    // RGBA -> BGRA 重排
    const color =
      (col & 0xff00ff00) |
      ((col & 0xff0000) >>> 16) |
      ((col & 0xff) << 16);

    const t = Tesselator.instance;
    t.begin();
    t.colorABGR(color);
    t.vertex(x0, y1, 0);
    t.vertex(x1, y1, 0);
    t.vertex(x1, y0, 0);
    t.vertex(x0, y0, 0);
    t.draw();

    glEnable2(GL_TEXTURE_2D);
    glDisable2(GL_BLEND);
  }

  /** C++ GuiComponent::fillGradient(float x0, float y0, float x1, float y1, int col1, int col2) */
  protected fillGradient(
    x0: number, y0: number, x1: number, y1: number,
    col1: number, col2: number,
  ): void {
    const a1 = ((col1 >> 24) & 0xff) / 255.0;
    const r1 = ((col1 >> 16) & 0xff) / 255.0;
    const g1 = ((col1 >> 8) & 0xff) / 255.0;
    const b1 = (col1 & 0xff) / 255.0;

    const a2 = ((col2 >> 24) & 0xff) / 255.0;
    const r2 = ((col2 >> 16) & 0xff) / 255.0;
    const g2 = ((col2 >> 8) & 0xff) / 255.0;
    const b2 = (col2 & 0xff) / 255.0;

    glDisable2(GL_TEXTURE_2D);
    glEnable2(GL_BLEND);
    glDisable2(GL_ALPHA_TEST);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glShadeModel2(GL_SMOOTH);

    const t = Tesselator.instance;
    t.begin();
    // 上面两个顶点用 col1
    t.color(r1, g1, b1, a1);
    t.vertex(x1, y0, 0);
    t.vertex(x0, y0, 0);
    // 下面两个顶点用 col2
    t.color(r2, g2, b2, a2);
    t.vertex(x0, y1, 0);
    t.vertex(x1, y1, 0);
    t.draw();

    glShadeModel2(GL_FLAT);
    glDisable2(GL_BLEND);
    glEnable2(GL_ALPHA_TEST);
    glEnable2(GL_TEXTURE_2D);
  }

  /** C++ GuiComponent::fillHorizontalGradient(float x0, float y0, float x1, float y1, int col1, int col2) */
  protected fillHorizontalGradient(
    x0: number, y0: number, x1: number, y1: number,
    col1: number, col2: number,
  ): void {
    const a1 = ((col1 >> 24) & 0xff) / 255.0;
    const r1 = ((col1 >> 16) & 0xff) / 255.0;
    const g1 = ((col1 >> 8) & 0xff) / 255.0;
    const b1 = (col1 & 0xff) / 255.0;

    const a2 = ((col2 >> 24) & 0xff) / 255.0;
    const r2 = ((col2 >> 16) & 0xff) / 255.0;
    const g2 = ((col2 >> 8) & 0xff) / 255.0;
    const b2 = (col2 & 0xff) / 255.0;

    glDisable2(GL_TEXTURE_2D);
    glEnable2(GL_BLEND);
    glDisable2(GL_ALPHA_TEST);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glShadeModel2(GL_SMOOTH);

    const t = Tesselator.instance;
    t.begin();
    // 右侧两个顶点用 col2
    t.color(r2, g2, b2, a2);
    t.vertex(x1, y0, 0);
    // 左侧两个顶点用 col1
    t.color(r1, g1, b1, a1);
    t.vertex(x0, y0, 0);
    t.vertex(x0, y1, 0);
    // 右侧两个顶点用 col2
    t.color(r2, g2, b2, a2);
    t.vertex(x1, y1, 0);
    t.draw();

    glShadeModel2(GL_FLAT);
    glDisable2(GL_BLEND);
    glEnable2(GL_ALPHA_TEST);
    glEnable2(GL_TEXTURE_2D);
  }
}