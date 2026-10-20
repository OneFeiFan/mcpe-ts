import { beforeEach, describe, expect, it } from 'vitest';
import { type Entity, type Level, Zombie } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核 W33：`Monster::checkHurtTarget(Entity* target, float distance)` 的形参是 float。
// C++ 在函数入口把实参舍入成 float；TS 以前直接拿 double 比较 `distance < 2.0f`。
// 引擎内唯一调用方 PathfinderMob 传的 `distanceTo()` 恰好已返回 float，所以玩法路径不变；
// 但按审核清单第 2 条，函数契约要求入口先舍入（同类：Creeper 的 W32）。

const f = Math.fround;

/** 把 protected 的 checkHurtTarget 暴露出来，直接喂 double */
class ExposedZombie extends Zombie {
  hit(target: Entity, d: number): void {
    this.checkHurtTarget(target, d);
  }
}

describe('Monster 审核（W33）', () => {
  let level: Level;

  beforeEach(() => {
    level = createFlatLevel();
    prepareLevel(level);
  });

  it('W33：checkHurtTarget 的 float 形参在入口舍入（distance < 2.0f 的边界）', () => {
    const attacker = new ExposedZombie(level);
    const target = new ExposedZombie(level);
    attacker.moveTo(10.5, 64, 10.5, 0, 0);
    target.moveTo(10.5, 64, 10.5, 0, 0);
    level.addEntity(attacker);
    level.addEntity(target);
    attacker.attackTime = 0;
    const healthBefore = target.health;

    // 这个 double 略小于 2，但舍入成 float 正好是 2.0f：
    // C++ 里条件 `distance < 2.0f` 为假，不攻击；未舍入的 TS 会判为真。
    const d = 1.9999999999999998;
    expect(f(d)).toBe(2);
    expect(d < 2).toBe(true);

    attacker.hit(target, d);
    expect(attacker.attackTime).toBe(0);
    expect(target.health).toBe(healthBefore);
  });
});
