#!/usr/bin/env node
/**
 * 定型检查：把"每步收尾都要跑一遍"的那几件事**一次跑完，只打印摘要**。
 *
 * 【为什么要它】每一步收尾我要跑 typecheck + test + 台账（有时还有反向验证）。
 * 分开跑 = 分开 3~4 次工具调用 = 3~4 次完整上下文重读。实测这个会话每次请求均价 $0.146，
 * 所以"少跑一次命令"是实打实的钱。合并成一条，输出只有几行。
 *
 * 【关键规矩】完整日志**写文件**，不进上下文；只在失败时把失败的用例名列出来。
 * 判断成败一律看**退出码**，不看管道后的文字（栽过一次）。
 *
 * 用法：
 *   node tools/verify/check.mjs                          # typecheck + 全部测试 + 台账
 *   node tools/verify/check.mjs tests/unit/client/model.test.ts   # 只跑这些测试文件
 *   node tools/verify/check.mjs --mutate tests/unit/client/model.test.ts /tmp/mutations.json   （变异清单是临时文件）
 *   node tools/verify/check.mjs --no-test                # 只要 typecheck + 台账
 *   node tools/verify/check.mjs --logs                   # 只打印日志目录路径
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const LOGDIR = path.join(os.tmpdir(), 'mcpe-check');
fs.rmSync(LOGDIR, { recursive: true, force: true });
fs.mkdirSync(LOGDIR, { recursive: true });

// ⚠ 解析必须按**位置**来：`--mutate A B` 里的 A 和"要跑的测试文件 A"是同一个字符串，
// 按值排除会把过滤器一起排掉 —— 第一版就栽在这里：给了过滤条件却跑了全量 1129 条。
const argv = process.argv.slice(2);
const flags = new Set();
const testFiles = [];
let mutateArgs = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--mutate') {
    mutateArgs = [argv[++i], argv[++i]];
    continue;
  }
  if (argv[i].startsWith('--')) flags.add(argv[i]);
  else testFiles.push(argv[i]);
}

if (flags.has('--logs')) {
  console.log(LOGDIR);
  process.exit(0);
}

/** 跑一条命令，stdout+stderr 一起写进日志文件，返回 {code, text} */
function run(label, cmd, args) {
  const log = path.join(LOGDIR, `${label}.log`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  fs.writeFileSync(log, text);
  return { code: r.status ?? 1, text, log };
}

const results = [];
const fmtMs = (t) => `${(t / 1000).toFixed(1)}s`;

// ---- typecheck ----
if (!flags.has('--no-typecheck')) {
  const t0 = Date.now();
  const r = run('typecheck', 'pnpm', ['typecheck']);
  const errs = [...r.text.matchAll(/error TS\d+:[^\n]*/g)].map((m) => m[0]);
  results.push({
    name: '类型检查',
    ok: r.code === 0,
    detail: r.code === 0 ? fmtMs(Date.now() - t0) : `${errs.length} 处报错`,
    lines: errs.slice(0, 12),
    log: r.log,
  });
}

// ---- tests ----
if (!flags.has('--no-test')) {
  const t0 = Date.now();
  const jsonOut = path.join(LOGDIR, 'vitest.json');
  // ⚠ 用 vitest 自己的 json 报告，不要数源码里的 it() —— for 循环生成的用例数对不上
  const args = ['vitest', 'run', '--reporter=json', `--outputFile=${jsonOut}`];
  if (testFiles.length) args.push(...testFiles);
  const r = run('test', 'npx', args);
  let detail = `退出码 ${r.code}`;
  const lines = [];
  try {
    const j = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    const total = j.numTotalTests ?? 0;
    const failed = j.numFailedTests ?? 0;
    // ⚠ 文件数要用 testResults.length，不是 numTotalTestSuites（后者实测是 392，不是 100）
    detail = `${(j.testResults ?? []).length} 文件 / ${total} 条${failed ? `，**${failed} 条不过**` : ''} · ${fmtMs(Date.now() - t0)}`;
    for (const tr of j.testResults ?? []) {
      for (const a of tr.assertionResults ?? []) {
        if (a.status === 'failed')
          lines.push(`${path.relative(ROOT, tr.name).replace(/\\/g, '/')} > ${a.fullName}`);
      }
    }
  } catch {
    detail += '（json 报告没生成，去看日志）';
  }
  results.push({ name: '测试', ok: r.code === 0, detail, lines: lines.slice(0, 12), log: r.log });
}

// ---- 台账 ----
if (!flags.has('--no-ledger')) {
  const r = run('ledger', 'node', ['tools/ledger.mjs']);
  const m = r.text.match(/共\s*(\d+)\s*条/);
  results.push({
    name: '台账',
    ok: r.code === 0 && !!m,
    detail: m ? `${m[1]} 条` : '没解析出条数',
    lines: [],
    log: r.log,
  });
}

// ---- 反向验证（可选）----
if (mutateArgs && mutateArgs.length === 2) {
  const t0 = Date.now();
  const r = run('mutate', 'node', ['tools/verify/mutate.mjs', ...mutateArgs]);
  const m = r.text.match(/(\d+)\/(\d+)\s*个变异被抓住/);
  // mutate.mjs 对"没抓住"打的是 `⚠ 仍然绿（没抓住）` 前缀
  const missed = [...r.text.matchAll(/⚠ 仍然绿（没抓住）\s*(.+)/g)].map((x) => x[1].trim());
  results.push({
    name: '反向验证',
    ok: r.code === 0 && !!m && m[1] === m[2],
    detail: m ? `${m[1]}/${m[2]} 个变异被抓住 · ${fmtMs(Date.now() - t0)}` : '没解析出结果',
    lines: missed.slice(0, 12),
    log: r.log,
  });
}

// ---- 打印 ----
let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(6, '　')} ${r.detail}`);
  for (const l of r.lines) console.log(`    ${l}`);
}
if (bad) console.log(`\n完整日志：${LOGDIR}`);
process.exit(bad ? 1 : 0);
