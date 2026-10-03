/**
 * NEW（S8）：DOM 事件 → 分支的 Keyboard.feed、Mouse.feed、Multitouch.feed，对应 main_glfw.h 里的 GLFW 回调。
 *  - 键位：DOM 的 KeyboardEvent.code 映射到分支的 Keyboard 常量（与 transformKey 的结果相同，见手册 S8 的映射表）；
 *    与 GLFW 一样忽略按住不放产生的重复（e.repeat）；可打印字符另走 Keyboard.feedText（character_callback）。
 *  - 鼠标：pointer lock 状态下 mousemove 带上 movementX/Y（GLFW_CURSOR_DISABLED 分支），否则只给位置；
 *    左键另外喂给 Multitouch（指针 0）；滚轮按 GLFW 的符号（向上为正）。
 *  - pointer lock 必须在用户手势回调里同步请求，所以在 canvas 的 mousedown 里请求；MouseHandler.grab/release 经钩子调用这里。
 *  - ADAPTED(Web)：窗口失去焦点时补发已按下键的 KEYUP（浏览器收不到这些键的 keyup，GLFW 没有这个问题）；F11 交给浏览器。
 */
import { MouseHandler } from '@mcpe/client';
import { Keyboard, KeyboardAction, Mouse, MouseAction, Multitouch } from '@mcpe/platform';

export interface DomInputOptions {
  /** pointer lock 被解除时调用（S9：mc.releaseMouse()） */
  onPointerUnlock?: () => void;
  /** pointer lock 被浏览器批准时调用（S9：mc.grabMouse()） */
  onPointerLock?: () => void;
}

