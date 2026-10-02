/**
 * 1:1 移植自 src/client/MouseHandler.h 与 MouseHandler.cpp：每帧从转向输入取一次转动量（xd、yd）。
 * ADAPTED(Platform)：grab()、release() 里的 glfwSetInputMode(GLFW_CURSOR_DISABLED / NORMAL) 改为调用平台挂上来的 pointer lock 钩子
 *   （apps/web 的 DomInput 负责挂上）。浏览器只允许在用户手势里请求 pointer lock，所以 DomInput 在 mousedown 里也会请求一次。
 */
import type { ITurnInput } from './player/input/ITurnInput';

export interface PointerLockHooks {
  grab(): void;
  release(): void;
}

export class MouseHandler {
  /** ADAPTED(Platform)：平台的 pointer lock；没有挂上时（单测、无头）什么都不做 */
  static platformHooks: PointerLockHooks | null = null;

  xd = 0; // C++ 未初始化，grab() 时置 0
  yd = 0;
  private toSkip = 0;
  private _turnInput: ITurnInput | null;

  constructor(turnInput: ITurnInput | null = null) {
    this._turnInput = turnInput;
  }

  setTurnInput(turnInput: ITurnInput | null): void {
    this._turnInput = turnInput;
  }

  grab(): void {
    this.xd = 0;
    this.yd = 0;
    // ADAPTED(Platform): glfwSetInputMode(glfwGetCurrentContext(), GLFW_CURSOR, GLFW_CURSOR_DISABLED);
    MouseHandler.platformHooks?.grab();
  }

  release(): void {
    // ADAPTED(Platform): glfwSetInputMode(glfwGetCurrentContext(), GLFW_CURSOR, GLFW_CURSOR_NORMAL);
    MouseHandler.platformHooks?.release();
  }

  poll(): void {
    if (this._turnInput !== null) {
      const td = this._turnInput.getTurnDelta();
      this.xd = td.x;
      this.yd = td.y;
    }
  }
}
