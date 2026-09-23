// log.ts

export type LogLevel = "V" | "I" | "W" | "E";

export type LogSink = (level: LogLevel, ...args: unknown[]) => void;

export interface LogOptions {
  /**
   * 发布模式：为 true 时所有日志静默。
   * 对应原 C 宏里的 PUBLISH / ANDROID_PUBLISH。
   * @default false
   */
  publish?: boolean;
  /**
   * 调试模式：只影响 LOGVV。
   * 对应原 C 宏里的 _DEBUG。
   * @default false
   */
  debug?: boolean;
  /**
   * 自定义输出。默认为按级别使用 console.log / warn / error。
   */
  sink?: LogSink;
  /**
   * 是否在输出前加 [V]/[I]/[W]/[E] 前缀。默认 true。
   */
  prefix?: boolean;
}

export class Logger {
  private _publish: boolean;
  private _debug: boolean;
  private _sink: LogSink;

  constructor(opts: LogOptions = {}) {
    this._publish = opts.publish ?? false;
    this._debug = opts.debug ?? false;

    const usePrefix = opts.prefix ?? true;
    this._sink =
      opts.sink ??
      ((level, ...args) => {
        const consoleFn =
          level === "E"
            ? console.error
            : level === "W"
            ? console.warn
            : console.log;
        if (usePrefix) consoleFn(`[${level}]`, ...args);
        else consoleFn(...args);
      });
  }

  // ---- 配置 ----
  setPublish(v: boolean): this {
    this._publish = v;
    return this;
  }
  setDebug(v: boolean): this {
    this._debug = v;
    return this;
  }
  setSink(sink: LogSink): this {
    this._sink = sink;
    return this;
  }
  get publish(): boolean {
    return this._publish;
  }
  get debug(): boolean {
    return this._debug;
  }

  // ---- 内部写出 ----
  private write(level: LogLevel, args: unknown[]): void {
    if (this._publish) return;
    this._sink(level, ...args);
  }

  // ---- 各级别日志 ----
  v(...args: unknown[]): void {
    this.write("V", args);
  }
  i(...args: unknown[]): void {
    this.write("I", args);
  }
  w(...args: unknown[]): void {
    this.write("W", args);
  }
  e(...args: unknown[]): void {
    this.write("E", args);
  }

  /** 仅 debug 模式下输出，对应原来的 LOGVV */
  vv(...args: unknown[]): void {
    if (this._publish || !this._debug) return;
    this._sink("V", ...args);
  }
}

/** 默认单例 */
export const log = new Logger();

/** 一次性配置默认单例，对应原来在编译期定义 PUBLISH / _DEBUG */
export function configureLog(opts: Omit<LogOptions, "prefix">): void {
  if (opts.publish !== undefined) log.setPublish(opts.publish);
  if (opts.debug !== undefined) log.setDebug(opts.debug);
  if (opts.sink !== undefined) log.setSink(opts.sink);
}

// ---- 顶层函数，名称与 C 宏保持一致 ----

export const LOGV = (...args: unknown[]): void => log.v(...args);
export const LOGI = (...args: unknown[]): void => log.i(...args);
export const LOGW = (...args: unknown[]): void => log.w(...args);
export const LOGE = (...args: unknown[]): void => log.e(...args);
export const LOGVV = (...args: unknown[]): void => log.vv(...args);