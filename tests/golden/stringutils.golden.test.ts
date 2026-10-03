import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Util } from '@mcpe/util';

// 真值来自 tools/golden/harness_util.cpp（参考源码 util/StringUtils.cpp）
const G = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/util.json', import.meta.url), 'utf8'),
);

describe('StringUtils（经 Util 调用）与 C++ 一致', () => {
  it('hashCode：含非 ASCII（按 UTF-8 字节、signed char）', () => {
    for (const [s, h] of G.hashCode as [string, number][])
      expect([s, Util.hashCode(s)]).toEqual([s, h]);
  });
  it('startsWith', () => {
    for (const [s, p, r] of G.startsWith as [string, string, boolean][])
      expect(Util.startsWith(s, p)).toBe(r);
  });
  it('stringTrim（默认空白字符与自定义字符集）', () => {
    for (const [s, r] of G.stringTrim as [string, string][]) expect(Util.stringTrim(s)).toBe(r);
    for (const [s, c, l, rt, r] of G.stringTrimChars as [
      string,
      string,
      boolean,
      boolean,
      string,
    ][])
      expect(Util.stringTrim(s, c, l, rt)).toBe(r);
  });
  it('stringReplace（每次从头查找，含 maxCount）', () => {
    for (const [s, a, b, n, r] of G.stringReplace as [string, string, string, number, string][])
      expect(Util.stringReplace(s, a, b, n)).toBe(r);
  });
  it('removeAll 的 string 重载', () => {
    for (const [s, rep, n, r] of G.removeAllString as [string, string[], number, string][])
      expect(Util.removeAll(s, rep, n)).toBe(r);
  });
});
