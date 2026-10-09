import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// F2：`tools/sound/build.mjs` 的产物与解析器。
//
// 【这个文件钉什么】
//   A. **已提交的产物**自洽：索引里的 offset 首尾相接、总长等于 bin 的长度、
//      每个条目头里那 16 个字节解出来的四个字段和索引里记的一致；
//   B. 解析器**会拒绝畸形输入**（这是最重要的 —— 一个"什么都收下"的解析器
//      会把 103 个文件里的脏数据静默搬进来）。
//
// 【为什么不拿 $REF 来对】参考源码不在仓库里（只读、路径由 $REF 给），
//   测试跑在别的机器上时它可能不存在。所以 A 只查**产物内部**自洽，
//   B 用**临时目录里现造的**输入喂给脚本。
//   真要和源素材比一遍，跑 `node tools/sound/build.mjs "$REF/src/client/sound/data" --check`。

const BIN = new URL('../../../apps/web/public/sounds/sounds.bin', import.meta.url);
const JSON_ = new URL('../../../apps/web/public/sounds/sounds.json', import.meta.url);
const SCRIPT = new URL('../../../tools/sound/build.mjs', import.meta.url);

type Entry = {
  name: string;
  offset: number;
  size: number;
  channels: number;
  byteWidth: number;
  frameRate: number;
  numFrames: number;
};

const entries = JSON.parse(readFileSync(JSON_, 'utf8')) as Entry[];
const bin = readFileSync(BIN);
const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

describe('sounds.bin + sounds.json 的产物自洽（F2）', () => {
  it('索引是 103 条，名字唯一且按字典序', () => {
    expect(entries.length).toBe(103);
    expect(new Set(entries.map((e) => e.name)).size).toBe(103);
    const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : 1));
    expect(entries.map((e) => e.name)).toEqual(sorted.map((e) => e.name));
  });

  it('offset 首尾相接，最后一条刚好顶到 bin 的末尾', () => {
    let cursor = 0;
    for (const e of entries) {
      expect(e.offset, `${e.name} 的 offset`).toBe(cursor);
      cursor += e.size;
    }
    expect(cursor, '所有 size 加起来 = bin 的字节数').toBe(bin.length);
    expect(bin.length).toBe(6390080);
  });

  it('每个条目头里那 16 个字节解出来，和索引里记的四个字段逐一对上', () => {
    for (const e of entries) {
      expect(dv.getInt32(e.offset, true), `${e.name}.channels`).toBe(e.channels);
      expect(dv.getInt32(e.offset + 4, true), `${e.name}.byteWidth`).toBe(e.byteWidth);
      expect(dv.getInt32(e.offset + 8, true), `${e.name}.frameRate`).toBe(e.frameRate);
      expect(dv.getInt32(e.offset + 12, true), `${e.name}.numFrames`).toBe(e.numFrames);
      expect(16 + e.channels * e.byteWidth * e.numFrames, `${e.name}.size`).toBe(e.size);
    }
  });

  it('⚠ 103 个不是"全都一个样"：click 是立体声、splash 是 11025Hz', () => {
    const click = entries.find((e) => e.name === 'click')!;
    const splash = entries.find((e) => e.name === 'splash')!;
    expect([click.channels, click.byteWidth, click.frameRate]).toEqual([2, 2, 44100]);
    expect([splash.channels, splash.byteWidth, splash.frameRate]).toEqual([1, 2, 11025]);
    expect(entries.filter((e) => e.channels === 1 && e.frameRate === 44100).length).toBe(101);
  });

  it('16 字节头之后的才是帧数据：长度刚好是 size - 16', () => {
    for (const e of entries.slice(0, 5)) {
      expect(e.size - 16, `${e.name} 的帧数据长度`).toBe(e.channels * e.byteWidth * e.numFrames);
    }
  });
});

/**
 * 在临时目录里造几个 .pcm 源码文件，喂给脚本跑。
 *
 * ⚠ **必须带 `--out`**：不带的话脚本会写到 `apps/web/public/sounds/`，
 *   把仓库里那份已提交的产物覆盖成一个只含临时样例的包（差点真这么干）。
 */
