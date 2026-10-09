import { defineConfig } from 'vitest/config';

// 包通过 workspace 链接 + package.json 的 "exports": "./src/index.ts" 直接解析到源码，不再需要别名。
export default defineConfig({
  test: {
    environment: 'node',
    // tests/bench 是性能基线，默认不跑；BENCH=1 时只跑它
    include: process.env.BENCH ? ['tests/bench/**/*.test.ts'] : ['tests/**/*.test.ts'],
    exclude: process.env.BENCH ? [] : ['tests/bench/**', '**/node_modules/**'],
    // 以前 s9 / leave-game 的 beforeAll（走完整个 NinecraftApp 启动）要 20 多秒，默认的 hookTimeout 不够。
    // 2026-10-09 审核查明原因：CFile.write 每次追加都整块重新分配（平方级），改成两倍扩容后这两个文件只要 1–3 秒。
    // 超时值仍留着 120 秒作为卡死时的兜底，不是性能预算。
    hookTimeout: 120_000,
  },
});
