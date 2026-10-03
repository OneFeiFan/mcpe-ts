import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Random } from '@mcpe/util';

// 真值来自 tools/golden/harness_random.cpp（参考 C++ 源码 util/Random.h）
interface Case {
  seed: string;
  u32: number[];
  nextInt: number[];
  nextInt100: number[];
  nextFloatBits: number[];
  nextGaussianBits: number[];
  nextBoolean: boolean[];
}
const cases: Case[] = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/random.json', import.meta.url), 'utf8'),
);
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (x: number): number => {
  f32[0] = x;
  return u32[0]!;
};
const take = <T>(n: number, fn: () => T): T[] => Array.from({ length: n }, fn);

describe.each(cases)('Random 与 C++ 逐位一致（seed=$seed）', (c) => {
  // C++ 的 long 种子在 init_genrand 里只取低 32 位
  const seed = Number(BigInt.asIntN(32, BigInt(c.seed)));
  it('genrand_int32', () => {
    const r = new Random(seed);
    expect(take(8, () => r.genrand_int32())).toEqual(c.u32);
  });
  it('nextInt()', () => {
    const r = new Random(seed);
    expect(take(8, () => r.nextInt())).toEqual(c.nextInt);
  });
  it('nextInt(100)', () => {
    const r = new Random(seed);
    expect(take(8, () => r.nextInt(100))).toEqual(c.nextInt100);
  });
  it('nextFloat（float 位）', () => {
    const r = new Random(seed);
    expect(take(8, () => bits(r.nextFloat()))).toEqual(c.nextFloatBits);
  });
  it('nextGaussian（float 位）', () => {
    const r = new Random(seed);
    expect(take(8, () => bits(r.nextGaussian()))).toEqual(c.nextGaussianBits);
  });
  it('nextBoolean（0x8000000 掩码）', () => {
    const r = new Random(seed);
    expect(take(8, () => r.nextBoolean())).toEqual(c.nextBoolean);
  });
});
