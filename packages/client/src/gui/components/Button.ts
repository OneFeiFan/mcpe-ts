/**
 * 1:1 移植自 src/client/gui/components/Button.h 与 Button.cpp（S13 阶段 C：界面类的基础）。
 * C++ 的三个构造函数 (id, msg)、(id, x, y, msg)、(id, x, y, w, h, msg) 写成静态工厂（R10 情形 B）：
 *   new Button(id, msg)  →  Button.create(id, msg) 或直接 new Button(id, msg)
 *   (id, x, y, msg) → Button.at(id, x, y, msg)；(id, x, y, w, h, msg) → Button.sized(id, x, y, w, h, msg)
 * Touch::TButton、Touch::THeader 放在同一文件，命名为 TButton、THeader（C++ 的 namespace Touch）。
 */
import type { Minecraft } from '../../Minecraft';
import { GL_BLEND, GL_ONE_MINUS_SRC_ALPHA, GL_SRC_ALPHA, glBlendFunc2, glColor4f2, glEnable2 } from '../../renderer/gles';
import { GuiElement } from './GuiElement';

export class Button extends GuiElement {
  msg: string;
  id: number;
  selected = false;
  protected _currentlyDown = false;

  constructor(id: number, msg: string, x = 0, y = 0, w = 200, h = 24) {
    super(true, true, x, y, w, h);
    this.id = id;
    this.msg = msg;
  }

  static at(id: number, x: number, y: number, msg: string): Button {
    return new Button(id, msg, x, y, 200, 24);
  }

  static sized(id: number, x: number, y: number, w: number, h: number, msg: string): Button {
    return new Button(id, msg, x, y, w, h);
  }

  override render(minecraft: Minecraft, xm: number, ym: number): void {
    if (!this.visible) return;
    this.renderBg(minecraft, xm, ym);
    this.renderFace(minecraft, xm, ym);
  }

  released(_mx: number, _my: number): void {
    this._currentlyDown = false;
  }

  clicked(_minecraft: Minecraft, mx: number, my: number): boolean {
    return this.active && mx >= this.x && my >= this.y && mx < this.x + this.width && my < this.y + this.height;
  }

  setPressed(): void {
    this._currentlyDown = true;
  }

  isInside(xm: number, ym: number): boolean {
    return xm >= this.x && ym >= this.y && xm < this.x + this.width && ym < this.y + this.height;
  }

  protected getYImage(hovered: boolean): number {
    let res = 1;
    if (!this.active) res = 0;
    else if (hovered) res = 2;
    return res;
  }

  protected renderFace(mc: Minecraft, xm: number, ym: number): void {
    const font = mc.font!;
    const cx = this.x + Math.trunc(this.width / 2);
    const cy = this.y + Math.trunc((this.height - 8) / 2);
    if (!this.active) {
      this.drawCenteredString(font, this.msg, cx, cy, 0xffa0a0a0 | 0);
    } else if (this.hovered(mc, xm, ym) || this.selected) {
      this.drawCenteredString(font, this.msg, cx, cy, 0xffffa0);
    } else {
      this.drawCenteredString(font, this.msg, cx, cy, 0xe0e0e0);
    }
  }

  protected renderBg(minecraft: Minecraft, xm: number, ym: number): void {
    minecraft.textures!.loadAndBindTexture('gui/gui.png');
    glColor4f2(1, 1, 1, 1);
    const yImage = this.getYImage(this.selected || this.hovered(minecraft, xm, ym));
    const hw = Math.trunc(this.width / 2);
    this.blit(this.x, this.y, 0, 46 + yImage * 20, hw, this.height, 0, 20);
    this.blit(this.x + hw, this.y, 200 - hw, 46 + yImage * 20, hw, this.height, 0, 20);
  }

  protected hovered(minecraft: Minecraft, xm: number, ym: number): boolean {
    return minecraft.useTouchscreen() ? this._currentlyDown && this.isInside(xm, ym) : this.isInside(xm, ym);
  }
}

export class BlankButton extends Button {
  constructor(id: number, x = 0, y = 0, w = 200, h = 24) {
    super(id, '', x, y, w, h);
    this.visible = false;
  }
}

/** C++ 的 Touch::TButton */
export class TButton extends Button {
  /** C++ 的 (id, msg) 与 (id, x, y, msg) 两个构造函数把尺寸改成 66×26；(id, x, y, w, h, msg) 保留给定尺寸 */
  constructor(id: number, msg: string, x = 0, y = 0, w?: number, h?: number) {
    super(id, msg, x, y, w ?? 200, h ?? 24);
    if (w === undefined) {
      this.width = 66;
      this.height = 26;
    }
  }

  protected override renderBg(minecraft: Minecraft, xm: number, ym: number): void {
    const x = this.x, y = this.y;
    const hovered =
      this.active && (minecraft.useTouchscreen() ? this._currentlyDown && xm >= x && ym >= y && xm < x + this.width && ym < y + this.height : this.isInside(xm, ym));
    minecraft.textures!.loadAndBindTexture('gui/touchgui.png');
    if (this.active) glColor4f2(1, 1, 1, 1);
    else glColor4f2(0.5, 0.5, 0.5, 1);
    this.blit(x, y, hovered ? 66 : 0, 0, this.width, this.height, 66, 26);
  }
}

/** C++ 的 Touch::THeader */
export class THeader extends Button {
  xText = -99999;

  constructor(id: number, msg: string, x = 0, y = 0, w?: number, h?: number) {
    super(id, msg, x, y, w ?? 200, h ?? 24);
    this.active = false;
    if (w === undefined) {
      this.width = 66;
      this.height = 26;
    }
  }

  override render(minecraft: Minecraft, xm: number, ym: number): void {
    const font = minecraft.font!;
    this.renderBg(minecraft, xm, ym);
    let xx = this.x + Math.trunc(this.width / 2);
    if (this.xText !== -99999) xx = this.xText;
    this.drawCenteredString(font, this.msg, xx, this.y + Math.trunc((this.height - 8) / 2), 0xe0e0e0);
  }

  protected override renderBg(minecraft: Minecraft, _xm: number, _ym: number): void {
    minecraft.textures!.loadAndBindTexture('gui/touchgui.png');
    glColor4f2(1, 1, 1, 1);
    const x = this.x, y = this.y, width = this.width, height = this.height;
    this.blit(x, y, 150, 26, 2, height - 1, 2, 25);
    this.blit(x + 2, y, 153, 26, width - 3, height - 1, 8, 25);
    this.blit(x + width - 2, y, 162, 26, 2, height - 1, 2, 25);
    glEnable2(GL_BLEND);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    this.blit(x, y + height - 1, 153, 52, width, 3, 8, 3);
  }
}
