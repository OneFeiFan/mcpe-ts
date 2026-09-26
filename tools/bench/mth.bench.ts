// 用法：npx tsx tools/bench/mth.bench.ts
// 每一项在独立子进程里跑（避免不同用例之间的 JIT 互相干扰），先预热 4 轮，再取 7 轮中位数。
// 输入是已按 float 舍入的数：调用方按 R4 本来就传 float。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Mth } from '../../packages/util/src/Mth.ts';

const N = 20_000_000;
const MASK = (1 << 16) - 1;
const A = new Float64Array(MASK + 1); // 角度
const C = new Float64Array(MASK + 1); // 坐标
const P = new Float64Array(MASK + 1); // 正数
let seed = 42;
const rnd = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i <= MASK; i++) {
  A[i] = Math.fround((rnd() - 0.5) * 20);
  C[i] = Math.fround((rnd() - 0.5) * 2000);
  P[i] = Math.fround(rnd() * 1000 + 0.001);
}
Mth.initMth();

const cases: Record<string, () => number> = {
  'Mth.sin（查表）': () => { let s = 0; for (let i = 0; i < N; i++) s += Mth.sin(A[i & MASK]!); return s; },
  'Math.sin': () => { let s = 0; for (let i = 0; i < N; i++) s += Math.sin(A[i & MASK]!); return s; },
  'Mth.cos（查表）': () => { let s = 0; for (let i = 0; i < N; i++) s += Mth.cos(A[i & MASK]!); return s; },
  'Math.cos': () => { let s = 0; for (let i = 0; i < N; i++) s += Math.cos(A[i & MASK]!); return s; },
  'Mth.floor': () => { let s = 0; for (let i = 0; i < N; i++) s += Mth.floor(C[i & MASK]!); return s; },
  'Math.floor(x) | 0': () => { let s = 0; for (let i = 0; i < N; i++) s += Math.floor(C[i & MASK]!) | 0; return s; },
  'Mth.invSqrt（快速近似）': () => { let s = 0; for (let i = 0; i < N; i++) s += Mth.invSqrt(P[i & MASK]!); return s; },
  '1 / Math.sqrt': () => { let s = 0; for (let i = 0; i < N; i++) s += 1 / Math.sqrt(P[i & MASK]!); return s; },
  'Mth.sqrt': () => { let s = 0; for (let i = 0; i < N; i++) s += Mth.sqrt(P[i & MASK]!); return s; },
  'Math.sqrt': () => { let s = 0; for (let i = 0; i < N; i++) s += Math.sqrt(P[i & MASK]!); return s; },
  'Mth.atan2': () => { let s = 0; for (let i = 0; i < N; i++) s += Mth.atan2(C[i & MASK]!, C[(i + 7) & MASK]!); return s; },
  'Math.atan2': () => { let s = 0; for (let i = 0; i < N; i++) s += Math.atan2(C[i & MASK]!, C[(i + 7) & MASK]!); return s; },
  'Mth.clamp': () => { let s = 0; for (let i = 0; i < N; i++) s += Mth.clamp(C[i & MASK]!, -500, 500); return s; },
  'Math.min(Math.max())': () => { let s = 0; for (let i = 0; i < N; i++) s += Math.min(Math.max(C[i & MASK]!, -500), 500); return s; },
  'Mth.lerp': () => { let s = 0; for (let i = 0; i < N; i++) s += Mth.lerp(C[i & MASK]!, C[(i + 3) & MASK]!, 0.25); return s; },
  'a + (b - a) * t': () => { let s = 0; for (let i = 0; i < N; i++) { const a = C[i & MASK]!; s += a + (C[(i + 3) & MASK]! - a) * 0.25; } return s; },
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
  console.log(`每项 ${N / 1e6}M 次调用，独立进程，7 轮中位数（Node ${process.versions.node}，V8 ${process.versions.v8}）`);
  const self = fileURLToPath(import.meta.url);
  for (const name of Object.keys(cases)) {
    const r = spawnSync(process.execPath, [...process.execArgv, self, name], { encoding: 'utf8' });
    console.log(`  ${name.padEnd(22)} ${(r.stdout.trim() || r.stderr.trim().split('\n')[0]).padStart(6)} ns/次`);
  }
}
