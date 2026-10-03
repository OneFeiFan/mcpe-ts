---
description: 为指定功能新建一个黄金样本（C++ harness + 夹具 + TS 对照测试）
argument-hint: <要核对的功能，如 “RegionFile 的扇区布局”>
---
为 “$ARGUMENTS” 建立黄金样本。按 skill `golden-sample` 执行：
1. 说明要比较什么、用什么固定输入、属于三档里的哪一档。
2. 写 `tools/golden/harness_xxx.cpp`，在 `tools/golden/build.sh` 里照已有段落加一段。
3. 运行 `REF=$REF bash tools/golden/build.sh`，确认新夹具生成、**旧夹具没有变化**（`git diff --stat fixtures/golden`）。
4. 写 `tests/golden/xxx.golden.test.ts`，运行它。不通过就修 TS 实现，并说明差异的原因（对照 PITFALLS.md 的“常见失败的含义”）。
