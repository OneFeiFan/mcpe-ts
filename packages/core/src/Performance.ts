// 1:1 移植自 src/Performance.h 与 Performance.cpp（D10：放在 core，core 因此依赖 platform）
import { StopwatchHandler } from '@mcpe/platform';

export class Performance {
  static watches = new StopwatchHandler(); // StopwatchHandler Performance::watches;（静态对象，默认构造）
}
