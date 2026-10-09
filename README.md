# MCPE-TS

把 Minecraft PE 0.6.1 的 C++ 源码**逐个函数**移植成 TypeScript，在浏览器里运行。目标是行为与原版一致，不是“能跑就行”：判断对错的依据只有参考 C++ 源码、用它跑出来的黄金样本，以及浏览器实测。

当前状态：单机部分已基本移植完，联机未做。详见 [`docs/状态与路线.md`](docs/状态与路线.md)。

## 快速开始

```bash
pnpm install
pnpm dev:web          # 开发服务器，打开页面即是起始菜单
```

| 目的                                           | 命令                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 类型检查 / 测试 / 构建                         | `pnpm typecheck` / `pnpm test` / `pnpm build`                                                       |
| 只跑一个测试文件                               | `npx vitest run tests/<路径>`                                                                       |
| 定型检查（类型检查 + 测试 + 台账，只打印摘要） | `pnpm check [测试文件…]`                                                                            |
| 台账（DEFERRED / OMIT / ADAPTED 统计）         | `pnpm ledger`、`pnpm ledger <系统名>`                                                               |
| 格式与 lint                                    | `pnpm format:check`、`pnpm lint`                                                                    |
| 完整 CI                                        | `pnpm run ci`（**不能写成 `pnpm ci`**——那是 pnpm 自带的 `install --frozen-lockfile`，什么都不检查） |
| 读 C++（展开网页版构建的 `#ifdef`、去注释）    | `python tools/porting/clean.py <文件…>`                                                             |
| 打印某几个成员函数                             | `python tools/porting/fn.py <file.cpp> <类名> <函数1,函数2>`                                        |
| 重新生成黄金样本                               | `REF=<参考源码> bash tools/golden/build.sh [节名…]`（Linux 或 WSL；`--list` 列出全部节）            |
| 浏览器实测                                     | `node tools/verify/smoke.mjs tools/verify/scenarios/<场景>.mjs`                                     |

全部测试一次跑完要五分钟以上，分批跑的方法见 [`docs/验证方法.md`](docs/验证方法.md)。

## 环境

| 需要                        | 用途                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Node 22、pnpm               | 构建与测试                                                                                                          |
| Python 3.10+                | `tools/porting/*.py`（读 C++、生成草稿、检查整数除法与漏加的 `this.`）                                              |
| g++（WSL 或 Linux，x86-64） | 重新生成黄金样本；WSL 里还要装 node（`build.sh` 最后一步用它）                                                      |
| Playwright + Chromium       | 浏览器实测（`npx playwright install chromium`）                                                                     |
| 参考 C++ 源码               | 放在仓库外，路径记为 `$REF`（里面有 `src/` 和 `data/`），只读；Claude Code 从 `.claude/settings.json` 的 `env` 读取 |

不要在 Windows 原生 MinGW 上重新生成黄金样本：数值能算对，但 `registry.json` 依赖 `MALLOC_PERTURB_` 检测未初始化内存，在 Windows 上无效。从 Git Bash 调 WSL 时加 `MSYS_NO_PATHCONV=1`。

## 目录

| 位置                                                                      | 内容                                                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/core、util、platform、nbt、locale、world、client`               | 按 C++ 目录分的包，路径与类名镜像 C++（`src/world/level/tile/Tile.h` → `packages/world/src/level/tile/Tile.ts`） |
| `apps/web`                                                                | 网页入口（`src/main.ts`）、预加载表（`src/assets.ts`）、贴图与声音（`public/`）                                  |
| `apps/server`                                                             | 占位，专用服务器不在范围内                                                                                       |
| `tests/unit`、`tests/golden`、`tests/helpers`                             | 单元测试；黄金样本的比较；测试辅助（无头世界等）                                                                 |
| `fixtures/golden`                                                         | 黄金样本夹具（由 C++ 生成，提交进仓库，不要手改）                                                                |
| `tools/golden`                                                            | 生成夹具的 C++ harness 与 `build.sh`                                                                             |
| `tools/porting`                                                           | 移植脚本（预处理、草稿生成、检查），说明见其中的 `README.md`                                                     |
| `tools/verify`                                                            | 浏览器实测（`smoke.mjs` 与 `scenarios/`）、定型检查 `check.mjs`、变异测试 `mutate.mjs`                           |
| `tools/hooks`                                                             | Claude Code 的三个钩子（见下）                                                                                   |
| `tools/sound`、`tools/sync-images.mjs`、`tools/ledger.mjs`、`tools/bench` | 声音包打包、贴图同步、台账、性能基准                                                                             |

浏览器里 `window.__app` 是 `NinecraftApp` 实例，可以直接读写游戏状态。

## 文档

| 文档                                       | 内容                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| [`docs/状态与路线.md`](docs/状态与路线.md) | 做到哪了、还没做什么、等决定的事                                           |
| [`docs/移植规范.md`](docs/移植规范.md)     | 移植规则 R1–R14、数值三档、台账标记、重载命名、原版里容易被当成 bug 的事实 |
| [`docs/验证方法.md`](docs/验证方法.md)     | 测试、黄金样本（清单与生成）、浏览器实测、台账                             |
| [`docs/经验教训.md`](docs/经验教训.md)     | 实际踩过的坑，带来龙去脉                                                   |
| [`docs/历史.md`](docs/历史.md)             | 里程碑、关键决定，以及去 git 历史里找原始记录的方法                        |
| `CLAUDE.md`、`.claude/`                    | 给 AI 的规则、技能（含速查清单 PITFALLS）、斜杠命令、审查子代理            |

## 用 AI 继续这个项目

仓库为 Claude Code 准备了规则、技能和钩子，也可以接其他兼容 Anthropic 接口的模型（例如把 `ANTHROPIC_BASE_URL` 指向 DeepSeek 的兼容地址）。

**钩子是硬约束，不靠模型自觉：**

- 改文件前（`guard`）：禁止改 `fixtures/golden/`、禁止改参考 C++、禁止在测试里加 `.skip` / `.only`。
- 改文件后（`post-edit`）：扫描 C++ 残留（`->`、`::`、`NULL`、`(int)x`、`1.0f`）、`declare function`、`any`、`@ts-ignore`、`$1` 方法名，发现就打回。
- 想结束时（`stop-check`）：自动跑类型检查和测试，不通过不让结束（连续 3 次后放行并说明仍未通过）。

**派活的方法：**

1. 一次只给一个明确的小步骤，并把验收条件写进提示（例如“黄金样本 X 通过、全部测试通过、提交”）。
2. 让它先列出要改的文件和改法，确认后再动手。
3. 每步做完跑 `/review-port <ts文件> <C++路径>`（只读的审查子代理逐函数对照 C++），再 `/verify`。
4. 让它打开截图逐张描述画面——只看退出码发现不了“画错了图”。

**自己检查结果：** `git diff --stat` 看改动范围；`git diff fixtures/golden` 必须为空（除非这一步就是新增样本）；`pnpm ledger` 看条数变化并要求解释；`rg "DEFERRED\(待确认\)"` 找它拿不准的地方；打开 `tools/verify/out/` 的截图看一眼。

**该换更强的模型或人工介入的时候：** 黄金样本对不上、连续两次改不对；需要做设计决定（同步与异步、多重继承怎么拆、某个系统要不要暂缓）；画面上出现“画错了图”、残影、闪烁这类没有报错的问题；它开始改测试、改夹具，或大段删除 C++ 语句来“通过”。
