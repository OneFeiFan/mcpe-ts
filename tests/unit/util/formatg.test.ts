/**
 * formatG（C++ 流默认的浮点格式，%g、精度 6）与 printf 逐字符一致。
 * 用例由 Python 的 '%g' % v 生成（与 glibc 相同：在精确的二进制值上四舍六入五成双），含 float32 值、各种量级、恰好一半的情形。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatG } from '@mcpe/util';

describe('formatG', () => {
  it('与 printf %g 逐字符一致', () => {
    const cases = JSON.parse(
      readFileSync(new URL('./formatg-cases.json', import.meta.url), 'utf8'),
    ) as [number, string][];
    expect(cases.filter(([v, s]) => formatG(v) !== s)).toEqual([]);
  });
  it('边界：恰好一半取偶数、进位后指数加一、特殊值', () => {
    expect(formatG(1234565)).toBe('1.23456e+06');
    expect(formatG(999999.5)).toBe('1e+06');
    expect(formatG(0.0001)).toBe('0.0001');
    expect(formatG(0.00001)).toBe('1e-05');
    expect([formatG(NaN), formatG(Infinity), formatG(-0)]).toEqual(['nan', 'inf', '-0']);
  });
});
