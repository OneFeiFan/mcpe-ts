import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Mth } from '@mcpe/util';

// 真值来自 tools/golden/harness_mth.cpp（参考 C++ 源码 util/Mth.cpp，x86-64 上生成）
const G = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/mth.json', import.meta.url), 'utf8'),
);
const TABLE = new Uint32Array(
  new Uint8Array(readFileSync(new URL('../../fixtures/golden/mth_sin_table.f32', import.meta.url)))
    .buffer,
);

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (x: number): number => {
  f32[0] = x;
  return u32[0]!;
};
const fl = (b: number): number => {
  u32[0] = b;
  return f32[0]!;
};
/** 放宽档的比较：与 C++ 的 float 结果只差 float 末位（相对误差不超过 2^-22） */
const close = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 2 ** -22 * Math.max(Math.abs(b), 1e-30);

/** 逐条比较，返回第一个不一致的样本（全部一致时为 undefined），失败信息里能直接看到输入 */
function firstMismatch<T extends unknown[]>(rows: T[], check: (row: T) => boolean): T | undefined {
  return rows.find((r) => !check(r));
}

beforeAll(() => Mth.initMth());

describe('精确档：与 C++ 逐位一致', () => {
  it('常量 PI、TWO_PI、DEGRAD、RADDEG', () => {
    expect(bits(Mth.PI)).toBe(G.constants.PI);
    expect(bits(Mth.TWO_PI)).toBe(G.constants.TWO_PI);
    expect(bits(Mth.DEGRAD)).toBe(G.constants.DEGRAD);
    expect(bits(Mth.RADDEG)).toBe(G.constants.RADDEG);
  });

  it('正弦表 65536 项', () => {
    const scale = Math.fround(65536 / Math.fround(2 * Mth.PI));
    let bad = -1;
    for (let i = 0; i < 65536 && bad < 0; i++)
      if (bits(Mth.sin(Math.fround(i / scale))) !== TABLE[i]) bad = i;
    expect(bad).toBe(-1);
  });

  it('sin、cos 的边界取样（含 700000 的越界强转）与 2000 个随机角度', () => {
    for (const p of G.probes) {
      const x = fl(p.x);
      expect([bits(Mth.sin(x)), bits(Mth.cos(x))]).toEqual([p.sin, p.cos]);
    }
    expect(
      firstMismatch<[number, number, number]>(
        G.trig,
        ([x, s, c]) => bits(Mth.sin(fl(x))) === s && bits(Mth.cos(fl(x))) === c,
      ),
    ).toBeUndefined();
  });

  it('invSqrt 是快速平方根倒数，2000 个样本逐位一致', () => {
    expect(
      firstMismatch<[number, number]>(G.invSqrt, ([x, r]) => bits(Mth.invSqrt(fl(x))) === r),
    ).toBeUndefined();
  });

  it('intFloorDiv（含负数与 -2147483647）', () => {
    expect(
      firstMismatch<[number, number, number]>(
        G.intFloorDiv,
        ([a, b, r]) => Mth.intFloorDiv(a, b) === r,
      ),
    ).toBeUndefined();
  });
});

describe('放宽档：直接用 JS，与 C++ 只差 float 末位', () => {
  it('sqrt、atan、atan2', () => {
    expect(
      firstMismatch<[number, number]>(G.sqrt, ([x, r]) => close(Mth.sqrt(fl(x)), fl(r))),
    ).toBeUndefined();
    expect(
      firstMismatch<[number, number]>(G.atan, ([x, r]) => close(Mth.atan(fl(x)), fl(r))),
    ).toBeUndefined();
    expect(
      firstMismatch<[number, number, number]>(G.atan2, ([y, x, r]) =>
        close(Mth.atan2(fl(y), fl(x)), fl(r)),
      ),
    ).toBeUndefined();
  });

  it('floor：传入 float 时与 C++ 相同；越界输入不再模拟 x86 的强转结果', () => {
    const inRange = (G.floorF as [number, number][]).filter(([x]) => Math.abs(fl(x)) < 2 ** 31);
    expect(firstMismatch(inRange, ([x, r]) => Mth.floor(fl(x)) === r)).toBeUndefined();
    for (const p of G.probes) expect(Mth.floor(fl(p.x))).toBe(p.floor);
    expect(Mth.floor(0.99999999)).toBe(0); // C++ 先把参数转成 float 得 1；放宽后按 double 取整
  });

  it('lerp 与 lerpInt', () => {
    expect(
      firstMismatch<[number, number, number, number]>(
        G.lerp,
        ([a, b, t, r]) => Math.abs(Mth.lerp(fl(a), fl(b), fl(t)) - fl(r)) <= 2e-4,
      ),
    ).toBeUndefined(); // |结果| ≤ 3000，float 末位约 2.4e-4
    expect(
      firstMismatch<[number, number, number, number]>(
        G.lerpInt,
        ([a, b, t, r]) => Math.abs(Mth.lerpInt(a, b, fl(t)) - r) <= 1,
      ),
    ).toBeUndefined(); // 乘积恰好落在整数附近时截断可能差 1
  });

  it('absDecrease 近似相等；absMax、absMaxSigned 只做选择，结果逐位相同', () => {
    expect(
      firstMismatch<[number, number, number, number]>(
        G.absDecrease,
        ([v, w, m, r]) => Math.abs(Mth.absDecrease(fl(v), fl(w), fl(m)) - fl(r)) <= 2e-6,
      ),
    ).toBeUndefined();
    expect(
      firstMismatch<[number, number, number, number]>(
        G.absMax,
        ([a, b, m, ms]) =>
          bits(Mth.absMax(fl(a), fl(b))) === m && bits(Mth.absMaxSigned(fl(a), fl(b))) === ms,
      ),
    ).toBeUndefined();
  });

  it('abs、Min、Max、clamp：只做选择，int 与 float 两个重载都与 C++ 相同', () => {
    expect(
      firstMismatch<number[]>(
        G.intOps,
        ([a, b, lo, hi, ab, mn, mx, cl]) =>
          Mth.abs(a!) === ab &&
          Mth.Min(a!, b!) === mn &&
          Mth.Max(a!, b!) === mx &&
          Mth.clamp(a!, lo!, hi!) === cl,
      ),
    ).toBeUndefined();
    expect(
      firstMismatch<number[]>(
        G.floatOps,
        ([a, b, lo, hi, ab, mn, mx, cl]) =>
          bits(Mth.abs(fl(a!))) === ab &&
          bits(Mth.Min(fl(a!), fl(b!))) === mn &&
          bits(Mth.Max(fl(a!), fl(b!))) === mx &&
          bits(Mth.clamp(fl(a!), fl(lo!), fl(hi!))) === cl,
      ),
    ).toBeUndefined();
  });
});
