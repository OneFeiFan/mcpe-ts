import { describe, expect, it } from 'vitest';
import { Mth } from '@mcpe/util';

// 单独一个文件：Vitest 按文件隔离模块，这里的 Mth 还没调用过 initMth()
describe('Mth.initMth 之前', () => {
  it('与 C++ 一致：静态正弦表零初始化，sin/cos 返回 0', () => {
    expect(Mth.sin(1)).toBe(0);
    expect(Mth.cos(0)).toBe(0);
    Mth.initMth();
    expect(Mth.cos(0)).toBe(1);
  });
});
