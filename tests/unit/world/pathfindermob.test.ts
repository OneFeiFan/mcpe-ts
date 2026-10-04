import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import {
  AgableMob,
  type Entity,
  type Level,
  Mob,
  MobTypes,
  PathfinderMob,
  Tile,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D10a：`PathfinderMob` + `AgableMob` —— `Chicken → Animal → AgableMob → PathfinderMob → Mob`
// 这条链里 TS 一直缺的两级（D10 执行时才发现，D0 的估算漏了）。
//
// ⚠ 这个文件**不测 AI**（`updateAi` / `findRandomStrollLocation` 是整条 OMIT 的，见源码注释）。
//   测的是"非 AI 的那半"：字段、canSpawn、攻击目标、速度修正、以及 age/同步标志。

const f = Math.fround;
const X = 130;
const Y = 64;
const Z = 130;
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  for (let y = Y; y <= Y + 6; y++)
    for (let x = X - 4; x <= X + 4; x++)
      for (let z = Z - 4; z <= Z + 4; z++) level.setTileNoUpdate(x, y, z, 0);
});

/** 最小可实例化的子类：把 protected 的成员露出来，再把 Entity 那两个抽象方法实现掉。 */
class TestMob extends AgableMob {
  override getEntityTypeId(): number {
    // ⚠ 不能返回 0：`Entity.save` 见到 id === 0 直接 return false（D6 踩过）
    return MobTypes.Chicken;
  }
  speedMod(): number {
    return this.getWalkingSpeedModifier();
  }
  holdsGround(): boolean {
    return this.shouldHoldGround();
  }
  findTarget(): Entity | null {
    return this.findAttackTarget();
  }
  cantSee(target: Entity, d: number): void {
    this.checkCantSeeTarget(target, d);
  }
  hurtTarget(target: Entity, d: number): void {
    this.checkHurtTarget(target, d);
  }
  setFleeTime(t: number): void {
    this.fleeTime = t;
  }
  targetId(): number {
    return this.attackTargetId;
  }
  setTargetId(id: number): void {
    this.attackTargetId = id;
  }
  /** `setSize` 在 Mob 里是 protected（C++ 也是），测试从这个方法进去 */
  resize(w: number, h: number): void {
    this.setSize(w, h);
  }
  /** 直接动同步标志（模拟"网络包只把标志同步过来、age 字段没动"） */
  setBabyFlag(v: boolean): void {
    if (v) this.entityData.setFlag(14, 0);
    else this.entityData.clearFlag(14, 0);
  }
}

/** 一个 getWalkTargetValue 返回负数的子类：用来验 PathfinderMob.canSpawn 里那个 `>= 0` */
class UnhappyMob extends TestMob {
  override getWalkTargetValue(_x: number, _y: number, _z: number): number {
    return -1;
  }
}

/**
 * 造一只，**不加进世界**。
 *
 * ⚠ `canSpawn()` 必须在 addEntity **之前**问 —— `Mob.canSpawn` 的
 * `level.isUnobstructed(bb)` 会把**自己**也算进去（`blocksBuilding` 为真），
 * 先加进世界再问永远返回 false（第一版就是这么假红的）。真机的顺序也是先问再加。
 */
function makeMob(): TestMob {
  const m = new TestMob(level);
  m.resize(f(0.6), f(1.8));
  m.setPos(X + 0.5, Y + 1, Z + 0.5);
  return m;
}

/** 造一只并加进世界（测"按 entityId 去 level 里查"那几条时要） */
function spawnMob(): TestMob {
  const m = makeMob();
  level.addEntity(m);
  return m;
}

