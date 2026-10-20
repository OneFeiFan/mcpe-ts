import { beforeEach, describe, expect, it } from 'vitest';
import { Creeper, type Entity, type Level } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核 W32：Creeper 里带 float 形参的函数（checkHurtTarget 的 d、getSwelling 的 a）
// 必须在函数入口先按 float 舍入。C++ 形参是 float，调用方传进来的 double 会在入口被舍入；
// TS 若不包，边界比较（d < 7）和乘法结果都会和原版不同。

const f = Math.fround;

/** 把 protected 的 checkHurtTarget 暴露成 public，测试里直接喂 double */
class ExposedCreeper extends Creeper {
  hit(target: Entity, d: number): void {
    this.checkHurtTarget(target, d);
  }
}

describe('Creeper 审核（W32）', () => {
  let level: Level;

  beforeEach(() => {
    level = createFlatLevel();
    prepareLevel(level);
  });

  it('W32：checkHurtTarget 的 float 形参 d 在入口舍入（d < 7 的边界）', () => {
    const c = new ExposedCreeper(level);
    // 第一次 d=2 进入膨胀分支：swellDir 变成 1，swell 变成 1
    c.hit(c, 2);

    // 该 double 略小于 7，但舍入成 float 后正好是 7.f：
    // C++ 的条件 (swellDir > 0 && d < 7) 为假，走缩回分支，swell 回到 0。
    const d = 6.999999999999999;
    expect(f(d)).toBe(7);
    expect(d < 7).toBe(true);

    c.hit(c, d);
    expect(c.getSwelling(1)).toBe(0);
  });

  it('W32：getSwelling 的 float 形参 a 在入口舍入', () => {
    const c = new ExposedCreeper(level);
    for (let i = 0; i < 7; i++) c.hit(c, 2); // swell = 7, oldSwell = 0

    const a = 0.1 + 0.2; // double 不等于它的 float 值
    expect(f(a)).not.toBe(a);

    // C++：f(f(oldSwell + f((swell - oldSwell) * a)) / (MAX_SWELL - 2))，a 先转 float
    const product = f((7 - 0) * f(a));
    const sum = f(0 + product);
    expect(c.getSwelling(a)).toBe(f(sum / (30 - 2)));
  });
});
