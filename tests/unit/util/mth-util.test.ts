/**
 * util 包的小测试合在一处：Mth 与 Util 的基本函数、Mth.random 与 C++ 同构（任务单 H1）、Util.stringReplace 的安全改写。
 * 每个 describe 对应原来的一个测试文件（2026-10-09 整理时合并），内容未改。
 */
import { describe, expect, it } from 'vitest';
import { f2i, i16, Mth, u8, Util, Random, _mthRand } from '@mcpe/util';

describe('Mth 与 Util（原 mth-util.test.ts）', () => {
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
    const a = { id: 1 },
      b = { id: 2 },
      c = { id: 3 };
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
      expect([
        f2i(2.9),
        f2i(-2.9),
        f2i(-0.5),
        f2i(2147483647.5),
        f2i(2147483648),
        f2i(-2147483649),
        f2i(NaN),
      ]).toEqual([2, -2, 0, 2147483647, -2147483648, -2147483648, -2147483648]);
    });
    it('i16、u8', () => {
      expect([i16(32768), i16(-32769), u8(300), u8(-1)]).toEqual([-32768, 32767, 44, 255]);
    });
  });
});

describe('Mth.random 与 C++ 同构（原 mth-random.test.ts）', () => {
  /**
   * 任务单 H1：Mth.random 与 C++ 同构——背后是一个模块级 Random（C++ Mth.cpp 的 static Random _rand）。
   * random() = nextFloat()，random(n) = nextInt(n)（不是 floor(nextFloat() * n)）。
   */
  describe('Mth.random（H1）', () => {
    it('setSeed 之后，random() 的序列与同种子 Random.nextFloat() 相同', () => {
      _mthRand.setSeed(42);
      const ref = new Random(42);
      for (let i = 0; i < 8; i++) expect(Mth.random()).toBe(ref.nextFloat());
    });

    it('random(n) 是 nextInt(n)，与 floor(nextFloat() * n) 不同的序列', () => {
      _mthRand.setSeed(7);
      const ref = new Random(7);
      const got = Array.from({ length: 20 }, () => Mth.random(10));
      expect(got).toEqual(Array.from({ length: 20 }, () => ref.nextInt(10)));
      const viaFloat = new Random(7);
      expect(got).not.toEqual(
        Array.from({ length: 20 }, () => Math.floor(viaFloat.nextFloat() * 10)),
      );
    });
  });
});

describe('Util.stringReplace 的安全改写（原 stringutils-safety.test.ts）', () => {
  describe('Util.stringReplace 的 ADAPTED(Safety)', () => {
    it('src 为空时原样返回（C++ 会死循环）', () => {
      expect(Util.stringReplace('abc', '', 'x')).toBe('abc');
    });
    it('dst 包含 src 且 maxCount 为 -1 时只替换一遍（C++ 会死循环）', () => {
      expect(Util.stringReplace('a-b-c', '-', '--')).toBe('a--b--c');
      expect(Util.stringReplace('x$y', 'y', '$&y')).toBe('x$$&y'); // 按字面插入，不解释 $ 模式
    });
    it('其余情况保持 C++ 的“每次从头查找”', () => {
      expect(Util.stringReplace('aabb', 'ab', '')).toBe(''); // replaceAll 会得到 "ab"
      expect(Util.stringReplace('a-b', '-', '--x', 3)).toBe('a--x-x-xb'); // 有限次数时 C++ 不会死循环，照原样
    });
  });
});

describe('Random.copy（C++ 的隐式拷贝构造）', () => {
  it('副本与原对象接下来的随机序列相同，且互不影响', async () => {
    const { Random } = await import('@mcpe/util');
    const r = new Random(12345);
    r.nextInt();
    r.nextGaussian();
    const c = r.copy();
    const a = [r.nextInt(), r.nextFloat(), r.nextGaussian(), r.nextInt(100)];
    const b = [c.nextInt(), c.nextFloat(), c.nextGaussian(), c.nextInt(100)];
    expect(b).toEqual(a);
  });
});
