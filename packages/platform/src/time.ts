// 1:1 移植自 src/platform/time.h 与 time.cpp
import { LOGI } from './log.js';

// 平台适配：C++ 的 getTimeS()/getTimeMs() 以程序启动时刻为 0（time.cpp 里减去 _t_start），
// Windows 用 QueryPerformanceCounter。这里用单调的 performance.now()，同样以模块加载时刻为 0。
const T0 = performance.now();

const f = Math.fround;

/**
 * C++ 返回 float（Linux 版：`(float)(now.tv_sec - _t_start) + now.tv_usec / 1000000.0f`）。
 * 审核：以前返回 double。改成 float 后，长时间运行时的计时粒度与原版相同（运行 1 小时后约 0.24 毫秒，1 天后约 8 毫秒）。
 */
export function getTimeS(): number {
  return f((performance.now() - T0) / 1000.0);
}

/** C++：(int)(getTimeS() * 1000.0f)——float 乘法再截断 */
export function getTimeMs(): number {
  return Math.trunc(f(getTimeS() * 1000.0));
}

/// Returns a platform dependent time in seconds
export function getRawTimeS(): number {
  return Math.floor(Date.now() / 1000.0);
}

export function getEpochTimeS(): number {
  return Math.floor(Date.now() / 1000.0);
}

export const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Stopwatch {
  private _st: number;
  private _tt: number;
  private _last: number;
  private _max: number;
  private _count: number;
  private _printcounter: number;

  public constructor() {
    // 在构造函数中显式初始化所有属性，有利于 V8 引擎构建一致的隐藏类 (Hidden Classes)
    this._st = -1;
    this._tt = 0;
    this._last = 0;
    this._max = 0;
    this._count = 0;
    this._printcounter = 0;
  }

  public start(): void {
    this._st = getTimeS();
  }

  /** Returns the total number of seconds and stops the clock */
  public stop(): number {
    if (this._st === -1) return 0;
    this._last = f(getTimeS() - this._st);
    if (this._last > this._max) this._max = this._last;
    this._tt = f(this._tt + this._last);
    this._st = -1;
    ++this._count;
    return this._tt;
  }

  /* Returns the total number of seconds, but wont stop the clock */
  public stopContinue(): number {
    if (this._st === -1) return 0;
    const now = getTimeS();
    this._last = f(now - this._st);
    if (this._last > this._max) this._max = this._last;
    this._tt = f(this._tt + this._last);
    this._st = now;
    ++this._count;
    return this._tt;
  }

  public getLast(): number {
    return this._last;
  }
  public getTotal(): number {
    return this._tt;
  }
  public getMax(): number {
    return this._max;
  }
  public getCount(): number {
    return this._count;
  }

  public reset(): void {
    this._st = -1;
    this._tt = 0;
    this._max = 0;
  }

  public printEvery(n: number, prepend: string = ''): void {
    if (++this._printcounter >= n) {
      this._printcounter = 0;
      this.print(prepend);
    }
  }

  public print(prepend: string = ''): void {
    if (!this._count) return;
    LOGI(
      `${prepend}\tTime (AVGms/LTs(MAXs)/TTs, C) : ${((1000.0 * this._tt) / this._count).toFixed(3)}/${this._last.toFixed(6)}(${this._max.toFixed(6)})/${this._tt.toFixed(4)}, ${this._count}`,
    );
  }
}

export class SwStartStopper {
  private _stopwatch: Stopwatch;
  public constructor(stopwatch: Stopwatch) {
    this._stopwatch = stopwatch;
    this._stopwatch.start();
  }
  public [Symbol.dispose](): void {
    this._stopwatch.stop();
  }
}

export class SwStopper {
  private _stopwatch: Stopwatch;
  public constructor(stopwatch: Stopwatch) {
    this._stopwatch = stopwatch;
  }
  public [Symbol.dispose](): void {
    this._stopwatch.stop();
  }
}

export class StopwatchHandler {
  private _map: Map<string, Stopwatch>;
  private _printcounter: number;

  public constructor() {
    this._map = new Map<string, Stopwatch>();
    this._printcounter = 0;
  }

  public [Symbol.dispose](): void {
    this.clearAll();
  }

  public get(name: string): Stopwatch {
    // 移除了冗余的 !this._map 检查，提升性能
    let sw = this._map.get(name);
    if (!sw) {
      sw = new Stopwatch();
      this._map.set(name, sw);
    }
    return sw;
  }

  public clear(name: string): void {
    this._map.delete(name);
  }

  public clearAll(): void {
    this._map.clear();
  }

  /** C++ 的 std::map 按键（字节序）有序遍历；JS Map 是插入顺序，这里先排序（审核） */
  public print(): void {
    for (const name of [...this._map.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      this._map.get(name)!.print(name);
    }
  }

  public printEvery(n: number): void {
    if (++this._printcounter >= n) {
      this._printcounter = 0;
      this.print();
    }
  }
}

export class StopwatchNLast extends Stopwatch {
  private readonly n: number;
  private k: number;
  private t: Float32Array; // C++：float* t
  private sum: number;

  public constructor(numMeasurements: number) {
    super();
    this.n = numMeasurements;
    this.k = 0;
    this.sum = 0;
    this.t = new Float32Array(this.n);
  }

  public override stop(): number {
    const total = super.stop();
    const curr = super.getLast();

    // [已修复] 修正了原 C++ 代码中的 Ring Buffer 游标替换逻辑
    const toDelete = this.t[this.k]!;
    this.t[this.k] = curr;
    if (++this.k >= this.n) this.k = 0;

    this.sum = f(this.sum + f(curr - toDelete));

    return total;
  }

  public override print(prepend: string = ''): void {
    // 修复了 JS 环境下 %f 占位符无效的问题
    LOGI(
      `${prepend}\tTime (AVGms for the last ${this.n} runs): ${((1000.0 * this.sum) / this.n).toFixed(6)} (Max: ${(1000.0 * super.getMax()).toFixed(6)})\n`,
    );
  }
}
