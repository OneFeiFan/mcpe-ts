/**
 * 任务单 H1：Mth.random 与 C++ 同构——背后是一个模块级 Random（C++ Mth.cpp 的 static Random _rand）。
 * random() = nextFloat()，random(n) = nextInt(n)（不是 floor(nextFloat() * n)）。
 */
import { describe, expect, it } from 'vitest';
import { Mth, Random, _mthRand } from '@mcpe/util';

describe('Mth.random（H1）', () => {
  it('setSeed 之后，random() 的序列与同种子 Random.nextFloat() 相同', () => {
    _mthRand.setSeed(42);
    const ref = new Random(42);
    for (let i = 0; i < 8; i++) expect(Mth.random()).toBe(ref.nextFloat());
  });

  it('random(n) 是 nextInt(n)，与 floor(nextFloat() * n) 不同的序列', () => {
    _mthRand.setSeed(7);
    const ref = new Random(7);
    const got = Array.from({ length: 20 }, () => Mth.random(10));
    expect(got).toEqual(Array.from({ length: 20 }, () => ref.nextInt(10)));
    const viaFloat = new Random(7);
    expect(got).not.toEqual(Array.from({ length: 20 }, () => Math.floor(viaFloat.nextFloat() * 10)));
  });
});
