/**
 * 1:1 移植自 src/world/entity/PathfinderMob.h 与 .cpp（D10 移植字段与非 AI 部分；任务单 H3 补上旧 AI）。
 * 继承链：`Chicken → Animal → AgableMob → PathfinderMob → Mob`。
 *
 * 【旧 AI（H3）】`updateAi`：找攻击目标 → `Level.findPathToEntity` → 沿路径走（每刻最多转 30°）→ 随机闲逛
 *   （`findRandomStrollLocation` 在周围 13×7×13 里取 10 个随机点，按 `getWalkTargetValue` 挑最好的，再 `findPathToTile`）。
 *   这一版里**所有生物实际运行的都是这套**：`Mob::aiStep` 只在 `useNewAi()` 为真时走新 AI，而能让它为真的 `Level::setZombieAi`
 *   在 Level.cpp:1429 被注释掉了（见 docs/移植规范.md 末尾“原版里容易被当成 bug 的事实”）。
 * 【新 AI 的成员】构造函数里创建 `sensing`、`navigation`（任务单 H11）；它们只在 useNewAi() 为真时被 tick。
 *
 * 【照抄的几处】`getWalkingSpeedModifier()` 里 `fleeTime > 0` 就把速度乘 2；`checkCantSeeTarget` 的阈值 `d > 32` 是距离；
 *   `updateAi` 里 `xRot = 0` 每刻都执行；走路径时 `random.nextInt(100) == 0` 会跳过一刻改走基类 updateAi。
 * 【浮点】朝向计算全是 float：`(float)(Mth::atan2(zd, xd) * 180 / Mth::PI) - 90` 逐步 Math.fround。
 * C++ 的 `Path path` 是按值成员，`setPath(Path&)` 是默认赋值（浅拷贝）→ `Path.assignFrom`。
 */
import { SharedConstants } from '@mcpe/core';
import { Mth, TIMER_POP, TIMER_PUSH } from '@mcpe/util';
import { Path } from '../level/pathfinder/Path';
import { PathNavigation } from './ai/PathNavigation';
import { Sensing } from './ai/Sensing';
import type { Entity } from './Entity';
import type { Level } from '../level/Level';
import { Mob } from './Mob';

const f = Math.fround;

export abstract class PathfinderMob extends Mob {
  /** C++ `static const int MAX_TURN = 30;`（声明在 `public:` 之前，是 private） */
  // ADAPTED(Cpp)：C++ 里它是 private；TS 保持 public —— 既有测试断言它的值，改 private 就得删断言。
  static readonly MAX_TURN = 30;
  /** C++ `static const int CAN_OPEN_DOORS = 1;` */
  static readonly CAN_OPEN_DOORS = 1;
  /** C++ `static const int AVOID_WATER = 2;` */
  static readonly AVOID_WATER = 2;

  protected attackTargetId!: number;
  protected holdGround!: boolean;
  protected fleeTime!: number;
  /** C++ 的按值成员 `Path path;`（private） */
  private path = new Path();

  /** C++ `PathfinderMob(Level* level)` */
  constructor(level: Level) {
    super(level);
    this.attackTargetId = 0;
    this.holdGround = false;
    this.fleeTime = 0;
    this.sensing = new Sensing(this);
    this.navigation = new PathNavigation(this, level, 16);
  }

  // OMIT(MobAI): PathfinderMob::~PathfinderMob() { delete navigation; delete sensing; }  PathfinderMob.cpp:23（JS 没有析构）
  // OMIT(MobAI): typedef struct AIData { AIData(): target(NULL) {} Mob* target; } AIData;  PathfinderMob.h:13（参考源码里除定义外零使用）

  /** C++ `bool PathfinderMob::canSpawn()` */
  override canSpawn(): boolean {
    return (
      super.canSpawn() &&
      this.getWalkTargetValue(Mth.floor(this.x), Mth.floor(this.bb.y0), Mth.floor(this.z)) >= 0
    );
  }

  /** C++ `bool PathfinderMob::isPathFinding()` */
  isPathFinding(): boolean {
    return !this.path.isEmpty();
  }

