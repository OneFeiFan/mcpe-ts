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
const paramChars = new Map(); // tool_use id -> 该次调用的参数序列化长度
const resMax = new Map(); // tool_use id -> 该次返回的文本长度（同一 id 取最长的那次）
let hookBytes = 0;
let hookBlocks = 0;
const tsFirstLast = [];
let n = 0;

function add(map, k, v) {
  map.set(k, (map.get(k) ?? 0) + v);
}
/** 数一条工具返回里内嵌图片的 base64 字符数（截图走的是这个口径，不是 textLen） */
function imgB64(content) {
  let s = 0;
  const scan = (x) => {
    if (Array.isArray(x)) x.forEach(scan);
    else if (x && typeof x === 'object') {
      if (x.type === 'image') s += x.source?.data?.length ?? 0;
      else Object.values(x).forEach(scan);
    }
  };
  scan(content);
  return s;
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
    // ⚠ 图片（截图）不能按字符算：一张 1280×720 的 base64 有 47 万字符，但按图片计价只值 ~1400 token。
    //   混进来会把"文字返回"撑大 5 倍 —— 第一版就这么错了。单独统计，见下面的截图一节。
    else if (b?.type === 'image') s += 0;
    else s += JSON.stringify(b).length;
  }
  return s;
}

const seenRec = new Set(); // ⚠ 同一条记录会因流式更新被重复写很多行（实测 18 倍），必须按 uuid 去重，
                           //   否则"工具返回合计"会被撑大成十几倍 —— 第一版就栽在这上面。
for await (const line of rl) {
  if (!line.trim()) continue;
  n++;
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    continue;
  }
  if (r.uuid) {
    if (seenRec.has(r.uuid)) continue;
    seenRec.add(r.uuid);
  }
  const m = r.message;
  if (r.type === 'assistant' && m?.usage && m.id) {
    usageById.set(m.id, m.usage);
    modelById.set(m.id, m.model);
  }
  if (r.type === 'assistant' && Array.isArray(m?.content)) {
    for (const b of m.content)
      if (b?.type === 'tool_use') {
        callNameById.set(b.id, b.name);
        // 同上：同一个工具调用会随流式更新出现多次，取最长的那次
        const sz = typeof b.input === 'string' ? b.input.length : JSON.stringify(b.input ?? '').length;
        if (sz > (paramChars.get(b.id) ?? -1)) paramChars.set(b.id, sz);
      }
  }
  if (r.type === 'user' && Array.isArray(m?.content)) {
    for (const b of m.content) {
      // ⚠ uuid 去重**不够**：同一条 tool_result 会被重新发一遍、带新 uuid（实测还能翻 5 倍）。
      //   一次工具调用只有一条结果，所以按 tool_use_id 去重才是对的。
      if (b?.type === 'tool_result' && b.tool_use_id) {
        // ⚠ 取**最长**的那次：同一条结果会被逐步补全地重写，取第一条会拿到半截的。
        const sz = textLen(b.content); // 图片已排除（见 textLen）
        const img = imgB64(b.content);
        const prev = resMax.get(b.tool_use_id);
        if (!prev || sz > prev.t) resMax.set(b.tool_use_id, { t: sz, img });
      }
    }
  }
  // 钩子注入：数一条 PWF 块的实测平均长度。
  // ⚠ 同样要去重（按 tool_use_id，没有的按 uuid），否则会重复计入十几倍。
  // ⚠ 不在这里数 PWF 块：同一块会被重复写很多行，而且 **Bash 调用的块根本不写进 transcript**
  //   （只有 Edit 那种才写），所以按 transcript 计数既会重复也会漏。
  //   每次工具调用的开销用 A/B 实测值 664 token（见 tools/verify/pwf-ab.mjs），在输出处按调用次数算。
  if (line.includes('[planning-with-files]')) hookBlocks++;
  if (r.timestamp) {
    if (tsFirstLast.length < 1) tsFirstLast.push(r.timestamp);
    tsFirstLast[1] = r.timestamp;
  }
}

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
console.log('\n=== 我发出去的工具参数 ===');
const paramByTool = new Map();
for (const [id, chars] of paramChars) add(paramByTool, callNameById.get(id) ?? '?', chars);
const totalParam = [...paramByTool.values()].reduce((a, b) => a + b, 0);
console.log(rows(paramByTool, totalParam));
console.log(`  参数合计 ${fmt(totalParam)}`);

console.log('\n=== 工具返回内容大小（真正吃掉上下文的）===');
const resByTool = new Map();
for (const [id, v] of resMax) add(resByTool, callNameById.get(id) ?? '?', v.t);
const totalRes = [...resByTool.values()].reduce((a, b) => a + b, 0);
console.log(rows(resByTool, totalRes));
console.log(`  文字返回合计 ${fmt(totalRes)}（${resMax.size} 条）`);
console.log('\n=== 单条最大的 8 条文字返回 ===');
for (const [id, v] of [...resMax.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 8))
  console.log(`  ${fmt(v.t).padStart(9)}  ${callNameById.get(id) ?? '?'}`);

console.log('\n=== 截图（按图片计价，不按字符）===');
const imgN = [...resMax.values()].filter((v) => v.img > 0).length;
const imgBytes = [...resMax.values()].reduce((a, v) => a + v.img, 0);
console.log(`  ${imgN} 张，base64 合计 ${fmt(imgBytes)} 字符`);
console.log(`  按每张 ≈1400 token 估（1280×720），累计约 ${fmt(imgN * 1400)} token`);
console.log('  ⚠ 图片一进上下文，之后每次请求都要重读一遍，直到下次压缩。');
console.log(`\n=== 钩子注入（planning-with-files PreToolUse）===`);
const calls = paramChars.size;
console.log(`  工具调用 ${calls} 次 × 664 token/次（A/B 实测值，见 pwf-ab.mjs）= ${fmt(calls * 664)} token`);
console.log(`  （带钩子块的记录 ${hookBlocks} 行，仅供参考 —— 同一块会重复写，且 Bash 的块不写进 transcript）`);
