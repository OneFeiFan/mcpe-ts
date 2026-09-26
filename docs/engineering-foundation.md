# 工程地基（2026-09 修订）

基准：`minecraft-pe-reference`（MCPE 0.6.1 alpha 社区分支，含 Beta 特性与 Emscripten 网页版）。
移植目标：行为与该分支一致；目录、文件名、类名镜像 C++ 的 `src/` 结构。

```text
packages/platform  ← src/platform      时间、日志、输入静态类（Keyboard / Mouse）
packages/util      ← src/util          Random、Mth、Color …
packages/core      ← src/*.h 根文件     SharedConstants …
packages/world     ← src/world         Material、Tile、Level、Chunk …（禁止依赖 DOM / client）
packages/client    ← src/client        Minecraft、Options、renderer/、player/input/ …（可用 DOM / WebGL）
apps/web           ← main_glfw.h + AppPlatform_glfw 的网页等价物（入口、资源预加载、DOM 事件接入）
apps/server        占位
tools/golden       用参考 C++ 源码生成黄金样本（fixtures/golden）
```

依赖方向：`platform → util → core → world → client → apps/web`，只能向右依赖。
各包 `exports` 直接指向 `src/index.ts`，Vite / Vitest / tsc 都按源码解析，无需别名。

规则与标记见实施手册《MCPE-TS 最小 Demo 实施流程（修订版）》；台账用 `pnpm ledger` 查看。
