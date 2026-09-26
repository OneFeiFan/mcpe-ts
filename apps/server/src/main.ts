// 占位：专用服务器不在 demo 范围内，这里只保证 workspace 能编译运行。
import { Common, SharedConstants } from '@mcpe/core';
import { getTimeMs } from '@mcpe/platform';

console.log(`MCPE-TS server placeholder ${Common.getGameVersionString()}`);
const interval = setInterval(() => {
  console.log(`uptime=${getTimeMs()}ms tps=${SharedConstants.TicksPerSecond}`);
}, 1000);
process.on('SIGINT', () => { clearInterval(interval); process.exit(0); });
