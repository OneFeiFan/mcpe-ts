// S12 起只供 dev 页 fly-smoke 使用（游戏本身用真正的 LocalPlayer）；原在 packages/client/src/camera/。
/**
 * NEW（S8）：demo 用来代替玩家的自由飞行相机，实现 CameraTarget。没有碰撞、没有重力。
 *  - heightOffset = 1.62（与 Player 一致），GameRenderer 里 heightOffset − 1.62 = 0，视点就在 y 处。
 *  - turn 照抄 Entity.cpp:441；getPos 照抄 Mob.cpp:986；isUnderLiquid 照抄 Entity.cpp:367（getHeadHeight 取 0）。
 *  - tick(input)：先记下上一 tick 的位置与朝向，再 input.tick(null)；水平移动用 Entity::moveRelative 的公式，
 *    jumping 上升、sneaking 下降。SPEED 是 NEW 代码的常量（每 tick 0.5 格）。
 * 移植 LocalPlayer 之后，手册附录 C 的 6 处 ADAPTED(DebugCamera) 接缝逐条删除，本类随之不再使用。
 */
import { Mth } from '@mcpe/util';
import { type Level, LiquidTile, type Material, Tile, Vec3 } from '@mcpe/world';
import type { IMoveInput } from '@mcpe/client';
import type { CameraTarget } from './CameraTarget';

export class DebugFreeCamera implements CameraTarget {
  static readonly SPEED = 0.5;
  static readonly VERTICAL_SPEED = 0.5;

  x: number;
  y: number;
  z: number;
  xo: number;
  yo: number;
  zo: number;
  xOld: number;
  yOld: number;
  zOld: number;
  xRot = 0;
  yRot = 0;
  xRotO = 0;
  yRotO = 0;
  heightOffset = 1.62;
  hurtTime = 0;
  hurtDuration = 0;
  hurtDir = 0;
  deathTime = 0;
  level: Level;

  constructor(level: Level, x: number, y: number, z: number) {
    this.level = level;
    this.x = this.xo = this.xOld = x;
    this.y = this.yo = this.yOld = y;
    this.z = this.zo = this.zOld = z;
  }

  isAlive(): boolean {
    return true;
  }

  hasDied(): boolean {
    return false;
  }

  isPlayer(): boolean {
    return false;
  }

  /** Entity.cpp:441 */
  turn(xo: number, yo: number): void {
    const xRotOld = this.xRot;
    const yRotOld = this.yRot;
    this.yRot += xo * 0.15;
    this.xRot -= yo * 0.15;
    if (this.xRot < -90) this.xRot = -90;
    if (this.xRot > 90) this.xRot = 90;
    this.xRotO += this.xRot - xRotOld;
    this.yRotO += this.yRot - yRotOld;
  }

  /** Mob.cpp:986 */
  getPos(a: number): Vec3 {
    if (a === 1) {
      return new Vec3(this.x, this.y, this.z);
    }
    const x = this.xo + (this.x - this.xo) * a;
    const y = this.yo + (this.y - this.yo) * a;
    const z = this.zo + (this.z - this.zo) * a;
    return new Vec3(x, y, z);
  }

  /** Entity.cpp:367（getHeadHeight() 取 0） */
  isUnderLiquid(material: Material): boolean {
    const yp = this.y + 0;
    const xt = Mth.floor(this.x);
    const yt = Mth.floor(Mth.floor(yp));
    const zt = Mth.floor(this.z);
    const t = this.level.getTile(xt, yt, zt);
    if (t !== 0 && Tile.tiles[t]!.material === material) {
      const hh = LiquidTile.getHeight(this.level.getData(xt, yt, zt)) - 1 / 9.0;
      const h = yt + 1 - hh;
      return yp < h;
    }
    return false;
  }

  tick(input: IMoveInput): void {
    this.xo = this.xOld = this.x;
    this.yo = this.yOld = this.y;
    this.zo = this.zOld = this.z;
    this.xRotO = this.xRot;
    this.yRotO = this.yRot;
    input.tick(null);
    // Entity::moveRelative(xa, za, speed) 的公式，直接作用在位置上
    let xa = input.xa;
    let za = input.ya;
    let dist = Math.sqrt(xa * xa + za * za);
    if (dist >= 0.01) {
      if (dist < 1) dist = 1;
      dist = DebugFreeCamera.SPEED / dist;
      xa *= dist;
      za *= dist;
      const sin_ = Math.sin((this.yRot * Mth.PI) / 180);
      const cos_ = Math.cos((this.yRot * Mth.PI) / 180);
      this.x += xa * cos_ - za * sin_;
      this.z += za * cos_ + xa * sin_;
    }
    if (input.jumping) this.y += DebugFreeCamera.VERTICAL_SPEED;
    if (input.sneaking) this.y -= DebugFreeCamera.VERTICAL_SPEED;
  }
}