  /** C++ `void PathfinderMob::setPath(Path& path)`：默认赋值（浅拷贝） */
  setPath(path: Path): void {
    this.path.assignFrom(path);
  }

  /** C++ `Entity* PathfinderMob::getAttackTarget()` */
  getAttackTarget(): Entity | null {
    if (this.attackTargetId === 0) return null;
    return this.level.getEntity(this.attackTargetId);
  }

  /** C++ `void PathfinderMob::setAttackTarget(Entity* attacker)` */
  setAttackTarget(attacker: Entity | null): void {
    this.attackTargetId = attacker ? attacker.entityId : 0;
  }

  /** C++ `bool PathfinderMob::shouldHoldGround()` */
  protected shouldHoldGround(): boolean {
    return false;
  }

  /** C++ `void PathfinderMob::updateAi()`（旧 AI） */
  protected override updateAi(): void {
    TIMER_PUSH('ai');
    if (this.fleeTime > 0) this.fleeTime--;
    this.holdGround = this.shouldHoldGround();
    const maxDist = 16;
    let attackTarget: Entity | null = null;
    if (this.attackTargetId === 0) {
      attackTarget = this.findAttackTarget();
      if (attackTarget !== null) {
        this.level.findPathToEntity(this.path, this, attackTarget, maxDist, false, false);
        this.attackTargetId = attackTarget.entityId;
      }
    } else {
      attackTarget = this.level.getEntity(this.attackTargetId);
      if (!attackTarget || !attackTarget.isAlive()) {
        this.attackTargetId = 0;
        attackTarget = null;
      } else {
        this.attackTargetId = attackTarget.entityId;
        const d = attackTarget.distanceTo(this);
        if (this.canSee(attackTarget)) {
          this.checkHurtTarget(attackTarget, d);
        } else {
          this.checkCantSeeTarget(attackTarget, d);
        }
      }
    }
    TIMER_POP();
    let doStroll = false;
    if (
      !this.holdGround &&
      attackTarget !== null &&
      (this.path.isEmpty() || this.random.nextInt(20) === 0)
    ) {
      this.level.findPathToEntity(this.path, this, attackTarget, maxDist, false, false);
    } else if (!this.holdGround) {
      if (this.path.isEmpty() && this.random.nextInt(180) === 0) {
        doStroll = true;
      } else {
        if (this.random.nextInt(120) === 0) doStroll = true;
        else if (this.fleeTime > 0 && (this.fleeTime & 7) === 1) doStroll = true;
      }
    }
    if (doStroll) {
      if (this.noActionTime < SharedConstants.TicksPerSecond * 5) {
        this.findRandomStrollLocation();
      }
    }
    const yFloor = Mth.floor(f(this.bb.y0 + f(0.5)));
    const inWater = this.isInWater();
    const inLava = this.isInLava();
    this.xRot = 0;
    if (this.path.isEmpty() || this.random.nextInt(100) === 0) {
      super.updateAi();
      return;
    }
    TIMER_PUSH('followpath');
    let target = this.path.currentPos(this);
    const r = f(this.bbWidth * 2);
    let looping = true;
    while (looping && target.distanceToSqr(this.x, target.y, this.z) < f(r * r)) {
      this.path.next();
      if (this.path.isDone()) {
        looping = false;
        this.path.destroy();
      } else target = this.path.currentPos(this);
    }
    this.jumping = false;
    if (looping) {
      const xd = f(target.x - this.x);
      const zd = f(target.z - this.z);
      const yd = f(target.y - yFloor);
      const yRotD = f(f(f(f(Mth.atan2(zd, xd)) * 180) / f(Mth.PI)) - 90);
      let rotDiff = f(yRotD - this.yRot);
      this.yya = this.runSpeed;
      while (rotDiff < -180) rotDiff = f(rotDiff + 360);
      while (rotDiff >= 180) rotDiff = f(rotDiff - 360);
      if (rotDiff > PathfinderMob.MAX_TURN) {
        rotDiff = PathfinderMob.MAX_TURN;
      }
      if (rotDiff < -PathfinderMob.MAX_TURN) {
        rotDiff = -PathfinderMob.MAX_TURN;
      }
      this.yRot = f(this.yRot + rotDiff);
      if (this.holdGround) {
        if (attackTarget !== null) {
          const xd2 = f(attackTarget.x - this.x);
          const zd2 = f(attackTarget.z - this.z);
          const oldyRot = this.yRot;
          this.yRot = f(f(f(f(Mth.atan2(zd2, xd2)) * 180) / f(Mth.PI)) - 90);
          rotDiff = f(f(f(f(oldyRot - this.yRot) + 90) * f(Mth.PI)) / 180);
          this.xxa = f(f(-Mth.sin(rotDiff) * this.yya) * 1.0);
          this.yya = f(f(Mth.cos(rotDiff) * this.yya) * 1.0);
        }
      }
      if (yd > 0) {
        this.jumping = true;
      }
    }
    if (attackTarget !== null) {
      this.lookAt(attackTarget, 30, 30);
    }
    if (this.horizontalCollision && !this.isPathFinding()) this.jumping = true;
    if (this.random.nextFloat() < f(0.8) && (inWater || inLava)) this.jumping = true;
    TIMER_POP();
  }

