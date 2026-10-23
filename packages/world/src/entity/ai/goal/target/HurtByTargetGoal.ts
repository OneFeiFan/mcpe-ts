// 1:1 移植自 src/world/entity/ai/goal/target/HurtByTargetGoal.h（任务单 H11）：把最近打了自己的生物设为目标（alertSameType 存下但没用）
import type { Monster } from '../../../monster/Monster';
import { TargetGoal } from './TargetGoal';

export class HurtByTargetGoal extends TargetGoal {
  // 怪癖保留：C++ 只在初始化列表里保存 alertSameType；读取它的整段逻辑（HurtByTargetGoal.h:27-35）
  // 被注释掉了，所以这个字段从不被使用，也从不通知同类。TS 照抄保存。
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
