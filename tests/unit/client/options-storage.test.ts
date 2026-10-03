import { beforeEach, describe, expect, it } from 'vitest';
import { OptionId, Options } from '@mcpe/client';
import { VirtualFS, setVfs } from '@mcpe/platform';
import type { Minecraft } from '../../../packages/client/src/Minecraft';

// B9c：Options 与 OptionsFile 的接线（load / save / setOptionsFilePath）。
//
// ⚠ 各个 Option 对象在 C++ 里是文件级全局变量，TS 也照抄成模块级全局 —— 所以
// **同一个测试文件里的多个 Options 实例是共用同一批值的**。这既是原样保留的怪癖，
// 也意味着断言之间会互相影响：下面每个用例都显式把自己关心的那项设一遍，不依赖前一个用例的残留。
//
// OptionsFile 本身的解析细节由黄金样本 G9-1 钉；这里只管"接对线没有"。

let vfs: VirtualFS;

const readText = (path: string): string => {
  const f = vfs.open(path, 'rb');
  if (f === null) return '';
  f.seek(0, 2);
  const n = f.tell();
  f.seek(0, 0);
  const buf = new Uint8Array(n);
  if (n > 0) f.read(buf, 1, n);
  f.close();
  return new TextDecoder().decode(buf);
};

const writeText = (path: string, text: string): void => {
  // vfs.open 的父目录不存在会返回 null（C 的 ENOENT），所以先建出来
  const parent = path.slice(0, path.lastIndexOf('/'));
  if (parent !== '' && !vfs.exists(parent)) vfs.mkdir(parent);
  const f = vfs.open(path, 'w')!;
  const b = new TextEncoder().encode(text);
  f.write(b, 1, b.length);
  f.close();
};

/**
 * 【不能传 null】`set()` 会走 `notifyOptionUpdate` → `minecraft.optionUpdated`，传 null 就炸。
 * C++ 那边这个指针也不可能是空的（构造时就是 &app）。这里给个什么都不做的替身。
 */
const fakeMc = { optionUpdated: () => {} } as unknown as Minecraft;
const makeOptions = (): Options => new Options(fakeMc);

beforeEach(() => {
  vfs = new VirtualFS();
  setVfs(vfs);
});

describe('client/Options 的选项文件接线', () => {
  it('setOptionsFilePath 拼出来的是 <path>/options.txt', () => {
    const o = makeOptions();
    o.setOptionsFilePath('/games/com.mojang');
    o.save();
    expect(vfs.exists('/games/com.mojang/options.txt')).toBe(true);
  });

  it('save 写出来的每行都是 键:值，且以 \\n 结尾（最后一行也补）', () => {
    const o = makeOptions();
    o.set(OptionId.OPTIONS_USERNAME, 'Steve');
    o.setOptionsFilePath('/o');
    o.save();
    const text = readText('/o/options.txt');
    expect(text.endsWith('\n')).toBe(true);
    const lines = text.slice(0, -1).split('\n');
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) expect(line).toMatch(/^options\.[A-Za-z0-9.]+:/);
    expect(lines).toContain('options.username:Steve');
  });

  it('load 能把文件里的值读进来', () => {
    writeText('/o/options.txt', 'options.username:Notch\noptions.difficulty:3\n');
    const o = makeOptions();
    o.setOptionsFilePath('/o');
    o.load();
    expect(o.getStringValue(OptionId.OPTIONS_USERNAME)).toBe('Notch');
    expect(o.getIntValue(OptionId.OPTIONS_DIFFICULTY)).toBe(3);
  });

  it('load 忽略不认识的键，也不影响别的键', () => {
    writeText(
      '/o/options.txt',
      'options.username:Notch\noptions.nosuchthing:42\noptions.difficulty:2\n',
    );
    const o = makeOptions();
    o.setOptionsFilePath('/o');
    o.load();
    expect(o.getStringValue(OptionId.OPTIONS_USERNAME)).toBe('Notch');
    expect(o.getIntValue(OptionId.OPTIONS_DIFFICULTY)).toBe(2);
  });

  it('文件不存在时 load 什么都不做，也不抛', () => {
    const o = makeOptions();
    o.set(OptionId.OPTIONS_DIFFICULTY, 1);
    o.setOptionsFilePath('/nowhere');
    expect(() => o.load()).not.toThrow();
    expect(o.getIntValue(OptionId.OPTIONS_DIFFICULTY)).toBe(1);
  });

  it('存了再读回来是同一个值（覆盖到已有文件上也是整个重写）', () => {
    const o = makeOptions();
    o.set(OptionId.OPTIONS_USERNAME, '第一个名字');
    o.setOptionsFilePath('/o');
    o.save();
    o.set(OptionId.OPTIONS_USERNAME, '第二个名字');
    o.save();
    // 整个重写：文件里只剩第二个名字
    expect(readText('/o/options.txt')).toContain('options.username:第二个名字');
    expect(readText('/o/options.txt')).not.toContain('第一个名字');
    o.load();
    expect(o.getStringValue(OptionId.OPTIONS_USERNAME)).toBe('第二个名字');
  });

  it('父目录不存在时 save 自己建出来（走的是 OptionsFile 那段 mkdir 循环）', () => {
    const o = makeOptions();
    o.setOptionsFilePath('/a/b/c');
    expect(vfs.exists('/a')).toBe(false);
    o.save();
    expect(vfs.exists('/a/b/c/options.txt')).toBe(true);
  });

  it('路径不设置时用默认的 options.txt（落在 VFS 根目录）', () => {
    const o = makeOptions();
    o.save();
    expect(vfs.exists('/options.txt')).toBe(true);
  });
});
