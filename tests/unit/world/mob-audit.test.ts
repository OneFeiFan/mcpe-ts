import { afterEach, describe, expect, it, vi } from 'vitest';
import { _mthRand, Mth } from '@mcpe/util';
import { Mob, type Level } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核（第 2 批：world/entity/Mob 第 1 组）：W12 的“先红后绿”测试。
//   - 构造函数里的 0.7f/0.1f/0.02f、rotA/timeOffs/yRot 三段公式、footSize 0.5f 都按 float。
//   - 构造期的 setPos 是 C++ 的非派发调用（Mob 没重写，子类重写不参与）。
//   - setxxa/setyya 的 float 形参先转 float。

const f = Math.fround;

class TestMob extends Mob {
  override getEntityTypeId(): number {
    return 1;
  }
  getXxa(): number {
    return this.xxa;
  }
  getYya(): number {
    return this.yya;
  }
  getRunSpeed(): number {
    return this.runSpeed;
  }
  getWalkingSpeed(): number {
    return this.walkingSpeed;
  }
  getFlyingSpeed(): number {
    return this.flyingSpeed;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Mob（全量审核 W12：第 1 组）', () => {
  it('W12：构造函数的 float 字段与 Mth.random 公式按 float', () => {
    const level = createFlatLevel();
    prepareLevel(level);

    const r = f(0.1);
    vi.spyOn(_mthRand, 'nextFloat').mockReturnValue(r);

    const m = new TestMob(level);
    expect(m.getRunSpeed()).toBe(f(0.7));
    expect(m.getWalkingSpeed()).toBe(f(0.1));
    expect(m.getFlyingSpeed()).toBe(f(0.02));
    expect(m.rotA).toBe(f(f(r + 1) * f(0.01)));
    expect(m.timeOffs).toBe(f(r * 12398));
    expect(m.yRot).toBe(f(f(r * Mth.PI) * 2));
    expect(m.footSize).toBe(f(0.5));
  });

  it('W12：构造函数的 setPos 是静态调用；setxxa/setyya 按 float', () => {
    const level = createFlatLevel();
    prepareLevel(level);

    let calls = 0;
    class PosSpy extends TestMob {
      override setPos(x: number, y: number, z: number): void {
        calls++;
        super.setPos(x, y, z);
      }
    }

    calls = 0;
    const m = new PosSpy(level);
    expect(calls, 'C++ 构造期间的 setPos 不派发到子类').toBe(0);

    m.setPos(1, 2, 3);
    expect(calls).toBe(1);

    m.setxxa(0.1);
    m.setyya(0.2);
    expect(m.getXxa()).toBe(f(0.1));
    expect(m.getYya()).toBe(f(0.2));
  });
});
