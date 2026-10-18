import { describe, expect, it } from 'vitest';
import { HangingEntity, type Level } from '@mcpe/world';

// 全量审核（第 2 批：world/entity/HangingEntity）：W11 的“先红后绿”测试。
//   - C++ 只重写了 push(float,float,float)；push(Entity*) 仍是 Entity 的实现（它是 virtual，
//     内部又会虚调用到三参 push，于是挂件会掉落）。
//   - 构造函数的 init() 是 C++ 非虚函数，构造期间不会派发到子类。

const f = Math.fround;

let dropCalls = 0;

class TestHangingEntity extends HangingEntity {
  override getEntityTypeId(): number {
    return 1;
  }
  getWidth(): number {
    return 16;
  }
  getHeight(): number {
    return 16;
  }
  dropItem(): void {
    dropCalls++;
  }
}

describe('HangingEntity（全量审核 W11）', () => {
  it('W11：push(Entity*) 走基类实现，最终虚调用到三参 push（双方都掉落）', () => {
    dropCalls = 0;
    const a = new TestHangingEntity({} as Level);
    const b = new TestHangingEntity({} as Level);
    b.x = f(1);
    b.z = 0;

    a.push(b);

    expect(dropCalls, 'a 与 b 各 dropItem 一次').toBe(2);
    expect(a.removed).toBe(true);
    expect(b.removed).toBe(true);
  });

  it('W11：构造函数的 init 是静态调用（子类重写不参与）', () => {
    let initCalls = 0;
    class InitSpy extends TestHangingEntity {
      override init(): void {
        initCalls++;
        super.init();
      }
    }

    initCalls = 0;
    const e = new InitSpy({} as Level);
    expect(initCalls, 'C++ 的 init 不是 virtual，构造期间不派发到子类').toBe(0);

    e.init();
    expect(initCalls, '构造完成后再调用，正常派发').toBe(1);
  });
});
