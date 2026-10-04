/**
 * 1:1 移植自 src/world/entity/item/PrimedTnt.h 与 .cpp（127 行）。
 *
 * 点着的 TNT：站在原处晃悠 80 刻（`life` 从 80 数到 0），然后**先 `remove()` 再 `explode()`**，
 * 半径写死 `3.1f`。
 *
 * 【它不调 `super.tick()`】和 `FallingTile` 一样，`tick()` 是整体重写的 ——
 * `baseTick` 那套（着火、入水、掉出世界）一个都不跑。
 *
 * 【两个构造函数不是一模一样】四参那个多三件事：`setPos`、给一个随机的初速度、
 * `makeStepSound = false`。**单参那个没有 `makeStepSound = false`** —— 不一致是原样，别"补齐"。
 * 前五行（rendererId / blocksBuilding / setSize / heightOffset）两边是**各自抄了一遍**的，
 * C++ 里没有抽成 `init()`（不像 FallingTile），所以这里也照原样写两遍。
 *
 * 【NBT 读回来没有 `& 0xff`】`life = tag.getByte("Fuse")` 直接赋 int，
 * 与 FallingTile 那条一样（同批的 Arrow/Throwable 反而带 `& 0xff`）。
 */
import { Mth } from '@mcpe/util';
import type { CompoundTag } from '@mcpe/nbt';
import { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { EntityTypes, ParticleType } from '../EntityTypes';
import type { Level } from '../../level/Level';

const f = Math.fround;

export class PrimedTnt extends Entity {
  /** C++ `int life;`，初始化列表里是 80 */
  public life: number;

  /** C++ `PrimedTnt(Level*)` */
  constructor(level: Level);
  /** C++ `PrimedTnt(Level*, float x, float y, float z)` */
  constructor(level: Level, x: number, y: number, z: number);
  constructor(level: Level, x?: number, y?: number, z?: number) {
    super(level);
    this.life = 80;

    if (x === undefined) {
      // C++ `PrimedTnt(Level*)`：五行，没有 setPos、没有初速度、没有 makeStepSound
      this.entityRendererId = EntityRendererId.ER_TNT_RENDERER;
      this.blocksBuilding = true;
      this.setSize(f(0.98), f(0.98));
      this.heightOffset = f(this.bbHeight / f(2.0));
    } else {
      // C++ `PrimedTnt(Level*, float, float, float)`
      this.entityRendererId = EntityRendererId.ER_TNT_RENDERER;
      this.blocksBuilding = true;
      this.setSize(f(0.98), f(0.98));
      this.heightOffset = f(this.bbHeight / f(2.0));
      this.setPos(x, y!, z!);
      const rot = f(f(Mth.random() * Mth.PI) * f(2.0));
      this.xd = f(Mth.sin(f(rot * Mth.DEGRAD)) * f(-0.02));
      this.yd = f(0.2);
      this.zd = f(Mth.cos(f(rot * Mth.DEGRAD)) * f(-0.02));
      this.makeStepSound = false;
      // C++ 用的是**形参** x/y/z，不是 setPos 之后的成员 —— 这里两者相等，写法照抄
      this.xo = x;
      this.yo = y!;
      this.zo = z!;
    }
  }

  /** C++ `bool PrimedTnt::isPickable()` */
  override isPickable(): boolean {
    return !this.removed;
  }

  /** C++ `void PrimedTnt::tick()` —— 整体重写，**不调 super.tick()** */
  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yd = f(this.yd - f(0.04));
    this.move(this.xd, this.yd, this.zd);
    this.xd = f(this.xd * f(0.98));
    this.yd = f(this.yd * f(0.98));
    this.zd = f(this.zd * f(0.98));
    if (this.onGround) {
      this.xd = f(this.xd * f(0.7));
      this.zd = f(this.zd * f(0.7));
      this.yd = f(this.yd * f(-0.5));
    }
    this.life--;
    if (!this.level.isClientSide && this.life <= 0) {
      // ⚠ 顺序是**先 remove 再 explode**，照抄
      this.remove();
      this.explode();
    } else {
      this.level.addParticle(ParticleType.smoke, this.x, f(this.y + f(0.5)), this.z, 0, 0, 0);
    }
  }

  /** C++ `float PrimedTnt::getShadowHeightOffs()` */
  override getShadowHeightOffs(): number {
    return 0;
  }

  /** C++ `void PrimedTnt::explode()` —— 半径写死 3.1f，source 传 NULL */
  private explode(): void {
    const r = f(3.1);
    this.level.explode(null, this.x, this.y, this.z, r);
  }

  /** C++ `void PrimedTnt::addAdditonalSaveData(CompoundTag*)` —— 注意拼写 */
  protected override addAdditonalSaveData(entityTag: CompoundTag): void {
    // C++: putByte("Fuse", life) —— (char) 是有符号的
    entityTag.putByte('Fuse', (this.life << 24) >> 24);
  }

  /** C++ `void PrimedTnt::readAdditionalSaveData(CompoundTag*)` */
  protected override readAdditionalSaveData(tag: CompoundTag): void {
    // ⚠ 原句就是**不带 `& 0xff`** 的，与 FallingTile 那条一致
    this.life = tag.getByte('Fuse');
  }

  /** C++ `int PrimedTnt::getEntityTypeId() const` */
  override getEntityTypeId(): number {
    return EntityTypes.IdPrimedTnt;
  }
}
