/**
 * 1:1 移植自 src/client/model/ZombieModel.h（任务单 H7）：人形模型，空手时双臂前伸（僵尸、骷髅共用）。
 * 浮点：`(float) Mth::sin(attackTime * Mth::PI)` 等逐步 Math.fround。
 */
import { Mth } from '@mcpe/util';
import { HumanoidModel } from './HumanoidModel';

const f = Math.fround;

export class ZombieModel extends HumanoidModel {
  override setupAnim(
    time: number,
    r: number,
    bob: number,
    yRot: number,
    xRot: number,
    scale: number,
  ): void {
    super.setupAnim(time, r, bob, yRot, xRot, scale);
    if (!this.holdingLeftHand && !this.holdingRightHand) {
      const attack2 = f(Mth.sin(f(this.attackTime * Mth.PI)));
      const t = f(1 - this.attackTime);
      const attack = f(Mth.sin(f(f(1 - f(t * t)) * Mth.PI)));
      this.arm0.zRot = 0;
      this.arm1.zRot = 0;
      this.arm0.yRot = -f(f(0.1) - f(attack2 * f(0.6)));
      this.arm1.yRot = +f(f(0.1) - f(attack2 * f(0.6)));
      this.arm0.xRot = f(-Mth.PI / 2.0);
      this.arm1.xRot = f(-Mth.PI / 2.0);
      this.arm0.xRot = f(this.arm0.xRot - f(f(attack2 * f(1.2)) - f(attack * f(0.4))));
      this.arm1.xRot = f(this.arm1.xRot - f(f(attack2 * f(1.2)) - f(attack * f(0.4))));
      const zBob = f(f(Mth.cos(f(bob * f(0.09))) * f(0.05)) + f(0.05));
      const xBob = f(Mth.sin(f(bob * f(0.067))) * f(0.05));
      this.arm0.zRot = f(this.arm0.zRot + zBob);
      this.arm1.zRot = f(this.arm1.zRot - zBob);
      this.arm0.xRot = f(this.arm0.xRot + xBob);
      this.arm1.xRot = f(this.arm1.xRot - xBob);
    }
  }
}
