/**
 * 1:1 移植自 src/AppPlatform.h（S6）：平台接口的基类，默认实现照抄。网页版的 AppPlatform_web 在 S9 写（apps/web）。
 * 决策 D10：AppPlatform 依赖 client 的 TextureData，所以放在 client 包。
 * C++ 里注释掉的 UserInput、UserInputStatus 不移植；__APPLE__ 才有的纯虚 isSuperFast 不移植。
 */
import { TextureData } from './renderer/TextureData';

export type StringVector = string[];

export class BinaryBlob {
  data: Uint8Array | null;
  size: number;

  constructor();
  constructor(data: Uint8Array, size: number);
  constructor(data?: Uint8Array, size?: number) {
    this.data = data ?? null;
    this.size = size ?? -1;
  }
}

export class PlatformStringVars {
  static readonly DEVICE_BUILD_MODEL = 0;
}

export class AppPlatform {
  protected keyboardVisible = false;

  saveScreenshot(_filename: string, _glWidth: number, _glHeight: number): void {}

  loadTexture(_filename_: string, _textureFolder: boolean): TextureData {
    return new TextureData();
  }

  loadTextureFromMemory(_data: Uint8Array, _size: number): TextureData {
    return new TextureData();
  }

  playSound(_fn: string, _volume: number, _pitch: number): void {}

  hideCursor(_hide: boolean): void {}

  showDialog(_dialogId: number): void {}

  /** C++ 的两个重载：virtual createUserInput() 与非虚的 createUserInput(int dialogId)（先 showDialog 再调前者） */
  createUserInput(dialogId?: number): void {
    if (dialogId === undefined) {
      this.createDefaultUserInput();
      return;
    }
    this.showDialog(dialogId);
    this.createDefaultUserInput();
  }

  /** C++ virtual void createUserInput() */
  createDefaultUserInput(): void {}

  is_big_endian(): boolean {
    const u = new Uint32Array([0x01020304]);
    return new Uint8Array(u.buffer)[0] === 1;
  }

  getUserInputStatus(): number {
    return 0;
  }

  getUserInput(): StringVector {
    return [];
  }

  getDateString(_s: number): string {
    return '';
  }

  uploadPlatformDependentData(_id: number, _data: unknown): void {}

  readAssetFile(_filename: string): BinaryBlob {
    return new BinaryBlob();
  }

  _tick(): void {}

  getScreenWidth(): number {
    return 854;
  }

  getScreenHeight(): number {
    return 480;
  }

  getPixelsPerMillimeter(): number {
    return 10;
  }

  isNetworkEnabled(_onlyWifiAllowed: boolean): boolean {
    return true;
  }

  isPowerVR(): boolean {
    return false;
  }

  getKeyFromKeyCode(_keyCode: number, _metaState: number, _deviceId: number): number {
    return 0;
  }

  openURL(_url: string): void {}

  finish(): void {}

  supportsTouchscreen(): boolean {
    return false;
  }

  vibrate(_milliSeconds: number): void {}

  getPlatformStringVar(_stringId: number): string {
    return '<getPlatformStringVar NotImplemented>';
  }

  showKeyboard(): void {
    this.keyboardVisible = true;
  }

  hideKeyboard(): void {
    this.keyboardVisible = false;
  }

  isKeyboardVisible(): boolean {
    return this.keyboardVisible;
  }
}
