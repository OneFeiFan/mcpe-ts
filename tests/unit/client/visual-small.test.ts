/**
 * 视觉小项：开关门的声音（LevelRenderer.levelEvent）、调试帧时间图（PerfRenderer）。
 * - levelEvent(SOUND_OPEN_DOOR)：在方块中心播 random.door_open 或 random.door_close（各一半），音量 1、音高 0.9–1.0；其他事件什么都不做；
 * - PerfRenderer：PerfTimer 关着（没有日志）时什么都不画；开着时能画出来；按 1 进入第一个子区段、按 0 回到上一层。
 */
import { describe, expect, it, vi } from 'vitest';
import { GLES1, glSetContext, LevelRenderer, PerfRenderer } from '@mcpe/client';
import { LevelEvent } from '@mcpe/world';
import { _mthRand, PerfTimer } from '@mcpe/util';

describe('LevelRenderer.levelEvent（开关门的声音）', () => {
  it('SOUND_OPEN_DOOR：方块中心、random.door_open / door_close、音量 1、音高 0.9–1.0', () => {
    const calls: unknown[][] = [];
    const level = { playSound: (...a: unknown[]) => calls.push(a), random: { nextFloat: () => 0.5 } };
    const lr = Object.create(LevelRenderer.prototype) as LevelRenderer;
    (lr as unknown as { level: unknown }).level = level;
    _mthRand.setSeed(1);
    for (let i = 0; i < 20; i++) lr.levelEvent(null, LevelEvent.SOUND_OPEN_DOOR, 10, 64, 20, 0);
    expect(calls.length).toBe(20);
    for (const c of calls) {
      expect(c.slice(0, 3)).toEqual([10.5, 64.5, 20.5]);
      expect(['random.door_open', 'random.door_close']).toContain(c[3]);
      expect(c[4]).toBe(1);
      expect(c[5]).toBe(Math.fround(Math.fround(0.5 * Math.fround(0.1)) + Math.fround(0.9)));
    }
    expect(new Set(calls.map((c) => c[3])).size).toBe(2); // 两种都出现
    calls.length = 0;
    lr.levelEvent(null, 9999, 0, 0, 0, 0);
    expect(calls.length).toBe(0);
  });
});

describe('PerfRenderer', () => {
  const mc = { width: 960, height: 540 };
  const font = { drawShadow: vi.fn(), width: (s: string) => s.length * 6 };

  it('PerfTimer 关着：getLog 为空，什么都不画', () => {
    glSetContext(new GLES1(null));
    PerfTimer.enabled = false;
    const pr = new PerfRenderer(mc as never, font as never);
    font.drawShadow.mockClear();
    pr.renderFpsMeter(1);
    expect(font.drawShadow).not.toHaveBeenCalled();
  });

  it('PerfTimer 开着：画出根节点与各区段的百分比；按 1 进入子区段、按 0 回到上一层', () => {
    glSetContext(new GLES1(null));
    PerfTimer.reset();
    PerfTimer.enabled = true;
    const busy = (ms: number): void => {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        /* 让区段有可测的耗时 */
      }
    };
    PerfTimer.push('root'); // 游戏里 Minecraft.update 最外层就是 TIMER_PUSH("root")
    PerfTimer.push('tick');
    PerfTimer.push('entities');
    busy(4);
    PerfTimer.pop();
    PerfTimer.pop();
    PerfTimer.push('render');
    busy(4);
    PerfTimer.pop();
    PerfTimer.pop();
    const pr = new PerfRenderer(mc as never, font as never);
    font.drawShadow.mockClear();
    pr.renderFpsMeter(1);
    expect(font.drawShadow).toHaveBeenCalled();
    const texts = font.drawShadow.mock.calls.map((c) => c[0] as string);
    expect(texts.some((t) => t.includes('%'))).toBe(true);
    const path = () => (pr as unknown as { _debugPath: string })._debugPath;
    const names = PerfTimer.getLog('root').slice(1).map((r) => r.name).filter((n) => n !== 'unspecified');
    expect(names.length).toBeGreaterThan(0);
    const all = PerfTimer.getLog('root').slice(1).map((r) => r.name);
    const k = all.indexOf(names[0]!) + 1;
    pr.debugFpsMeterKeyPress(k);
    expect(path()).toBe('root.' + names[0]);
    pr.debugFpsMeterKeyPress(0);
    expect(path()).toBe('root');
    PerfTimer.enabled = false;
  });
});
