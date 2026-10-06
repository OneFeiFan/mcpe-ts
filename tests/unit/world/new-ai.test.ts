/**
 * 任务单 H11：新 AI（goal 系统）。这一版里 useNewAi() 恒为假（Level::setZombieAi 的调用点被注释掉），游戏中不会运行；
 * 这里直接驱动它，钉住 C++ 的行为：
 * - GoalSelector：优先级数字小的先占控制位；控制位冲突时低优先级的不启动；位不重叠的可以同时运行；
 *   不能继续的会 stop，同一刻里让出的控制位可以被别的 goal 接手；
 * - MoveControl：每刻最多转 30°，并把速度交给 mob；
 * - 僵尸打开新 AI 后：NearestAttackableTargetGoal 选中 16 格内的玩家，MeleeAttackGoal 追过去并造成伤害；
 * - 默认（不打开）时，僵尸的 useNewAi() 为假，Level.tickEntities 每刻把它重置为假。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Control, Difficulty, Goal, GoalSelector, initItems, initTileEntities, type Level, MoveControl, Player, Zombie,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {}
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
  level.difficulty = Difficulty.NORMAL;
});

class FakeGoal extends Goal {
  use = true;
  cont = true;
  log: string[];
  constructor(public name: string, flags: number, log: string[]) {
    super();
    this.log = log;
    this.setRequiredControlFlags(flags);
  }
  canUse(): boolean { return this.use; }
  override canContinueToUse(): boolean { return this.cont; }
  override start(): void { this.log.push(`start:${this.name}`); }
  override stop(): void { this.log.push(`stop:${this.name}`); }
  override tick(): void { this.log.push(`tick:${this.name}`); }
}

describe('GoalSelector', () => {
  it('同一控制位：优先级 1 先占，优先级 2 不启动；位不重叠的同时运行', () => {
    const log: string[] = [];
    const sel = new GoalSelector();
    const a = new FakeGoal('a', Control.MoveControlFlag, log);
    const b = new FakeGoal('b', Control.MoveControlFlag, log);
    const c = new FakeGoal('c', Control.JumpControlFlag, log);
    sel.addGoal(2, b);
    sel.addGoal(1, a);
    sel.addGoal(3, c);
    sel.tick();
    // b 先被检查（加入顺序）：那时 a 还没在运行，所以 b 先启动；然后 a（优先级更高）也能用 → 也启动（canUseInSystem 只看已运行的）
    expect(log).toEqual(['start:b', 'start:a', 'start:c', 'tick:b', 'tick:a', 'tick:c']);
    log.length = 0;
    sel.tick();
    // 第二刻：b 在运行，但更高优先级的 a 也在运行且控制位冲突 → b 被 stop
    expect(log).toEqual(['stop:b', 'tick:a', 'tick:c']);
  });

  it('不能继续的 goal 被 stop，同一刻里让出的控制位被别的 goal 接手', () => {
    const log: string[] = [];
    const sel = new GoalSelector();
    const a = new FakeGoal('a', Control.MoveControlFlag, log);
    const b = new FakeGoal('b', Control.MoveControlFlag, log);
    sel.addGoal(1, a);
    sel.addGoal(2, b);
    sel.tick();
    expect(log).toEqual(['start:a', 'tick:a']);
    log.length = 0;
    a.cont = false;
    a.use = false;
    sel.tick();
    expect(log).toEqual(['stop:a', 'start:b', 'tick:b']);
  });
});

describe('MoveControl', () => {
  it('每刻最多转 30°，并把速度交给 mob', () => {
    const z = new Zombie(level);
    z.moveTo(128.5, 64, 128.5, 0, 0);
    const mc = z.getMoveControl() as MoveControl;
    mc.setWantedPosition(140.5, 64, 128.5, 0.5); // 正 x 方向：目标朝向 atan2(0, +)·180/π − 90 = −90
    mc.tick();
    expect(z.yRot).toBe(-30);
    expect(mc.hasWanted()).toBe(false);
  });
});

describe('僵尸的新 AI', () => {
  it('默认关闭；Level.tickEntities 每刻把它重置为关闭', () => {
    const z = new Zombie(level);
    z.moveTo(100.5, 64, 100.5, 0, 0);
    level.addEntity(z);
    z.setUseNewAi(true);
    level.tickEntities();
    expect((z as unknown as { useNewAi(): boolean }).useNewAi()).toBe(false);
    level.removeEntity(z);
  });

  it('打开后：选中 16 格内的玩家为目标，追过去并造成伤害', () => {
    const p = new TestPlayer(level, false);
    p.moveTo(140.5, 64, 128.5, 0, 0);
    level.addEntity(p);
    const z = new Zombie(level);
    z.moveTo(130.5, 64, 128.5, 0, 0);
    z.setUseNewAi(true);
    const startDist = z.distanceTo(p);
    const hp0 = p.health;
    let gotTarget = false;
    for (let t = 0; t < 400 && p.health === hp0; t++) {
      z.setUseNewAi(true);
      z.tick();
      if (z.getTarget() === p) gotTarget = true;
    }
    expect(gotTarget).toBe(true);
    expect(z.distanceTo(p)).toBeLessThan(startDist);
    expect(p.health).toBeLessThan(hp0);
    level.removeEntity(p);
  });
});
