import { describe, expect, it } from 'vitest';
import { f2i, i16, Mth, u8, Util } from '@mcpe/util';

describe('Mth.random（放宽档：直接用 Math.random）', () => {
  it('random() 在 [0, 1) 内，random(n) 是 [0, n) 内的整数', () => {
    for (let i = 0; i < 1000; i++) {
      const x = Mth.random();
      expect(x >= 0 && x < 1).toBe(true);
      const n = Mth.random(10);
      expect(Number.isInteger(n) && n >= 0 && n < 10).toBe(true);
    }
  });
});

describe('Mth 对象', () => {
  it('冻结：属性不可改写', () => {
    expect(Object.isFrozen(Mth)).toBe(true);
    expect(Object.isFrozen(Util)).toBe(true);
  });
});

describe('Util.remove / Util.removeAll（按引用比较，与 C++ 指针的 operator== 一致）', () => {
  const a = { id: 1 }, b = { id: 2 }, c = { id: 3 };
  it('remove：数组删除第一个匹配项', () => {
    const list = [a, b, a, c];
    expect(Util.remove(list, a)).toBe(true);
    expect(list).toEqual([b, a, c]);
    expect(Util.remove(list, { id: 2 })).toBe(false); // 内容相同但不是同一个对象
  });
  it('remove：Set', () => {
    const set = new Set([a, b]);
    expect(Util.remove(set, a)).toBe(true);
    expect(Util.remove(set, a)).toBe(false);
    expect([...set]).toEqual([b]);
  });
  it('removeAll：toRemove 的每个元素只删一次', () => {
    const list = [a, b, a, c, a];
    expect(Util.removeAll(list, [a, a, c, { id: 9 }])).toBe(3);
    expect(list).toEqual([b, a]);
  });
});

describe('cpp.ts 数值辅助', () => {
  it('f2i：范围内截断，越界与 NaN 得 INT_MIN', () => {
    expect([f2i(2.9), f2i(-2.9), f2i(-0.5), f2i(2147483647.5), f2i(2147483648), f2i(-2147483649), f2i(NaN)])
      .toEqual([2, -2, 0, 2147483647, -2147483648, -2147483648, -2147483648]);
  });
  it('i16、u8', () => {
    expect([i16(32768), i16(-32769), u8(300), u8(-1)]).toEqual([-32768, 32767, 44, 255]);
  });
});
