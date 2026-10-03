import { MouseAction, MouseDevice } from './Mouse'; // 请根据实际路径调整

// 对应 C++ 中的 typedef MouseDevice TouchPointer;
export type TouchPointer = MouseDevice;

export class Multitouch {
  public static readonly MAX_POINTERS = 12;

  // 使用 Uint8Array 替代 boolean 数组，0=false, 1=true，最大限度压榨性能
  private static _wasPressed: Uint8Array = new Uint8Array(Multitouch.MAX_POINTERS);
  private static _wasReleased: Uint8Array = new Uint8Array(Multitouch.MAX_POINTERS);
  private static _wasPressedThisUpdate: Uint8Array = new Uint8Array(Multitouch.MAX_POINTERS);
  private static _wasReleasedThisUpdate: Uint8Array = new Uint8Array(Multitouch.MAX_POINTERS);

  private static _pointers: TouchPointer[] = [];
  private static _inputs: MouseAction[] = [];

  // 使用 Int32Array 替代 C++ 的 int 数组
  private static _activePointerList: Int32Array = new Int32Array(Multitouch.MAX_POINTERS);
  private static _activePointerCount: number = 0;

  private static _activePointerThisUpdateList: Int32Array = new Int32Array(Multitouch.MAX_POINTERS);
  private static _activePointerThisUpdateCount: number = 0;

  private static _index: number = -1;

  // TS 的静态初始化块，等效于 C++ 的静态成员自动构造
  static {
    for (let i = 0; i < Multitouch.MAX_POINTERS; ++i) {
      Multitouch._pointers.push(new MouseDevice());
    }
  }

  public static isPointerDown(pointerId: number): boolean {
    return this.g(pointerId).isButtonDown(1);
  }

  public static getFirstActivePointerIdEx(): number {
    for (let i = 0; i < this.MAX_POINTERS; ++i) {
      if (this._pointers[i]!.isButtonDown(1)) return i;
    }
    for (let i = 0; i < this.MAX_POINTERS; ++i) {
      if (this._wasReleased[i] === 1) return i;
    }
    return -1;
  }

  public static getFirstActivePointerIdExThisUpdate(): number {
    for (let i = 0; i < this.MAX_POINTERS; ++i) {
      if (this._pointers[i]!.isButtonDown(1)) return i;
    }
    for (let i = 0; i < this.MAX_POINTERS; ++i) {
      if (this._wasReleasedThisUpdate[i] === 1) return i;
    }
    return -1;
  }

  // 完美模拟 C++ 的双重指针传递: getActivePointerIds(const int** const ids)
  public static getActivePointerIds(outRef: { ids: Int32Array | null }): number {
    outRef.ids = this._activePointerList;
    return this._activePointerCount;
  }

  public static getActivePointerIdsThisUpdate(outRef: { ids: Int32Array | null }): number {
    outRef.ids = this._activePointerThisUpdateList;
    return this._activePointerThisUpdateCount;
  }

  public static commit(): void {
    this._activePointerCount = 0;
    this._activePointerThisUpdateCount = 0;
    for (let i = 0; i < this.MAX_POINTERS; ++i) {
      const isDown = this._pointers[i]!.isButtonDown(1);
      if (isDown) {
        this._activePointerList[this._activePointerCount++] = i;
        this._activePointerThisUpdateList[this._activePointerThisUpdateCount++] = i;
      } else if (this._wasReleased[i] === 1) {
        this._activePointerThisUpdateList[this._activePointerThisUpdateCount++] = i;
      }
    }
  }

  public static getX(pointerId: number): number {
    return this.g(pointerId).getX();
  }
  public static getY(pointerId: number): number {
    return this.g(pointerId).getY();
  }

  public static getDX(pointerId: number): number {
    return this.g(pointerId).getDX();
  }
  public static getDY(pointerId: number): number {
    return this.g(pointerId).getDY();
  }

  public static wasFirstMovement(pointerId: number): boolean {
    return this.g(pointerId).wasFirstMovement();
  }

  public static isPressed(pointerId: number): boolean {
    return this._wasPressed[this._clampPointerId(pointerId)] === 1;
  }

  public static isReleased(pointerId: number): boolean {
    return this._wasReleased[this._clampPointerId(pointerId)] === 1;
  }

  public static isPressedThisUpdate(pointerId: number): boolean {
    return this._wasPressedThisUpdate[this._clampPointerId(pointerId)] === 1;
  }

  public static isReleasedThisUpdate(pointerId: number): boolean {
    return this._wasReleasedThisUpdate[this._clampPointerId(pointerId)] === 1;
  }

  public static reset(): void {
    this._inputs.length = 0;
    this._index = -1;

    for (let i = 0; i < this.MAX_POINTERS; ++i) {
      this.g(i).reset();
      this._wasPressed[i] = 0;
      this._wasReleased[i] = 0;
    }
  }

  public static resetThisUpdate(): void {
    // 对于 TypedArray，使用 fill(0) 是最快的清空方式，远快于 for 循环
    this._wasPressedThisUpdate.fill(0);
    this._wasReleasedThisUpdate.fill(0);
  }

  public static next(): boolean {
    if (this._index + 1 >= this._inputs.length) {
      return false;
    }
    ++this._index;
    return true;
  }

  public static rewind(): void {
    this._index = -1;
  }

  public static getEvent(): MouseAction {
    return this._inputs[this._index]!;
  }

  public static feed(
    actionButtonId: number,
    buttonData: number,
    x: number,
    y: number,
    pointerId: number,
  ): void {
    pointerId = this._clampPointerId(pointerId);

    this._inputs.push(new MouseAction(actionButtonId, buttonData, x, y, pointerId));
    this.g(pointerId).feed(actionButtonId, buttonData, x, y);

    if (actionButtonId > 0) {
      if (buttonData === MouseAction.DATA_DOWN) {
        this._wasPressed[pointerId] = 1;
        this._wasPressedThisUpdate[pointerId] = 1;
      } else if (buttonData === MouseAction.DATA_UP) {
        this._wasReleased[pointerId] = 1;
        this._wasReleasedThisUpdate[pointerId] = 1;
      }
    }
  }

  public static getMaxPointers(): number {
    return this.MAX_POINTERS;
  }

  private static g(pointerId: number): TouchPointer {
    return this._pointers[this._clampPointerId(pointerId)]!;
  }

  private static _clampPointerId(p: number): number {
    if (p < 0) return p;
    if (p >= this.MAX_POINTERS) return this.MAX_POINTERS - 1;
    return p;
  }
}
