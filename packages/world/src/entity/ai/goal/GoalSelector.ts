/**
 * 1:1 移植自 src/world/entity/ai/goal/GoalSelector.h（任务单 H11）：按优先级（数字小的优先）与控制位调度 goal。
 * 每刻：正在运行的若不能继续（或被更高优先级的占了控制位）就 stop；然后把能用的标成运行中，统一 start，最后给所有运行中的 tick。
 * 原样保留：`toStart` 里放的是 InternalGoal 的**副本**（std::vector<InternalGoal> 按值），isUsing 设在原件上；
 *   优先级是 short。
 */
import type { Goal } from './Goal';

class InternalGoal {
  isUsing = false;
  constructor(
    public prio: number,
    public goal: Goal,
  ) {
    this.prio = (prio << 16) >> 16;
  }
}

export class GoalSelector {
  private goals: InternalGoal[] = [];

  addGoal(prio: number, goal: Goal): void {
    this.goals.push(new InternalGoal(prio, goal));
  }

  tick(): void {
    const toStart: InternalGoal[] = [];
    for (const ig of this.goals) {
      const isUsing = ig.isUsing;
      if (isUsing) {
        if (!this.canUseInSystem(ig) || !ig.goal.canContinueToUse()) {
          ig.goal.stop();
          ig.isUsing = false;
        } else continue;
      }
      if (!this.canUseInSystem(ig) || !ig.goal.canUse()) {
        continue;
      }
      const copy = new InternalGoal(ig.prio, ig.goal);
      copy.isUsing = ig.isUsing;
      toStart.push(copy);
      ig.isUsing = true;
    }
    for (const ig of toStart) {
      ig.goal.start();
    }
    for (const ig of this.goals) {
      if (ig.isUsing) {
        ig.goal.tick();
      }
    }
  }

  private canUseInSystem(goal: InternalGoal): boolean {
    for (const ig of this.goals) {
      if (ig.goal === goal.goal && ig.prio === goal.prio) continue;
      if (goal.prio >= ig.prio) {
        if (ig.isUsing && !this.canCoExist(goal, ig)) return false;
      } else if (ig.isUsing && !ig.goal.canInterrupt()) return false;
    }
    return true;
  }

  private canCoExist(goalA: InternalGoal, goalB: InternalGoal): boolean {
    return (goalA.goal.getRequiredControlFlags() & goalB.goal.getRequiredControlFlags()) === 0;
  }
}
