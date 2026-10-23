/**
 * 全量审核（第 2 批：world/entity/ai/goal）W48–W50。
 *
 * 三个 goal（MeleeAttackGoal / RandomStrollGoal / BreakDoorGoal）逐行对照参考 C++ 头文件后，
 * 没有发现行为差异；W48–W50 只补了 OMIT 登记与「C++ 未初始化 / 被注释代码」的注释，不改变运行行为。
 * 因此这里钉住的是审核确认过的现有行为：
 * - MeleeAttackGoal：目标条件、attackType 怪癖、float 速度入口、2 倍身宽与 20 刻冷却；
 * - RandomStrollGoal：noActionTime/nextInt(120) 的判定顺序、RandomPos 输出、速度 float 入口；
 * - BreakDoorGoal：门开/关判定、breakTime >= 0、每刻消耗 nextInt(20)、第 240 刻拆门。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BreakDoorGoal,
  Difficulty,
  DoorInteractGoal,
  DoorTile,
  initItems,
  initTileEntities,
  type Level,
  MeleeAttackGoal,
  Path,
  Player,
  RandomPos,
  RandomStrollGoal,
  Tile,
  Vec3,
  Zombie,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {}

/** 暴露 DoorInteractGoal 的 protected 字段，方便直接摆门的位置。 */
class TestBreakDoorGoal extends BreakDoorGoal {
  setDoor(x: number, y: number, z: number): void {
    this.doorX = x;
    this.doorY = y;
    this.doorZ = z;
    this.doorTile = Tile.tiles[Tile.door_wood.id] as DoorTile;
  }
}

let level: Level;

beforeAll(() => {
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
  level.difficulty = Difficulty.NORMAL;
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MeleeAttackGoal（W48）', () => {
  it('canUse：无目标、无路径、attackType != 0 时非玩家生物不能用（C++ 怪癖）', () => {
    const z = new Zombie(level);
    z.moveTo(100.5, 64, 100.5, 0, 0);
    const p = new TestPlayer(level, false);
    p.moveTo(101.5, 64, 100.5, 0, 0);
    level.addEntity(p);

    const nav = z.getNavigation()!;
    const create = vi.spyOn(nav, 'createPathToMob');
    const goal = new MeleeAttackGoal(z, 0.5, true, 0);

    expect(goal.canUse(), '没有目标').toBe(false);

    z.setTarget(p);
    create.mockReturnValue(null);
    expect(goal.canUse(), 'createPath 失败').toBe(false);

    create.mockReturnValue(new Path());
    expect(goal.canUse()).toBe(true);

    const typed = new MeleeAttackGoal(z, 0.5, true, 1);
    expect(typed.canUse(), 'attackType != 0 且 mob 不是玩家').toBe(false);

    level.removeEntity(p);
  });

  it('start 把 float 形参（入口已舍入）传给 moveToPath，第三个参数是 false', () => {
    const z = new Zombie(level);
    z.moveTo(105.5, 64, 105.5, 0, 0);
    const p = new TestPlayer(level, false);
    p.moveTo(106.5, 64, 105.5, 0, 0);
    level.addEntity(p);
    z.setTarget(p);

    const nav = z.getNavigation()!;
    const path = new Path();
    vi.spyOn(nav, 'createPathToMob').mockReturnValue(path);
    const moveToPath = vi.spyOn(nav, 'moveToPath').mockReturnValue(true);

    const goal = new MeleeAttackGoal(z, 1.1, true, 0);
    expect(goal.canUse()).toBe(true);
    goal.start();

    expect(moveToPath).toHaveBeenCalledWith(path, Math.fround(1.1), false);
    level.removeEntity(p);
  });

  it('tick：2 倍身宽内每 20 刻打一次；超出 (bbWidth*2)^2 不打', () => {
    const z = new Zombie(level);
    z.moveTo(110.5, 64, 110.5, 0, 0);
    const p = new TestPlayer(level, false);
    p.moveTo(110.6, 64, 110.5, 0, 0);
    level.addEntity(p);
    z.setTarget(p);

    const nav = z.getNavigation()!;
    vi.spyOn(nav, 'createPathToMob').mockReturnValue(new Path());
    vi.spyOn(nav, 'moveToPath').mockReturnValue(true);
    const move = vi.spyOn(nav, 'moveToMob').mockReturnValue(true);
    const hurt = vi.spyOn(z, 'doHurtTarget').mockReturnValue(true);

    const goal = new MeleeAttackGoal(z, 0.5, true, 0);
    expect(goal.canUse()).toBe(true);
    goal.start();
    goal.tick();
    expect(hurt).toHaveBeenCalledTimes(1);
    expect(hurt).toHaveBeenCalledWith(p);

    for (let i = 0; i < 19; i++) goal.tick();
    expect(hurt, '冷却未到（第 2–20 刻）').toHaveBeenCalledTimes(1);

    goal.tick();
    expect(hurt, '第 21 刻再打一下').toHaveBeenCalledTimes(2);
    expect(move).toHaveBeenCalledTimes(21);

    // 超出 2 倍身宽（(0.6*2)^2 = 1.44）：即使冷却结束也不打
    const z2 = new Zombie(level);
    z2.moveTo(120.5, 64, 120.5, 0, 0);
    const p2 = new TestPlayer(level, false);
    p2.moveTo(122.5, 64, 120.5, 0, 0);
    level.addEntity(p2);
    z2.setTarget(p2);
    const nav2 = z2.getNavigation()!;
    vi.spyOn(nav2, 'createPathToMob').mockReturnValue(new Path());
    vi.spyOn(nav2, 'moveToPath').mockReturnValue(true);
    vi.spyOn(nav2, 'moveToMob').mockReturnValue(true);
    const hurt2 = vi.spyOn(z2, 'doHurtTarget').mockReturnValue(true);
    const goal2 = new MeleeAttackGoal(z2, 0.5, true, 0);
    expect(goal2.canUse()).toBe(true);
    goal2.start();
    goal2.tick();
    expect(hurt2).not.toHaveBeenCalled();

    level.removeEntity(p);
    level.removeEntity(p2);
  });

  it('canContinueToUse：trackTarget = false 时取决于导航是否走完', () => {
    const z = new Zombie(level);
    z.moveTo(130.5, 64, 130.5, 0, 0);
    const p = new TestPlayer(level, false);
    p.moveTo(131.5, 64, 130.5, 0, 0);
    level.addEntity(p);
    z.setTarget(p);

    const nav = z.getNavigation()!;
    const done = vi.spyOn(nav, 'isDone').mockReturnValue(false);
    const goal = new MeleeAttackGoal(z, 0.5, false, 0);
    expect(goal.canContinueToUse()).toBe(true);
    done.mockReturnValue(true);
    expect(goal.canContinueToUse()).toBe(false);

    level.removeEntity(p);
  });
});

