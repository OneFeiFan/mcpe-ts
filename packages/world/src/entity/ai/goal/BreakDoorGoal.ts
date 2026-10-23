/**
 * 1:1 移植自 src/world/entity/ai/goal/BreakDoorGoal.h（任务单 H11）：在关着的木门前站 12 秒就把门拆掉（直接 setTile 0）。
 * 原样保留：`random.nextInt(20) == 0` 的分支是空的（C++ 里播破门声音的 levelEvent 调用被注释掉了），但仍消耗随机数；
 *   拆门外层 `if (mob->level->difficulty == Difficulty.HARD)` 的判断也被注释掉了，所以拆门无条件执行。
 */
import { SharedConstants } from '@mcpe/core';
import { DoorTile } from '../../../level/tile/DoorTile';
import type { Monster } from '../../monster/Monster';
import { DoorInteractGoal } from './DoorInteractGoal';

export class BreakDoorGoal extends DoorInteractGoal {
  // C++ 的 breakTime 没有初始化（start 之前读到是未定义行为）；这里取 0。
  private breakTime = 0;

  constructor(mob: Monster) {
    super(mob);
  }

  override canUse(): boolean {
    if (!super.canUse()) return false;
    // C++ 通过 doorTile-> 调用静态方法 DoorTile::isOpen；这里直接调用静态方法，行为相同。
    return !DoorTile.isOpen(this.mob.level, this.doorX, this.doorY, this.doorZ);
  }

  override start(): void {
    super.start();
    this.breakTime = SharedConstants.TicksPerSecond * 12;
  }

  override canContinueToUse(): boolean {
    const d = this.mob.distanceToSqr(this.doorX, this.doorY, this.doorZ);
    return (
      this.breakTime >= 0 &&
      !DoorTile.isOpen(this.mob.level, this.doorX, this.doorY, this.doorZ) &&
      d < 2 * 2
    );
  }

  override tick(): void {
    super.tick();
    if (this.mob.random.nextInt(20) === 0) {
      // C++ 这里是空的
    }
    if (--this.breakTime === 0) {
      this.mob.level.setTile(this.doorX, this.doorY, this.doorZ, 0);
    }
  }
}
