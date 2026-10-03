// Claude Code 的 PostToolUse 钩子（Edit / Write / MultiEdit 之后）：扫描刚改过的 .ts 文件里“C++ 转写残留”和禁用写法。
// 退出码 2 = 把问题反馈给模型（修改已经写入，要求它马上修）。
import { existsSync, readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const ti = input.tool_input ?? {};
const file = String(ti.file_path ?? ti.path ?? '');
if (!/\.(ts|tsx|mts)$/.test(file) || !existsSync(file)) process.exit(0);
const lines = readFileSync(file, 'utf8').split(/\r?\n/);
const rules = [
  [/\bdeclare\s+(function|const|let|var|class)\b/, 'declare 只骗过类型检查，运行时不存在：改成真正的 import（手册：不要用 declare 代替 import）'],
  [/\b\w+\$\d+\s*\(/, '方法名里有 $n（如 getTexture$1）：按 R10 用描述性名字，并加 override'],
  [/@ts-(ignore|nocheck|expect-error)/, '不要用 @ts-ignore / @ts-nocheck 压掉类型错误，修正类型'],
  [/\bas\s+any\b|:\s*any\b(?!\[\]\)\s*=>)/, '不要用 any；用具体类型或 unknown + 断言（mixin 构造器的 ...args: any[] 除外）'],
  [/->|::|\bNULL\b|\bstd::|\bsizeof\s*\(|\bnullptr\b/, 'C++ 语法残留（-> :: NULL std:: sizeof nullptr）'],
  [/\((int|float|short|char|unsigned|long|double|bool)\)\s*[\w(]/, 'C 风格强转残留：int → Math.trunc(…)，float → Math.fround(…) 或去掉，char/short → 位运算截断'],
  [/\b\d+\.\d*f\b|\b\d+f\b(?!\w)/, 'float 字面量后缀 f 残留（1.0f → 1.0）'],
  [/\b(unsigned|signed)\s+\w+\s+\w+\s*=/, 'C++ 变量声明残留'],
];
const hits = [];
lines.forEach((l, i) => {
  const code = l.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '').replace(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`/g, '""');
  if (/^\s*(\*|\/\*)/.test(l)) return; // 注释行（文件头的 C++ 引用说明）
  for (const [re, msg] of rules) if (re.test(code)) hits.push(`${file}:${i + 1}: ${msg}\n    ${l.trim().slice(0, 140)}`);
});
if (hits.length) {
  process.stderr.write('【post-edit】刚改过的文件里有问题，请立即修正：\n' + hits.slice(0, 30).join('\n') + (hits.length > 30 ? `\n…… 另有 ${hits.length - 30} 处` : '') + '\n');
  process.exit(2);
}
process.exit(0);
