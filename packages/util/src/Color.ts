// 1:1 移植自 src/util/Color.h 与 Color.cpp
/**
 * Color：0xAARRGGBB。
 * R10：C++ 的两个构造函数 Color(float r, float g, float b) 与 Color(int r, int g, int b) 靠实参的静态类型区分，
 *   TS 分不出来——构造函数是 int 版，float 版写成静态方法 fromFloat。
 *   （审核：以前的构造函数按“是不是整数、是否都在 0..1”猜，new Color(1, 1, 1) 会被当成 float 版得到白色；
 *   float 版在越界时还会抛错，而 C++ 只有调试版的 assert。）
 * getHSBColor 全程是 float 运算，每一步 f()（Biome.getSkyColor 用它算天空颜色）。
 */
import { f2i } from './cpp';
import { Mth } from './Mth';

const f = Math.fround;

export class Color {
  private colour: number;

  /** C++ `Color(int r, int g, int b)` */
  constructor(r: number, g: number, b: number) {
    this.colour = (0xff << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }

  /** C++ `Color(float r, float g, float b)`（0..1；C++ 只在调试版 assert 范围，这里不检查） */
  static fromFloat(r: number, g: number, b: number): Color {
    const c = new Color(0, 0, 0);
    c.colour =
      (0xff << 24) | (f2i(f(f(r) * 255)) << 16) | (f2i(f(f(g) * 255)) << 8) | f2i(f(f(b) * 255));
    return c;
  }

  static getHSBColor(hue: number, saturation: number, brightness: number): Color {
    hue = f(hue);
    saturation = f(saturation);
    brightness = f(brightness);
    let r = 0;
    let g = 0;
    let b = 0;
    const c255 = (v: number): number => f2i(f(f(v * 255.0) + 0.5)); // (int) (v * 255.0f + 0.5f)
    if (saturation === 0) {
      r = g = b = c255(brightness);
    } else {
      const h = f(f(hue - Mth.floor(hue)) * 6.0);
      const ff = f(h - Mth.floor(h));
      const p = f(brightness * f(1.0 - saturation));
      const q = f(brightness * f(1.0 - f(saturation * ff)));
      const t = f(brightness * f(1.0 - f(saturation * f(1.0 - ff))));
      switch (f2i(h)) {
        case 0:
          r = c255(brightness);
          g = c255(t);
          b = c255(p);
          break;
        case 1:
          r = c255(q);
          g = c255(brightness);
          b = c255(p);
          break;
        case 2:
          r = c255(p);
          g = c255(brightness);
          b = c255(t);
          break;
        case 3:
          r = c255(p);
          g = c255(q);
          b = c255(brightness);
          break;
        case 4:
          r = c255(t);
          g = c255(p);
          b = c255(brightness);
          break;
        case 5:
          r = c255(brightness);
          g = c255(p);
          b = c255(q);
          break;
      }
    }
    return new Color(r, g, b);
  }

  getRGB(): number {
    return this.colour;
  }
}
