import { describe, expect, it } from 'vitest';
import { Util } from '@mcpe/util';

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
