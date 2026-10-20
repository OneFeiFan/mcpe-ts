/**
 * 全量审核 PrimedTnt（W25）：
 * C++ 构造函数 `PrimedTnt(Level*, float x, float y, float z)` 的形参是 float，
 * `xo = x; yo = y; zo = z;` 赋的是**舍入后的形参**（注意它不设 xOld/yOld/zOld）。
 * 旧实现直接用了 double 实参：实参不能在 float32 里精确表示时，xo/yo/zo 与 this.x/y/z 不一致。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Level, PrimedTnt } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
});

describe('PrimedTnt 四参构造的 float 形参入口（W25）', () => {
  it('xo/yo/zo 取 float 形参，与 setPos 之后的 x/y/z 相同；xOld/yOld/zOld 保持 0', () => {
    const x = 0.1;
    const y = 0.2;
    const z = 0.3;
    // 这三个 double 在 float32 下都会变，测试才有分辨力
    expect(f(x)).not.toBe(x);
    expect(f(y)).not.toBe(y);
    expect(f(z)).not.toBe(z);

    const e = new PrimedTnt(level, x, y, z);
    expect([e.xo, e.yo, e.zo]).toEqual([f(x), f(y), f(z)]);
    // C++ 里 xo 与 this.x 都来自同一个 float 形参
    expect([e.x, e.y, e.z]).toEqual([f(x), f(y), f(z)]);
    // 与 FallingTile 的差异：只对齐 xo/yo/zo
    expect([e.xOld, e.yOld, e.zOld]).toEqual([0, 0, 0]);
  });
});
