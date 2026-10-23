import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgableMob, type Level, MobTypes } from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// 全量审核 W39（PathNavigation）。
//
// C++ 的 createPath(float x, float y, float z) 三个形参都是 float：实参先舍入成 float，
// 再对 y 做 `(int)` 截断（Mth::floor 内部自己会先转 float）。旧 TS 直接对 double 做
// Math.trunc(y)，在“double 比某个整数小一点、但舍入成 float 后正好等于该整数”时会少 1。
// 另外按清单第 7 条统一用 f2i 表达 `(int)`（NaN / 越界得 INT_MIN，与 x86 相同）。

class TestMob extends AgableMob {
  override getEntityTypeId(): number {
    return MobTypes.Chicken;
  }
}

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  level = createFlatLevel();
});

describe('PathNavigation 审核（W39）', () => {
  it('createPathToPos 的 y 形参先舍入成 float 再截断', () => {
    const mob = new TestMob(level);
    mob.onGround = true;
    const nav = mob.getNavigation()!;
    const spy = vi.spyOn(level, 'findPathToTile').mockReturnValue(true);

    nav.createPathToPos(0, 1.99999999, 0);

    expect(spy).toHaveBeenCalledTimes(1);
    // C++: (int)(float)1.99999999 = (int)2.0f = 2；旧 TS: Math.trunc(1.99999999) = 1
    expect(spy.mock.calls[0]![3], 'yBest').toBe(2);
  });

  it('(int) 用 f2i：NaN 按 x86 得 INT_MIN', () => {
    const mob = new TestMob(level);
    mob.onGround = true;
    const nav = mob.getNavigation()!;
    const spy = vi.spyOn(level, 'findPathToTile').mockReturnValue(true);

    nav.createPathToPos(0, Number.NaN, 0);

    expect(spy.mock.calls[0]![3], 'yBest').toBe(-2147483648);
  });

  it('x/z 仍按 floor、y 按向零截断', () => {
    const mob = new TestMob(level);
    mob.onGround = true;
    const nav = mob.getNavigation()!;
    const spy = vi.spyOn(level, 'findPathToTile').mockReturnValue(true);

    nav.createPathToPos(1.9, -1.5, -1.9);

    const args = spy.mock.calls[0]!;
    expect(args[2], 'xBest').toBe(1);
    expect(args[3], 'yBest').toBe(-1);
    expect(args[4], 'zBest').toBe(-2);
  });
});
