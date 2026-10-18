/**
 * 1:1 移植自 src/world/entity/projectile/Throwable.h 与 .cpp（323 行）。抽象基类。
 *
 * 扔出去的东西（雪球、蛋……）的公共部分：初速度由 `shoot` 给，每刻往前飞一点、
 * 碰上方块或实体就调 `onHit`（子类自己实现）。
 *
 * 【两处必须原样保留的怪癖】
 *   1. **落地存活是硬编码的 `20 * 60`**（`life == 20*60` 时 `remove()`），
 *      **没有乘 `TicksPerSecond`** —— 而 Arrow 那边写的是 `60 * TicksPerSecond`。
 *      同一个数字两种写法，原样。
 *   2. `readAdditionalSaveData` 里 `lastTile` 和 `shakeTime` 读的时候**带 `& 0xff`**，
 *      而 `xTile/yTile/zTile` 是 `getShort`（没截断）。和 FallingTile/PrimedTnt 那条"不带 `& 0xff`"
 *      正好相反 —— 同批里两种写法都有，抄的时候按各自的原文来。
 *
 * 【`tick()` 调 `super.tick()`】和 FallingTile/PrimedTnt（不调）相反 —— 这里要跑 `baseTick`。
 */
import { Mth } from '@mcpe/util';
import type { CompoundTag } from '@mcpe/nbt';
import { Entity } from '../Entity';
import { ParticleType } from '../EntityTypes';
import { HitResult } from '../../phys/HitResult';
import { Vec3 } from '../../phys/Vec3';
import type { Mob } from '../Mob';
import type { Level } from '../../level/Level';

const f = Math.fround;

export abstract class Throwable extends Entity {
  /** C++ `int shakeTime;` */
  public shakeTime!: number;
  protected inGround!: boolean;
  protected ownerId!: number;
  private life!: number;
  private flightTime!: number;
  private xTile!: number;
  private yTile!: number;
  private zTile!: number;
  private lastTile!: number;

  /** C++ `Throwable(Level*)` */
  constructor(level: Level);
  /** C++ `Throwable(Level*, Mob* mob)` */
  constructor(level: Level, mob: Mob);
  /** C++ `Throwable(Level*, float x, float y, float z)` */
  constructor(level: Level, x: number, y: number, z: number);
  constructor(level: Level, a?: Mob | number, b?: number, c?: number) {
    super(level);
    this._initThrowable();

    if (a === undefined) {
      // C++ `Throwable(Level*)`
      this.setSize(f(0.25), f(0.25));
    } else if (typeof a === 'number') {
      // C++ `Throwable(Level*, float x, float y, float z)`
      this.setSize(f(0.25), f(0.25));
      this.setPos(a, b!, c!);
      this.heightOffset = 0;
    } else {
      // C++ `Throwable(Level*, Mob* mob)`
      const mob = a;
      this.setSize(f(0.25), f(0.25));
      this.ownerId = mob.entityId;
      this.moveTo(mob.x, f(mob.y + mob.getHeadHeight()), mob.z, mob.yRot, mob.xRot);
      const rcos = f(Mth.cos(f(f(mob.yRot / 180) * Mth.PI)));
      const rsin = f(Mth.sin(f(f(mob.yRot / 180) * Mth.PI)));
      this.x = f(this.x - f(rcos * f(0.16)));
      this.y = f(this.y - f(0.1));
      this.z = f(this.z - f(rsin * f(0.16)));
      this.setPos(this.x, this.y, this.z);
      this.heightOffset = 0;
      if (mob.isPlayer()) {
        this.shootVec(mob.aimDirection, this.getThrowPower(), 1);
      } else {
        const xd = f(f(-rsin) * f(Mth.cos(f(f(mob.xRot / 180) * Mth.PI))));
        const zd = f(rcos * f(Mth.cos(f(f(mob.xRot / 180) * Mth.PI))));
        const yd = f(-Mth.sin(f(f(f(mob.xRot + this.getThrowUpAngleOffset()) / 180) * Mth.PI)));
        this.shoot(xd, yd, zd, this.getThrowPower(), 1);
      }
    }
  }

  /**
   * C++ `void Throwable::_init()`。
   * ⚠ 这里不能沿用 C++ 那个名字：TS 的 `Entity` 已经有一个 `_init()`（构造器里绕虚函数用的），
   * 同名会撞成 override。所以加个后缀，语义不变。
   */
  private _initThrowable(): void {
    this.ownerId = 0;
    this.shakeTime = 0;
    this.inGround = false;
    this.life = 0;
    this.flightTime = 0;
    this.xTile = -1;
    this.yTile = -1;
    this.zTile = -1;
    this.lastTile = 0;
  }

