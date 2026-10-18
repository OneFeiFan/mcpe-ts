// 1:1 移植自 src/platform/input/Keyboard.h 与 Keyboard.cpp
export class KeyboardAction {
  public static readonly KEYUP = 0;
  public static readonly KEYDOWN = 1;

  public key: number;
  public state: number;

  constructor(keyCode: number, state: number) {
    this.key = keyCode;
    this.state = state;
  }
}

export class Keyboard {
  public static readonly KEY_A = 65;
  public static readonly KEY_B = 66;
  public static readonly KEY_C = 67;
  public static readonly KEY_D = 68;
  public static readonly KEY_E = 69;
  public static readonly KEY_F = 70;
  public static readonly KEY_G = 71;
  public static readonly KEY_H = 72;
  public static readonly KEY_I = 73;
  public static readonly KEY_J = 74;
  public static readonly KEY_K = 75;
  public static readonly KEY_L = 76;
  public static readonly KEY_M = 77;
  public static readonly KEY_N = 78;
  public static readonly KEY_O = 79;
  public static readonly KEY_P = 80;
  public static readonly KEY_Q = 81;
  public static readonly KEY_R = 82;
  public static readonly KEY_S = 83;
  public static readonly KEY_T = 84;
  public static readonly KEY_U = 85;
  public static readonly KEY_V = 86;
  public static readonly KEY_W = 87;
  public static readonly KEY_X = 88;
  public static readonly KEY_Y = 89;
  public static readonly KEY_Z = 90;

  public static readonly KEY_BACKSPACE = 8;
  public static readonly KEY_TAB = 9;
  public static readonly KEY_RETURN = 13;

  public static readonly KEY_F1 = 112;
  public static readonly KEY_F2 = 113;
  public static readonly KEY_F3 = 114;
  public static readonly KEY_F4 = 115;
  public static readonly KEY_F5 = 116;
  public static readonly KEY_F6 = 117;
  public static readonly KEY_F7 = 118;
  public static readonly KEY_F8 = 119;
  public static readonly KEY_F9 = 120;
  public static readonly KEY_F10 = 121;
  public static readonly KEY_F11 = 122;
  public static readonly KEY_F12 = 123;

  public static readonly KEY_ESCAPE = 27;
  public static readonly KEY_SPACE = 32;
  public static readonly KEY_LSHIFT = 10;
  public static readonly KEY_LEFT_CTRL = 232;

  // 使用 Uint8Array 替代 int _states[256]，初始化默认全为0，性能极佳
  private static _states: Uint8Array = new Uint8Array(256);
  private static _inputs: KeyboardAction[] = [];

  // TS 中没有 char 类型，统一使用 string (单字符) 存储
  private static _inputText: string[] = [];

  private static _index: number = -1;
  private static _textIndex: number = -1;

  public static isKeyDown(keyCode: number): boolean {
    return this._states[keyCode] === KeyboardAction.KEYDOWN;
  }

  public static reset(): void {
    // 使用 length = 0 清空数组是最快的方式，不会产生新的内存分配
    this._inputs.length = 0;
    this._inputText.length = 0;
    this._index = -1;
    this._textIndex = -1;
  }

  /** C++ 的 keyCode 是 unsigned char：超过 255 的值按低 8 位存（审核） */
  public static feed(keyCode: number, state: number): void {
    keyCode &= 0xff;
    this._inputs.push(new KeyboardAction(keyCode, state));
    this._states[keyCode] = state;
  }

  public static feedText(character: string): void {
    this._inputText.push(character);
  }

  public static next(): boolean {
    if (this._index + 1 >= this._inputs.length) {
      return false;
    }
    ++this._index;
    return true;
  }

  public static nextTextChar(): boolean {
    if (this._textIndex + 1 >= this._inputText.length) {
      return false;
    }
    ++this._textIndex;
    return true;
  }

  public static rewind(): void {
    this._index = -1;
    this._textIndex = -1;
  }

  public static getEventKey(): number {
    // 使用 ! 断言数组不会越界返回 undefined
    return this._inputs[this._index]!.key;
  }

  public static getEventKeyState(): number {
    return this._inputs[this._index]!.state;
  }

  public static getChar(): string {
    return this._inputText[this._textIndex]!;
  }

  public static getKeyName(key: number): string {
    switch (key) {
      case this.KEY_A:
        return 'A';
      case this.KEY_B:
        return 'B';
      case this.KEY_C:
        return 'C';
      case this.KEY_D:
        return 'D';
      case this.KEY_E:
        return 'E';
      case this.KEY_F:
        return 'F';
      case this.KEY_G:
        return 'G';
      case this.KEY_H:
        return 'H';
      case this.KEY_I:
        return 'I';
      case this.KEY_J:
        return 'J';
      case this.KEY_K:
        return 'K';
      case this.KEY_L:
        return 'L';
      case this.KEY_M:
        return 'M';
      case this.KEY_N:
        return 'N';
      case this.KEY_O:
        return 'O';
      case this.KEY_P:
        return 'P';
      case this.KEY_Q:
        return 'Q';
      case this.KEY_R:
        return 'R';
      case this.KEY_S:
        return 'S';
      case this.KEY_T:
        return 'T';
      case this.KEY_U:
        return 'U';
      case this.KEY_V:
        return 'V';
      case this.KEY_W:
        return 'W';
      case this.KEY_X:
        return 'X';
      case this.KEY_Y:
        return 'Y';
      case this.KEY_Z:
        return 'Z';
      case this.KEY_BACKSPACE:
        return 'Backspace';
      case this.KEY_RETURN:
        return 'Return';
      case this.KEY_F1:
        return 'F1';
      case this.KEY_F2:
        return 'F2';
      case this.KEY_F3:
        return 'F3';
      case this.KEY_F4:
        return 'F4';
      case this.KEY_F5:
        return 'F5';
      case this.KEY_F6:
        return 'F6';
      case this.KEY_F7:
        return 'F7';
      case this.KEY_F8:
        return 'F8';
      case this.KEY_F9:
        return 'F9';
      case this.KEY_F10:
        return 'F10';
      case this.KEY_F11:
        return 'F11';
      case this.KEY_F12:
        return 'F12';
      case this.KEY_ESCAPE:
        return 'Esc';
      case this.KEY_SPACE:
        return 'Space';
      case this.KEY_LSHIFT:
        return 'Left Shift';
      default:
        return 'Unknown';
    }
  }
}
