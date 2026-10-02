// 1:1 移植自 src/client/gui/components/ImageButton.h 里的 struct IntRectangle（GameRenderer 的裁剪区用到）。
// ImageButton 等 GUI 组件本身属于 Gui（S11），这里不移植。
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
