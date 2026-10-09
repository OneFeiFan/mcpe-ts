/**
 * 审核 P1：草的随机偏移原来用 BigInt 做 64 位运算，改成 32 位（Math.imul）。
 * 只用到第 16–27 位，64 位乘加结果的低 32 位只取决于操作数的低 32 位，所以两者逐位相同。这里用 BigInt 版本做参照，覆盖世界内外的坐标。
 */
import { describe, expect, it } from 'vitest';

const ref = (x: number, y: number, z: number): number[] => {
  let seed = BigInt(Math.imul(x, 3129871)) ^ (BigInt(z) * 116129781n) ^ BigInt(y);
  seed = BigInt.asIntN(64, seed * seed * 42317861n + seed * 11n);
  return [Number((seed >> 16n) & 0xfn), Number((seed >> 20n) & 0xfn), Number((seed >> 24n) & 0xfn)];
};
const fast = (x: number, y: number, z: number): number[] => {
  const s0 = Math.imul(x, 3129871) ^ Math.imul(z, 116129781) ^ y;
  const seed = (Math.imul(Math.imul(s0, s0), 42317861) + Math.imul(s0, 11)) | 0;
  return [(seed >>> 16) & 0xf, (seed >>> 20) & 0xf, (seed >>> 24) & 0xf];
};

describe('草的随机偏移：32 位写法与 64 位逐位相同', () => {
  it('世界内的每一格（0–255 × 0–127 × 0–255，步长 3）以及大坐标、负坐标', () => {
    for (let x = 0; x < 256; x += 3)
      for (let y = 0; y < 128; y += 3)
        for (let z = 0; z < 256; z += 3) expect(fast(x, y, z)).toEqual(ref(x, y, z));
    const big = [-2147483648, -123456789, -1, 2147483647, 30000000, -30000000];
    for (const x of big) for (const z of big) expect(fast(x, 64, z)).toEqual(ref(x, 64, z));
  });
});
