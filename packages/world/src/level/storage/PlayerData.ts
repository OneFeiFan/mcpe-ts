// 1:1 移植自 src/world/level/storage/PlayerData.h（S4）。存档里的玩家数据（旧版 v1 存档格式）；loadPlayer 在“读档恢复玩家”这一步补上。
import { Mth } from '@mcpe/util';
import { Vec3 } from '../../phys/Vec3';
import type { Player } from '../../entity/player/Player';

/** Inventory::MAX_SELECTION_SIZE（PlayerData 与 Inventory 互相引用，这里取值不导入，避免加载期循环；值由测试核对） */
const MAX_SELECTION_SIZE = 9; // Including "More..." right now

// PlayerData.h 里的文件内静态函数，只被 loadPlayer 使用
export function clampRot(r: number): number {
  return Mth.clamp(r, -100000.0, 100000.0);
}
export function clampXZ(r: number): number {
  return Mth.clamp(r, 4.0, 252.0);
}
export function clampY(r: number): number {
  return Mth.clamp(r, 4.0, 126.0);
}

export class PlayerData {
  pos = new Vec3();
  motion = new Vec3();
  xRot = 0;
  yRot = 0;
  fallDistance = 0;
  onFire = 0; // short
  airSupply = 0; // short
  onGround = false;
  inventorySlots = new Int32Array(MAX_SELECTION_SIZE);

  /**
   * C++ `void PlayerData::loadPlayer(Player* p) const`：速度超过 10 的分量清零。
   * 原样保留：先把 x/y/z（连同 xo、xOld）夹到 4..252 / 4..126，最后一句 setPos(pos.x, pos.y, pos.z) 却用未夹的原值——
   *   最终 x/y/z 是存档原值，只有 xo/yo/zo、xOld/yOld/zOld 是夹过的。
   */
  loadPlayer(p: Player): void {
    const f = Math.fround;
    p.setPos(0, 0, 0);
    p.x = p.xo = p.xOld = clampXZ(f(this.pos.x));
    p.y = p.yo = p.yOld = clampY(f(this.pos.y));
    p.z = p.zo = p.zOld = clampXZ(f(this.pos.z));
    let motionX = f(this.motion.x);
    let motionY = f(this.motion.y);
    let motionZ = f(this.motion.z);
    if (Mth.abs(motionX) > 10.0) motionX = 0;
    if (Mth.abs(motionY) > 10.0) motionY = 0;
    if (Mth.abs(motionZ) > 10.0) motionZ = 0;
    p.xd = motionX;
    p.yd = motionY;
    p.zd = motionZ;
    p.xRot = p.xRotO = clampRot(f(this.xRot));
    p.yRot = p.yRotO = clampRot(f(this.yRot));
    p.fallDistance = this.fallDistance;
    p.onFire = this.onFire;
    p.airSupply = this.airSupply;
    p.onGround = this.onGround;
    p.setPos(this.pos.x, this.pos.y, this.pos.z);
  }

  /** ADAPTED(Cpp)：C++ 按值拷贝（默认拷贝构造 / operator=），这里显式逐字段复制 */
  assign(rhs: PlayerData): this {
    this.pos = new Vec3(rhs.pos.x, rhs.pos.y, rhs.pos.z);
    this.motion = new Vec3(rhs.motion.x, rhs.motion.y, rhs.motion.z);
    this.xRot = rhs.xRot;
    this.yRot = rhs.yRot;
    this.fallDistance = rhs.fallDistance;
    this.onFire = rhs.onFire;
    this.airSupply = rhs.airSupply;
    this.onGround = rhs.onGround;
    this.inventorySlots = rhs.inventorySlots.slice();
    return this;
  }
}
