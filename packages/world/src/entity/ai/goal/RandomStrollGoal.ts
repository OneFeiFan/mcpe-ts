// 1:1 移植自 src/world/entity/ai/goal/RandomStrollGoal.h（任务单 H11）：闲着时（noActionTime < 5 秒）每刻 1/120 的概率去附近随机一点
import { SharedConstants } from '@mcpe/core';
import type { PathfinderMob } from '../../PathfinderMob';
import { Control } from '../control/Control';
import { RandomPos } from '../util/RandomPos';
import { Goal } from './Goal';

const f = Math.fround;

export class RandomStrollGoal extends Goal {
  private mob: PathfinderMob;
  private wantedX = 0;
  private wantedY = 0;
  private wantedZ = 0;
  private speed: number;

  constructor(mob: PathfinderMob, speed: number) {
    super();
    this.mob = mob;
    this.speed = f(speed);
    this.setRequiredControlFlags(Control.MoveControlFlag);
  }

  canUse(): boolean {
    if (this.mob.getNoActionTime() >= SharedConstants.TicksPerSecond * 5) return false;
    if (this.mob.random.nextInt(120) !== 0) return false;
    const pos = RandomPos.getPos(this.mob, 10, 7);
    if (!pos) return false;
    this.wantedX = pos.x;
    this.wantedY = pos.y;
    this.wantedZ = pos.z;
    return true;
  }

  override canContinueToUse(): boolean {
    return !this.mob.getNavigation()!.isDone();
  }

  override start(): void {
    this.mob.getNavigation()!.moveToPos(this.wantedX, this.wantedY, this.wantedZ, this.speed);
  }
}
