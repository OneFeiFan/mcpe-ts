// Claude Code 的 PreToolUse 钩子（Edit / Write / MultiEdit）：拦下不允许的修改。
// 退出码 2 = 拒绝这次工具调用，stderr 的内容会反馈给模型。
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const ti = input.tool_input ?? {};
const file = String(ti.file_path ?? ti.path ?? '').replace(/\\/g, '/');
const problems = [];

// 1. 黄金样本夹具只能由 tools/golden/build.sh 从参考 C++ 重新生成，禁止手改（手改 = 让测试“假通过”）
if (/\/fixtures\/golden\//.test(file)) problems.push('不能手改 fixtures/golden/ 下的夹具。夹具只能用 REF=<参考源码> bash tools/golden/build.sh 从参考 C++ 生成。测试不过时去修 TS 实现。');
// 2. 参考 C++ 源码只读
if (/(^|\/)(ref|reference|mcpe-src)\/src\//.test(file) || /\.(cpp|h|hpp|mm)$/.test(file) && !/tools\/golden\//.test(file))
  problems.push('参考 C++ 源码是只读的，不能修改（tools/golden/ 下的 harness 除外）。');
// 3. 不许删改已有测试的断言来“修好”测试：写入测试文件时检查是否新加了 skip / only
const newText = String(ti.content ?? ti.new_string ?? '') + (Array.isArray(ti.edits) ? ti.edits.map((e) => e.new_string).join('\n') : '');
if (/\/tests\//.test(file) && /\b(it|describe|test)\.(skip|only|todo)\s*\(/.test(newText))
  problems.push('不能用 .skip / .only / .todo 绕过测试。测试不过时修实现；确实要暂缓的功能在实现里标 DEFERRED(系统名) 并在测试里断言暂缓行为。');

if (problems.length) {
  process.stderr.write('【guard】这次修改被拒绝：\n- ' + problems.join('\n- ') + '\n');
  process.exit(2);
}
process.exit(0);