describe('PathfinderMob（D10a）', () => {
  it('三个字段的初值：attackTargetId 0、holdGround false、fleeTime 0', () => {
    const m = spawnMob();
    expect(m.targetId()).toBe(0);
    expect(m.holdsGround()).toBe(false);
    expect(m.getNoActionTime()).toBe(0);
  });

  it('三个类常量照 C++', () => {
    expect(PathfinderMob.MAX_TURN).toBe(30);
    expect(PathfinderMob.CAN_OPEN_DOORS).toBe(1);
    expect(PathfinderMob.AVOID_WATER).toBe(2);
  });

  it('getAttackTarget：id 为 0 时是 null；设过之后按 id 去 level 里查', () => {
    const m = spawnMob();
    expect(m.getAttackTarget()).toBeNull();

    const other = spawnMob();
    m.setAttackTarget(other);
    expect(m.targetId(), '记的是 entityId').toBe(other.entityId);
    expect(m.getAttackTarget()).toBe(other);

    m.setAttackTarget(null);
    expect(m.targetId()).toBe(0);
    expect(m.getAttackTarget()).toBeNull();
  });

  it('getAttackTarget：id 指向一个已经不在世界里的实体 → null（level.getEntity 查不到）', () => {
    const m = spawnMob();
    m.setTargetId(999999);
    expect(m.getAttackTarget()).toBeNull();
  });

  it('⚠ checkCantSeeTarget 的阈值是 **d > 32**（大于，不是大于等于）', () => {
    const m = spawnMob();
    const other = spawnMob();
    m.setAttackTarget(other);
    m.cantSee(other, 32);
    expect(m.targetId(), '正好 32 时还留着').toBe(other.entityId);
    m.cantSee(other, f(32.5));
    expect(m.targetId(), '超过 32 才清掉').toBe(0);
  });

  it('checkHurtTarget 是空函数体（原样）—— 什么都不改', () => {
    const m = spawnMob();
    const other = spawnMob();
    m.setAttackTarget(other);
    m.hurtTarget(other, 1);
    expect(m.targetId()).toBe(other.entityId);
  });

  it('getWalkingSpeedModifier：平时是 Mob 的 0.7，fleeTime > 0 时乘 2', () => {
    // ⚠ 这里断言的是 **0.7 / 1.4 的 double**，不是 `f(0.7)`：TS 的 `Mob.getWalkingSpeedModifier()`
    // 现在返回的是裸字面量 `0.7`（Mob.ts:1199-1203），没包 fround —— 那是之前那一轮移植时就有的，
    // 不在 D10a 的范围里，不"顺手"改它。等 Mob 那一轮回头补 fround 时这两条要一起改。
    const m = makeMob();
    expect(m.speedMod()).toBe(0.7);
    m.setFleeTime(1);
    expect(m.speedMod()).toBe(0.7 * 2);
    m.setFleeTime(0);
    expect(m.speedMod(), '归零就恢复').toBe(0.7);
  });

  it('canSpawn：站在草上方是 true（getWalkTargetValue 的基类实现返回 0，>= 0）', () => {
    for (let x = X - 2; x <= X + 2; x++)
      for (let z = Z - 2; z <= Z + 2; z++) level.setTileNoUpdate(x, Y - 1, z, Tile.grass.id);
    const m = makeMob();
    expect(m.canSpawn()).toBe(true);
  });

  it('canSpawn：身体里塞了方块时是 false（Mob 基类那三条检查）', () => {
    for (let x = X - 2; x <= X + 2; x++)
      for (let z = Z - 2; z <= Z + 2; z++) level.setTileNoUpdate(x, Y - 1, z, Tile.grass.id);
    const m = makeMob();
    level.setTileNoUpdate(X, Y + 1, Z, Tile.rock.id); // 身体里塞一块
    expect(m.canSpawn()).toBe(false);
  });

  it('⚠ canSpawn 之后才 addEntity 的顺序是真的（加进世界再问会被自己挡住）', () => {
    for (let x = X - 2; x <= X + 2; x++)
      for (let z = Z - 2; z <= Z + 2; z++) level.setTileNoUpdate(x, Y - 1, z, Tile.grass.id);
    const m = makeMob();
    level.addEntity(m);
    expect(m.canSpawn(), 'isUnobstructed 把自己也算进去了').toBe(false);
  });

  it('getWalkTargetValue / findAttackTarget / shouldHoldGround 的基类值', () => {
    const m = spawnMob();
    expect(m.getWalkTargetValue(X, Y, Z)).toBe(0);
    expect(m.findTarget()).toBeNull();
    expect(m.holdsGround()).toBe(false);
  });

  it('⚠ canSpawn 里 `getWalkTargetValue(...) >= 0` 那一半是有牙的', () => {
    for (let x = X - 2; x <= X + 2; x++)
      for (let z = Z - 2; z <= Z + 2; z++) level.setTileNoUpdate(x, Y - 1, z, Tile.grass.id);
    const m = new UnhappyMob(level);
    m.resize(f(0.6), f(1.8));
    m.setPos(X + 0.5, Y + 1, Z + 0.5);
    expect(m.canSpawn(), '走路目标值是负的 → 不能生成').toBe(false);
  });

  it('继承链：PathfinderMob 是 Mob 的子类', () => {
    const m = spawnMob();
    expect(m).toBeInstanceOf(Mob);
    expect(m).toBeInstanceOf(PathfinderMob);
  });
});