describe('RandomStrollGoal（W49）', () => {
  it('canUse：noActionTime >= 100 直接失败，不消耗随机数', () => {
    const z = new Zombie(level);
    vi.spyOn(z, 'getNoActionTime').mockReturnValue(100);
    const nextInt = vi.spyOn(z.random, 'nextInt').mockReturnValue(0);
    const getPos = vi.spyOn(RandomPos, 'getPos');

    const goal = new RandomStrollGoal(z, 0.5);
    expect(goal.canUse()).toBe(false);
    expect(nextInt).not.toHaveBeenCalled();
    expect(getPos).not.toHaveBeenCalled();
  });

  it('canUse：先 nextInt(120)，再 RandomPos.getPos；成功才写入 wanted，start 用舍入后的速度', () => {
    const z = new Zombie(level);
    vi.spyOn(z, 'getNoActionTime').mockReturnValue(0);

    const order: string[] = [];
    const nextInt = vi.spyOn(z.random, 'nextInt').mockImplementation((n?: number): number => {
      order.push(`nextInt:${n}`);
      return 0;
    });
    const getPos = vi.spyOn(RandomPos, 'getPos').mockImplementation(() => {
      order.push('getPos');
      return new Vec3(11, 65, 12);
    });

    const nav = z.getNavigation()!;
    const moveToPos = vi.spyOn(nav, 'moveToPos').mockReturnValue(true);

    const goal = new RandomStrollGoal(z, 1.1);
    expect(goal.canUse()).toBe(true);
    expect(order).toEqual(['nextInt:120', 'getPos']);
    expect(nextInt).toHaveBeenCalledWith(120);
    expect(getPos).toHaveBeenCalledWith(z, 10, 7);

    goal.start();
    expect(moveToPos).toHaveBeenCalledWith(11, 65, 12, Math.fround(1.1));
  });

  it('canUse：nextInt(120) != 0 或 getPos 返回 null 都失败', () => {
    const z = new Zombie(level);
    vi.spyOn(z, 'getNoActionTime').mockReturnValue(0);
    const nextInt = vi.spyOn(z.random, 'nextInt').mockReturnValue(5);
    const getPos = vi.spyOn(RandomPos, 'getPos').mockReturnValue(new Vec3(1, 64, 1));

    const goal = new RandomStrollGoal(z, 0.5);
    expect(goal.canUse()).toBe(false);
    expect(getPos).not.toHaveBeenCalled();

    nextInt.mockReturnValue(0);
    getPos.mockReturnValue(null);
    expect(goal.canUse()).toBe(false);
  });

  it('canContinueToUse 取反导航的 isDone', () => {
    const z = new Zombie(level);
    const nav = z.getNavigation()!;
    const done = vi.spyOn(nav, 'isDone').mockReturnValue(false);
    const goal = new RandomStrollGoal(z, 0.5);
    expect(goal.canContinueToUse()).toBe(true);
    done.mockReturnValue(true);
    expect(goal.canContinueToUse()).toBe(false);
  });
});

