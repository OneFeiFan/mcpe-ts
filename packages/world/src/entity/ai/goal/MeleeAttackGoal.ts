/**
 * 1:1 移植自 src/world/entity/ai/goal/MeleeAttackGoal.h（任务单 H11）：追着目标走，贴身（2 倍身宽内）每 20 刻打一下。
 * 原样保留：`attackType != 0 && !mob->isPlayer()` 时不能用（C++ 判断的是自己是不是玩家）；trackTarget 为 false 时，
 *   路径走完就停（不再追）。C++ 的 Path 内存管理（delete path）在 JS 里省略。
 */
import { Mth } from '@mcpe/util';
import type { Level } from '../../../level/Level';
import type { Path } from '../../../level/pathfinder/Path';
import type { Mob } from '../../Mob';
import type { Monster } from '../../monster/Monster';
import { Control } from '../control/Control';
import type { PathNavigation } from '../PathNavigation';
import type { Sensing } from '../Sensing';
import { Goal } from './Goal';

const f = Math.fround;

export class MeleeAttackGoal extends Goal {
  private level: Level;
  private mob: Monster;
  // C++ 的 target 没有初始化（读到它是未定义行为）；这里取 null。
  private target: Mob | null = null;
  private attackTime = 0;
  private speed: number;
  private path: Path | null = null;
  private attackType: number;
  private trackTarget: boolean;

  constructor(mob: Monster, speed: number, trackTarget: boolean, attackType = 0) {
    super();
    this.mob = mob;
    this.level = mob.level;
    this.speed = f(speed);
    this.trackTarget = trackTarget;
    this.attackTime = 0;
    this.attackType = attackType;
    this.setRequiredControlFlags(Control.MoveControlFlag | Control.LookControlFlag);
  }

  private nav(): PathNavigation {
    return this.mob.getNavigation()!;
  }

  canUse(): boolean {
    const bestTarget = this.mob.getTarget();
    if (bestTarget === null) return false;
    if (this.attackType !== 0 && !this.mob.isPlayer()) return false;
    this.target = bestTarget;
    // C++ 会先 LOGI 并 delete 旧 path；JS 交给 GC。
    this.path = this.nav().createPathToMob(this.target);
    return this.path !== null;
  }

  override canContinueToUse(): boolean {
    const bestTarget = this.mob.getTarget();
    if (bestTarget === null) return false;
    if (this.attackType !== 0 && !this.mob.isPlayer()) return false;
    this.target = bestTarget;
    if (!this.trackTarget) return !this.nav().isDone();
    return true;
  }

  override start(): void {
    this.nav().moveToPath(this.path, this.speed, false);
  }

  override stop(): void {
    this.target = null;
    this.nav().stop();
  }

  override tick(): void {
    const target = this.target!;
    if (this.trackTarget || (this.mob.sensing as Sensing).canSee(target)) {
      this.nav().moveToMob(target, this.speed);
    }
    this.attackTime = Mth.Max(this.attackTime - 1, 0);
    const meleeRadiusSqr = f(f(this.mob.bbWidth * 2) * f(this.mob.bbWidth * 2));
    if (this.mob.distanceToSqr(target.x, target.bb.y0, target.z) > meleeRadiusSqr) return;
    if (this.attackTime > 0) return;
    this.attackTime = 20;
    this.mob.doHurtTarget(target);
  }

  // OMIT(MeleeAttackGoal): ~MeleeAttackGoal() { if (path) { LOGI(...); delete path; } }  MeleeAttackGoal.h:28-33 —— JS 由 GC 接管（R3）。
}
