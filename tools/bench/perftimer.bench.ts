// 用法：npx tsx tools/bench/perftimer.bench.ts
// 测 TIMER_* 在关闭与开启两种状态下的开销。每项独立子进程，预热 4 轮，取 7 轮中位数。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PerfTimer, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '../../packages/util/src/PerfTimer.ts';

const N = 5_000_000;
const cases: Record<string, () => number> = {
  '关闭：PUSH + POP_PUSH + POP': () => {
    PerfTimer.enabled = false;
    for (let i = 0; i < N; i++) { TIMER_PUSH('tick'); TIMER_POP_PUSH('level'); TIMER_POP(); }
    return PerfTimer.stackDepth();
  },
  '开启：PUSH + POP_PUSH + POP': () => {
    PerfTimer.enabled = true;
    TIMER_PUSH('root');
    for (let i = 0; i < N; i++) { TIMER_PUSH('tick'); TIMER_POP_PUSH('level'); TIMER_POP(); }
    TIMER_POP();
    PerfTimer.enabled = false;
    return PerfTimer.stackDepth();
  },
};

const only = process.argv[2];
if (only) {
  const run = cases[only]!;
  let sink = 0;
  for (let k = 0; k < 4; k++) sink += run();
  const t: number[] = [];
  for (let k = 0; k < 7; k++) { const t0 = performance.now(); sink += run(); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  process.stdout.write(`${((t[3]! * 1e6) / N).toFixed(2)}${sink === 42 ? ' ' : ''}\n`);
} else {
  console.log(`每项 ${N / 1e6}M 组调用（每组 3 个宏），独立进程，7 轮中位数（Node ${process.versions.node}）`);
  const self = fileURLToPath(import.meta.url);
  for (const name of Object.keys(cases)) {
    const r = spawnSync(process.execPath, [...process.execArgv, self, name], { encoding: 'utf8' });
    console.log(`  ${name.padEnd(26)} ${(r.stdout.trim() || r.stderr.trim().split('\n')[0]).padStart(7)} ns/组`);
  }
}
