// 1:1 移植自 src/world/entity/ai/goal/target/NearestAttackableTargetGoal.h（任务单 H11）：targetType 1 = 最近的玩家
import type { Mob } from '../../../Mob';
import type { Monster } from '../../../monster/Monster';
import { TargetGoal } from './TargetGoal';

export class NearestAttackableTargetGoal extends TargetGoal {
  private target: Mob | null = null;
  private targetType: number;
  private randomInterval: number;

  constructor(
    mob: Monster,
    targetType: number,
    within: number,
    randomInterval: number,
    mustSee: boolean,
  ) {
    super(mob, within, mustSee);
    this.targetType = targetType;
    this.randomInterval = randomInterval;
    this.setRequiredControlFlags(TargetGoal.TargetFlag);
  }

  canUse(): boolean {
    if (this.randomInterval > 0 && this.mob.random.nextInt(this.randomInterval) !== 0) return false;
    let potentialTarget: Mob | null = null;
    if (this.targetType === 1)
      potentialTarget = this.mob.level.getNearestPlayer(this.mob, this.within);
    if (!this.canAttack(potentialTarget, false)) return false;
    this.target = potentialTarget;
    return true;
  }

  override start(): void {
    this.mob.setTarget(this.target);
  }
}
