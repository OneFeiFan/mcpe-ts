import { defineConfig } from 'vitest/config';

// 包通过 workspace 链接 + package.json 的 "exports": "./src/index.ts" 直接解析到源码，不再需要别名。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
