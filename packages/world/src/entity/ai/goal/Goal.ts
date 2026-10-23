// 1:1 移植自 src/world/entity/ai/goal/Goal.h（任务单 H11）
export abstract class Goal {
  private _requiredControlFlags = 0;

  // OMIT(Goal): ~Goal() {}  Goal.h:12 —— 空析构函数，R3 不移植。

  abstract canUse(): boolean;

  canContinueToUse(): boolean {
    return this.canUse();
  }

  canInterrupt(): boolean {
    return true;
  }

  start(): void {}

  stop(): void {}

  tick(): void {}

  setRequiredControlFlags(requiredControlFlags: number): void {
    this._requiredControlFlags = requiredControlFlags;
  }

  getRequiredControlFlags(): number {
    return this._requiredControlFlags;
  }
}
