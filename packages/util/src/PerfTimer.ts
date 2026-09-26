/**
 * 1:1 移植自 src/util/PerfTimer.h 与 PerfTimer.cpp：分层性能计时。只记账，不读写任何游戏状态。
 *
 * 调用方式与 C++ 一致，三个宏写成同名函数，调用处照抄：
 *   TIMER_PUSH("tick");   TIMER_POP_PUSH("level");   TIMER_POP();
 *   PerfTimer.enabled = true;   PerfTimer.reset();   PerfTimer.getLog("root");
 * 引入：`import { TIMER_PUSH, TIMER_POP, TIMER_POP_PUSH, PerfTimer } from '@mcpe/util'`。
 * C++ 的嵌套类 PerfTimer::ResultField 在 TS 里是同文件导出的 ResultField（也可用 PerfTimer.ResultField 取到）。
 *
 * 按手册的三档规则属于“自由处理”：只记账，不进入世界状态。
 * 结构与算法与 C++ 相同（已用 tools/golden/harness_util.cpp 驱动参考源码核对），数值按 double 计算，
 * 不模拟 C++ 的 float——C++ 的 getTimeS 是自启动起的 float 秒数，运行越久越不准，这里没有这个问题。
 *  - enabled 为 false 时 push、pop、popPush、getLog 立即返回。enabled 只在 Minecraft::update 的帧末
 *    按 renderDebug 选项切换，此时所有区段都已结束。
 *  - getLog 每调用一次把全部累计值乘 0.999（指数衰减，显示的是平滑后的比例）。
 *  - getLog 对子路径算百分比时，分母用的是 root 的总时间（源码查了 itPath 却没有用），照原样保留。
 *  - reset() 只清空累计值，不清空栈。
 *
 * 与 C++ 不同的地方：
 *  - ADAPTED(Safety)：开启状态下对空栈 pop，C++ 是未定义行为（对空 vector 调 back()，通常崩溃）。
 *    这里忽略这次调用，并且只警告一次。
 *  - ADAPTED(Test)：stackDepth() 只给测试用，用来断言“一个用到计时宏的函数跑完后栈深度回到原值”。
 *
 * 移植其他文件时的规则：
 *  - 切代码（DEFERRED、OMIT）时，TIMER_PUSH 与 TIMER_POP 必须成对保留或成对删掉。
 *  - TIMER_POP_PUSH 不改变栈深度，删掉只会改变时间记在哪个名字下；建议保留，分段名与 C++ 一致。
 *  - 不要在 PUSH 与 POP 之间新增提前 return。
 *  - 已知的原始问题：Minecraft::tick 在 TIMER_POP_PUSH("gui") 之后遇到 isGeneratingLevel 会直接 return，
 *    漏掉一次 POP。PLATFORM_WEB 同步生成世界，走不到这条路径；以后若改成 Worker 生成，
 *    在那个 return 前补 TIMER_POP()，标 ADAPTED(Fix)。
 */
import { getTimeS, LOGW } from '@mcpe/platform';
import { hashCode, startsWith } from './StringUtils.js';

const DECAY = 0.999; // it->second *= 0.999f;

/** C++ 的 PerfTimer::ResultField */
export class ResultField {
  percentage: number;
  globalPercentage: number;
  name: string;

  constructor(name: string, percentage: number, globalPercentage: number) {
    this.name = name;
    this.percentage = percentage;
    this.globalPercentage = globalPercentage;
  }

  /** C++ 的 operator<：百分比大的排前面；百分比相同时按名字逆序 */
  lessThan(rf: ResultField): boolean {
    if (this.percentage !== rf.percentage) return this.percentage > rf.percentage;
    return this.name > rf.name;
  }

  getColor(): number {
    return ((hashCode(this.name) & 0xaaaaaa) + 0x444444) | 0;
  }
}

/** std::sort 用的比较器（由 operator< 推出） */
function compareFields(a: ResultField, b: ResultField): number {
  return a.lessThan(b) ? -1 : b.lessThan(a) ? 1 : 0;
}

/** 与 getLog 里 C++ 的判断相同：key 是 path 的直接子区段 */
function isDirectChild(key: string, path: string): boolean {
  return key.length > path.length && startsWith(key, path) && key.indexOf('.', path.length + 1) === -1;
}

