#!/usr/bin/env node
/**
 * pwf-lite：把 planning-with-files 的 **PreToolUse 那一档**关掉，其余全保留。
 *
 * 【为什么】实测（`tools/verify/pwf-ab.mjs`，A/B 交替 12 次）：
 * PreToolUse 那一档挂在 `Write|Edit|Bash|Read|Glob|Grep` 上，**每次工具调用**
 * 都往上下文里注入一份 `task_plan.md`，实测 **+664 token / 次**。
 * 而同一份计划在 `UserPromptSubmit`（每用户消息一次）刚给过 —— 边际价值很低。
 *
 * 【改哪一段】插件脚本 `hooks/claude-hook.sh` 的 `case "$EVENT"` 里
 * `pre-tool-use)` 那个分支。只让它 `exit 0`，其余分支（session-start /
 * user-prompt-submit / post-tool-use / pre-compact / stop）原样不动。
 *
 * ⚠ 为什么改**脚本**而不是 `hooks.json`：`hooks.json` 是 Claude Code **启动时**读的，
 *   改完要重启；而 `claude-hook.sh` 是每次事件**现跑**的子进程，改完**当场生效**。
 *
 * ⚠ **插件升级会覆盖掉这个补丁**（和 `~/.codegraph/` 那个 Windows 补丁同一个道理）。
 *   升级后重跑一次：`node tools/setup/pwf-lite.mjs`。脚本是幂等的，可以随便重跑。
 *
 * 用法：
 *   node tools/setup/pwf-lite.mjs           # 打补丁
 *   node tools/setup/pwf-lite.mjs --check   # 只看状态，不改
 *   node tools/setup/pwf-lite.mjs --revert  # 还原（从 .bak 备份）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MARK = '# PATCHED(mcpe-ts/pwf-lite)';
const FROM = `    pre-tool-use)\n        emit_context "PreToolUse" "pretool"\n        ;;\n`;
const TO = `    pre-tool-use)\n        ${MARK}: 关掉"每次工具调用重复注入同一份计划"。\n        # 实测每次调用白送 664 token（见 tools/verify/pwf-ab.mjs）。\n        # UserPromptSubmit / SessionStart 那两档保留，跨会话恢复不受影响。\n        exit 0\n        ;;\n`;

const HOME = os.homedir();
const CANDIDATES = [
  path.join(HOME, '.claude/plugins/cache/planning-with-files/planning-with-files'),
  path.join(HOME, '.claude/plugins/marketplaces/planning-with-files'),
];

/** 找出所有版本目录下的 hooks/claude-hook.sh */
function findTargets() {
  const out = [];
  for (const base of CANDIDATES) {
    if (!fs.existsSync(base)) continue;
    // cache 下面还有一层版本号目录
    const dirs = [base, ...fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(base, d.name))];
    for (const d of dirs) {
      const f = path.join(d, 'hooks/claude-hook.sh');
      if (fs.existsSync(f)) out.push(f);
    }
  }
  return [...new Set(out)];
}

const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--revert') ? 'revert' : 'patch';
const targets = findTargets();
if (!targets.length) {
  console.log('没找到 planning-with-files 插件，可能没装。');
  process.exit(0);
}

let changed = 0;
let already = 0;
for (const f of targets) {
  const src = fs.readFileSync(f, 'utf8');
  const bak = `${f}.bak-pwflite`;
  const short = f.replace(HOME, '~').replace(/\\/g, '/');

  if (mode === 'check') {
    console.log(`${src.includes(MARK) ? '已打补丁 ' : '未打补丁 '} ${short}`);
    continue;
  }

  if (mode === 'revert') {
    if (!fs.existsSync(bak)) {
      console.log(`没有备份，跳过  ${short}`);
      continue;
    }
    fs.copyFileSync(bak, f);
    console.log(`已还原    ${short}`);
    changed++;
    continue;
  }

  if (src.includes(MARK)) {
    already++;
    console.log(`已打过    ${short}`);
    continue;
  }
  if (!src.includes(FROM)) {
    console.log(`⚠ 找不到目标代码块（插件版本变了？），跳过  ${short}`);
    continue;
  }
  fs.writeFileSync(bak, src); // 只在第一次打补丁时留备份（幂等）
  fs.writeFileSync(f, src.replace(FROM, TO));
  changed++;
  console.log(`已打补丁  ${short}`);
}

console.log(
  mode === 'check'
    ? ''
    : `\n改了 ${changed} 个，本来就打过 ${already} 个。\n` +
        `PreToolUse 那一档已关；其余档位不动。\n` +
        `⚠ 插件升级会覆盖，升级后重跑：node tools/setup/pwf-lite.mjs`,
);
