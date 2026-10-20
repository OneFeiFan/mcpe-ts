/**
 * 全量审核 FallingTile（W24）：
 * C++ 构造函数 `FallingTile(Level*, float x, float y, float z, int, int)` 的形参是 float，
 * `xo = xOld = x; yo = yOld = y; zo = zOld = z;` 赋的是**舍入后的形参**。
 * 旧实现直接用了 double 实参：实参不能在 float32 里精确表示时，xo/yo/zo 与 this.x/y/z 不一致。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallingTile, type Level } from '@mcpe/world';
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

describe('FallingTile 构造函数的 float 形参入口（W24）', () => {
  it('xo/xOld/yo/yOld/zo/zOld 取 float 形参，与 setPos 之后的 x/y/z 相同', () => {
    const x = 0.1;
    const y = 0.2;
    const z = 0.3;
    // 这三个 double 在 float32 下都会变，测试才有分辨力
    expect(f(x)).not.toBe(x);
    expect(f(y)).not.toBe(y);
    expect(f(z)).not.toBe(z);

    const e = new FallingTile(level, x, y, z, 1, 0);
    expect([e.xo, e.xOld]).toEqual([f(x), f(x)]);
    expect([e.yo, e.yOld]).toEqual([f(y), f(y)]);
    expect([e.zo, e.zOld]).toEqual([f(z), f(z)]);
    // C++ 里 xo 与 this.x 都来自同一个 float 形参
    expect([e.x, e.y, e.z]).toEqual([f(x), f(y), f(z)]);
  });
});
