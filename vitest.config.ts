import { defineConfig } from 'vitest/config';

// 包通过 workspace 链接 + package.json 的 "exports": "./src/index.ts" 直接解析到源码，不再需要别名。
export default defineConfig({
  test: {
    environment: 'node',
    // tests/bench 是性能基线，默认不跑；BENCH=1 时只跑它
    include: process.env.BENCH ? ['tests/bench/**/*.test.ts'] : ['tests/**/*.test.ts'],
    exclude: process.env.BENCH ? [] : ['tests/bench/**', '**/node_modules/**'],
    // s9.test.ts 与 leave-game.test.ts 的 beforeAll 要走完 NinecraftApp 的完整启动
    // （建存档、建平坦世界、塞玩家）—— prepareLevel 要过 441 个区块并逐个 updateLights，
    // 单跑整文件就要 21~24 秒，并行跑时被别的 worker 抢 CPU 更久，表现为 "Hook timed out"，
    // 跟断言没关系。
    //
    // 2026-10-07：测试文件涨到 119 个后，30 秒被打穿（只有这两个文件挂，其余 1302 条全过）；
    // 实测放宽到 120 秒后全套 119 文件通过。这个值只是"卡死"的兜底，不是性能预算，
    // 所以给足余量。注意：这一改只是让测试不再误报，**没有**让启动变快——
    // NinecraftApp 启动要 20 秒上下这件事本身还没查过，是独立问题。
    hookTimeout: 120_000,
  },
});
