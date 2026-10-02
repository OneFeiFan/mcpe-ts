// 1:1 移植自 src/client/PixelCalc.h：毫米与像素的换算（触屏按钮大小用）
export class PixelCalc {
  private _pixelsPerMillimeter = 1;
  private _millimetersPerPixel = 1;

  constructor(pixelsPerMillimeter = 1) {
    this.setPixelsPerMillimeter(pixelsPerMillimeter);
  }

  millimetersToPixels(mm: number): number {
    return mm * this._pixelsPerMillimeter;
  }

  pixelsToMillimeters(pp: number): number {
    return pp * this._millimetersPerPixel;
  }

  setPixelsPerMillimeter(pixelsPerMillimeter: number): void {
    this._pixelsPerMillimeter = pixelsPerMillimeter;
    this._millimetersPerPixel = 1.0 / this._pixelsPerMillimeter;
  }

  /** C++ 的按值拷贝 */
  assign(rhs: PixelCalc): this {
    this._pixelsPerMillimeter = rhs._pixelsPerMillimeter;
    this._millimetersPerPixel = rhs._millimetersPerPixel;
    return this;
  }
}