describe('BreakDoorGoal（W50）', () => {
  it('canUse：super 可用且门没开时才可用', () => {
    const z = new Zombie(level);
    const goal = new TestBreakDoorGoal(z);
    goal.setDoor(150, 64, 150);
    level.setTileAndDataNoUpdate(150, 64, 150, Tile.door_wood.id, 0);

    const superCanUse = vi.spyOn(DoorInteractGoal.prototype, 'canUse').mockReturnValue(true);
    expect(goal.canUse()).toBe(true);

    level.setTileAndDataNoUpdate(150, 64, 150, Tile.door_wood.id, DoorTile.C_OPEN_MASK);
    expect(goal.canUse()).toBe(false);

    superCanUse.mockReturnValue(false);
    expect(goal.canUse()).toBe(false);
  });

  it('canContinueToUse：breakTime >= 0、门未开、距离 < 2*2', () => {
    const z = new Zombie(level);
    z.moveTo(160.5, 64, 160.5, 0, 0);
    const goal = new TestBreakDoorGoal(z);
    goal.setDoor(160, 64, 160);
    level.setTileAndDataNoUpdate(160, 64, 160, Tile.door_wood.id, 0);
    vi.spyOn(z.random, 'nextInt').mockReturnValue(1);

    goal.start();
    expect(goal.canContinueToUse()).toBe(true);

    level.setTileAndDataNoUpdate(160, 64, 160, Tile.door_wood.id, DoorTile.C_OPEN_MASK);
    expect(goal.canContinueToUse(), '门开了').toBe(false);

    level.setTileAndDataNoUpdate(160, 64, 160, Tile.door_wood.id, 0);
    z.moveTo(170.5, 64, 160.5, 0, 0);
    expect(goal.canContinueToUse(), '距离 10 > 2').toBe(false);
  });

  it('tick：每刻消耗一次 nextInt(20)；第 240 刻拆门；breakTime 为 0 时仍可继续（C++ 的 >= 0）', () => {
    const z = new Zombie(level);
    z.moveTo(170.5, 64, 170.5, 0, 0);
    const goal = new TestBreakDoorGoal(z);
    goal.setDoor(170, 64, 170);
    level.setTileAndDataNoUpdate(170, 64, 170, Tile.door_wood.id, 0);

    const nextInt = vi.spyOn(z.random, 'nextInt').mockReturnValue(1);
    // 只观察调用，不真的把方块删掉（否则后面的 canContinueToUse 会被门已消失干扰）。
    const setTile = vi.spyOn(level, 'setTile').mockReturnValue(true);

    goal.start(); // breakTime = 20 * 12 = 240
    for (let i = 0; i < 239; i++) goal.tick();
    expect(setTile).not.toHaveBeenCalled();
    expect(nextInt).toHaveBeenCalledTimes(239);

    goal.tick();
    expect(setTile).toHaveBeenCalledTimes(1);
    expect(setTile).toHaveBeenCalledWith(170, 64, 170, 0);
    expect(nextInt).toHaveBeenCalledTimes(240);
    expect(nextInt).toHaveBeenCalledWith(20);
    expect(goal.canContinueToUse(), 'breakTime 恰好 0：>= 0 成立').toBe(true);

    goal.tick();
    expect(goal.canContinueToUse(), 'breakTime = -1 后结束').toBe(false);
    expect(nextInt).toHaveBeenCalledTimes(241);
  });
});
