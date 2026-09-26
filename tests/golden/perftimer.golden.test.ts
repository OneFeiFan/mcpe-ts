import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// 用可控的假时钟替换 platform 的 getTimeS，与 harness_util.cpp 里的 g_now 对应
const clock = vi.hoisted(() => ({ now: 0 }));
vi.mock('@mcpe/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mcpe/platform')>()),
  getTimeS: () => clock.now,
}));

import { PerfTimer, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '@mcpe/util';

// 真值来自 tools/golden/harness_util.cpp（参考源码 util/PerfTimer.cpp，x86-64 上生成）
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/util.json', import.meta.url), 'utf8')).perfTimer;
const f = Math.fround;
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (x: number): number => { f32[0] = x; return u32[0]!; };

// 与 harness 的 FRAME 完全相同的脚本：u=push、o=pop、p=popPush；t 为执行前的时钟（float）
const FRAME: [op: 'u' | 'o' | 'p', name: string, t: number][] = [
  ['u', 'root', 0.0], ['u', 'tick', 0.001], ['p', 'level', 0.004], ['o', '', 0.0065],
  ['u', 'render', 0.007], ['u', 'terrain', 0.0161], ['o', '', 0.02], ['u', 'sky', 0.0203],
  ['o', '', 0.02071], ['o', '', 0.021], ['o', '', 0.023],
];
function runFrames(frames: number, base: number): void {
  for (let k = 0; k < frames; k++) {
    const off = f(f(base) + f(k * f(0.05)));
    for (const [op, name, t] of FRAME) {
      clock.now = f(off + f(t));
      if (op === 'u') TIMER_PUSH(name);
      else if (op === 'o') TIMER_POP();
      else TIMER_POP_PUSH(name);
    }
  }
}
const dump = (path: string) => ({ path, fields: PerfTimer.getLog(path) });
const fl = (b: number): number => { u32[0] = b; return f32[0]!; };
type Golden = { path: string; fields: { name: string; pct: number; gpct: number; color: number }[] };
/** PerfTimer 属于自由档，按 double 计算：名字、顺序、颜色必须相同，百分比与 C++ 的 float 结果只差末位 */
function expectSameLog(actual: ReturnType<typeof dump>, golden: Golden): void {
  expect(actual.path).toBe(golden.path);
  expect(actual.fields.map((r) => [r.name, r.getColor()])).toEqual(golden.fields.map((g) => [g.name, g.color]));
  actual.fields.forEach((r, i) => {
    expect(r.percentage).toBeCloseTo(fl(golden.fields[i]!.pct), 3);
    expect(r.globalPercentage).toBeCloseTo(fl(golden.fields[i]!.gpct), 3);
  });
}

describe('PerfTimer 与 C++ 一致（自由档：数值按 double）', () => {
  it('关闭时是空操作：getLog 为空，栈不变', () => {
    PerfTimer.enabled = false;
    runFrames(1, 0);
    expect(PerfTimer.getLog('root').length).toBe(G.disabled);
    expect(PerfTimer.stackDepth()).toBe(0);
  });

  it('开启后：累计、嵌套路径、getLog 的百分比、排序、颜色、0.999 衰减', () => {
    PerfTimer.enabled = true;
    PerfTimer.reset();
    runFrames(3, 1);
    const logs = [dump('root'), dump('root.render'), dump(''), dump('root')];
    runFrames(2, 5);
    logs.push(dump('root'));
    expect(logs.length).toBe(G.logs.length);
    logs.forEach((log, i) => expectSameLog(log, G.logs[i]));
    expect(PerfTimer.stackDepth()).toBe(0);
  });
});
