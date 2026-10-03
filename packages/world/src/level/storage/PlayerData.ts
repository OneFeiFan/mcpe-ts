// 1:1 移植自 src/world/level/storage/PlayerData.h（S4）。存档里的玩家数据；把数据写回 Player 的 loadPlayer 本轮 OMIT。
import { Mth } from '@mcpe/util';
import { Vec3 } from '../../phys/Vec3';

/** Inventory::MAX_SELECTION_SIZE（PlayerData 与 Inventory 互相引用，这里取值不导入，避免加载期循环；值由测试核对） */
const MAX_SELECTION_SIZE = 9; // Including "More..." right now

// PlayerData.h 里的文件内静态函数，只被已 OMIT 的 loadPlayer 使用
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

  // OMIT(Player): loadPlayer(p)  PlayerData.h:21

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
