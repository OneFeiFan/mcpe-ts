// 1:1 移植自 src/world/entity/ai/goal/target/HurtByTargetGoal.h（任务单 H11）：把最近打了自己的生物设为目标（alertSameType 存下但没用）
import type { Monster } from '../../../monster/Monster';
import { TargetGoal } from './TargetGoal';

export class HurtByTargetGoal extends TargetGoal {
  private alertSameType: boolean;

  constructor(mob: Monster, alertSameType: boolean) {
    super(mob, 16, false);
    this.alertSameType = alertSameType;
    this.setRequiredControlFlags(TargetGoal.TargetFlag);
  }

  canUse(): boolean {
    return this.canAttack(this.mob.getLastHurtByMob(), true);
  }

  override start(): void {
    this.mob.setTarget(this.mob.getLastHurtByMob());
  }
}
