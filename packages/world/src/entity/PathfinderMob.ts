/**
 * 1:1 移植自 src/world/entity/PathfinderMob.h 与 .cpp（248 行 + 头 65 行）—— **部分移植**。
 *
 * 它夹在 `Mob` 和"会自己找路走的生物"之间：
 * `Chicken → Animal → AgableMob → PathfinderMob → Mob`。D10 之前 TS 里只有 `Mob`，
 * 而 `Animal::hurt` 要写的 `fleeTime` / `attackTargetId` 两个字段**就声明在这个类里**，绕不过去。
 *
 * 【AI 的部分整块没移植】`Sensing` / `PathNavigation` / `Path` / `level->findPath`
 * 属于计划外的 MobAI 大系统（`Level.findPath` 在 TS 里还是一条 `OMIT(PathFinder)`）。
 * 处理办法和 `Mob.ts` 一致：字段留 `// DEFERRED(MobAI)`、整个函数留 `// OMIT(MobAI)`，
 * **不自己发明半成品实现**。
 *
 * ⚠ **`updateAi()` 整个函数是 OMIT 的**：它 130 行里绝大多数语句都在操作 `path` / `findPath`，
 * 掏掉之后剩下的只有"随机数决定要不要散步"这种只在 AI 流程里有意义的片段。
 * 后果：`Mob.tick` 里那句 `this.updateAi()` 走的是 **Mob 的基类实现**
 * （只 `noActionTime++` + `checkDespawnFrom`），等价于"这只生物没有 AI"。
 * 这是**已知缺口**，不是 bug，D12 收尾时列进缺口清单。
 *
 * 【照抄的两处】`getWalkingSpeedModifier()` 里 `fleeTime > 0` 就把速度乘 2（整数 2，不是 2.0f）；
 * `checkCantSeeTarget` 的阈值 `d > 32` 是**距离**不是平方。
 */
import { Mth } from '@mcpe/util';
import type { Entity } from './Entity';
import type { Level } from '../level/Level';
import { Mob } from './Mob';

export abstract class PathfinderMob extends Mob {
  /** C++ `static const int MAX_TURN = 30;` —— 只被 OMIT 掉的 `updateAi` 用 */
  static readonly MAX_TURN = 30;
  /** C++ `static const int CAN_OPEN_DOORS = 1;` */
  static readonly CAN_OPEN_DOORS = 1;
  /** C++ `static const int AVOID_WATER = 2;` */
  static readonly AVOID_WATER = 2;

  protected attackTargetId!: number;
  protected holdGround!: boolean;
  protected fleeTime!: number;

  /** C++ `PathfinderMob(Level* level)` */
  constructor(level: Level) {
    super(level);
    this.attackTargetId = 0;
    this.holdGround = false;
    this.fleeTime = 0;
    // DEFERRED(MobAI): sensing = new Sensing(this);
    // DEFERRED(MobAI): navigation = new PathNavigation(this, level, 16);
  }

  // OMIT(MobAI): PathfinderMob::~PathfinderMob() { delete navigation; delete sensing; }  PathfinderMob.cpp:23
  //   JS 没有析构函数；且这两个成员本身就没移植。`navigation` / `sensing` 在 Mob.ts 里是
  //   `unknown = null; // DEFERRED(MobAI)`。

  /** C++ `bool PathfinderMob::canSpawn()` */
  override canSpawn(): boolean {
    return (
      super.canSpawn() &&
      this.getWalkTargetValue(Mth.floor(this.x), Mth.floor(this.bb.y0), Mth.floor(this.z)) >= 0
    );
  }

  // OMIT(MobAI): bool PathfinderMob::isPathFinding() { return !path.isEmpty(); }  PathfinderMob.cpp:33
  // OMIT(MobAI): void PathfinderMob::setPath(Path& path) { this->path = path; }  PathfinderMob.cpp:38

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

  // OMIT(MobAI): void PathfinderMob::updateAi()  PathfinderMob.cpp:59
  //   整个函数（130 行）是 AI：fleeTime 递减 → findAttackTarget → level->findPath →
  //   沿 path 走（path.currentPos / path.next / path.destroy）→ findRandomStrollLocation。
  //   见文件头那条 ⚠。
  // OMIT(MobAI): void PathfinderMob::findRandomStrollLocation()  PathfinderMob.cpp:187

  /** C++ `void PathfinderMob::checkHurtTarget(Entity* target, float d)` —— 空函数体，原样 */
  protected checkHurtTarget(_target: Entity, _d: number): void {}

  /** C++ `void PathfinderMob::checkCantSeeTarget(Entity* target, float d)` */
  protected checkCantSeeTarget(_target: Entity, d: number): void {
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

  // OMIT(MobAI): PathNavigation* PathfinderMob::getNavigation() { return navigation; }  PathfinderMob.cpp:246
}
