// S0 占位入口：只验证 “浏览器 + workspace 源码解析 + Timer 主循环” 这条链路。S9 会整体替换本文件。
import { Timer } from '@mcpe/client';
import { Common, SharedConstants } from '@mcpe/core';

const status = document.querySelector<HTMLParagraphElement>('#status');
const timer = new Timer(SharedConstants.TicksPerSecond);
let ticks = 0;

function frame(): void {
  timer.advanceTime();
  ticks += timer.ticks;
  if (status) status.textContent = `${Common.getGameVersionString()}：S0 工具链正常，已运行 ${ticks} 个 tick`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
