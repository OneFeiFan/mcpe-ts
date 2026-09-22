import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mcpe/math': `${root}/packages/math/src/index.ts`,
      '@mcpe/core': `${root}/packages/core/src/index.ts`,
      '@mcpe/simulation': `${root}/packages/simulation/src/index.ts`,
      '@mcpe/renderer-core': `${root}/packages/renderer-core/src/index.ts`,
      '@mcpe/input-core': `${root}/packages/input-core/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
