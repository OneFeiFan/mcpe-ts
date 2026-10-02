// 合并同一个 harness 的两次运行（正常运行与 MALLOC_PERTURB_ 填充运行）：两次结果不同的字段读到了 C++ 未初始化的内存。
// 输出以正常运行为准，并在该条目上加 "uninit": [字段名…]；TS 测试对这些字段按“零初始化”比较并注明。
// 用法：node merge-uninit.mjs a.json b.json out.json
import { readFileSync, writeFileSync } from 'node:fs';
const [a, b, out] = process.argv.slice(2);
const A = JSON.parse(readFileSync(a, 'utf8'));
const B = JSON.parse(readFileSync(b, 'utf8'));
let n = 0;
for (const key of Object.keys(A)) {
  if (!Array.isArray(A[key])) continue;
  A[key].forEach((x, i) => {
    const y = B[key][i];
    if (!x || !y) return;
    const diff = Object.keys(x).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
    if (diff.length) { x.uninit = diff; n++; }
  });
}
writeFileSync(out, JSON.stringify(A) + '\n');
console.log(`${out}：${n} 个条目含未初始化字段`);