  /** C++ `void PathfinderMob::findRandomStrollLocation()` */
  protected findRandomStrollLocation(): void {
    TIMER_PUSH('stroll');
    let hasBest = false;
    let xBest = -1;
    let yBest = -1;
    let zBest = -1;
    let best = -99999;
    for (let i = 0; i < 10; i++) {
      // C++：`Mth::floor(x + random.nextInt(13) - 6)` —— x 是 float 字段，int 先转 float，
      // 加、减每一步都按 float 舍入，最后才 floor。
      const xt = Mth.floor(f(f(this.x + this.random.nextInt(13)) - 6));
      const yt = Mth.floor(f(f(this.y + this.random.nextInt(7)) - 3));
      const zt = Mth.floor(f(f(this.z + this.random.nextInt(13)) - 6));
      const value = this.getWalkTargetValue(xt, yt, zt);
      if (value > best) {
        best = value;
        xBest = xt;
        yBest = yt;
        zBest = zt;
        hasBest = true;
      }
    }
    if (hasBest) {
      this.level.findPathToTile(this.path, this, xBest, yBest, zBest, 10, false, false);
    }
    TIMER_POP();
  }

  /** C++ `void PathfinderMob::checkHurtTarget(Entity* target, float d)` —— 空函数体，原样 */
  protected checkHurtTarget(_target: Entity, _d: number): void {}

  /** C++ `void PathfinderMob::checkCantSeeTarget(Entity* target, float d)` */
  protected checkCantSeeTarget(_target: Entity, d: number): void {
    d = f(d); // C++ 形参是 float
    if (d > 32) this.attackTargetId = 0;
  }

  /** C++ `float PathfinderMob::getWalkTargetValue(int x, int y, int z)` */
  getWalkTargetValue(_x: number, _y: number, _z: number): number {
    return 0;
  }

  /** C++ `Entity* PathfinderMob::findAttackTarget()` */
  protected findAttackTarget(): Entity | null {
    return null;
  }

  /** C++ `float PathfinderMob::getWalkingSpeedModifier()` */
  protected override getWalkingSpeedModifier(): number {
    let speed = super.getWalkingSpeedModifier();
    if (this.fleeTime > 0) speed *= 2;
    return speed;
  }

  /** C++ `int PathfinderMob::getNoActionTime()` */
  getNoActionTime(): number {
    return this.noActionTime;
  }

  /** C++ `PathNavigation* PathfinderMob::getNavigation()` */
  // C++ 返回非空指针（构造函数里 new 过）；`Mob::_init` 不清 navigation（与 C++ 一致）。
  // ADAPTED(Cpp)：TS 的字段类型是 `PathNavigation | null`（`Mob` 构造函数里先置 null），
  // 这里返回该字段，与 C++ 一样不做空检查。
  getNavigation(): PathNavigation | null {
    return this.navigation;
  }
}
