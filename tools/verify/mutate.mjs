// 一次性反向验证工具：改坏实现的一处，跑指定测试，看是否变红，然后还原。
//
// 【为什么要它】仓库的规矩是"每个一次过的测试都要反向验证"—— 把源码扰动一处，
// 确认对应断言真的会红。手改手还原太慢也太容易忘，写成脚本。
//
// 用法：node tools/verify/mutate.mjs <测试文件> <变异清单.json>
// 清单格式：[{ "file": "…", "from": "…", "to": "…", "label": "…" }, …]
//
// 每个变异都必须让 `from` 在文件里**恰好出现一次**（多处就写长一点），否则直接报错 ——
// 免得改错地方还以为验证过了。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , testFile, listFile] = process.argv;
if (!testFile || !listFile) {
  console.error('用法：node tools/verify/mutate.mjs <测试文件> <变异清单.json>');
  process.exit(2);
}

const mutations = JSON.parse(readFileSync(listFile, 'utf8'));

function runTest() {
  try {
    execFileSync('npx', ['vitest', 'run', testFile], { stdio: 'pipe' });
    return true; // 绿
  } catch {
    return false; // 红
  }
}

const results = [];
for (const m of mutations) {
  const src = readFileSync(m.file, 'utf8');
  const hits = src.split(m.from).length - 1;
  if (hits !== 1) {
    results.push({ label: m.label, status: `跳过：from 出现 ${hits} 次（要求恰好 1 次）` });
    continue;
  }
  writeFileSync(m.file, src.replace(m.from, m.to));
  try {
    const green = runTest();
    results.push({ label: m.label, status: green ? '⚠ 仍然绿（没抓住）' : '红 ✓' });
  } finally {
    writeFileSync(m.file, src); // 还原
  }
}

console.log('\n===== 反向验证结果 =====');
let caught = 0;
for (const r of results) {
  console.log(`${r.status.padEnd(24)} ${r.label}`);
  if (r.status === '红 ✓') caught++;
}
console.log(`\n${caught}/${results.length} 个变异被抓住`);
