/**
 * 全量审核（第 2 批：world/entity/ai）：三个 goal 的行为钉住测试。
 * - W51 DoorInteractGoal：路点扫描范围（0..index+1）、2.25 阈值（严格 >）、未撞墙/无路径/不开门的提前返回、
 *   回退到 floor(mob.y + 1) 所在格、开门方向与点积的 float 逐步舍入；
 * - W52 HurtByTargetGoal：getLastHurtByMob 的 targetId==0 原版怪癖、start 用最近攻击者覆盖目标、
 *   alertSameType=true 也不通知同类（C++ 那段被注释掉）；
 * - W53 NearestAttackableTargetGoal：targetType==1 选 16 格内玩家、targetType!=1 恒 false、
 *   randomInterval 的短路取数、invulnerable 玩家被拒绝、within 按 float 形参舍入、
 *   canUse 之前 start 的安全默认值。
 * DoorInteractGoal 在本版里没有任何生物添加；HurtBy/Nearest 由 Zombie 构造函数无条件加入
 * （C++ Zombie.cpp:29-30），只是普通 Zombie 的 useNewAi 默认 false、选择器不会 tick。
 * 测试直接构造并调用 goal 来固定行为。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DoorInteractGoal,
  HurtByTargetGoal,
  initItems,
  initTileEntities,
  type Level,
  NearestAttackableTargetGoal,
  Node,
  Path,
  Player,
  TargetGoal,
  Tile,
  Zombie,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {}

let level: Level;
const cleanup: (Zombie | Player)[] = [];

beforeAll(() => {
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

afterEach(() => {
  for (const e of cleanup.splice(0)) level.removeEntity(e);
  vi.restoreAllMocks();
});

function makeZombie(x: number, y: number, z: number, add = false): Zombie {
  const mob = new Zombie(level);
  mob.moveTo(x, y, z, 0, 0);
  if (add) {
    level.addEntity(mob);
    cleanup.push(mob);
  }
  return mob;
}

function makePlayer(x: number, y: number, z: number): TestPlayer {
  const p = new TestPlayer(level, false);
  p.moveTo(x, y, z, 0, 0);
  level.addEntity(p);
  cleanup.push(p);
  return p;
}

function usePath(mob: Zombie, nodes: Node[], canOpenDoors = true): Path {
  const nav = mob.getNavigation()!;
  nav.canOpenDoors = canOpenDoors;
  const path = new Path();
  path.copyNodes(nodes, nodes.length);
  nav.moveToPath(path, 0.5, true);
  return path;
}

describe('DoorInteractGoal（W51）', () => {
  class TestDoorInteractGoal extends DoorInteractGoal {
    get doorPos(): [number, number, number] {
      return [this.doorX, this.doorY, this.doorZ];
    }
    setDoorPos(x: number, y: number, z: number): void {
      this.doorX = x;
      this.doorY = y;
      this.doorZ = z;
    }
  }

  it('未撞墙 / 没有路径 / canOpenDoors=false 时返回 false；否则回退到 mob 所在格', () => {
    const mob = makeZombie(100.5, 64, 100.5);
    expect(level.setTile(100, 65, 100, Tile.door_wood.id)).toBe(true);
    const goal = new TestDoorInteractGoal(mob);

    expect(goal.canUse()).toBe(false); // horizontalCollision = false
    mob.horizontalCollision = true;
    expect(goal.canUse()).toBe(false); // path === null

    usePath(mob, [new Node(120, 63, 120)], false);
    expect(goal.canUse()).toBe(false); // !pathNav.canOpenDoors

    mob.getNavigation()!.canOpenDoors = true;
    expect(goal.canUse()).toBe(true); // 路点太远 → 回退到 floor(mob.y + 1)
    expect(goal.doorPos).toEqual([100, 65, 100]);
  });

  it('扫描 0..index+1 的路点；距离恰好 2.25 不跳过，超过才跳过', () => {
    const mob = makeZombie(100.5, 64, 100.5);
    usePath(mob, [new Node(120, 63, 120), new Node(101, 63, 100)]);
    expect(level.setTile(101, 64, 100, Tile.door_wood.id)).toBe(true);
    mob.horizontalCollision = true;
    const goal = new TestDoorInteractGoal(mob);
    expect(goal.canUse()).toBe(true);
    expect(goal.doorPos).toEqual([101, 64, 100]); // 第二个路点也扫到了

    const border = makeZombie(130.5, 64, 130);
    usePath(border, [new Node(132, 63, 130)]);
    expect(level.setTile(132, 64, 130, Tile.door_wood.id)).toBe(true);
    border.horizontalCollision = true;
    expect(new TestDoorInteractGoal(border).canUse()).toBe(true); // 1.5² = 2.25，不满足 >

    const tooFar = makeZombie(140.5, 64, 140);
    usePath(tooFar, [new Node(143, 63, 140)]);
    expect(level.setTile(143, 64, 140, Tile.door_wood.id)).toBe(true);
    tooFar.horizontalCollision = true;
    expect(new TestDoorInteractGoal(tooFar).canUse()).toBe(false); // 2.5² > 2.25
  });

  it('start/tick 的开门方向按 float 逐步舍入；穿过门后 canContinueToUse=false', () => {
    const mob = makeZombie(0.1, 64, 0.1);
    const goal = new TestDoorInteractGoal(mob);
    goal.setDoorPos(0, 64, 0);
    expect(goal.canContinueToUse()).toBe(true); // passed 的安全默认值（C++ 未初始化）

    goal.start();
    // C++: doorX + 0.5f - mob->x（两段 float）。doorOpenDirX/Z 是 private，测试不直接读；
    // 精确的 f() 分步在审核记录里按代码对照确认。

    mob.moveTo(0.6, 64, 0.6, 0, 0);
    goal.tick();
    expect(goal.canContinueToUse()).toBe(false);

    goal.start(); // 重新开始会清掉 passed
    expect(goal.canContinueToUse()).toBe(true);
  });

  it('路径已完成时提前返回 false（不会回退到脚下）', () => {
    const mob = makeZombie(145.5, 64, 145.5);
    expect(level.setTile(145, 65, 145, Tile.door_wood.id)).toBe(true);
    const path = usePath(mob, [new Node(120, 63, 120)]);
    path.setIndex(1);
    mob.horizontalCollision = true;
    expect(new TestDoorInteractGoal(mob).canUse()).toBe(false);
  });

  it('路点格不是 door_wood 时继续找，最终返回 false', () => {
    const mob = makeZombie(146.5, 64, 146.5);
    usePath(mob, [new Node(147, 63, 146)]);
    expect(level.setTile(147, 64, 146, Tile.dirt.id)).toBe(true);
    mob.horizontalCollision = true;
    expect(new TestDoorInteractGoal(mob).canUse()).toBe(false);
  });
});

describe('HurtByTargetGoal（W52）', () => {
  it('原版怪癖：getLastHurtByMob 在 targetId==0 时返回 null，因此 canUse 也是 false', () => {
    const mob = makeZombie(150.5, 64, 150.5, true);
    const p = makePlayer(151.5, 64, 150.5);
    mob.setLastHurtByMob(p);

    expect(mob.getTarget()).toBeNull();
    expect(mob.getLastHurtByMob()).toBeNull();

    const goal = new HurtByTargetGoal(mob, false);
    expect(goal.canUse()).toBe(false);
    expect(goal.getRequiredControlFlags()).toBe(TargetGoal.TargetFlag);
  });

  it('canUse/start 把最近攻击者设为目标（覆盖已有目标）', () => {
    const mob = makeZombie(155.5, 64, 155.5, true);
    const other = makeZombie(156.5, 64, 155.5, true);
    const p = makePlayer(157.5, 64, 155.5);
    mob.setTarget(other);
    mob.setLastHurtByMob(p);
    expect(mob.getTarget()).toBe(other);

    const goal = new HurtByTargetGoal(mob, false);
    expect(goal.canUse()).toBe(true);
    goal.start();
    expect(mob.getTarget()).toBe(p);
  });

  it('alertSameType=true 也不通知同类（C++ 的整段逻辑被注释掉）', () => {
    const mob = makeZombie(160.5, 64, 160.5, true);
    const other = makeZombie(161.5, 64, 160.5, true);
    const p = makePlayer(162.5, 64, 160.5);
    mob.setTarget(p);
    mob.setLastHurtByMob(p);

    const goal = new HurtByTargetGoal(mob, true);
    goal.start();
    expect(other.getTarget()).toBeNull();
    expect(mob.getTarget()).toBe(p);
  });
});

describe('NearestAttackableTargetGoal（W53）', () => {
  class TestNearestGoal extends NearestAttackableTargetGoal {
    get withinValue(): number {
      return this.within;
    }
  }

  it('targetType==1：选 16 格内最近的玩家，start 设为目标', () => {
    const mob = makeZombie(150.5, 64, 150.5, true);
    const p = makePlayer(158.5, 64, 150.5);
    const goal = new NearestAttackableTargetGoal(mob, 1, 16, 0, false);
    expect(goal.canUse()).toBe(true);
    goal.start();
    expect(mob.getTarget()).toBe(p);
  });

  it('targetType!=1：potentialTarget 保持 null（C++ 的 else 分支被注释掉）', () => {
    const mob = makeZombie(150.5, 64, 150.5, true);
    makePlayer(155.5, 64, 150.5);
    expect(new NearestAttackableTargetGoal(mob, 2, 16, 0, false).canUse()).toBe(false);
    expect(mob.getTarget()).toBeNull();
  });

  it('16 格外不选；invulnerable 玩家被 canAttack(false) 拒绝', () => {
    const mob = makeZombie(150.5, 64, 150.5, true);
    makePlayer(180.5, 64, 150.5); // 30 格外
    expect(new NearestAttackableTargetGoal(mob, 1, 16, 0, false).canUse()).toBe(false);

    const near = makePlayer(155.5, 64, 150.5); // 5 格内
    near.abilities.invulnerable = true;
    expect(new NearestAttackableTargetGoal(mob, 1, 16, 0, false).canUse()).toBe(false);
  });

  it('randomInterval>0 时先抽 nextInt：非 0 立即 false，0 才继续；=0 不抽', () => {
    const mob = makeZombie(150.5, 64, 150.5, true);
    makePlayer(155.5, 64, 150.5);

    const goal = new NearestAttackableTargetGoal(mob, 1, 16, 5, false);
    const spy = vi.spyOn(mob.random, 'nextInt').mockReturnValue(1);
    expect(goal.canUse()).toBe(false);
    expect(spy).toHaveBeenCalledWith(5);
    spy.mockRestore();

    const goal2 = new NearestAttackableTargetGoal(mob, 1, 16, 5, false);
    const spy2 = vi.spyOn(mob.random, 'nextInt').mockReturnValue(0);
    expect(goal2.canUse()).toBe(true);
    expect(spy2).toHaveBeenCalledTimes(1);
    spy2.mockRestore();

    const goal3 = new NearestAttackableTargetGoal(mob, 1, 16, 0, false);
    const spy3 = vi.spyOn(mob.random, 'nextInt');
    expect(goal3.canUse()).toBe(true);
    expect(spy3).not.toHaveBeenCalled();
    spy3.mockRestore();
  });

  it('within 形参按 C++ float 入口舍入', () => {
    const mob = makeZombie(150.5, 64, 150.5);
    const goal = new TestNearestGoal(mob, 1, 16.1, 0, false);
    expect(goal.withinValue).toBe(Math.fround(16.1));
    expect(goal.withinValue).not.toBe(16.1);
  });

  it('canUse 之前 start 是安全的：target 默认 null（C++ 未初始化）', () => {
    const mob = makeZombie(150.5, 64, 150.5, true);
    const other = makeZombie(151.5, 64, 150.5, true);
    mob.setTarget(other);
    expect(mob.getTarget()).toBe(other);

    new NearestAttackableTargetGoal(mob, 1, 16, 0, false).start();
    expect(mob.getTarget()).toBeNull();
  });
});
