// 1:1 移植自 src/world/entity/ai/control/JumpControl.h（任务单 H11）
import type { Mob } from '../../Mob';
import { Control } from './Control';

export class JumpControl extends Control {
  private mob: Mob;
  private _jump = false;

  constructor(mob: Mob) {
    super();
    this.mob = mob;
    this._jump = false;
  }

  jump(): void {
    this._jump = true;
  }

  tick(): void {
    this.mob.setJumping(this._jump);
    this._jump = false;
  }
}