function run(
  files: Record<string, string>,
  args: string[] = [],
): { ok: boolean; out: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mcpe-sound-'));
  const outDir = mkdtempSync(join(tmpdir(), 'mcpe-sound-out-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const argv = [fileURLToPath(SCRIPT), dir, '--out', outDir, ...args];
  try {
    const out = execFileSync(process.execPath, argv, { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, out, dir: outDir };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: (err.stdout ?? '') + (err.stderr ?? ''), dir: outDir };
  }
}

/** 造一份合法的 C 数组源码：1ch/2B/8000Hz/2 帧 */
function source(name: string, values: number[]): string {
  const body = values.join(',');
  return `unsigned char PCM_${name}[${values.length}] = {\n${body}\n};\n`;
}
const HEAD = [1, 0, 0, 0, 2, 0, 0, 0, 64, 31, 0, 0, 2, 0, 0, 0]; // 1ch/2B/8000Hz/2帧

describe('解析器会拒绝畸形输入（F2）', () => {
  it('合法输入：通过，并把字节**原样**写出来（十进制）', () => {
    const r = run({ 'a.pcm': source('a', [...HEAD, 7, 8, 9, 10]) });
    expect(r.ok, r.out).toBe(true);
    expect(r.out).toContain('音源 1 个文件');
    expect(r.out).toContain('解码后 20 字节');
  });

  it('合法输入：**十六进制**写法也要认', () => {
    const hex = HEAD.map((v) => `0x${v.toString(16)}`);
    const r = run({
      'a.pcm': source('a', [])
        .replace(/\[\d+\]/, '[20]')
        .replace('{\n\n}', '{}'),
    });
    void hex;
    // 用真正的十六进制源码再跑一次
    const body = [...hex, '0x7', '0x8', '0x9', '0xa'].join(',');
    const r2 = run({ 'a.pcm': `unsigned char PCM_a[20] = {\n${body}\n};\n` });
    expect(r2.ok, r2.out).toBe(true);
    expect(r2.out).toContain('十六进制写法 1 个');
  });

  it('数值个数和声明对不上 → 报错退出（**不是**默默截断）', () => {
    // 声明 20、只给 18 个
    const bad = run({ 'a.pcm': `unsigned char PCM_a[20] = {\n${[...HEAD, 1, 2].join(',')}\n};\n` });
    expect(bad.ok, '声明 20、只给 18 个').toBe(false);
    expect(bad.out).toContain('声明 20');
  });

  it('⚠ 头里算出来的长度和声明不符 → 报错退出', () => {
    // 头说 1ch/2B/8000Hz/2 帧 = 16+4 = 20，但声明 24
    const bad = run({
      'a.pcm': `unsigned char PCM_a[24] = {\n${[...HEAD, 1, 2, 3, 4, 5, 6, 7, 8].join(',')}\n};\n`,
    });
    expect(bad.ok).toBe(false);
    expect(bad.out).toContain('算出 20 字节');
  });

  it('⚠ `};` 后面还有别的内容时不受影响（pop2.pcm 的尾巴上粘着一行 Sound.cpp）', () => {
    const r = run({
      'a.pcm': `${source('a', [...HEAD, 1, 2, 3, 4])}\nSoundDesc SA_a((char*)PCM_a);\n`,
    });
    expect(r.ok, r.out).toBe(true);
    expect(r.out).toContain('解码后 20 字节');
  });

  it('⚠ 尾巴上**还有一个花括号**时，只取第一个 `}`（取最后一个会把脏数据也算进去）', () => {
    // 真实素材里 pop2.pcm 那行没有 `}`，所以这条是我造的更狠的版本 —— 不这么造就
    // "取第一个 }" 和 "取最后一个 }" 是**等价变异**，测不出来（第一版就漏了这个）
    const tail = 'unsigned char PCM_EXTRA[1] = { 0 };\n';
    const r = run({ 'a.pcm': `${source('a', [...HEAD, 1, 2, 3, 4])}\n${tail}` });
    expect(r.ok, r.out).toBe(true);
    expect(r.out).toContain('解码后 20 字节');
  });

  it('⚠ 多个文件时 offset 要首尾相接（只测一个文件的话 offset 恒为 0，测不出来）', () => {
    const r = run({
      'a.pcm': source('a', [...HEAD, 1, 2, 3, 4]),
      'b.pcm': source('b', [...HEAD, 5, 6, 7, 8]),
    });
    expect(r.ok, r.out).toBe(true);
    const idx = JSON.parse(readFileSync(join(r.dir, 'sounds.json'), 'utf8')) as Entry[];
    expect(idx.map((e) => [e.name, e.offset, e.size])).toEqual([
      ['a', 0, 20],
      ['b', 20, 20],
    ]);
    expect(readFileSync(join(r.dir, 'sounds.bin')).length).toBe(40);
  });

  it('数组名和文件名对不上 → 报错退出', () => {
    const r = run({ 'a.pcm': source('b', [...HEAD, 1, 2, 3, 4]) });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('和文件名对不上');
  });

  it('⚠ 合法输入会把字节**原样**写进 bin（不是重新编码）', () => {
    const vals = [...HEAD, 7, 8, 9, 10];
    const r = run({ 'a.pcm': source('a', vals) });
    expect(r.ok, r.out).toBe(true);
    expect([...readFileSync(join(r.dir, 'sounds.bin'))]).toEqual(vals);
    const idx = JSON.parse(readFileSync(join(r.dir, 'sounds.json'), 'utf8')) as Entry[];
    expect(idx).toEqual([
      { name: 'a', offset: 0, size: 20, channels: 1, byteWidth: 2, frameRate: 8000, numFrames: 2 },
    ]);
    expect(readdirSync(r.dir).sort()).toEqual(['sounds.bin', 'sounds.json']);
  });

  it('没有声明 → 报错退出', () => {
    const r = run({ 'a.pcm': 'int nothing = 3;\n' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('找不到');
  });

  it('有值越界（>255）→ 报错退出', () => {
    const r = run({ 'a.pcm': source('a', [...HEAD, 300, 2, 3, 4]) });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('不是 0..255');
  });
});