type ResultFieldT = ResultField;

export class PerfTimer {
  static enabled = false;
  static readonly ResultField = ResultField;

  private static paths: string[] = [];
  private static startTimes: number[] = [];
  private static path = '';
  private static times = new Map<string, number>(); // std::map<std::string, float>
  private static warnedEmptyPop = false;

  static reset(): void {
    PerfTimer.times.clear();
  }

  static push(name: string): void {
    if (!PerfTimer.enabled) return;
    if (PerfTimer.path.length > 0) PerfTimer.path += '.';
    PerfTimer.path += name;
    PerfTimer.paths.push(PerfTimer.path);
    PerfTimer.startTimes.push(getTimeS());
  }

  static pop(): void {
    if (!PerfTimer.enabled) return;
    const endTime = getTimeS();
    const startTimes = PerfTimer.startTimes;
    if (startTimes.length === 0) {
      // ADAPTED(Safety)：C++ 在这里对空 vector 调 back()，是未定义行为
      if (!PerfTimer.warnedEmptyPop) {
        PerfTimer.warnedEmptyPop = true;
        LOGW('PerfTimer.pop() 在空栈上被调用：TIMER_PUSH 与 TIMER_POP 不配对，本次调用已忽略（只提示一次）');
      }
      return;
    }
    const startTime = startTimes.pop()!;
    const paths = PerfTimer.paths;
    paths.pop();
    const time = endTime - startTime;
    const times = PerfTimer.times;
    const acc = times.get(PerfTimer.path);
    times.set(PerfTimer.path, acc !== undefined ? acc + time : time);
    PerfTimer.path = paths.length > 0 ? paths[paths.length - 1]! : '';
  }

  static popPush(name: string): void {
    PerfTimer.pop();
    PerfTimer.push(name);
  }

  static getLog(rawPath: string): ResultField[] {
    if (!PerfTimer.enabled) return [];
    const times = PerfTimer.times;
    let path = rawPath;
    const rootTime = times.get('root');
    let globalTime = rootTime !== undefined ? rootTime : 0;
    // C++ 这里还查了 itPath = times.find(path)，但后面没有用到
    const totalTime2 = rootTime !== undefined ? rootTime : -1;
    const result: ResultField[] = [];

    if (path.length > 0) path += '.';

    let totalTime = 0;
    for (const [key, time] of times) if (isDirectChild(key, path)) totalTime += time;
    const oldTime = totalTime;
    if (totalTime < totalTime2) totalTime = totalTime2;
    if (globalTime < totalTime) globalTime = totalTime;

    for (const [key, time] of times) {
      if (!isDirectChild(key, path)) continue;
      result.push(new ResultField(key.substring(path.length), (time * 100) / totalTime, (time * 100) / globalTime));
    }

    for (const [key, time] of times) times.set(key, time * DECAY);

    if (totalTime > oldTime) {
      const rest = (totalTime - oldTime) * 100;
      result.push(new ResultField('unspecified', rest / totalTime, rest / globalTime));
    }

    result.sort(compareFields);
    result.unshift(new ResultField(rawPath, 100, (totalTime * 100) / globalTime));
    return result;
  }

  /** ADAPTED(Test)：当前栈深度。只给测试用，游戏代码不要调用 */
  static stackDepth(): number {
    return PerfTimer.startTimes.length;
  }
}

// C++ 的嵌套类型：同名命名空间只放类型别名，让 PerfTimer::ResultField 在 TS 里照样写成 PerfTimer.ResultField（作类型用）；作值用走类上的同名静态属性。
// eslint-disable-next-line @typescript-eslint/no-namespace -- 只含类型，编译后不产生任何代码
export declare namespace PerfTimer {
  type ResultField = ResultFieldT;
}

/** #define TIMER_PUSH(x) PerfTimer::push(x) */
export function TIMER_PUSH(name: string): void {
  PerfTimer.push(name);
}

/** #define TIMER_POP() PerfTimer::pop() */
export function TIMER_POP(): void {
  PerfTimer.pop();
}

/** #define TIMER_POP_PUSH(x) PerfTimer::popPush(x) */
export function TIMER_POP_PUSH(name: string): void {
  PerfTimer.popPush(name);
}
