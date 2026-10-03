// Claude Code 的 Stop 钩子：模型想结束这一轮时，强制跑类型检查与全部测试；不通过就不让它停下，并把失败摘要反馈回去。
// 为避免死循环：同一轮里连续拦截 3 次后放行，但会在输出里写明“仍未通过”。
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const counter = join(process.cwd(), '.claude', '.stop-attempts');
const attempts = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) || 0 : 0;

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf8', timeout: 15 * 60 * 1000 });
    return null;
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const lines = out.split(/\r?\n/).filter((l) => /error TS|FAIL|AssertionError|Error:|✗|×/.test(l));
    return (lines.length ? lines : out.split(/\r?\n/).slice(-40)).slice(0, 40).join('\n');
  }
}

// 用 --silent 而不是 -s：pnpm 12 起把 -s 这个简写去掉了，会直接报
// “unexpected argument '-s' found”，于是钩子每次都误判成“类型检查失败”。
// pnpm 不在 PATH 上、或这个 pnpm 不认 --silent 时，退回 npx 拉一个 pnpm@10。
let PNPM = 'pnpm';
try { execSync('pnpm --silent --version', { stdio: 'ignore' }); } catch { PNPM = 'npx -y pnpm@10'; }
const tc = run(`${PNPM} --silent typecheck`);
const tests = tc ? null : run(`${PNPM} --silent test`);
if (!tc && !tests) {
  if (existsSync(counter)) unlinkSync(counter);
  process.exit(0);
}
if (attempts >= 3 || input.stop_hook_active && attempts >= 3) {
  if (existsSync(counter)) unlinkSync(counter);
  process.stderr.write('【stop-check】已连续拦截 3 次，放行；但类型检查或测试仍未通过——这一轮的工作不算完成，下一轮先修这些。\n');
  process.exit(0);
}
writeFileSync(counter, String(attempts + 1));
process.stderr.write(
  '【stop-check】还不能结束：' + (tc ? '类型检查失败' : '测试失败') + '。修好之后再结束（不要改测试或夹具来通过）。\n' + (tc ?? tests) + '\n',
);
process.exit(2);
