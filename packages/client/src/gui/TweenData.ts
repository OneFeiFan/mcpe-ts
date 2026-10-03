/**
 * 1:1 移植自 src/client/gui/TweenData.h。
 *
 * C++ 是 `typedef struct TweenData { float cur, dur, start, stop; } TweenData;` —— 一个没有成员函数的
 * 数据包，用来描述一段补间动画：从 start 走到 stop、共 dur 帧、当前走到第 cur 帧。
 * 唯一的使用者是选世界界面的 Touch::WorldSelectionList（B8d）。
 *
 * C++ 里那四个 float 是没有初值的（PITFALLS 第 20 条：不复刻未定义行为），这里给 0。
 * 使用方是把它当成员按值放一份、原地改字段，所以字段都可写、不设只读。
 */
export class TweenData {
  cur = 0;
  dur = 0;
  start = 0;
  stop = 0;
}
