import { expect } from 'vitest';
import { PerfTimer } from '@mcpe/util';

/**
 * 在开启 PerfTimer 的情况下执行 fn，断言它结束后计时栈深度回到原值。
 * 以后每个用到 TIMER_* 的移植函数（Minecraft.update/tick、GameRenderer.render…）都应该用它测一次，
 * 专门防止切代码时把 PUSH/POP 切成不配对。
 */
export function expectTimerBalanced(fn: () => void): void {
  const wasEnabled = PerfTimer.enabled;
  PerfTimer.enabled = true;
  const before = PerfTimer.stackDepth();
  try {
    fn();
  } finally {
    const after = PerfTimer.stackDepth();
    PerfTimer.enabled = wasEnabled;
    expect(after, 'TIMER_PUSH / TIMER_POP 不配对：函数结束后计时栈深度变了').toBe(before);
  }
}
