const f = Math.fround;
// 1:1 移植自 src/client/player/input/touchscreen/TouchAreaModel.h 里的 IArea 与 RectangleArea（S13 阶段 C：ScrollingPane、InventoryPane 用到）。
// 同一头文件里的 TouchAreaModel、CircleArea 等触屏输入部分属于触屏兼容，暂不移植（DEFERRED(Touch)）。
export abstract class IArea {
  deleteMe = true;
  abstract isInside(x: number, y: number): boolean;
}

export class RectangleArea extends IArea {
  _x0: number;
  _x1: number;
  _y0: number;
  _y1: number;

  constructor(x0: number, y0: number, x1: number, y1: number) {
    super();
    this._x0 = f(x0);
    this._x1 = f(x1);
    this._y0 = f(y0);
    this._y1 = f(y1);
  }

  isInside(x: number, y: number): boolean {
    return x >= this._x0 && x <= this._x1 && y >= this._y0 && y <= this._y1;
  }

  centerX(): number {
    return this._x0 + (this._x1 - this._x0) * 0.5;
  }

  centerY(): number {
    return this._y0 + (this._y1 - this._y0) * 0.5;
  }

  /** C++ 的按值复制（RectangleArea bboxArea(area)） */
  copy(): RectangleArea {
    return new RectangleArea(this._x0, this._y0, this._x1, this._y1);
  }
}
