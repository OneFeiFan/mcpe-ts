import { describe, expect, it } from 'vitest';
import { FixedGameClock } from '@mcpe/core';

describe('FixedGameClock', () => {
  it('每次 advance 增加一个 tick', () => {
    const clock = new FixedGameClock();

    expect(clock.tick).toBe(0);

    clock.advance();

    expect(clock.tick).toBe(1);

    clock.advance();

    expect(clock.tick).toBe(2);
  });

  it('tickRate 保持构造时的值', () => {
    const clock = new FixedGameClock(20);

    expect(clock.tickRate).toBe(20);
  });
});
