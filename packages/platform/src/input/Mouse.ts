//
// MouseAction
//
export class MouseAction {
  public static readonly ACTION_MOVE = 0;
  public static readonly ACTION_LEFT = 1;
  public static readonly ACTION_RIGHT = 2;
  public static readonly ACTION_WHEEL = 3;

  public static readonly DATA_UP = 0;
  public static readonly DATA_DOWN = 1;

  public x: number;
  public y: number;
  public dx: number;
  public dy: number;
  public action: number; // 对应 C++ 的 char
  public data: number; // 对应 C++ 的 char
  public pointerId: number; // 对应 C++ 的 char

  // 使用可选参数合并 C++ 的两个构造函数
  constructor(
    actionButtonId: number,
    buttonData: number,
    x: number,
    y: number,
    dxOrPointerId: number,
    dy: number = 0,
    pointerId: number = 0,
  ) {
    this.action = actionButtonId;
    this.data = buttonData;
    this.x = x;
    this.y = y;

    // 模拟 C++ 构造函数的重载逻辑
    // 如果传入了 5 个参数，代表调用的是 MouseAction(action, data, x, y, pointerId)
    if (arguments.length === 5) {
      this.dx = 0;
      this.dy = 0;
      this.pointerId = dxOrPointerId;
    } else {
      // 如果传入 >= 6 个参数，代表调用的是 MouseAction(action, data, x, y, dx, dy, pointerId)
      this.dx = dxOrPointerId;
      this.dy = dy;
      this.pointerId = pointerId;
    }
  }

  public isButton(): boolean {
    return this.action === MouseAction.ACTION_LEFT || this.action === MouseAction.ACTION_RIGHT;
  }
}

//
// MouseDevice
//
export class MouseDevice {
  public static readonly MAX_NUM_BUTTONS = 4;
  private static readonly DELTA_NOTSET = -9999;

  private _index: number;
  private _x: number;
  private _y: number;
  private _dx: number;
  private _dy: number;
  private _xOld: number;
  private _yOld: number;

  // 使用 Uint8Array 替代 char _buttonStates[MAX_NUM_BUTTONS]
  // 默认初始化为 0，省去了 C++ 构造函数中的 for 循环初始化
  private _buttonStates: Uint8Array = new Uint8Array(MouseDevice.MAX_NUM_BUTTONS);

  private _inputs: MouseAction[] = [];
  private _firstMovementType: number;

  constructor() {
    this._index = -1;
    this._x = 0;
    this._xOld = 0;
    this._y = 0;
    this._yOld = 0;
    this._dx = MouseDevice.DELTA_NOTSET;
    this._dy = MouseDevice.DELTA_NOTSET;
    this._firstMovementType = 0;
  }

  public reset(): void {
    this._index = -1;
    // 使用 length = 0 极速清空数组
    this._inputs.length = 0;
    this._buttonStates[MouseAction.ACTION_WHEEL] = 0;
  }

  public getButtonState(buttonId: number): number {
    if (buttonId < MouseAction.ACTION_LEFT || buttonId > MouseAction.ACTION_WHEEL) {
      return 0;
    }
    return this._buttonStates[buttonId]!;
  }

  public isButtonDown(buttonId: number): boolean {
    return this.getButtonState(buttonId) !== 0;
  }

  /// Was the current movement the first movement after mouse down?
  public wasFirstMovement(): boolean {
    return this._firstMovementType === 1;
  }

  public getX(): number {
    return this._x;
  }
  public getY(): number {
    return this._y;
  }

  public getDX(): number {
    return MouseDevice.DELTA_NOTSET !== this._dx ? this._dx : this._x - this._xOld;
  }
  public getDY(): number {
    return MouseDevice.DELTA_NOTSET !== this._dy ? this._dy : this._y - this._yOld;
  }

  public reset2(): void {
    this._xOld = this._x;
    this._yOld = this._y;
    this._dx = this._dy = MouseDevice.DELTA_NOTSET;
  }

  public next(): boolean {
    if (this._index + 1 >= this._inputs.length) {
      return false;
    }
    ++this._index;
    return true;
  }

  public rewind(): void {
    this._index = -1;
  }

  public getEventButtonState(): boolean {
    // 使用 ! 断言
    return this._inputs[this._index]!.data === MouseAction.DATA_DOWN;
  }

  public getEventButton(): number {
    return this._inputs[this._index]!.action;
  }

  public getEvent(): MouseAction {
    return this._inputs[this._index]!;
  }

  // 利用 TS 函数重载定义接口
  public feed(actionButtonId: number, buttonData: number, x: number, y: number): void;
  public feed(
    actionButtonId: number,
    buttonData: number,
    x: number,
    y: number,
    dx: number,
    dy: number,
  ): void;
  // 实际实现
  public feed(
    actionButtonId: number,
    buttonData: number,
    x: number,
    y: number,
    dx?: number,
    dy?: number,
  ): void {
    const actualDx = dx !== undefined ? dx : 0;
    const actualDy = dy !== undefined ? dy : 0;

    // pointerId 默认为 0
    this._inputs.push(new MouseAction(actionButtonId, buttonData, x, y, actualDx, actualDy, 0));

    if (actionButtonId !== MouseAction.ACTION_MOVE) {
      this._buttonStates[actionButtonId] = buttonData;

      if (actionButtonId === MouseAction.ACTION_LEFT) {
        this._firstMovementType = -1;
      }
    } else {
      if (this._dx === MouseDevice.DELTA_NOTSET) {
        this._dx = this._dy = 0;
      }
      this._dx += actualDx;
      this._dy += actualDy;

      if (this._firstMovementType === -1) {
        this._firstMovementType = 1;
      } else {
        this._firstMovementType = 0;
      }
    }

    this._xOld = this._x;
    this._yOld = this._y;
    this._x = x;
    this._y = y;
  }
}

//
// Mouse - static class wrapping a MouseDevice
//
export class Mouse {
  private static _instance: MouseDevice = new MouseDevice();

  public static reset(): void {
    this._instance.reset();
  }

  public static getButtonState(buttonId: number): number {
    return this._instance.getButtonState(buttonId);
  }

  public static isButtonDown(buttonId: number): boolean {
    return this._instance.isButtonDown(buttonId);
  }

  public static getX(): number {
    return this._instance.getX();
  }
  public static getY(): number {
    return this._instance.getY();
  }

  public static getDX(): number {
    return this._instance.getDX();
  }
  public static getDY(): number {
    return this._instance.getDY();
  }

  public static reset2(): void {
    this._instance.reset2();
  }

  public static next(): boolean {
    return this._instance.next();
  }
  public static rewind(): void {
    this._instance.rewind();
  }

  public static getEventButtonState(): boolean {
    return this._instance.getEventButtonState();
  }

  public static getEventButton(): number {
    return this._instance.getEventButton();
  }

  public static getEvent(): MouseAction {
    return this._instance.getEvent();
  }

  // 函数重载
  public static feed(actionButtonId: number, buttonData: number, x: number, y: number): void;
  public static feed(
    actionButtonId: number,
    buttonData: number,
    x: number,
    y: number,
    dx: number,
    dy: number,
  ): void;
  public static feed(
    actionButtonId: number,
    buttonData: number,
    x: number,
    y: number,
    dx?: number,
    dy?: number,
  ): void {
    if (dx !== undefined && dy !== undefined) {
      this._instance.feed(actionButtonId, buttonData, x, y, dx, dy);
    } else {
      this._instance.feed(actionButtonId, buttonData, x, y);
    }
  }
}
