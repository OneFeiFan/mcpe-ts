import { defineConfig } from 'vitest/config';

// 包通过 workspace 链接 + package.json 的 "exports": "./src/index.ts" 直接解析到源码，不再需要别名。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // s9.test.ts 的 beforeAll 要走完 NinecraftApp 的完整启动（建存档、建平坦世界、塞玩家），
    // 单跑约 10 秒出头，并行跑时被别的 worker 抢 CPU 就会超过默认的 10 秒 —— 表现为
    // "Hook timed out"，跟断言没关系。默认值在这个文件上本来就没有余量，放宽到 30 秒。
    hookTimeout: 30_000,
  },
});
