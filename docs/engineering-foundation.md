# 工程地基

当前工程的职责边界：

```text
analysis/
    Reference 研究结果

reference/
    原项目源码

packages/
    与运行环境无关的 TypeScript 核心

apps/web/
    浏览器运行时

apps/server/
    Node.js 运行时

tests/
    跨 package 的验证

fixtures/
    Reference 黄金样本

tools/
    辅助工具
```

依赖方向：

```text
math
 ↓
core
 ↓
simulation
 ↓
apps

renderer-core / input-core
 ↓
apps/web
```

Simulation 不依赖 DOM、WebGL、WebAudio、Node fs。

当前 `SeededRandom` 只是工程地基的确定性占位实现，
真正开始 WorldGen 行为对齐时必须替换成 Reference 所要求的精确随机算法。

当前 `GameSimulation` 只负责验证：

- deterministic clock；
- deterministic random；
- headless tick execution。

它不是 Minecraft World 的实现。
