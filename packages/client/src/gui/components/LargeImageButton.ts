/**
 * 1:1 移植自 src/client/gui/components/LargeImageButton.h 与 .cpp（B8b-1）。
 *
 * 起始菜单那三个大按钮（开始游戏 / 加入游戏 / 选项）用的就是它：默认 72×72 的图标按钮。
 * 与基类 ImageButton 的差别只有三处：
 *   ① 悬停时图标**平滑**缩到 0.95 倍（ImageButton 是一步到位地乘 0.95；见下面的 _buttonScale）；
 *   ② 取哪半张图固定按 `hovered` 判断，不走可覆盖的 `isSecondImage()`；
 *   ③ 文字画在 `y + 11`（ImageButton 是 16 / 17 / 16）。
 *
 * 【构造函数里那两次 setupDefault 是有意的】C++ 里 `setupDefault()` 是虚函数，`ImageButton` 的构造函数
 * 会调一次（那时对象还是 ImageButton，走基类版本），`LargeImageButton` 的构造函数再调一次（这时才走
 * 派生版本，把尺寸改成 72×72）。TS 的虚函数在构造函数里就会派发到派生版本，所以第一次调用进去的
 * 就是派生版本 —— 结果一样（尺寸被设两遍），但过程不同，写在这里免得以后有人以为是笔误。
 */
import { Mth } from '@mcpe/util';
import type { Minecraft } from '../../Minecraft';
import { glColor4f2 } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { Textures } from '../../renderer/Textures';
import type { ImageDef } from './ImageButton';
import { ImageButton } from './ImageButton';

export class LargeImageButton extends ImageButton {
  /** 图标的当前缩放，逐帧向 0.95（悬停）或 1.00（不悬停）逼近，步长 0.025 */
  private _buttonScale = 1;

  constructor(id: number, msg: string, imageDef?: ImageDef) {
    super(id, msg, imageDef);
    this.setupDefault();
  }

  protected override setupDefault(): void {
    this._buttonScale = 1;
    this.width = 72;
    this.height = 72;
  }

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
      // 平滑逼近期望值：每次只走 0.025（第三档：界面动画，不做 fround）
      if (hovered) this._buttonScale = Mth.Max(0.95, this._buttonScale - 0.025);
      else this._buttonScale = Mth.Min(1.0, this._buttonScale + 0.025);
      hx *= this._buttonScale;
      hy *= this._buttonScale;
      const src = this._imageDef.getSrc();
      if (src) {
        const td = minecraft.textures!.getTemporaryTextureData(texId);
        if (td !== null) {
          // 这里用的是 hovered（不走 isSecondImage）
          const u0 = (src.x + (hovered ? src.w : 0)) / td.w;
          const u1 = (src.x + (hovered ? 2 * src.w : src.w)) / td.w;
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
    // 三个分支的文字都画在 y + 11（基类是 16 / 17 / 16）
    if (!this.active) {
      this.drawCenteredString(font, this.msg, cxs, y + 11, 0xffa0a0a0 | 0);
    } else if (hovered || this.selected) {
      this.drawCenteredString(font, this.msg, cxs, y + 11, 0xffffa0);
    } else {
      this.drawCenteredString(font, this.msg, cxs, y + 11, 0xe0e0e0);
    }
  }
}
