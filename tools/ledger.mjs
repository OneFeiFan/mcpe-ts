// 移植台账：扫描 packages/*/src 里的标记注释并汇总。
//   // DEFERRED(系统): <原 C++ 代码>      —— 1:1 函数体内被暂时切掉的调用（原文保留在注释里，恢复时直接还原）
//   // OMIT(系统): 函数签名  <C++ 文件:行>  —— 本轮整函数不移植（没有任何已移植代码调用它）
//   // ADAPTED(原因): 说明                 —— 与 C++ 不同的改写（平台差异或 demo 专用接缝）
//   // FORWARD-DECL(类名)                  —— 前向声明接口（只含已用成员），移植正身时整体替换
// 用法：pnpm ledger            汇总
//       pnpm ledger Entity     只列某个系统的条目
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const filter = process.argv[2];
const re = /\/\/\s*(DEFERRED|OMIT|ADAPTED|FORWARD-DECL)\(([^)]+)\)\s*:?\s*(.*)$/;
const rows = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'dist') walk(p); continue; }
    if (!p.endsWith('.ts')) continue;
    readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, i) => {
      const m = re.exec(line);
      if (m) rows.push({ kind: m[1], sys: m[2].trim(), text: m[3].trim(), at: `${relative(root, p)}:${i + 1}` });
    });
  }
}
for (const top of ['packages', 'apps']) walk(join(root, top));
const shown = filter ? rows.filter((r) => r.sys === filter) : rows;
const count = {};
for (const r of rows) count[`${r.kind}(${r.sys})`] = (count[`${r.kind}(${r.sys})`] ?? 0) + 1;
console.log('移植台账汇总：');
for (const [k, v] of Object.entries(count).sort()) console.log(`  ${k.padEnd(34)} ${v}`);
if (filter) for (const r of shown) console.log(`${r.kind.padEnd(12)} ${r.at.padEnd(60)} ${r.text}`);
console.log(`共 ${rows.length} 条`);
