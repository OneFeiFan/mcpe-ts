/**
 * NEW（S8，决策 D7）：渲染与相机代码从“相机目标”读取的成员。成员名与 Mob（及 Entity）完全一致，
 * 将来真正的 Mob、LocalPlayer 按结构类型直接满足，GameRenderer、LevelRenderer 不用改（手册附录 A）。
 * 只在 isPlayer() 为真、强转成 Player 之后才读的 bob、tilt、walkDist 等不放这里。
 */
import type { Material, Vec3 } from '@mcpe/world';

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  xo: number;
  yo: number;
  zo: number;
  xOld: number;
  yOld: number;
  zOld: number;
  xRot: number;
  yRot: number;
  xRotO: number;
  yRotO: number;
  heightOffset: number;
  hurtTime: number;
  hurtDuration: number;
  hurtDir: number;
  deathTime: number;
  isAlive(): boolean;
  hasDied(): boolean;
  isPlayer(): boolean;
  isUnderLiquid(material: Material): boolean;
  getPos(a: number): Vec3;
  turn(xo: number, yo: number): void;
}
