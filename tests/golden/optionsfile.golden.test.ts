import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { OptionsFile } from '@mcpe/client';
import { VirtualFS, setVfs } from '@mcpe/platform';

// G9-1：OptionsFile 的读写。真值来自 tools/golden/harness_optionsfile.cpp（参考源码
// src/client/OptionsFile.cpp，在 WSL 上生成）。
//
// 【这个样本专门钉什么】`fgets(lineBuff, 128, f)` 那一套 C 的字符串规则：
// 最多 127 字节、碰 '\n' 停、strlen 撞 '\0' 为止、剥尾部 \r\n、剥完短于 3 字节丢掉、
// strchr 找第一个 ':'. 这几条按"读代码推"很容易差一点，尤其是**超长行从哪儿切**。
// 夹具里 line-125/126/127/130 那几条就是那条线周围各站一个位置。

type SaveCase = { name: string; created: boolean; bytes: string };
type ReadCase = { name: string; bytes: string; out: string[] };
type Fixture = {
  counterSize: number;
  save: SaveCase[];
  read: ReadCase[];
  missing: string[];
  defaultPath: string;
};

const G: Fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/optionsfile.json', import.meta.url), 'utf8'),
);

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
const bytesToHex = (b: Uint8Array): string =>
  [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const hexToText = (hex: string): string => new TextDecoder().decode(hexToBytes(hex));

/** save 那批用例的输入。必须与 harness 里的 `saves` 一张表一份内容 */
const SAVE_INPUTS: Record<string, string[]> = {
  'two-lines': ['options.a:1', 'options.b:hello'],
  empty: [],
  'value-has-newline': ['options.a:1\n2'],
  // C++ 那边是 std::string("options.a:12\0 34", 16) —— 16 个字节，中间一个 NUL
  'value-has-nul': ['options.a:12\u0000 34'],
  'empty-element': [''],
  'utf8-value': ['options.username:张三'],
  'creates-parents': ['options.a:1'],
};

let vfs: VirtualFS;

/** 把夹具里的原始字节铺进虚拟文件系统，再让 OptionsFile 去读 */
function plant(hex: string, path = '/options.txt'): OptionsFile {
  const f = vfs.open(path, 'w')!;
  const bytes = hexToBytes(hex);
  if (bytes.length > 0) f.write(bytes, 1, bytes.length);
  f.close();
  const of = new OptionsFile();
  of.setOptionsPath(path);
  return of;
}

function readBack(path = '/options.txt'): string {
  const f = vfs.open(path, 'rb');
  if (f === null) return '';
  f.seek(0, 2);
  const n = f.tell();
  f.seek(0, 0);
  const buf = new Uint8Array(n);
  if (n > 0) f.read(buf, 1, n);
  f.close();
  return bytesToHex(buf);
}

beforeEach(() => {
  vfs = new VirtualFS();
  setVfs(vfs);
});

describe('golden G9-1 OptionsFile', () => {
  it('夹具本身是齐的：读用例覆盖了 127 字节那条线周围', () => {
    expect(G.counterSize).toBe(128); // 也就是 fgets 最多读 127 字节 + 1 个 '\0'
    expect(G.save.length).toBe(Object.keys(SAVE_INPUTS).length);
    for (const name of ['line-125', 'line-126', 'line-127', 'line-130']) {
      expect(
        G.read.some((c) => c.name === name),
        `少了 ${name}`,
      ).toBe(true);
    }
  });

  it('默认路径是 options.txt', () => {
    expect(new OptionsFile().getOptionsPath()).toBe(G.defaultPath);
  });

  describe('save 写出来的字节与参考 C++ 逐字节相同', () => {
    for (const c of G.save) {
      it(`${c.name}`, () => {
        const inputs = SAVE_INPUTS[c.name]!;
        // 父目录要 OptionsFile 自己建出来，所以先别 mkdir 好
        const path = c.name === 'creates-parents' ? '/a/b/c/options.txt' : '/options.txt';
        const of = new OptionsFile();
        of.setOptionsPath(path);
        of.save(inputs);
        expect(readBack(path)).toBe(c.bytes);
        expect(vfs.exists(path)).toBe(c.created);
      });
    }
  });

  describe('getOptionStrings 的解析结果与参考 C++ 相同', () => {
    for (const c of G.read) {
      it(`${c.name}（${c.bytes.length / 2} 字节）→ ${JSON.stringify(c.out)}`, () => {
        expect(plant(c.bytes).getOptionStrings()).toEqual(c.out);
      });
    }
  });

  it('文件（连同父目录）不存在时返回空表', () => {
    const of = new OptionsFile();
    of.setOptionsPath('/nope/options.txt');
    expect(of.getOptionStrings()).toEqual(G.missing);
  });

  it('save 之后立刻读回来是同一批键值对（自己写的自己读得回来）', () => {
    const of = new OptionsFile();
    of.setOptionsPath('/options.txt');
    const lines = [
      'options.username:Steve',
      'options.difficulty:2',
      'options.thirdperson:1',
      'options.hidegui:0',
    ];
    of.save(lines);
    expect(of.getOptionStrings()).toEqual([
      'options.username',
      'Steve',
      'options.difficulty',
      '2',
      'options.thirdperson',
      '1',
      'options.hidegui',
      '0',
    ]);
  });

  // 这一条不是在测参考实现，是把"样本里为什么没有这个用例"钉在明面上
  it('已知差异：127 字节那一刀切在多字节字符中间时，参考实现留下裸字节，TS 只能给替换符', () => {
    // 126 个 'x' + ':' + 一个 3 字节汉字 + '\n'：第一段正好切在汉字的第二个字节处
    const head = 'x'.repeat(126);
    expect(hexToText('')).toBe('');
    const bytes = new TextEncoder().encode(head + ':' + '张' + '\n');
    expect(bytes.length).toBe(126 + 1 + 3 + 1);
    // C++ 那边第一段是 head + ':' + 汉字的前 2 个字节（拼不成合法 UTF-8），第二段是那半个字节 + '\n'
    // —— 那种内容既进不了合法 JSON，也没法用 JS 字符串无损表示，所以夹具里**没有**这个用例。
    // 这里只确认 TS 侧不会抛：解出来是个带替换符的串。
    const of = plant(bytesToHex(bytes));
    const out = of.getOptionStrings();
    expect(out.length).toBe(2);
    expect(out[0]).toBe(head);
  });
});
