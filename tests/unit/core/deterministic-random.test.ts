import { describe, expect, it } from 'vitest';
import { SeededRandom } from '@mcpe/core';

describe('SeededRandom', () => {
  it('相同 seed 产生相同序列', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);

    const valuesA = [a.nextInt(100), a.nextInt(100), a.nextInt(100), a.nextInt(100)];

    const valuesB = [b.nextInt(100), b.nextInt(100), b.nextInt(100), b.nextInt(100)];

    expect(valuesA).toEqual(valuesB);
  });

  it('非法范围会被拒绝', () => {
    const random = new SeededRandom(12345);

    expect(() => random.nextInt(0)).toThrow(RangeError);
  });
});
