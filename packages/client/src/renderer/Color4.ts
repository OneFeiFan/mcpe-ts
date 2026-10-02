// 1:1 移植自 src/client/renderer/Color4.h
export class Color4 {
  r: number;
  g: number;
  b: number;
  a: number;

  constructor(r_: number, g_: number, b_: number, a_?: number);
  constructor(hex: number);
  constructor(a: number, g?: number, b?: number, alpha = 0) {
    if (g === undefined) {
      const hex = a | 0;
      this.r = ((hex >> 16) & 255) / 255.0;
      this.g = ((hex >> 8) & 255) / 255.0;
      this.b = (hex & 255) / 255.0;
      this.a = (hex >> 24) / 255.0; // 照原样：有符号右移，0x80000000 以上的 alpha 会是负数
    } else {
      this.r = a;
      this.g = g;
      this.b = b!;
      this.a = alpha;
    }
  }

  add(val: number, modifyAlpha: boolean): void {
    this.r += val;
    this.g += val;
    this.b += val;
    if (modifyAlpha) this.a += val;
    this.sanitize();
  }

  mul(val: number, modifyAlpha: boolean): void {
    this.r *= val;
    this.g *= val;
    this.b *= val;
    if (modifyAlpha) this.a *= val;
    this.sanitize();
  }

  private sanitize(): void {
    this.r = Color4.range(this.r);
    this.g = Color4.range(this.g);
    this.b = Color4.range(this.b);
    this.a = Color4.range(this.a);
  }

  private static range(v: number): number {
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    return v;
  }
}
