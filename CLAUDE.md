# MCPE-TS：把 Minecraft PE 0.6.1（C++）1:1 移植成 TypeScript 网页版

Claude Code 每次启动都会读这个文件。**先读完它，再动手。**

## 你是谁、要做什么

你在把一份 C++ 游戏源码逐个函数地移植成 TS。目标是“行为与原版一致”，不是“能跑就行”。
判断对错的依据只有三个：**参考 C++ 源码**、**黄金样本**（用参考 C++ 跑出来的标准答案）、**浏览器实测**。

- 参考 C++ 源码：放在仓库外，路径记为 `$REF`（里面有 `src/` 和 `data/`）。**只读**。本机路径是
  `D:/Work/mcpe-reimplementation/reference/minecraft-pe`，已写进 `.claude/settings.json` 的 `env`，不用手动设。
- 工作手册：`MCPE-TS最小Demo实施流程-修订版10.html`（规则 R1–R14、三档数值规则、台账标记、R10 重载命名）。
- 每一步的任务单：`docs/ai/` 下的 `TASK-*.md`。一次只做一个任务单里的一个步骤。

## 必须遵守（违反会被钩子拦下）

1. **不改 `fixtures/golden/`**。夹具只能用 `REF=$REF bash tools/golden/build.sh` 从参考 C++ 重新生成。
2. **不改参考 C++**，不改已有测试的断言，不加 `.skip / .only`。测试不过就修实现。
3. **不留 C++ 语法**（`-> :: NULL std:: (int)x 1.0f`），不用 `declare` 代替 import，不用 `any` / `@ts-ignore`，方法名不许带 `$1`。
4. **每轮结束前类型检查和全部测试必须通过**（Stop 钩子会强制执行）。
5. **没移植的语句不能删**：原地留一行 `// DEFERRED(系统名): <C++ 原句>`；整个函数不移植写 `// OMIT(系统名): 函数签名  文件.cpp:行号`。

## 每个单元的标准流程（详见 skill：mcpe-porting）

1. 读 C++：`python tools/porting/clean.py $REF/src/<路径>.h $REF/src/<路径>.cpp`（已按网页版构建展开 #ifdef）。
2. 查依赖：它用到的类在 TS 里有没有（`rg "class 名字" packages`）。没有就先写前向声明（FORWARD-DECL）或把那几句标 DEFERRED。
3. 写 TS：大类先用 `tools/porting/cls2ts.py` 生成草稿，再逐函数人工核对；小类直接手写。
4. 逐项核对 `.claude/skills/mcpe-porting/PITFALLS.md` 里的 26 条语言差异。至少跑：
   - `python tools/porting/divs.py <file.ts>`：逐条判断整数除法；
   - `python tools/porting/shadow.py <file.ts> <成员清单>`：查漏加的 this.；
5. 接线：把原来的 `DEFERRED(...)` / `OMIT(...)` 换成真实调用。
6. 验证（三层，缺一不可）：
   - `pnpm typecheck` 与 `pnpm test`；
   - 数值或字节格式有关的：写黄金样本（skill：golden-sample）；
   - 能在画面上看到的：`node tools/verify/smoke.mjs <场景>`（skill：browser-verify），**并打开截图看一眼**。
7. `pnpm ledger` 看台账条数变化；`git commit`，提交说明写清移植了什么、暂缓了什么。

## 常用命令

| 目的                          | 命令                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| 类型检查 / 测试 / 构建        | `pnpm typecheck` / `pnpm test` / `pnpm build`                     |
| 只跑一个测试文件              | `npx vitest run tests/<路径>`                                     |
| 台账（DEFERRED、OMIT 统计）   | `pnpm ledger`                                                     |
| 读 C++（展开 #ifdef、去注释） | `python tools/porting/clean.py <文件...>`                         |
| 打印某几个成员函数            | `python tools/porting/fn.py <file.cpp> <类名> <函数1,函数2>`      |
| 生成类的 TS 草稿              | 见 `tools/porting/README.md`                                      |
| 重新生成黄金样本              | `REF=$REF bash tools/golden/build.sh`（需要 Linux 或 WSL 的 g++） |
| 浏览器实测                    | `node tools/verify/smoke.mjs tools/verify/scenarios/<场景>.mjs`   |

## 用 CodeGraph 找线索（只是线索，不是判据）

仓库和参考 C++ 两边都建好了索引（每台机器各建各的：`codegraph init <路径>`；`.codegraph/` 已加进 .gitignore）。
本机 CLI 不在 Git Bash 的 PATH 上，用这个完整路径：

```bash
CG="$LOCALAPPDATA/codegraph/current/bin/codegraph.cmd"
"$CG" callers -p "$REF" Tile::initTiles      # 谁调用了它（跨目录也能找到）
"$CG" impact  -p "$REF" <符号>               # 改动会波及什么
"$CG" explore -p "$REF" "<用大白话问>"        # 一次给出相关符号 + 调用路径 + 源码
"$CG" sync "$PWD"                            # 索引跟上改动；没有守护进程，改完要手动跑
```

查依赖（标准流程第 2 步）用它比 `rg` 快得多，TS 侧还会标出**覆盖该符号的黄金样本测试**。

**但它解析的是原始源码，不是 `clean.py` 展开 #ifdef 之后的源码**，所以会把 iOS / Android / Win32
那些分支也算进去 —— 它给出的调用关系**可能包含网页版构建里根本不存在的调用**。
所以：用它摸方向、找线索可以；**判据永远只有三个：clean.py 出来的源码、黄金样本、浏览器实测**。
不许拿它的输出当"移植对了"的证据。

## 仓库地图

- `packages/core|util|platform|nbt|locale|world|client`：按 C++ 目录分的包；`apps/web`：网页入口（`src/main.ts`、`src/assets.ts` 预加载表）。
- `tests/unit`：单元测试；`tests/golden`：黄金样本测试；`fixtures/golden`：夹具；`tools/golden`：生成夹具的 C++ harness。
- 浏览器里 `window.__app` 是 NinecraftApp 实例，可以直接读写游戏状态（场景脚本靠它）。

## 遇到拿不准的情况

- 不确定 C++ 某句在 TS 里怎么写：先查 PITFALLS.md；还不确定就保留 C++ 原句为 `DEFERRED(待确认)`，在提交说明里列出来，不要猜。
- 一个任务单步骤超过约 300 行改动或要碰 5 个以上文件：停下，把它拆成更小的步骤写回任务单，再继续。
- 不要“顺手优化”：保留 C++ 的怪癖（例如字宽扫描读红色分量、`%.ld` 打印 0 为空），在注释里写明是原样保留。