export class DomInput {
  private locked = false;
  private vx = 0; // 锁定时的虚拟光标位置（GLFW 在 CURSOR_DISABLED 下同样给出不受窗口限制的坐标）
  private vy = 0;
  private readonly down = new Set<number>();
  private readonly listeners: [EventTarget, string, EventListener][] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: DomInputOptions = {},
  ) {}

  /** KeyboardEvent.code → 分支的键值；不认识的键返回 -1 */
  static mapKey(code: string): number {
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3); // KeyA–KeyZ → 65–90
    if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5); // Digit0–9 → 48–57
    const f = /^F([1-9]|1[0-2])$/.exec(code);
    if (f) return 111 + Number(f[1]); // F1–F12 → 112–123（GLFW 键值 − 178）
    switch (code) {
      case 'Space':
        return Keyboard.KEY_SPACE; // 32
      case 'ShiftLeft':
        return Keyboard.KEY_LSHIFT; // 10
      case 'Escape':
        return Keyboard.KEY_ESCAPE; // 27
      case 'Enter':
        return Keyboard.KEY_RETURN; // 13
      case 'Backspace':
        return Keyboard.KEY_BACKSPACE; // 8
      case 'Tab':
        return Keyboard.KEY_TAB; // 9
      case 'ControlLeft':
        return Keyboard.KEY_LEFT_CTRL; // 232
      default:
        return -1;
    }
  }

  isLocked(): boolean {
    return this.locked;
  }

  attach(): void {
    const on = (
      t: EventTarget,
      type: string,
      fn: EventListener,
      opts?: AddEventListenerOptions,
    ) => {
      t.addEventListener(type, fn, opts);
      this.listeners.push([t, type, fn]);
    };
    on(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    on(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    on(window, 'blur', () => this.releaseAll());
    on(this.canvas, 'mousedown', (e) => this.onButton(e as MouseEvent, true));
    on(window, 'mouseup', (e) => this.onButton(e as MouseEvent, false));
    on(window, 'mousemove', (e) => this.onMove(e as MouseEvent));
    on(this.canvas, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    on(this.canvas, 'contextmenu', (e) => e.preventDefault());
    on(document, 'pointerlockchange', () => this.onLockChange());
    MouseHandler.platformHooks = {
      grab: () => this.requestLock(),
      release: () => {
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      },
    };
  }

  detach(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.listeners.length = 0;
    MouseHandler.platformHooks = null;
  }

  /** 由页面设置：当前是否允许点击时锁定指针（主页：没有打开界面时）。默认允许 */
  lockAllowed: () => boolean = () => true;

  private requestLock(): void {
    if (document.pointerLockElement !== this.canvas) {
      // 不在用户手势里时浏览器会拒绝；mousedown 里会再请求
      void Promise.resolve(this.canvas.requestPointerLock()).catch(() => {});
    }
  }

  /**
   * 一个 CSS 像素对应几个设备像素。
   *
   * 【为什么必须换算】浏览器给的鼠标坐标是 **CSS 像素**（相对画布的 clientX/Y），
   * 而游戏里的"屏幕尺寸"是 **设备像素**：`AppPlatform_web.getScreenWidth()` 返回 `canvas.width`，
   * 而 `main.ts` 里 `canvas.width = clientWidth * devicePixelRatio`（为了在高分屏上不糊）。
   * dpr ≠ 1 时两者差一个系数，鼠标就只能够到屏幕左上角的 **1/dpr** ——
   * 右下角那一大片按钮永远点不到（Windows 缩放 125% 就是 1/1.25，150% 就是 1/1.5）。
   *
   * 用 `canvas.width / rect.width` 而不是直接读 `devicePixelRatio`：它就是"一个 CSS 像素
   * 对应几个设备像素"的实测值，画布尺寸不是严格按 dpr 算的时候也不会跑偏。
   */
  private pixelScale(): number {
    const r = this.canvas.getBoundingClientRect();
    return r.width > 0 ? this.canvas.width / r.width : 1;
  }

  private pos(e: MouseEvent): [number, number] {
    if (this.locked) return [this.vx, this.vy];
    const r = this.canvas.getBoundingClientRect();
    const s = this.pixelScale();
    return [Math.round((e.clientX - r.left) * s), Math.round((e.clientY - r.top) * s)];
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    const key = DomInput.mapKey(e.code);
    if (key >= 0 && (key === Keyboard.KEY_SPACE || key === Keyboard.KEY_TAB || this.locked))
      e.preventDefault();
    if (isDown && e.key.length === 1) Keyboard.feedText(e.key); // character_callback（重复也会触发）
    if (e.repeat) return; // if(action == GLFW_REPEAT) return;
    if (key < 0) return;
    if (isDown) this.down.add(key);
    else this.down.delete(key);
    Keyboard.feed(key, isDown ? KeyboardAction.KEYDOWN : KeyboardAction.KEYUP);
  }

  // ADAPTED(Web): 窗口失焦时补发 KEYUP（浏览器收不到这些键的 keyup）
  private releaseAll(): void {
    for (const key of this.down) Keyboard.feed(key, KeyboardAction.KEYUP);
    this.down.clear();
  }

  private onMove(e: MouseEvent): void {
    if (this.locked) {
      // ADAPTED(Web): 锁定状态下 Chromium 偶尔会给出一个不真实的大位移（光标被移到锁定点时按旧位置算出的差，例如正好等于
      //   −(画布中心坐标)）；刚进入锁定时的第一个事件也可能如此。一次事件里移动超过画布宽或高的三分之一不是真实的手部动作，丢弃。
      const r = this.canvas.getBoundingClientRect();
      // 尖峰判据用 CSS 像素量（阈值说的是"手动了多少"，跟 dpr 无关）；累加进去的要是设备像素。
      const spike = Math.abs(e.movementX) > r.width / 3 || Math.abs(e.movementY) > r.height / 3;
      if (spike) return;
      const s = this.pixelScale();
      this.vx += e.movementX * s;
      this.vy += e.movementY * s;
      Mouse.feed(MouseAction.ACTION_MOVE, 0, this.vx, this.vy, e.movementX, e.movementY);
      Multitouch.feed(0, 0, this.vx, this.vy, 0);
      return;
    }
    const [x, y] = this.pos(e);
    Mouse.feed(MouseAction.ACTION_MOVE, 0, x, y);
    Multitouch.feed(0, 0, x, y, 0);
  }

  private onButton(e: MouseEvent, isDown: boolean): void {
    if (isDown && !this.locked && this.lockAllowed()) this.requestLock(); // 用户手势里同步请求（打开界面时不锁定：C++ 只在没有界面时点击才 grabMouse）
    const [x, y] = this.pos(e);
    const data = isDown ? MouseAction.DATA_DOWN : MouseAction.DATA_UP;
    if (e.button === 0) {
      Mouse.feed(MouseAction.ACTION_LEFT, data, x, y);
      Multitouch.feed(1, data, x, y, 0);
    } else if (e.button === 2) {
      Mouse.feed(MouseAction.ACTION_RIGHT, data, x, y);
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const [x, y] = this.pos(e);
    Mouse.feed(3, 0, x, y, 0, -Math.sign(e.deltaY)); // GLFW 的 yoffset：向上为正
  }

  private onLockChange(): void {
    const locked = document.pointerLockElement === this.canvas;
    if (locked && !this.locked) {
      // 锁定时把虚拟光标放到屏幕正中 —— 用**设备像素**，跟上面 pos()/onMove() 一个单位
      this.vx = Math.round(this.canvas.width / 2);
      this.vy = Math.round(this.canvas.height / 2);
    }
    const was = this.locked;
    this.locked = locked;
    if (!locked) this.opts.onPointerUnlock?.();
    // ADAPTED(Web): 浏览器异步批准锁定；批准时同步告诉游戏。C++ 只靠 tickInput 的“点击即 grabMouse”，
    //   而 tickInput 会丢弃比上次 tick 早 200ms 以上的鼠标事件，锁定过程中的一次卡顿就会让这次点击失效。
    else if (!was) this.opts.onPointerLock?.();
  }
}
