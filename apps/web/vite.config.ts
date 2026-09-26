import { defineConfig } from 'vite';

// @mcpe/* 通过 workspace 链接解析到各包 src/index.ts，不需要别名。
export default defineConfig({
  server: { port: 5173 },
});
