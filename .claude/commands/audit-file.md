---
description: 全量审核一个 TS 文件（严格按 docs/全量审核方案.md 的 8 个步骤）
argument-hint: <TS 文件路径，例如 packages/world/src/entity/Mob.ts>
---

严格按 `docs/全量审核方案.md` 审核：$ARGUMENTS

必须依次完成，不得跳步：

1. `python tools/audit/worksheet.py $REF $ARGUMENTS > /tmp/ws.md`，把工作表贴出来。
2. 读对应的 C++ `.h` 与 `.cpp`（`python tools/porting/clean.py …`），列出每个成员的类型、哪些函数是 virtual、构造函数初始化列表、未初始化的成员。
3. 按方案第 5 节的 35 条清单，逐个函数并排对照 C++ 与 TS，每行 C++ 都要找到对应。
4. 给工作表的每一行写结论（一致 / 怪癖保留 / 已修 Wn / 原版 bug / ADAPTED / OMIT），不允许空行。
5. 修复每个“已修”，并为它写单元测试或黄金样本；先确认撤掉修复时测试会失败。
6. `pnpm typecheck`、三批测试、`npx prettier --check <改过的文件>` 全部通过；解释 `pnpm ledger` 的每一处变化。
7. 在 `docs/审核记录/<模块>.md` 写下这个文件的结论表，更新 `docs/审核记录/待审清单.md` 的状态。
8. 提交：`全量审核（<批次>：<文件>）：Wn …；审核记录 <模块>.md`。

拿不准的地方按方案第 9 节处理（写黄金样本，或标 `DEFERRED(待确认)` 并列出来），不要猜。禁止事项见方案第 6 节。
