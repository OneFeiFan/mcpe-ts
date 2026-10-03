---
description: 按标准流程移植一个 C++ 单元（类或若干函数）
argument-hint: <C++ 相对路径，如 client/gui/screens/OptionsScreen> [说明]
---

移植参考源码里的 `$ARGUMENTS`。

严格按 skill `mcpe-porting` 的 0–7 步执行，每一步完成后用一两句话汇报：

1. 用 `python tools/porting/clean.py $REF/src/<路径>.h $REF/src/<路径>.cpp` 读源码，列出：基类、字段（按声明顺序）、所有成员函数（标出虚函数）、静态成员、文件内 static 函数/变量。
2. 列出依赖，逐个查 TS 里是否存在；决定 import / 前向声明 / DEFERRED。
3. 写 TS（大类用 cls2ts 流程）。
4. 对照 `.claude/skills/mcpe-porting/PITFALLS.md` 逐条检查，并运行 divs.py、shadow.py，把每一处整数除法的判断结果列出来。
5. 接线：替换所有等待它的 DEFERRED / OMIT / FORWARD-DECL。
6. 验证：`pnpm typecheck`、`pnpm test`；需要时写黄金样本；有画面的跑 browser-verify 并打开截图描述所见。
7. `pnpm ledger`，提交。

不要一次改超过约 300 行；超过就先拆分并说明拆分方案。