describe('AgableMob（D10a）', () => {
  it('⚠ 构造函数里 age 先 -1、马上 setAge(0) —— 出生即成年', () => {
    // ⚠ 这条**钉不住那个字面量 -1**，别拿它做扰动：把 `this.age = -1` 改成 `= 0` 测试照样绿
    //   （实测过）。因为 `setAge(0)` 走的是"清 ISBABY 标志"那条分支，而标志本来就是清的 ——
    //   最终状态（age 0、标志清）两种写法完全一样，那个 -1 在构造这条路上**观测不到**。
    //   它真正的作用是"保证第一次 setAge 走一遍清标志的代码"，C++ 原样，照抄。
    const m = spawnMob();
    expect(m.getAge()).toBe(0);
    expect(m.isBaby(), '刚出生不是幼崽').toBe(false);
  });

  it('setAge(-1) → isBaby true（服务端看 age）；转回 0 就 false', () => {
    const m = spawnMob();
    m.setAge(-1);
    expect(m.isBaby()).toBe(true);
    m.setAge(0);
    expect(m.isBaby()).toBe(false);
  });

  it('⚠ 客户端上 isBaby 走的是**同步标志**，不是 age（客户端不跑 aiStep）', () => {
    const m = spawnMob();
    m.setAge(-1); // 服务端把它标成幼崽 → 标志被 set
    level.isClientSide = true;
    expect(m.isBaby(), '客户端读到的是那个标志').toBe(true);

    const n = spawnMob(); // 新的这只标志是清的
    expect(n.isBaby()).toBe(false);
  });

  it('⚠ age 与标志**不一致**时，客户端信标志（造出"网络包只同步了标志"那个状态）', () => {
    const m = spawnMob();
    expect(m.getAge(), '前置条件：age 是 0（成年）').toBe(0);
    m.setBabyFlag(true); // 只动标志，不动 age —— 真机上这就是客户端收到的样子
    level.isClientSide = true;
    expect(m.isBaby(), '客户端看标志 → 幼崽').toBe(true);
    m.setBabyFlag(false);
    expect(m.isBaby()).toBe(false);
  });

  it('aiStep：age < 0 时往上加；age > 0 时往下减；正好 0 不动', () => {
    const m = spawnMob();
    m.setAge(-5);
    m.aiStep();
    expect(m.getAge()).toBe(-4);
    m.setAge(3);
    m.aiStep();
    expect(m.getAge()).toBe(2);
    m.setAge(0);
    m.aiStep();
    expect(m.getAge(), '0 是停住的那一点').toBe(0);
  });

  it('NBT：Age 按 int 存/读', () => {
    const m = spawnMob();
    m.setAge(-7);
    const tag = new CompoundTag();
    expect(m.save(tag), '前置条件：能存下来').toBe(true);
    expect(tag.getInt('Age')).toBe(-7);

    const back = new TestMob(level);
    back.load(tag);
    expect(back.getAge()).toBe(-7);
    expect(back.isBaby()).toBe(true);
  });
});
