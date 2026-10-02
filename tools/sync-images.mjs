#!/usr/bin/env node
// 材质包同步：把参考源码 data/images 下的全部 PNG 按原相对路径复制到 apps/web/public/images/，
// 并重新生成 apps/web/src/imageManifest.ts（文件名、宽、高）。非网页格式（.pvr、.h、.ico、.rc）跳过。
// 用法：node tools/sync-images.mjs <参考源码目录>/data/images
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('用法：node tools/sync-images.mjs <参考源码目录>/data/images');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dst = join(root, 'apps/web/public/images');

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const entries = [];
for (const file of walk(src).sort()) {
  const rel = relative(src, file).split(sep).join('/');
  if (!rel.endsWith('.png')) continue;
  const buf = readFileSync(file);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error(`${rel} 不是 PNG`);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  mkdirSync(dirname(join(dst, rel)), { recursive: true });
  copyFileSync(file, join(dst, rel));
  entries.push({ rel, w, h, bytes: buf.length });
}

const lines = entries.map((e) => `  ['${e.rel}', ${e.w}, ${e.h}],`).join('\n');
writeFileSync(
  join(root, 'apps/web/src/imageManifest.ts'),
  `// 由 tools/sync-images.mjs 生成，请勿手改。材质包里的全部图片：[C++ 里的名字, 宽, 高]。
// 图片放在 apps/web/public/images/ 的同名路径下；启动时只预加载 assets.ts 的 PRELOAD 里列出的几张。
export const IMAGE_MANIFEST: readonly (readonly [string, number, number])[] = [
${lines}
];

export const IMAGE_NAMES: ReadonlySet<string> = new Set(IMAGE_MANIFEST.map(([n]) => n));
`,
);
const kb = Math.round(entries.reduce((s, e) => s + e.bytes, 0) / 1024);
console.log(`已同步 ${entries.length} 张 PNG（${kb} KB）到 ${relative(root, dst)}，并生成 apps/web/src/imageManifest.ts`);
