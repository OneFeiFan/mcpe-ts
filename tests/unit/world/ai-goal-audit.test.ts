/**
 * 全量审核（第 2 批：world/entity/ai）：
 * - W40 Goal：抽象基类的默认实现（canContinueToUse 转调 canUse、canInterrupt、控制位）。
 * - W41 GoalSelector：优先级按 short 截断、toStart 按值副本、按 (goal, prio) 值自跳过。
 * - W42 TargetGoal：within 是 float 形参、canContinueToUse / canAttack 的判据与顺序。
 * 本组审核未发现行为错误，用例用于钉住上述行为；编号见 docs/审核记录/entity-ai-goal.md。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Control,
  Goal,
  GoalSelector,
  initItems,
  initTileEntities,
  type Level,
  type Mob,
  Player,
  TargetGoal,
  Zombie,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

class MinimalGoal extends Goal {
  use = false;
  canUse(): boolean {
    return this.use;
  }
}

class TestGoal extends Goal {
  use = true;
  cont = true;
  log: string[];
  constructor(
    public name: string,
    flags: number,
    log: string[],
  ) {
    super();
    this.log = log;
    this.setRequiredControlFlags(flags);
  }
  canUse(): boolean {
    return this.use;
  }
  override canContinueToUse(): boolean {
    return this.cont;
  }
  override start(): void {
    this.log.push(`start:${this.name}`);
  }
  override stop(): void {
    this.log.push(`stop:${this.name}`);
  }
  override tick(): void {
    this.log.push(`tick:${this.name}`);
  }
}

class TestTargetGoal extends TargetGoal {
  canUse(): boolean {
    return true;
  }
  attack(target: Mob | null, allowInvulnerable: boolean): boolean {
    return this.canAttack(target, allowInvulnerable);
  }
  getWithin(): number {
    return this.within;
  }
}

class TestPlayer extends Player {}

let level: Level;

beforeAll(() => {
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

function placeZombie(x: number, y: number, z: number): Zombie {
  const mob = new Zombie(level);
  mob.moveTo(x, y, z, 0, 0);
  level.addEntity(mob);
  return mob;
}

describe('W40 Goal', () => {
  it('默认实现：canContinueToUse 转调 canUse，canInterrupt 为 true，控制位默认为 0', () => {
    const goal = new MinimalGoal();
    expect(goal.canContinueToUse()).toBe(false);
    goal.use = true;
    expect(goal.canContinueToUse()).toBe(true);
    expect(goal.canInterrupt()).toBe(true);
    expect(goal.getRequiredControlFlags()).toBe(0);
    const flags = Control.MoveControlFlag | Control.LookControlFlag;
    goal.setRequiredControlFlags(flags);
    expect(goal.getRequiredControlFlags()).toBe(flags);
  });

  it('start / stop / tick 的基类是空实现', () => {
    const goal = new MinimalGoal();
    expect(() => goal.start()).not.toThrow();
    expect(() => goal.stop()).not.toThrow();
    expect(() => goal.tick()).not.toThrow();
  });
});

describe('W41 GoalSelector', () => {
  it('优先级按 short 截断：addGoal(0x10001) 与 addGoal(1) 同优先级', () => {
    const log: string[] = [];
    const sel = new GoalSelector();
    const a = new TestGoal('a', Control.MoveControlFlag, log);
    const b = new TestGoal('b', Control.MoveControlFlag, log);
    sel.addGoal(0x10001, a);
    sel.addGoal(1, b);
    sel.tick();
    expect(log).toEqual(['start:a', 'tick:a']);
  });

  it('同一 goal 以同一优先级登记两次：两条记录互相跳过、各启动一次（怪癖保留）', () => {
    const log: string[] = [];
    const sel = new GoalSelector();
    const g = new TestGoal('g', 0, log);
    sel.addGoal(1, g);
    sel.addGoal(1, g);
    sel.tick();
    expect(log).toEqual(['start:g', 'start:g', 'tick:g', 'tick:g']);
  });
});

describe('W42 TargetGoal', () => {
  it('TargetFlag = 1', () => {
    expect(TargetGoal.TargetFlag).toBe(1);
  });

  it('within 是 float 形参：入口先 f()，5.999999999999999 / 6.000000000000001 都按 6 处理', () => {
    const mob = placeZombie(100.5, 64, 100.5);
    const target = placeZombie(106.5, 64, 100.5);
    mob.setTarget(target);
    expect(mob.distanceToSqr(target)).toBe(36);

    const below = new TestTargetGoal(mob, 5.999999999999999, false);
    expect(below.getWithin()).toBe(f(6));
    expect(below.canContinueToUse()).toBe(true); // double 下 36 > 35.999… 会误判为 false

    const above = new TestTargetGoal(mob, 6.000000000000001, false);
    expect(above.getWithin()).toBe(f(6));
    expect(above.canContinueToUse()).toBe(true); // double 下 36.000… > 36 会误判为 false
  });

  it('canContinueToUse：目标为空 / 已死 / 超出 within² 都返回 false', () => {
    const mob = placeZombie(100.5, 64, 100.5);
    const target = placeZombie(106.5, 64, 100.5);
    const goal = new TestTargetGoal(mob, 16, false);
    expect(goal.canContinueToUse()).toBe(false);
    mob.setTarget(target);
    expect(goal.canContinueToUse()).toBe(true);
    target.health = 0;
    expect(goal.canContinueToUse()).toBe(false);
    mob.setTarget(null);
    expect(goal.canContinueToUse()).toBe(false);

    const near = new TestTargetGoal(mob, 5, false);
    target.health = 20;
    mob.setTarget(target);
    expect(near.canContinueToUse()).toBe(false); // 6 > 5
  });

  it('canAttack：null / 自身 / 死亡 / y 不重叠 / 无敌玩家', () => {
    const mob = placeZombie(100.5, 64, 100.5);
    const goal = new TestTargetGoal(mob, 16, false);
    expect(goal.attack(null, false)).toBe(false);
    expect(goal.attack(mob, false)).toBe(false);

    const dead = placeZombie(100.5, 64, 100.5);
    dead.health = 0;
    expect(goal.attack(dead, false)).toBe(false);

    const above = placeZombie(100.5, 66, 100.5);
    expect(goal.attack(above, false)).toBe(false);
    const below = placeZombie(100.5, 62, 100.5);
    expect(goal.attack(below, false)).toBe(false);

    const same = placeZombie(100.5, 64, 100.5);
    expect(goal.attack(same, false)).toBe(true);

    const player = new TestPlayer(level, false);
    player.moveTo(100.5, 63, 100.5, 0, 0);
    player.abilities.invulnerable = true;
    expect(goal.attack(player, false)).toBe(false);
    expect(goal.attack(player, true)).toBe(true);
  });

  it('stop 清空目标', () => {
    const mob = placeZombie(100.5, 64, 100.5);
    const target = placeZombie(101.5, 64, 100.5);
    mob.setTarget(target);
    expect(mob.getTarget()).toBe(target);
    new TestTargetGoal(mob, 16, false).stop();
    expect(mob.getTarget()).toBeNull();
  });
});
