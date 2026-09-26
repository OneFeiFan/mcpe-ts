import { describe, expect, it, vi } from 'vitest';
import { PerfTimer, ResultField, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '@mcpe/util';
import { expectTimerBalanced } from '../../helpers/perfTimerBalance';

describe('PerfTimer', () => {
  it('ADAPTED(Safety)：开启时对空栈 pop 不崩溃，只警告一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    PerfTimer.enabled = true;
    expect(() => { TIMER_POP(); TIMER_POP(); }).not.toThrow();
    expect(PerfTimer.stackDepth()).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    PerfTimer.enabled = false;
    warn.mockRestore();
  });

  it('reset 只清累计值，不清栈（与 C++ 一致）', () => {
    PerfTimer.enabled = true;
    TIMER_PUSH('root');
    PerfTimer.reset();
    expect(PerfTimer.stackDepth()).toBe(1);
    TIMER_POP();
    expect(PerfTimer.stackDepth()).toBe(0);
    PerfTimer.enabled = false;
  });

  it('POP_PUSH 不改变栈深度', () => {
    expectTimerBalanced(() => {
      TIMER_PUSH('root');
      TIMER_PUSH('tick');
      const d = PerfTimer.stackDepth();
      TIMER_POP_PUSH('level');
      expect(PerfTimer.stackDepth()).toBe(d);
      TIMER_POP();
      TIMER_POP();
    });
  });

  it('expectTimerBalanced 能抓到少写的 POP', () => {
    expect(() => expectTimerBalanced(() => { TIMER_PUSH('root'); })).toThrow(/不配对/);
    PerfTimer.enabled = true;
    TIMER_POP(); // 清理上面留下的一层
    PerfTimer.enabled = false;
  });

  it('ResultField 的排序与 C++ operator< 一致；PerfTimer.ResultField 指向同一个类', () => {
    const a = new ResultField('a', 10, 10), b = new ResultField('b', 10, 10), c = new ResultField('c', 50, 50);
    expect([a, b, c].sort((x, y) => (x.lessThan(y) ? -1 : y.lessThan(x) ? 1 : 0)).map((r) => r.name)).toEqual(['c', 'b', 'a']);
    expect(PerfTimer.ResultField).toBe(ResultField);
  });
});
