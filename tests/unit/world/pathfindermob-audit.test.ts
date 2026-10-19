import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgableMob, type Entity, type Level, MobTypes } from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// 全量审核 W17 / W18。
//
// W17：`findRandomStrollLocation` 里 `Mth::floor(x + random.nextInt(13) - 6)` 的实参在 C++ 里
//   每一步都是 float（x 是 float 字段，int 先转 float）。TS 旧写法用 double 一次算完，
//   只在 `Mth.floor` 内部舍入一次 —— 边界上会取到相邻的整数。
// W18：`checkCantSeeTarget(Entity*, float d)` 的形参在 C++ 里先舍入成 float，TS 旧写法直接
//   拿 double 比较。

const f = Math.fround;

/** 最小可实例化的子类：暴露 protected 的旧 AI 入口与 attackTargetId。 */
class TestMob extends AgableMob {
  override getEntityTypeId(): number {
    // ⚠ 不能返回 0：`Entity.save` 见到 id === 0 直接 return false（D6 踩过）
    return MobTypes.Chicken;
  }
  stroll(): void {
    this.findRandomStrollLocation();
  }
  cantSee(target: Entity, d: number): void {
    this.checkCantSeeTarget(target, d);
  }
  targetId(): number {
    return this.attackTargetId;
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

describe('PathfinderMob 审核（W17）', () => {
  it('findRandomStrollLocation 的 floor 实参按 C++ 逐步 float 舍入', () => {
    const m = new TestMob(level);
    // x 取一个会让 `x + 8` 在 float 里舍入成 8 的值：
    //   C++：f(f(x + 8) - 6) = 2 → floor 2
    //   旧 TS：x + 8 - 6 = 1.9999998… → floor 1
    m.setPos(f(-1.94077813e-7), 64, f(-1.94077813e-7));
    vi.spyOn(m.random, 'nextInt').mockImplementation((n: number) => (n === 13 ? 8 : 0));
    const spy = vi.spyOn(level, 'findPathToTile');

    m.stroll();

    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0]!;
    expect(args[2], 'xBest').toBe(2);
    expect(args[3], 'yBest').toBe(61); // 64 + 0 - 3，float 精确
    expect(args[4], 'zBest').toBe(2);
  });
});

describe('PathfinderMob 审核（W18）', () => {
  it('checkCantSeeTarget 的 d 先按 float 舍入（C++ 形参是 float）', () => {
    const m = new TestMob(level);
    const other = new TestMob(level);
    m.setAttackTarget(other);
    // 32 + 1e-7 在 float 里就是 32（32 附近 float 间隔 2^-18 ≈ 3.8e-6），C++ 不会清目标；
    // 旧 TS 用 double 比较会当成 > 32 清掉。
    m.cantSee(other, 32 + 1e-7);
    expect(m.targetId()).toBe(other.entityId);
  });
});
