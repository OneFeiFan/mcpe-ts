// 1:1 移植自 src/world/level/GrassColor.h/.cpp（S2 前置，GrassTile 要用）。
// 自由档：只影响颜色，按 JS 数值计算。pixels 是 Textures::loadTexturePixels 得到的 ARGB 像素（256×256）。
export class GrassColor {
  static useTint = true; // 静态初值 true；Minecraft::init 按选项 foliagetint 改写
  private static pixels: Int32Array | null = null;

  static setUseTint(value: boolean): void {
    GrassColor.useTint = value;
  }

  static init(p: Int32Array): void {
    GrassColor.pixels = p;
  }

  static get(temp: number, rain: number): number {
    rain *= temp;
    const x = ((1 - temp) * 255) | 0;
    const y = ((1 - rain) * 255) | 0;
    return GrassColor.pixels![(y << 8) | x]!;
  }
}
