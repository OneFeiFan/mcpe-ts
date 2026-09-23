import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mcpe/core': `${root}/packages/core/src/index.ts`,
      '@mcpe/client': `${root}/packages/client/src/index.ts`,
      '@mcpe/input-core': `${root}/packages/input-core/src/index.ts`,
      '@mcpe/platform': `${root}/packages/platform/src/index.ts`,
      '@mcpe/renderer-core': `${root}/packages/renderer-core/src/index.ts`,
      '@mcpe/simulation': `${root}/packages/simulation/src/index.ts`,
      '@mcpe/world': `${root}/packages/world/src/index.ts`,
    },
  },
});
