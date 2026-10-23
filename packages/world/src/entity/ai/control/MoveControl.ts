/**
 * 1:1 移植自 src/world/entity/ai/control/MoveControl.h 与 MoveControl.cpp（任务单 H11）：新 AI 的移动控制。
 * 每刻：先把 yya 清零；有目标点时朝它转（每刻最多 30°）、按给定速度走；目标在上方且水平距离不到 1 格就跳。
 * 朝向：`(float)(std::atan2(zd, xd) * 180 / Mth::PI) - 90`。C++17 的 `std::atan2(float, float)`
 * 是 float 重载（等价 atan2f），`* 180`、`/ Mth::PI`、`- 90` 都在 float 里逐步舍入；TS 用 `Mth.atan2`
 * 并在每一步套 `f()`（W43）。
 */
import { Mth } from '@mcpe/util';
import type { Mob } from '../../Mob';
import { Control } from './Control';
import type { JumpControl } from './JumpControl';

const f = Math.fround;

export class MoveControl extends Control {
  private static readonly MAX_TURN = 30;
  static readonly MIN_SPEED = f(0.0005);
  static readonly MIN_SPEED_SQR = f(MoveControl.MIN_SPEED * MoveControl.MIN_SPEED);
  private mob: Mob;
  private wantedX: number;
  private wantedY: number;
  private wantedZ: number;
  private speed = 0; // C++ 未初始化（构造函数没给），setWantedPosition 之前读到的是不确定值；这里取 0
  private _hasWanted = false;

  constructor(mob: Mob) {
    super();
    this.mob = mob;
    this.wantedX = mob.x;
    this.wantedY = mob.y;
    this.wantedZ = mob.z;
    this._hasWanted = false;
  }

  hasWanted(): boolean {
    return this._hasWanted;
  }

  getSpeed(): number {
    return this.speed;
  }

  setWantedPosition(x: number, y: number, z: number, speed: number): void {
    this.wantedX = f(x);
    this.wantedY = f(y);
    this.wantedZ = f(z);
    this.speed = f(speed);
    this._hasWanted = true;
  }

  tick(): void {
    const mob = this.mob;
    mob.setYya(0);
    if (!this._hasWanted) return;
    this._hasWanted = false;
    const yFloor = Mth.floor(f(mob.bb.y0 + f(0.5)));
    const xd = f(this.wantedX - mob.x);
    const zd = f(this.wantedZ - mob.z);
    const yd = f(this.wantedY - yFloor);
    const dd = f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd));
    if (dd < MoveControl.MIN_SPEED_SQR) return;
    // C++ 每一步都是 float：atan2f → ×180f → ÷Mth::PI → −90（W43，不能整段用 double 只舍入一次）
    const yRotD = f(f(f(Mth.atan2(zd, xd) * 180) / Mth.PI) - 90);
    mob.yRot = this.rotlerp(mob.yRot, yRotD, MoveControl.MAX_TURN);
    mob.setSpeed(this.speed);
    if (yd > 0 && f(f(xd * xd) + f(zd * zd)) < 1) (mob.getJumpControl() as JumpControl).jump();
  }

  private rotlerp(a: number, b: number, max: number): number {
    let diff = f(b - a);
    while (diff < -180) diff = f(diff + 360);
    while (diff >= 180) diff = f(diff - 360);
    if (diff > max) {
      diff = max;
    }
    if (diff < -max) {
      diff = -max;
    }
    return f(a + diff);
  }
}
