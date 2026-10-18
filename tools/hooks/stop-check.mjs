// Claude Code 的 Stop 钩子：模型想结束这一轮时，强制跑类型检查与全部测试；不通过就不让它停下，并把失败摘要反馈回去。
// 为避免死循环：同一轮里连续拦截 3 次后放行，但会在输出里写明“仍未通过”。
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const counter = join(process.cwd(), '.claude', '.stop-attempts');
const attempts = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) || 0 : 0;
const green = join(process.cwd(), '.claude', '.stop-green');

/**
 * 工作树指纹：HEAD + 所有已修改/未跟踪文件的内容。
 * 内容完全一致时，上次已经通过的 typecheck + 全量测试结论仍然成立，没必要再跑一遍
 * （全量套件有 130+ 个文件，反复跑只是浪费 CPU，还会把纯 CPU 测试挤到超时）。
 */
function treeFingerprint() {
  try {
    const head = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const files = execSync('git ls-files -mo --exclude-standard', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .sort();
    const h = createHash('sha256');
    h.update(head);
    for (const file of files) {
      h.update(file);
      try {
        h.update(readFileSync(file));
      } catch {
        h.update('<missing>');
      }
    }
    return h.digest('hex');
  } catch {
    return null; // 不在 git 仓库里就退回“每次照跑”
  }
}

const fingerprint = treeFingerprint();
if (fingerprint && existsSync(green) && readFileSync(green, 'utf8').trim() === fingerprint) {
  if (existsSync(counter)) unlinkSync(counter);
  process.exit(0);
}

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf8', timeout: 15 * 60 * 1000 });
    return null;
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const lines = out
      .split(/\r?\n/)
      .filter((l) => /error TS|FAIL|AssertionError|Error:|✗|×/.test(l));
    return (lines.length ? lines : out.split(/\r?\n/).slice(-40)).slice(0, 40).join('\n');
  }
}

// 用 --silent 而不是 -s：pnpm 12 起把 -s 这个简写去掉了，会直接报
// “unexpected argument '-s' found”，于是钩子每次都误判成“类型检查失败”。
// pnpm 不在 PATH 上、或这个 pnpm 不认 --silent 时，退回 npx 拉一个 pnpm@10。
let PNPM = 'pnpm';
try {
  execSync('pnpm --silent --version', { stdio: 'ignore' });
} catch {
  PNPM = 'npx -y pnpm@10';
}
const tc = run(`${PNPM} --silent typecheck`);
const tests = tc ? null : run(`${PNPM} --silent test`);
if (!tc && !tests) {
  // 只在跑测试期间工作树没变时才记录，避免把“边改边跑”的结果当成当前树的有效结论。
  if (fingerprint && treeFingerprint() === fingerprint) writeFileSync(green, fingerprint);
  if (existsSync(counter)) unlinkSync(counter);
  process.exit(0);
}
if (attempts >= 3 || (input.stop_hook_active && attempts >= 3)) {
  if (existsSync(counter)) unlinkSync(counter);
  process.stderr.write(
    '【stop-check】已连续拦截 3 次，放行；但类型检查或测试仍未通过——这一轮的工作不算完成，下一轮先修这些。\n',
  );
  process.exit(0);
}
writeFileSync(counter, String(attempts + 1));
process.stderr.write(
  '【stop-check】还不能结束：' +
    (tc ? '类型检查失败' : '测试失败') +
    '。修好之后再结束（不要改测试或夹具来通过）。\n' +
    (tc ?? tests) +
    '\n',
);
process.exit(2);
