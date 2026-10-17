// 1:1 移植自 src/util/SmoothFloat.h（S12 阶段 C；LocalPlayer 的平滑飞行用）。字段是 float，按 Math.fround 计算。
const f = Math.fround;

export class SmoothFloat {
  private targetValue = 0;
  private remainingValue = 0;
  private lastAmount = 0;

  getNewDeltaValue(deltaValue: number, accelerationAmount: number): number {
    // 形参是 float：实参先转 float（审核：以前直接拿 double 参与运算，与 C++ 可能差末位）
    deltaValue = f(deltaValue);
    accelerationAmount = f(accelerationAmount);
    this.targetValue = f(this.targetValue + deltaValue);
    deltaValue = f(f(this.targetValue - this.remainingValue) * accelerationAmount);
    this.lastAmount = f(this.lastAmount + f(f(deltaValue - this.lastAmount) * f(0.5)));
    if (
      (deltaValue > 0 && deltaValue > this.lastAmount) ||
      (deltaValue < 0 && deltaValue < this.lastAmount)
    ) {
      deltaValue = this.lastAmount;
    }
    this.remainingValue = f(this.remainingValue + deltaValue);
    return deltaValue;
  }

  getTargetValue(): number {
    return this.targetValue;
  }
}
