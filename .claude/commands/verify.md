---
description: 完整验证：类型检查、测试、构建、台账、浏览器默认场景（并查看截图）
---
依次运行并汇报每一项的结果：
1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm build`
4. `pnpm ledger`（与上次提交相比的变化）
5. `node tools/verify/smoke.mjs`，然后**用图片查看工具打开 tools/verify/out/default/ 下的每张截图**，逐张描述画面并指出任何异常（错位、错图、缺图、黑屏、残影）。
任何一项失败：先定位原因再修，不要改测试或夹具。
