/**
 * 1:1 移植自 src/App.h（S6）：应用的生命周期骨架，NinecraftApp（S9）继承它。
 * ADAPTED(Web)：AppContext 里的 EGLDisplay、EGLContext、EGLSurface 在浏览器里不存在，只保留 platform 与 doRender；
 *   swapBuffers 不做事——浏览器在每一帧回调结束后自动呈现画布。
 * C++ 的 init(AppContext&) 是 public、init() 是 protected virtual，按约定把后者写成 init$0()；子类重写 C++ 的 init() 时重写 init$0。
 */
import type { AppPlatform } from './AppPlatform';

// ADAPTED(Web): 去掉 EGLDisplay、EGLContext、EGLSurface
export interface AppContext {
  platform: AppPlatform | null;
  doRender: boolean;
}

export abstract class App {
  private _inited = false;
  private _finished = false;
  private _context: AppContext = { platform: null, doRender: true };

  init(c: AppContext): void {
    this._context = c;
    this.init$0();
    this._inited = true;
  }

  isInited(): boolean {
    return this._inited;
  }

  platform(): AppPlatform | null {
    return this._context.platform;
  }

  onGraphicsReset(c: AppContext): void {
    this._context = c;
    this.onGraphicsReset$0();
  }

  audioEngineOn(): void {}

  audioEngineOff(): void {}

  destroy(): void {}

  loadState(_state: unknown, _stateSize: number): void {}

  saveState(): boolean {
    return false;
  }

  // ADAPTED(Web): C++ 调用 eglSwapBuffers；浏览器自动呈现
  swapBuffers(): void {}

  draw(): void {}

  update(): void {}

  setSize(_width: number, _height: number): void {}

  quit(): void {
    this._finished = true;
  }

  wantToQuit(): boolean {
    return this._finished;
  }

  handleBack(_isDown: boolean): boolean {
    return false;
  }

  /** C++ protected virtual void init() */
  protected init$0(): void {}

  /** C++ protected virtual void onGraphicsReset() = 0 */
  protected abstract onGraphicsReset$0(): void;
}
