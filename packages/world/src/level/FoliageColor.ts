// 1:1 移植自 src/world/level/FoliageColor.h/.cpp（S2 前置，LeafTile 与 LeafTileItem 要用）。
// 自由档：只影响颜色，按 JS 数值计算。
export class FoliageColor {
  static useTint = true;
  private static pixels: Int32Array | null = null;

  static setUseTint(value: boolean): void {
    FoliageColor.useTint = value;
  }

  static init(p: Int32Array): void {
    FoliageColor.pixels = p;
  }

  static get(temp: number, rain: number): number {
    rain *= temp;
    const x = ((1 - temp) * 255) | 0;
    const y = ((1 - rain) * 255) | 0;
    return FoliageColor.pixels![(y << 8) | x]!;
  }

  static getEvergreenColor(): number {
    return 0x619961;
  }

  static getBirchColor(): number {
    return 0x80a755;
  }

  static getDefaultColor(): number {
    return 0x48b518;
  }
}
