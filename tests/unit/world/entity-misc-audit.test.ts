import { describe, expect, it } from 'vitest';
import { AgableMob, EntityPos } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核（第 2 批：world/entity 小文件组）：W10 的“先红后绿”测试。
//   - EntityPos 的五个字段在 C++ 里是 float，构造函数形参也是 float；旧 TS 直接存 double。
//   - AgableMob 构造函数里的 setAge 是 C++ 非虚函数，构造期间不会派发到子类。

const f = Math.fround;

describe('world/entity 小文件（全量审核 W10）', () => {
  it('W10：EntityPos 的五个 float 字段在构造时舍入', () => {
    const full = new EntityPos(0.1, 0.2, 0.3, 0.4, 0.5);
    expect([full.x, full.y, full.z]).toEqual([f(0.1), f(0.2), f(0.3)]);
    expect([full.yRot, full.xRot]).toEqual([f(0.4), f(0.5)]);
    expect([full.rot, full.move]).toEqual([true, true]);

    const pos = new EntityPos(0.6, 0.7, 0.8);
    expect([pos.x, pos.y, pos.z]).toEqual([f(0.6), f(0.7), f(0.8)]);
    // C++ 的 (x,y,z) 构造函数不初始化 yRot/xRot（UB）；TS 统一取 0。
    expect([pos.yRot, pos.xRot]).toEqual([0, 0]);
    expect([pos.rot, pos.move]).toEqual([false, true]);

    const rot = new EntityPos(0.9, 1.1);
    expect([rot.yRot, rot.xRot]).toEqual([f(0.9), f(1.1)]);
    // C++ 的 (yRot,xRot) 构造函数不初始化 x/y/z（UB）；TS 统一取 0。
    expect([rot.x, rot.y, rot.z]).toEqual([0, 0, 0]);
    expect([rot.rot, rot.move]).toEqual([true, false]);
  });

  it('W10：AgableMob 构造函数的 setAge 是静态调用（子类重写不参与）', () => {
    const level = createFlatLevel();
    prepareLevel(level);

    let calls = 0;
    class TestAgableMob extends AgableMob {
      override getEntityTypeId(): number {
        return 1;
      }
      override setAge(age: number): void {
        calls++;
        super.setAge(age);
      }
    }

    calls = 0;
    const mob = new TestAgableMob(level);
    expect(calls, 'C++ 非虚函数，构造期间的调用不派发到子类').toBe(0);
    expect(mob.getAge()).toBe(0);

    mob.setAge(3);
    expect(calls).toBe(1);
    expect(mob.getAge()).toBe(3);
  });
});
