// 1:1 移植自 src/world/entity/ai/goal/target/TargetGoal.h（任务单 H11）：目标类 goal 的基类（距离、可见性、能否攻击）
import type { Mob } from '../../../Mob';
import type { Monster } from '../../../monster/Monster';
import type { Player } from '../../../player/Player';
import type { Sensing } from '../../Sensing';
import { Goal } from '../Goal';


const f = Math.fround;
export abstract class TargetGoal extends Goal {
  static readonly TargetFlag = 1;
  protected mob: Monster;
  protected within: number;
  protected mustSee: boolean;

  constructor(mob: Monster, within: number, mustSee: boolean) {
    super();
    this.mob = mob;
    this.within = f(within);
    this.mustSee = mustSee;
  }

  override canContinueToUse(): boolean {
    const target = this.mob.getTarget();
    if (target === null) return false;
    if (!target.isAlive()) return false;
    if (this.mob.distanceToSqr(target) > f(this.within * this.within)) return false;
    if (this.mustSee && !(this.mob.sensing as Sensing).canSee(target)) return false;
    return true;
  }

  override stop(): void {
    this.mob.setTarget(null);
  }

  protected canAttack(target: Mob | null, allowInvulnerable: boolean): boolean {
    if (target === null) return false;
    if (target === this.mob) return false;
    if (!target.isAlive()) return false;
    if (target.bb.y1 <= this.mob.bb.y0 || target.bb.y0 >= this.mob.bb.y1) return false;
    if (target.isPlayer()) {
      if (!allowInvulnerable && (target as Player).abilities.invulnerable) return false;
    }
    if (this.mustSee && !(this.mob.sensing as Sensing).canSee(target)) return false;
    return true;
  }
}
