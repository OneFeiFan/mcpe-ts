/**
 * 移植自 src/util/Mth.h 与 Mth.cpp（minecraft-pe-reference 分支）。
 *
 * 调用方式与 C++ 一致：
 *   C++  Mth::sin(x)   Mth::floor(v)   Mth::PI   Mth::Min(a, b)   Util::remove(list, p)
 *   TS   Mth.sin(x)    Mth.floor(v)    Mth.PI    Mth.Min(a, b)    Util.remove(list, p)
 * 引入：包外 `import { Mth, Util } from '@mcpe/util'`；util 包内 `import { Mth } from './Mth.js'`。
 * Mth.h 里 namespace Util 的两个模板在本文件末尾实现，由 Util.ts 汇总到 Util 对象。
 *
 * 按手册的三档规则分两类：
 *
 * 【精确】与 C++ 逐位一致，已用黄金样本核对：
 *   sin、cos（65536 项查表）、invSqrt（快速平方根倒数）、PI / TWO_PI / DEGRAD / RADDEG（float 常量）、intFloorDiv。
 *   前两个是分支独有的算法，结果和 JS 的 Math.sin、1/Math.sqrt 本来就不同；
 *   OreFeature 用 sin、cos、PI 决定矿脉形状，在“种子 → 世界”的链上。
 *   查表和 fround 还保证了所有浏览器算出同样的值。
 *
 * 【放宽】直接用 JS，不再模拟 float 舍入和越界强转：
 *   sqrt、atan、atan2、floor、abs、Min、Max、clamp、lerp、lerpInt、absDecrease、absMax、absMaxSigned。
 *   与 C++ 的差别只在 float 与 double 的末位（约 1e-7），或 |x| ≥ 2^31 这类实际不会出现的输入。
 *   种子链上的代码自己负责按 float 计算，传进来的已经是 float，floor 等结果与 C++ 相同。
 *   random（任务单 H1 起 1:1）：C++ 是 Mth.cpp 的 `static Random _rand`（种子 getTimeMs()），random() = _rand.nextFloat()、
 *   random(n) = _rand.nextInt(n)。这里同样用一个模块级 Random（`_mthRand`）。以前用 Math.random，random(n) 的分布与序列都和 C++ 不同，
 *   做不了生物 AI 的黄金样本。`_mthRand` 导出只为测试与黄金样本对照（setSeed 固定序列、或 vi.spyOn 打桩），游戏代码不要直接用它（ADAPTED(Test)）。
 *
 * 其他说明：
 *  - initMth() 之前 sin、cos 返回 0（C++ 的静态数组零初始化）。NinecraftApp::init 第一行就调用它。
 *  - int 版 lerp(int, int, float) 写成 Mth.lerpInt（TS 无法按参数类型分派；分支里没有调用点）。
 *  - 源码里有的地方直接调用 C 库的 sin、cos（洞穴、峡谷、树、昼夜），那些不要改成 Mth.sin。
 */
import { f2i } from './cpp.js';
import { getTimeMs } from '@mcpe/platform';
import { Random } from './Random.js';

/** C++ Mth.cpp 的 `static Random _rand;`（Random() 默认构造以 getTimeMs() 播种） */
export const _mthRand = new Random(getTimeMs());

const f = Math.fround;

// ================================================================ 精确

// ---------------------------------------------------------------- 常量（constexpr float）
const PI = f(3.1415926535897932384626433832795028841971); // exactly!
const TWO_PI = f(2 * PI); // exactly!
const DEGRAD = f(PI / 180);
const RADDEG = f(180 / PI);

// ---------------------------------------------------------------- 正弦表
const _sin = new Float32Array(65536); // static float _sin[65536];（零初始化）
const _sinScale = f(65536 / f(2 * PI)); // static const float _sinScale = 65536.0f / (2.0f * PI);

function initMth(): void {
  // _sin[i] = ::sin(i / _sinScale);  i / _sinScale 是 float 除法，::sin 按 double 算，写入 float 数组
  for (let i = 0; i < 65536; ++i) _sin[i] = Math.sin(f(i / _sinScale));
}

function sin(x: number): number {
  return _sin[f2i(f(f(x) * _sinScale)) & 65535]!;
}

function cos(x: number): number {
  // (int)(x * _sinScale + 65536 / 4)：int 常量 16384 转成 float 后做 float 加法
  return _sin[f2i(f(f(f(x) * _sinScale) + 16384)) & 65535]!;
}

