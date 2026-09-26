import { describe, expect, it } from 'vitest';
import { getTimeMs, getTimeS } from '@mcpe/platform';

describe('platform/time', () => {
  it('与 C++ 一致：以启动时刻为 0，且单调不减', () => {
    const a = getTimeMs();
    const b = getTimeMs();
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(60_000);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(getTimeS()).toBeLessThan(60);
  });
});
