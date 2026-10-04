// PWF 钩子 A/B 的分析器。
//
// 【测什么】planning-with-files 的 PreToolUse 钩子在**每次工具调用**上附加一段计划文本。
// 想知道它到底让每次请求的上下文多出多少 token。
//
// 【怎么测】在同一个会话里让工具调用**交替**开关钩子（开关 = task_plan.md 存不存在），
// 然后看相邻两次请求之间的上下文增量。
//
//   请求 i 的上下文 = 请求 i-1 的上下文 + 请求 i-1 的输出 + 【请求 i-1 的工具返回 + 钩子块】
//
// 所以 `残差 = ctx(i) - ctx(i-1) - out(i-1)` 正好等于"上一条工具调用的返回 + 它带的钩子块"。
// `echo` 的返回只有几字节，所以残差基本就是钩子块的体积。
// **我自己的思考量（out）是被减掉的**，所以它不构成噪声 —— 这是这个设计的要点。
//
// ⚠ transcript 里同一条消息会因流式更新重复写很多行，必须按 message.id 去重。
// ⚠ 文件的**行序不是时间序**（实测过），要按 timestamp 排。
//
// 用法: node tools/verify/pwf-ab.mjs <会话.jsonl> <起始时间戳 ISO>
import fs from 'node:fs';
import readline from 'node:readline';

const [file, since] = process.argv.slice(2);
const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

const usageById = new Map(); // message.id -> {usage, ts, idx}
const callById = new Map(); // tool_use.id -> {name, input, msgId}
const resultById = new Map(); // tool_use.id -> 结果文本
let idx = 0;

for await (const line of rl) {
  if (!line.trim()) continue;
  const i = idx++;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    continue;
  }
  if (o.timestamp && o.timestamp < since) continue;
  const m = o.message;
  if (o.type === 'assistant' && m?.id) {
    if (!usageById.has(m.id)) usageById.set(m.id, { usage: m.usage, ts: o.timestamp, idx: i });
    if (Array.isArray(m.content))
      for (const b of m.content)
        if (b?.type === 'tool_use' && !callById.has(b.id))
          callById.set(b.id, { name: b.name, input: b.input, msgId: m.id });
  }
  if (o.type === 'user' && Array.isArray(m?.content))
    for (const b of m.content)
      if (b?.type === 'tool_result' && !resultById.has(b.tool_use_id))
        // ⚠ 钩子块**不在** message.content 里，它挂在记录顶层的 toolUseResult 字段上。
        //   所以判断"这条调用带没带块"必须看**整行原文**，不能只看 message.content
        //   （第一版就是这么错判的：明明残差 674/18 逐个交替，标签却全写成"无"）。
        resultById.set(b.tool_use_id, {
          text: typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? ''),
          pwf: line.includes('[planning-with-files]'),
        });
}

// 按时间排序出"请求序列"
const seq = [...usageById.entries()]
  .map(([id, v]) => ({ id, ...v }))
  .filter((x) => x.usage)
  .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.idx - b.idx));

const ctx = (u) =>
  (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);

// 每条请求对应的是"上一条工具调用"
const rows = [];
for (let k = 1; k < seq.length; k++) {
  const prev = seq[k - 1];
  const cur = seq[k];
  // 上一条请求里发出的工具调用（可能不止一个）
  const calls = [...callById.entries()].filter(([, c]) => c.msgId === prev.id);
  if (!calls.length) continue;
  const call = calls[calls.length - 1];
  const res = resultById.get(call[0]) ?? { text: '', pwf: false };
  const raw = String(call[1].input?.command ?? call[1].input?.file_path ?? call[1].name ?? '');
  // 只认实验调用；别的工具调用（改名、编辑等）会污染聚类
  if (!/PWF-AB-\d/.test(raw)) continue;
  const residual = ctx(cur.usage) - ctx(prev.usage) - (prev.usage.output_tokens ?? 0);
  rows.push({
    tag: raw.slice(0, 42).replace(/\n/g, ' '),
    n: Number(raw.match(/PWF-AB-(\d+)/)[1]),
    pwfRecorded: res.pwf,
    resChars: res.text.length,
    residual,
    ctx: ctx(cur.usage),
  });
}
rows.sort((a, b) => a.n - b.n);

console.log(`窗口内请求 ${seq.length} 次，其中实验调用 ${rows.length} 次\n`);
console.log('第几次  返回字节   上下文增量(已减掉我的输出)  该请求的上下文');
for (const r of rows)
  console.log(
    `  ${String(r.n).padStart(4)}   ${String(r.resChars).padStart(5)}      ${String(Math.round(r.residual)).padStart(6)}              ${(r.ctx / 1000).toFixed(0)}k`,
  );

// 残差应该分成两簇（开销是开关的、不是连续的）。用一维 2-means 找分界点，
// 不预设哪一簇是"开"—— 那是实验设计（每次调用翻转开关）决定的，不是数据能告诉我们的。
const xs = rows.map((r) => r.residual).sort((a, b) => a - b);
let best = null;
for (let cut = 1; cut < xs.length; cut++) {
  const lo = xs.slice(0, cut);
  const hi = xs.slice(cut);
  const mu = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mlo = mu(lo);
  const mhi = mu(hi);
  const sse = [...lo.map((v) => (v - mlo) ** 2), ...hi.map((v) => (v - mhi) ** 2)].reduce(
    (s, v) => s + v,
    0,
  );
  if (!best || sse < best.sse) best = { cut, mlo, mhi, sse, nlo: lo.length, nhi: hi.length };
}

console.log(`\n=== 结论 ===`);
const ratio = best.mhi / Math.max(1, best.mlo);
console.log(`残差明显分成两簇（一维 2-means，比值 ${ratio.toFixed(1)}×）：`);
console.log(
  `  低簇 ${best.nlo} 次，均值 ${Math.round(best.mlo)} token  ← 这条工具调用**没有**带钩子块`,
);
console.log(`  高簇 ${best.nhi} 次，均值 ${Math.round(best.mhi)} token  ← 带了钩子块`);
console.log(`\n**每次工具调用的钩子开销 ≈ ${Math.round(best.mhi - best.mlo)} token**`);
console.log(
  `（实验设计是每次调用翻转一次开关，所以两簇应当交替出现 —— 看上面的表里残差是否交替，这就是自检。）`,
);