// ---------------------------------------------------------------- 快速平方根倒数
// 4 字节暂存区：float 与 int 共用同一段内存（等价于 *(int*)&x）
const _fbuf = new Float32Array(1);
const _ibuf = new Int32Array(_fbuf.buffer);

/** 0x5f3759df 加一次牛顿迭代，最大相对误差约 0.175%。Frustum、Mob 移动、寻路、爆炸依赖这个近似值 */
function invSqrt(x: number): number {
  x = f(x);
  const xhalf = f(0.5 * x); // float xhalf = 0.5f*x;
  _fbuf[0] = x;
  _ibuf[0] = (0x5f3759df - (_ibuf[0]! >> 1)) | 0; // i = 0x5f3759df - (i>>1);
  const y = _fbuf[0]!; // x = *(float*)&i;
  return f(y * f(1.5 - f(f(xhalf * y) * y))); // x = x*(1.5f - xhalf*x*x);
}

// ---------------------------------------------------------------- 整数向下取整除法
function intFloorDiv(a: number, b: number): number {
  if (a < 0) return (-((((-a - 1) | 0) / b) | 0) - 1) | 0; // -((-a - 1) / b) - 1
  return (a / b) | 0;
}

// ================================================================ 放宽

/** C++ 的参数是 float；这里不再先转 float，也不模拟越界强转 */
function floor(v: number): number {
  return Math.floor(v) | 0;
}

function random(): number;
function random(n: number): number;
function random(n?: number): number {
  return n === undefined ? _mthRand.nextFloat() : _mthRand.nextInt(n);
}

function clamp(v: number, low: number, high: number): number {
  if (v > high) return high;
  return v > low ? v : low;
}

/** float lerp(float src, float dst, float alpha) */
function lerp(src: number, dst: number, alpha: number): number {
  return src + (dst - src) * alpha;
}

/** int lerp(int src, int dst, float alpha)：src + (int)((dst - src) * alpha) */
function lerpInt(src: number, dst: number, alpha: number): number {
  return (src + Math.trunc((dst - src) * alpha)) | 0;
}

/**
 * @param value 原始带符号值
 * @param w     用来“按绝对值减小” value 的量（C++ 形参名是 with，JS 里是保留字）
 * @param min   最小值
 */
function absDecrease(value: number, w: number, min: number): number {
  if (value > 0) return Math.max(min, value - w);
  return Math.min(value + w, -min);
}

function absMax(a: number, b: number): number {
  return Math.max(Math.abs(a), Math.abs(b));
}

function absMaxSigned(a: number, b: number): number {
  return Math.abs(a) > Math.abs(b) ? a : b;
}

export const Mth = Object.freeze({
  // 精确
  PI,
  TWO_PI,
  DEGRAD,
  RADDEG,
  initMth,
  sin,
  cos,
  invSqrt,
  intFloorDiv,
  // 放宽
  sqrt: Math.sqrt,
  atan: Math.atan,
  atan2: Math.atan2,
  abs: Math.abs,
  Min: Math.min,
  Max: Math.max,
  floor,
  random,
  clamp,
  lerp,
  lerpInt,
  absDecrease,
  absMax,
  absMaxSigned,
});

// ---------------------------------------------------------------- namespace Util 的模板（同样定义在 Mth.h 里）
// 由 Util.ts 汇总进 Util 对象，调用写成 Util.removeAll(...)、Util.remove(...)，不要直接用这两个导出名。
// JS 没有语义完全相同的内置方法，保留原实现。
// 元素比较对应 C++ 的 operator==：分支里的调用全是指针（players、tileEntities、cubes），即引用相等。

/** 对 toRemove 中的每个元素，删除 superset 里第一个相同元素；返回删除个数 */
export function utilRemoveAll<T>(superset: T[], toRemove: readonly T[]): number {
  const subSize = toRemove.length;
  let removed = 0;
  for (let i = 0; i < subSize; ++i) {
    const elem = toRemove[i];
    const size = superset.length;
    for (let j = 0; j < size; ++j) {
      if (elem === superset[j]) {
        superset.splice(j, 1);
        ++removed;
        break;
      }
    }
  }
  return removed;
}

/** 删除第一个等于 instance 的元素（std::vector 与 std::set 两个重载） */
export function utilRemove<T>(list: T[] | Set<T>, instance: T): boolean {
  if (list instanceof Set) return list.delete(instance);
  const i = list.indexOf(instance);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
