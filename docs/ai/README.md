# 用 Claude Code + DeepSeek 继续这个项目

这份说明给“人”看：怎么搭环境、怎么给模型派活、怎么判断它做得对不对。给模型看的规则在根目录 `CLAUDE.md` 和 `.claude/` 里。

## 1. 环境（Windows）

| 需要 | 用途 | 安装 |
|---|---|---|
| Node 22、pnpm 12 | 构建与测试 | 已有（本机实测 Node v22.14.0 / pnpm 12.8.1） |
| Claude Code | 终端里的代理 | `npm i -g @anthropic-ai/claude-code` |
| Python 3.10+ | `tools/porting/*.py`（读 C++、出草稿、检查） | python.org，安装时勾 “Add to PATH” |
| g++（WSL 或 MinGW-w64） | 重新生成黄金样本（`tools/golden/build.sh`） | 见下方说明 |
| Playwright + Chromium | 浏览器实测 | `pnpm add -D -w playwright && npx playwright install chromium` |
| 参考 C++ 源码 | 移植依据 | 放在仓库外，本机在 `D:\Work\mcpe-reimplementation\reference\minecraft-pe`（里面有 `src\` 和 `data\`） |

**g++ 用哪个**：`tools/golden/build.sh` 原本是给 Linux/WSL 写的。本机实测过 `E:\mingw64`（MinGW-w64 g++ 15.1，即 `c++.exe`）：
- 能编、能跑，**算出来的数值和 Linux 生成的夹具逐字节一致**（只差换行符 CRLF）；
- 但 build.sh 里还有几处 Linux 专用的东西要改才跑得通（`ld` 的名字、CRLF、汇编桩的 ELF 语法、`sigill_diag.cpp` 用的 POSIX `sigaction`）；
- 而且 `MALLOC_PERTURB_` 在 Windows 上无效，**`registry.json` 依赖它检测未初始化内存（58 个字段），不要在 Windows 上重新生成**。

`REF` 已经写进 `.claude/settings.json` 的 `env` 里，Claude Code 每次会话自动带上，不用再手动设。

把 DeepSeek 接到 Claude Code（以 DeepSeek 官方文档 https://api-docs.deepseek.com/guides/anthropic_api 为准）：
```powershell
$env:ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic"
$env:ANTHROPIC_AUTH_TOKEN = "<你的 DeepSeek API Key>"
claude                            # REF 由 .claude/settings.json 提供，不必再设
```
进入后先运行 `/doctor`（检查环境），再输入“读 CLAUDE.md，然后告诉我你理解的工作流程”，确认它读到了规则。

## 2. 仓库里为它准备的东西

| 位置 | 作用 |
|---|---|
| `CLAUDE.md` | 每次启动自动读：目标、硬规则、每个单元的标准流程、常用命令 |
| `.claude/skills/mcpe-porting/` | 移植流程 + **PITFALLS.md（26 条 C++→TS 语言差异，全是本项目真实踩过的坑）** |
| `.claude/skills/golden-sample/` | 怎么写 C++ harness 生成标准答案、怎么比较 |
| `.claude/skills/browser-verify/` | 怎么用 Playwright 跑场景、读游戏状态、截图并查看 |
| `.claude/commands/` | 斜杠命令：`/port-unit`、`/verify`、`/golden`、`/review-port` |
| `.claude/agents/port-reviewer.md` | 只读的审查子代理：逐函数对照 C++ 找问题 |
| `.claude/settings.json` | 权限 + 三个**钩子**（见下） |
| `tools/porting/` | 我用过的全部移植脚本（预处理、草稿生成、整数除法清单、漏加 this. 检查） |
| `tools/verify/smoke.mjs` | 浏览器实测脚本（场景在 `tools/verify/scenarios/`） |
| `docs/ai/TASK-B-存档.md` | 下一阶段的任务单，拆成 9 步，每步有范围、样本、验收 |

### 钩子：不靠模型自觉的硬约束
- **guard（改文件前）**：禁止改 `fixtures/golden/`、禁止改参考 C++、禁止在测试里加 `.skip/.only`。这三条是“让测试假通过”的常见手段。
- **post-edit（改文件后）**：扫描刚改的 TS 文件，发现 C++ 残留（`->`、`::`、`NULL`、`(int)x`、`1.0f`）、`declare function`、`any`、`@ts-ignore`、`$1` 方法名就立刻打回。
- **stop-check（想结束时）**：自动跑 `pnpm typecheck` 和 `pnpm test`，不通过就不让它结束（连续 3 次后放行并明确说明“仍未通过”）。

## 3. 怎么派活（最重要）

能力弱一些的模型，最怕“大而模糊”的任务。规则：

1. **一次只给任务单里的一个步骤**，并把验收条件抄进提示：
   ```
   做 docs/ai/TASK-B-存档.md 的 B3（RegionFile）。
   按 /port-unit 的流程；完成标准：黄金样本 G14-1 通过、pnpm test 全绿、提交。
   每完成流程里的一步，先汇报再继续。
   ```
2. **让它先说计划再动手**：“先列出要改的文件和每个文件改什么，等我确认。”（Claude Code 里按 Shift+Tab 切到 plan 模式也可以。）
3. **每步做完，固定跑两条**：`/review-port <ts文件> <C++路径>`（子代理审查），然后 `/verify`。
4. **让它看截图并描述**：“打开 tools/verify/out/xxx/ 的截图，逐张描述画面。”只看退出码发现不了画错图。
5. 上下文变长后用 `/compact` 或开新会话；新会话第一句：“读 CLAUDE.md 和 docs/ai/TASK-B-存档.md，当前进度是 B?。”

## 4. 怎么判断它做得对不对（你可以自己检查的）

- `git diff --stat`：改动范围是不是只在这一步的文件里。
- `git diff fixtures/golden`：**必须为空**（除非这一步就是新增样本，而且只新增不修改）。
- `pnpm ledger`：DEFERRED/OMIT 条数应该下降；上升了要它解释。
- `rg "DEFERRED\(待确认\)"`：它拿不准的地方，集中拿来问更强的模型或你自己判断。
- 打开 `tools/verify/out/` 的截图自己看一眼。

## 5. 什么时候该换更强的模型（或回来找我）

- 黄金样本对不上，而它连续两次改不对（往往是 float 截断、整数除法、遍历顺序这类细节）。
- 需要做设计决定：同步/异步怎么适配、多重继承怎么拆、某个系统要不要整体暂缓。
- 画面上出现“画错了图”、残影、闪烁这类没有报错的问题。
- 它开始改测试、改夹具、或者大段删除 C++ 语句来“通过”。

## 6. 可选的增强

- **Playwright MCP**（交互式看网页、点按钮）：`claude mcp add playwright -- npx @playwright/mcp@latest`。适合排查画面问题；常规验证用 `tools/verify/smoke.mjs` 就够了，结果更可重复。
- **把审查交给另一个模型**：`port-reviewer` 子代理可以在 frontmatter 里指定别的模型（如果你的接入方式支持），让“写的”和“审的”不是同一个模型。
- **CI**：在 GitHub Actions 里跑 `pnpm ci`，防止某次提交把主干弄红。
