#!/usr/bin/env node
// 音源转换：把参考源码 src/client/sound/data/*.pcm 拼成一份二进制 + 一份索引。
//
// 【为什么需要这一步】磁盘上的 `.pcm` **不是**二进制，是 **C 源码**：
//
//     unsigned char PCM_bow[40156] = {
//     1,0,0,0,2,0,0,0,68,172,0,0,102,78,0,0,3,0,2,0,2,0,2,0,2,0,3,0,2,0,2,0,
//     ...
//     };
//
// 前 16 个字节是小端 int32 × 4 的头（channels / byteWidth / frameRate / numFrames），
// 后面是 PCM16。这正是 `SoundDesc(char* data)` 构造函数期待的形状 ——
// 所以"转换"就是把这份 C 数组**原样还原成字节**，一个 bit 都不改。
//
// 【三个必须处理的坑（都是实测出来的）】
//   1. 数值有两种写法：86 个文件是十进制，**17 个是十六进制**（`0x1,0x0,…`）；
//   2. `pop2.pcm` 的 `};` **后面还粘着一行 `SoundDesc SA_pop2((char*)PCM_pop2);`** ——
//      只能取**第一个 `{` 到第一个 `}`** 之间的内容；
//   3. 解析完必须**自校验**：数值个数 == 声明长度 == `16 + ch×bw×nf`，且每个值都在 [0,255]。
//      这条自校验是整步的判据 —— 103 个文件全过才算数。
//
// 用法：node tools/sound/build.mjs <参考源码目录>/src/client/sound/data
//       node tools/sound/build.mjs <…> --check        只校验产物是否与源一致，不写文件
//       node tools/sound/build.mjs <…> --out <目录>   写到别的目录（测试用，避免覆盖真产物）
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
const check = process.argv.includes('--check');
const outArg = process.argv.indexOf('--out');
if (!src) {
  console.error(
    '用法：node tools/sound/build.mjs <参考源码目录>/src/client/sound/data [--check] [--out <目录>]',
  );
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// ⚠ `--out` 是为了测试：默认目标是**已提交的产物**，测试跑一遍就会把它覆盖成一个只含
//   临时样例的包。所以测试必须用 --out 指到临时目录去。
const outDir = outArg >= 0 ? process.argv[outArg + 1] : join(root, 'apps/web/public/sounds');
const binPath = join(outDir, 'sounds.bin');
const jsonPath = join(outDir, 'sounds.json');

/** `unsigned char PCM_xxx[123] = {` —— 抓名字和声明长度 */
const DECL = /unsigned\s+char\s+(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*\{/;
/** 十进制整数 或 十六进制整数（值域是 unsigned char，不会出现负数） */
const NUM = /0[xX][0-9a-fA-F]+|\d+/g;

const files = readdirSync(src)
  .filter((n) => n.endsWith('.pcm'))
  .sort();

const entries = [];
const chunks = [];
let offset = 0;
let totalValues = 0;
const hexFiles = [];

for (const file of files) {
  const name = file.slice(0, -4);
  const text = readFileSync(join(src, file), 'utf8');

  const m = DECL.exec(text);
  if (!m) throw new Error(`${file}: 找不到 "unsigned char PCM_xxx[N] = {" 声明`);
  const declName = m[1];
  const declCount = Number(m[2]);
  if (declName !== `PCM_${name}`) {
    throw new Error(`${file}: 数组名 ${declName} 和文件名对不上（应该是 PCM_${name}）`);
  }

  // ⚠ 只取第一个 `{` 到第一个 `}` —— pop2.pcm 的括号后面还有一行 Sound.cpp 的代码
  const close = text.indexOf('}', m.index + m[0].length);
  if (close < 0) throw new Error(`${file}: 找不到收尾的 "}"`);
  const body = text.slice(m.index + m[0].length, close);

  if (/0[xX]/.test(body)) hexFiles.push(name);

  const nums = body.match(NUM);
  if (nums === null) throw new Error(`${file}: 花括号里一个数都没有`);

  if (nums.length !== declCount) {
    throw new Error(`${file}: 声明 ${declCount} 个数，实际数出 ${nums.length} 个`);
  }

  const bytes = new Uint8Array(declCount);
  for (let i = 0; i < declCount; i++) {
    const v = Number(nums[i]); // Number() 能吃 "0x1"
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error(`${file}: 第 ${i} 个值 ${nums[i]} 不是 0..255 的整数`);
    }
    bytes[i] = v;
  }

  const dv = new DataView(bytes.buffer);
  const channels = dv.getInt32(0, true);
  const byteWidth = dv.getInt32(4, true);
  const frameRate = dv.getInt32(8, true);
  const numFrames = dv.getInt32(12, true);
  const expect = 16 + channels * byteWidth * numFrames;
  if (expect !== declCount) {
    throw new Error(
      `${file}: 头里写的是 ${channels}ch/${byteWidth}B/${frameRate}Hz/${numFrames} 帧，` +
        `算出 ${expect} 字节，但声明是 ${declCount}`,
    );
  }

  chunks.push(Buffer.from(bytes));
  entries.push({ name, offset, size: declCount, channels, byteWidth, frameRate, numFrames });
  offset += declCount;
  totalValues += declCount;
}

const bin = Buffer.concat(chunks);
const json = JSON.stringify(entries, null, 1) + '\n';

if (check) {
  const same =
    existsSync(binPath) &&
    existsSync(jsonPath) &&
    readFileSync(binPath).equals(bin) &&
    readFileSync(jsonPath, 'utf8').replace(/\r\n/g, '\n') === json;
  if (!same) {
    console.error('✗ 产物和源素材对不上，跑一次不带 --check 的重新生成');
    process.exit(1);
  }
  console.log(`✓ 产物与源一致（${entries.length} 个文件 / ${bin.length} 字节）`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(binPath, bin);
writeFileSync(jsonPath, json);

const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`音源 ${entries.length} 个文件`);
console.log(`  解码后 ${totalValues} 字节 = ${mb(totalValues)} MB`);
console.log(`  十六进制写法 ${hexFiles.length} 个：${hexFiles.slice(0, 5).join(', ')}…`);
console.log(`  非 1ch/2B/44100 的：`);
for (const e of entries) {
  if (e.channels !== 1 || e.byteWidth !== 2 || e.frameRate !== 44100) {
    console.log(
      `    ${e.name}: ${e.channels}ch/${e.byteWidth}B/${e.frameRate}Hz ` +
        `${e.numFrames} 帧 ${(e.numFrames / e.frameRate).toFixed(2)}s`,
    );
  }
}
console.log(`→ ${binPath}`);
console.log(`→ ${jsonPath}`);