  /** C++ `bool Throwable::shouldRenderAtSqrDistance(float)` */
  override shouldRenderAtSqrDistance(distance: number): boolean {
    let size = f(this.bb.getSize() * 4);
    size = f(size * f(64.0));
    return distance < f(size * size);
  }

  /** C++ `virtual float Throwable::getThrowPower()` */
  protected getThrowPower(): number {
    return f(1.5);
  }

  /** C++ `virtual float Throwable::getThrowUpAngleOffset()` */
  protected getThrowUpAngleOffset(): number {
    return 0;
  }

  /** C++ `virtual float Throwable::getGravity()` */
  protected getGravity(): number {
    return f(0.03);
  }

  /** C++ `virtual void Throwable::onHit(const HitResult&) = 0` —— protected，纯虚 */
  protected abstract onHit(res: HitResult): void;

  /** C++ 的 `shoot(const Vec3&, float, float)`（R10 情形 A：只是转发给 5 参那个） */
  shootVec(v: Vec3, pow: number, uncertainty: number): void {
    this.shoot(v.x, v.y, v.z, pow, uncertainty);
  }

  /** C++ `void Throwable::shoot(float xd, float yd, float zd, float pow, float uncertainty)` */
  shoot(xd_: number, yd_: number, zd_: number, pow: number, uncertainty: number): void {
    // 审核：形参是 float，先转 float；C++ 的加法与乘法从左到右结合（xd*xd + yd*yd 先算），
    // 以前写成 xd*xd + (yd*yd + zd*zd)、g * (0.0075 * uncertainty)，float 下结果可能差末位
    let xd = f(xd_);
    let yd = f(yd_);
    let zd = f(zd_);
    pow = f(pow);
    uncertainty = f(uncertainty);
    const dist = f(Mth.sqrt(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd))));
    if (dist >= f(0.001)) {
      xd = f(xd / dist);
      yd = f(yd / dist);
      zd = f(zd / dist);
    } else {
      xd = yd = zd = 0;
    }
    xd = f(xd + f(f(f(Entity.sharedRandom.nextGaussian()) * f(0.0075)) * uncertainty));
    yd = f(yd + f(f(f(Entity.sharedRandom.nextGaussian()) * f(0.0075)) * uncertainty));
    zd = f(zd + f(f(f(Entity.sharedRandom.nextGaussian()) * f(0.0075)) * uncertainty));
    xd = f(xd * pow);
    yd = f(yd * pow);
    zd = f(zd * pow);
    this.xd = xd;
    this.yd = yd;
    this.zd = zd;
    const sd = f(Mth.sqrt(f(f(xd * xd) + f(zd * zd))));
    this.yRotO = this.yRot = f(f(Mth.atan2(xd, zd) * 180) / Mth.PI);
    this.xRotO = this.xRot = f(f(Mth.atan2(yd, sd) * 180) / Mth.PI);
    this.life = 0;
  }

  /** C++ `void Throwable::lerpMotion(float, float, float)` */
  override lerpMotion(xd: number, yd: number, zd: number): void {
    this.xd = xd;
    this.yd = yd;
    this.zd = zd;
    if (this.xRotO === 0 && this.yRotO === 0) {
      const sd = f(Mth.sqrt(f(f(xd * xd) + f(zd * zd))));
      this.yRotO = this.yRot = f(f(Mth.atan2(xd, zd) * 180) / Mth.PI);
      this.xRotO = this.xRot = f(f(Mth.atan2(yd, sd) * 180) / Mth.PI);
    }
  }

  /** C++ `void Throwable::tick()` —— **调 `super.tick()`**（与 FallingTile/PrimedTnt 相反） */
  override tick(): void {
    this.xOld = this.x;
    this.yOld = this.y;
    this.zOld = this.z;
    super.tick();
    if (this.shakeTime > 0) this.shakeTime--;
    if (this.inGround) {
      const tile = this.level.getTile(this.xTile, this.yTile, this.zTile);
      if (tile !== this.lastTile) {
        this.inGround = false;
        this.xd = f(this.xd * f(Entity.sharedRandom.nextFloat() * f(0.2)));
        this.yd = f(this.yd * f(Entity.sharedRandom.nextFloat() * f(0.2)));
        this.zd = f(this.zd * f(Entity.sharedRandom.nextFloat() * f(0.2)));
        this.life = 0;
        this.flightTime = 0;
      } else {
        this.life++;
        // ⚠ 硬编码 20*60，**没有乘 TicksPerSecond**（Arrow 那边写的是 60*TicksPerSecond）
        if (this.life === 20 * 60) this.remove();
        return;
      }
    } else {
      this.flightTime++;
    }
    const from = new Vec3(this.x, this.y, this.z);
    const to = new Vec3(f(this.x + this.xd), f(this.y + this.yd), f(this.z + this.zd));
    let res = this.level.clip(from, to);
    from.set(this.x, this.y, this.z);
    to.set(f(this.x + this.xd), f(this.y + this.yd), f(this.z + this.zd));
    if (res.isHit()) to.set(res.pos.x, res.pos.y, res.pos.z);
    if (!this.level.isClientSide) {
      let hitEntity: Entity | null = null;
      const objects = this.level.getEntities(
        this,
        this.bb.expand(this.xd, this.yd, this.zd).grow(1, 1, 1),
      );
      let nearest = 0;
      for (const e of objects) {
        if (!e.isPickable() || (e.entityId === this.ownerId && this.flightTime < 5)) continue;
        const rr = f(0.3);
        const bb = e.bb.grow(rr, rr, rr);
        const p = bb.clip(from, to);
        if (p.isHit()) {
          // TS 的 Vec3.distanceTo 只有 (x,y,z) 那个重载
          const dd = from.distanceTo(p.pos.x, p.pos.y, p.pos.z);
          if (dd < nearest || nearest === 0) {
            hitEntity = e;
            nearest = dd;
          }
        }
      }
      if (hitEntity !== null) res = new HitResult(hitEntity);
    }
    if (res.isHit()) this.onHit(res);
    this.x = f(this.x + this.xd);
    this.y = f(this.y + this.yd);
    this.z = f(this.z + this.zd);
    const sd = f(Mth.sqrt(f(f(this.xd * this.xd) + f(this.zd * this.zd))));
    this.yRot = f(f(Mth.atan2(this.xd, this.zd) * 180) / Mth.PI);
    this.xRot = f(f(Mth.atan2(this.yd, sd) * 180) / Mth.PI);
    while (this.xRot - this.xRotO < -180) this.xRotO -= 360;
    while (this.xRot - this.xRotO >= 180) this.xRotO += 360;
    while (this.yRot - this.yRotO < -180) this.yRotO -= 360;
    while (this.yRot - this.yRotO >= 180) this.yRotO += 360;
    this.xRot = f(this.xRotO + f(f(this.xRot - this.xRotO) * f(0.2)));
    this.yRot = f(this.yRotO + f(f(this.yRot - this.yRotO) * f(0.2)));
    let inertia = f(0.99);
    const gravity = this.getGravity();
    if (this.isInWater()) {
      for (let i = 0; i < 4; i++) {
        const s = f(1 / f(4.0));
        this.level.addParticle(
          ParticleType.bubble,
          f(this.x - f(this.xd * s)),
          f(this.y - f(this.yd * s)),
          f(this.z - f(this.zd * s)),
          this.xd,
          this.yd,
          this.zd,
        );
      }
      inertia = f(0.8);
    }
    this.xd = f(this.xd * inertia);
    this.yd = f(this.yd * inertia);
    this.zd = f(this.zd * inertia);
    this.yd = f(this.yd - gravity);
    this.setPos(this.x, this.y, this.z);
  }

  /** C++ `float Throwable::getShadowHeightOffs()` */
  override getShadowHeightOffs(): number {
    return 0;
  }

  /** C++ `void Throwable::addAdditonalSaveData(CompoundTag*)` —— 注意拼写 */
  protected override addAdditonalSaveData(tag: CompoundTag): void {
    // C++ 用 putShort/putByte 存 int，按 (short)/(char) 截断
    tag.putShort('xTile', (this.xTile << 16) >> 16);
    tag.putShort('yTile', (this.yTile << 16) >> 16);
    tag.putShort('zTile', (this.zTile << 16) >> 16);
    tag.putByte('inTile', (this.lastTile << 24) >> 24);
    tag.putByte('shake', (this.shakeTime << 24) >> 24);
    tag.putByte('inGround', this.inGround ? 1 : 0);
  }

  /** C++ `void Throwable::readAdditionalSaveData(CompoundTag*)` */
  protected override readAdditionalSaveData(tag: CompoundTag): void {
    this.xTile = tag.getShort('xTile');
    this.yTile = tag.getShort('yTile');
    this.zTile = tag.getShort('zTile');
    // ⚠ 这两个**带 `& 0xff`**（与 FallingTile/PrimedTnt 相反，见文件头第 2 条）
    this.lastTile = tag.getByte('inTile') & 0xff;
    this.shakeTime = tag.getByte('shake') & 0xff;
    this.inGround = tag.getByte('inGround') === 1;
  }

  /** C++ `int Throwable::getAuxData()` */
  override getAuxData(): number {
    return this.ownerId;
  }
}
