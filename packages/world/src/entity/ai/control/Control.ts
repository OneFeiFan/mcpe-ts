// 1:1 移植自 src/world/entity/ai/control/Control.h（任务单 H11）：控制位（goal 之间按位判断能否同时运行）
export class Control {
  static readonly MoveControlFlag = 1;
  static readonly LookControlFlag = 2;
  static readonly JumpControlFlag = 4;
}
