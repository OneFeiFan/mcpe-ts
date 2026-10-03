// 1:1 移植自 src/client/gui/components/ImageButton.h 与 ImageButton.cpp：IntRectangle（S9，GameRenderer 的裁剪区）、ImageDef 与 ImageButton（S13 阶段 C）。
export class IntRectangle {
  x: number;
  y: number;
  w: number;
  h: number;

  constructor(x = 0, y = 0, w = 1, h = 1) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
}

// ---- S13 阶段 C：ImageDef、ImageButton 与 OptionButton（照 ImageButton.h / ImageButton.cpp 移植） ----
import type { Minecraft } from '../../Minecraft';
import { glColor4f2 } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { Textures } from '../../renderer/Textures';
import { Button } from './Button';
import type { OptionId, Options } from '../../Options';
import { MouseAction } from '@mcpe/platform';

/** C++ 的 struct ImageDef */
export class ImageDef {
  name = '';
  x = 0;
  y = 0;
  width = 16;
  height = 16;
  protected src = new IntRectangle();
  protected hasSrc = false;

  setSrc(srcRect: IntRectangle): ImageDef {
    this.hasSrc = true;
    this.src = new IntRectangle(srcRect.x, srcRect.y, srcRect.w, srcRect.h);
    return this;
  }

  getSrc(): IntRectangle | null {
    return this.hasSrc ? this.src : null;
  }

  copy(): ImageDef {
    const d = new ImageDef();
    d.name = this.name;
    d.x = this.x;
    d.y = this.y;
    d.width = this.width;
    d.height = this.height;
    d.src = new IntRectangle(this.src.x, this.src.y, this.src.w, this.src.h);
    d.hasSrc = this.hasSrc;
    return d;
  }
}

export class ImageButton extends Button {
  protected _imageDef = new ImageDef();
  scaleWhenPressed = true;

  constructor(id: number, msg: string, imageDef?: ImageDef) {
    super(id, msg);
    if (imageDef) this._imageDef = imageDef.copy();
    this.setupDefault();
  }

  protected setupDefault(): void {
    this.width = 48;
    this.height = 48;
    this.scaleWhenPressed = true;
  }

  setImageDef(imageDef: ImageDef, setButtonSize: boolean): void {
    this._imageDef = imageDef.copy();
    if (setButtonSize) {
      this.width = Math.trunc(this._imageDef.width);
      this.height = Math.trunc(this._imageDef.height);
    }
  }

  protected isSecondImage(hovered: boolean): boolean {
    return hovered;
  }

  protected override renderBg(_minecraft: Minecraft, _xm: number, _ym: number): void {}

  override render(minecraft: Minecraft, xm: number, ym: number): void {
    if (!this.visible) return;
    const font = minecraft.font!;
    glColor4f2(1, 1, 1, 1);
    const x = this.x,
      y = this.y;
    const hovered =
      this.active &&
      (minecraft.useTouchscreen()
        ? this._currentlyDown && xm >= x && ym >= y && xm < x + this.width && ym < y + this.height
        : this.isInside(xm, ym));
    const IsSecondImage = this.isSecondImage(hovered);
    this.renderBg(minecraft, xm, ym);
    const texId =
      this._imageDef.name.length > 0
        ? minecraft.textures!.loadAndBindTexture(this._imageDef.name)
        : Textures.InvalidId;
    if (Textures.isTextureIdValid(texId)) {
      const d = this._imageDef;
      const t = Tesselator.instance;
      t.begin();
      if (!this.active) t.color(0xff808080 | 0);
      else t.color(0xffffffff | 0);
      let hx = d.width * 0.5;
      let hy = d.height * 0.5;
      const cx = x + d.x + hx;
      const cy = y + d.y + hy;
      if (this.scaleWhenPressed && hovered) {
        hx *= 0.95;
        hy *= 0.95;
      }
      const src = this._imageDef.getSrc();
      if (src) {
        const td = minecraft.textures!.getTemporaryTextureData(texId);
        if (td !== null) {
          const u0 = (src.x + (IsSecondImage ? src.w : 0)) / td.w;
          const u1 = (src.x + (IsSecondImage ? 2 * src.w : src.w)) / td.w;
          const v0 = src.y / td.h;
          const v1 = (src.y + src.h) / td.h;
          t.vertexUV(cx - hx, cy - hy, this.blitOffset, u0, v0);
          t.vertexUV(cx - hx, cy + hy, this.blitOffset, u0, v1);
          t.vertexUV(cx + hx, cy + hy, this.blitOffset, u1, v1);
          t.vertexUV(cx + hx, cy - hy, this.blitOffset, u1, v0);
        }
      } else {
        t.vertexUV(cx - hx, cy - hy, this.blitOffset, 0, 0);
        t.vertexUV(cx - hx, cy + hy, this.blitOffset, 0, 1);
        t.vertexUV(cx + hx, cy + hy, this.blitOffset, 1, 1);
        t.vertexUV(cx + hx, cy - hy, this.blitOffset, 1, 0);
      }
      t.draw();
    }
    const cxs = x + Math.trunc(this.width / 2);
    if (!this.active) {
      this.drawCenteredString(font, this.msg, cxs, y + 16, 0xffa0a0a0 | 0);
    } else if (hovered || this.selected) {
      this.drawCenteredString(font, this.msg, cxs, y + 17, 0xffffa0);
    } else {
      this.drawCenteredString(font, this.msg, cxs, y + 16, 0xe0e0e0);
    }
  }
}

/** C++ 的 OptionButton：切换一个布尔选项的图片按钮（暂停界面的第三人称、隐藏界面按钮） */
export class OptionButton extends ImageButton {
  static readonly ButtonId = 9999999;
  private m_optId: OptionId;
  private _secondImage = false;

  constructor(optId: OptionId) {
    super(OptionButton.ButtonId, '');
    this.m_optId = optId;
  }

  toggle(options: Options): void {
    options.toggle(this.m_optId);
    this.updateImage(options);
  }

  updateImage(options: Options): void {
    this._secondImage = options.getBooleanValue(this.m_optId);
  }

  protected override isSecondImage(_hovered: boolean): boolean {
    return this._secondImage;
  }

  override mouseClicked(minecraft: Minecraft, x: number, y: number, buttonNum: number): void {
    if (buttonNum === MouseAction.ACTION_LEFT) {
      if (this.clicked(minecraft, x, y)) {
        this.toggle(minecraft.options);
      }
    }
  }
}
