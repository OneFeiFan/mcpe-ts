// 一次性分析脚本：统计某次会话 transcript 里 token 花在哪。
// ⚠ transcript 里同一条 assistant 消息会因为流式更新被**重复写很多行**（实测 40912 行里只有 3685 个
//   不同 message.id），所以必须按 message.id 去重、取**最后**一条（那条的 usage 才是最终的）。
// 用法: node tools/verify/token-audit.mjs <会话.jsonl>
import fs from 'node:fs';
import readline from 'node:readline';

const file = process.argv[2];
const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

const usageById = new Map(); // id -> usage
const modelById = new Map();
const callNameById = new Map(); // tool_use id -> name
const resultBytesByTool = new Map();
const biggest = [];
let hookBytes = 0;
let hookBlocks = 0;
let pwfBlockLen = 0;
let pwfBlockN = 0;
const tsFirstLast = [];
let n = 0;

function add(map, k, v) {
  map.set(k, (map.get(k) ?? 0) + v);
}
function textLen(content) {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;
  let s = 0;
  for (const b of content) {
    if (typeof b === 'string') s += b.length;
    else if (b?.type === 'text') s += (b.text ?? '').length;
    else if (b?.type === 'tool_result') s += textLen(b.content);
    else if (b?.type === 'tool_use') s += JSON.stringify(b.input ?? {}).length;
    else s += JSON.stringify(b).length;
  }
  return s;
}

for await (const line of rl) {
  if (!line.trim()) continue;
  n++;
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    continue;
  }
  const m = r.message;
  if (r.type === 'assistant' && m?.usage && m.id) {
    usageById.set(m.id, m.usage);
    modelById.set(m.id, m.model);
  }
  if (r.type === 'assistant' && Array.isArray(m?.content)) {
    for (const b of m.content) if (b?.type === 'tool_use') callNameById.set(b.id, b.name);
  }
  if (r.type === 'user' && Array.isArray(m?.content)) {
    for (const b of m.content) {
      if (b?.type === 'tool_result') {
        const sz = textLen(b.content);
        const name = callNameById.get(b.tool_use_id) ?? '?';
        add(resultBytesByTool, name, sz);
        biggest.push({ bytes: sz, label: name });
      }
    }
  }
  // 钩子注入：数一条 PWF 块的实测平均长度
  const blocks = line.split('[planning-with-files]');
  if (blocks.length > 1) {
    hookBlocks += blocks.length - 1;
    for (let i = 1; i < blocks.length; i++) {
      // 该块到下一个 "[planning-with-files]" 或行尾
      const seg = blocks[i];
      const end = seg.indexOf('===END-PWF-DATA');
      pwfBlockLen += end > 0 ? end : Math.min(seg.length, 4000);
      pwfBlockN++;
    }
  }
  if (r.timestamp) {
    if (tsFirstLast.length < 1) tsFirstLast.push(r.timestamp);
    tsFirstLast[1] = r.timestamp;
  }
}

biggest.sort((a, b) => b.bytes - a.bytes);

const usage = { in: 0, out: 0, cacheWrite: 0, cacheRead: 0 };
for (const u of usageById.values()) {
  usage.in += u.input_tokens ?? 0;
  usage.out += u.output_tokens ?? 0;
  usage.cacheWrite +=
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
    (u.cache_creation?.ephemeral_5m_input_tokens ?? 0);
  usage.cacheRead += u.cache_read_input_tokens ?? 0;
}
const reqs = usageById.size;

const fmt = (v) =>
  v >= 1e9
    ? (v / 1e9).toFixed(2) + 'B'
    : v >= 1e6
      ? (v / 1e6).toFixed(1) + 'M'
      : v >= 1e3
        ? (v / 1e3).toFixed(0) + 'k'
        : String(Math.round(v));
const rows = (map, denom) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(
      ([k, v]) =>
        `  ${String(k).padEnd(22)} ${String(fmt(v)).padStart(9)}  ${denom ? ((v / denom) * 100).toFixed(0) + '%' : ''}`,
    )
    .join('\n');

console.log(`transcript 行数 ${n}，去重后真实 API 请求 ${reqs} 次`);
console.log(`时间跨度 ${tsFirstLast[0]} → ${tsFirstLast[1]}`);
console.log(`模型 ${[...new Set(modelById.values())].join(', ')}`);
console.log('\n=== token 记账（按 message.id 去重后）===');
console.log(`  输入(未缓存)          ${fmt(usage.in)}`);
console.log(`  缓存写入              ${fmt(usage.cacheWrite)}`);
console.log(`  缓存读取              ${fmt(usage.cacheRead)}`);
console.log(`  输出                  ${fmt(usage.out)}`);
console.log(
  `  合计                  ${fmt(usage.in + usage.cacheWrite + usage.cacheRead + usage.out)}`,
);
console.log(
  `  平均每次请求的上下文  ${fmt((usage.cacheRead + usage.cacheWrite + usage.in) / Math.max(1, reqs))}`,
);
console.log('\n=== 工具返回内容大小（真正吃掉上下文的）===');
const totalRes = [...resultBytesByTool.values()].reduce((a, b) => a + b, 0);
console.log(rows(resultBytesByTool, totalRes));
console.log(`  返回合计 ${fmt(totalRes)}`);
console.log('\n=== 单条最大的 12 个工具返回 ===');
for (const b of biggest.slice(0, 12)) console.log(`  ${fmt(b.bytes).padStart(9)}  ${b.label}`);
console.log(`\n=== 钩子注入（planning-with-files）===`);
console.log(`  块出现次数 ${hookBlocks}`);
console.log(`  单块平均长度 ${pwfBlockN ? Math.round(pwfBlockLen / pwfBlockN) : 0} 字符`);
console.log(`  估算总量 ${fmt(pwfBlockLen)}`);
