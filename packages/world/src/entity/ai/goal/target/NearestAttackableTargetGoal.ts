// 1:1 移植自 src/world/entity/ai/goal/target/NearestAttackableTargetGoal.h（任务单 H11）：targetType 1 = 最近的玩家
import type { Mob } from '../../../Mob';
import type { Monster } from '../../../monster/Monster';
import { TargetGoal } from './TargetGoal';

export class NearestAttackableTargetGoal extends TargetGoal {
  // ADAPTED(Safety)：C++ 的 `Mob* target;` 未初始化（canUse 成功前读它是未定义行为）；
  // TS 取 null。canUse 返回 true 时 start 一定能读到已赋值的 target。
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
    // C++ 的 `//else potentialTarget = ... getClosestEntityOfClass(...)` 被注释掉，不移植；
    // targetType != 1 时 potentialTarget 保持 null（原样）。
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
