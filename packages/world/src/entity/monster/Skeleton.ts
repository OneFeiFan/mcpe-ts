/**
 * 1:1 移植自 src/world/entity/monster/Skeleton.h 与 Skeleton.cpp（任务单 H8）。白天露天着火；10 格内拉弓射箭（每 3 秒一支），射击时原地不动、面向目标。
 * 手里的弓是按值成员 `ItemInstance bow(Item::bow, 1)`，getCarriedItem 返回它的地址。
 * 朝向：`(float)(std::atan2(zd, xd) * Mth::RADDEG) - 90`——这里用的是 std::atan2（double），乘 float 的 RADDEG 后转 float。
 */
import { SharedConstants } from '@mcpe/core';
import { Mth } from '@mcpe/util';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import type { Level } from '../../level/Level';
import type { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import { Arrow } from '../projectile/Arrow';
import { Monster } from './Monster';

const f = Math.fround;

export class Skeleton extends Monster {
  private bow: ItemInstance;
  private fireCheckTick = 0;

  constructor(level: Level) {
    super(level);
    this.bow = new ItemInstance(Item.bow, 1);
    this.fireCheckTick = 0;
    this.entityRendererId = EntityRendererId.ER_SKELETON_RENDERER;
    this.textureName = 'mob/skeleton.png';
  }

  override getMaxHealth(): number {
    return 10;
  }

  override aiStep(): void {
    if (++this.fireCheckTick & 1 && this.level.isDay() && !this.level.isClientSide) {
      const br = this.getBrightness(1);
      if (br > f(0.5)) {
        if (
          this.level.canSeeSky(Mth.floor(this.x), Mth.floor(this.y), Mth.floor(this.z)) &&
          f(this.random.nextFloat() * f(3.5)) < f(br - f(0.4))
        ) {
          for (let i = 0; i < 5; ++i) {
            const xa = f(
              f(
                f(f(2.0 * this.random.nextFloat()) - 1.0) *
                  f(f(2.0 * this.random.nextFloat()) - 1.0),
              ) * f(0.02),
            );
            const ya = f(
              f(
                f(f(2.0 * this.random.nextFloat()) - 1.0) *
                  f(f(2.0 * this.random.nextFloat()) - 1.0),
              ) * f(0.02),
            );
            const za = f(
              f(
                f(f(2.0 * this.random.nextFloat()) - 1.0) *
                  f(f(2.0 * this.random.nextFloat()) - 1.0),
              ) * f(0.02),
            );
            this.level.addParticle(
              'explode',
              this.x + f(this.random.nextFloat() * this.bbWidth * 2) - this.bbWidth,
              this.y + f(this.random.nextFloat() * this.bbHeight),
              this.z + f(this.random.nextFloat() * this.bbWidth * 2) - this.bbWidth,
              xa,
              ya,
              za,
            );
          }
          this.setOnFire(8);
        }
      }
    }
    super.aiStep();
  }

  protected override getDeathLoot(): number {
    return Item.arrow.id;
  }

  override getCarriedItem(): ItemInstance | null {
    return this.bow;
  }

  override getEntityTypeId(): number {
    return MobTypes.Skeleton;
  }

  protected override getAmbientSound(): string | null {
    return 'mob.skeleton';
  }

  protected override getHurtSound(): string {
    return 'mob.skeletonhurt';
  }

  protected override getDeathSound(): string {
    return 'mob.skeletonhurt';
  }

  protected override checkHurtTarget(target: Entity, d: number): void {
    if (d < 10) {
      const xd = f(target.x - this.x);
      const zd = f(target.z - this.z);
      if (this.attackTime === 0) {
        const arrow = new Arrow(this.level, this, 1);
        const yd = f(f(f(target.y + target.getHeadHeight()) - f(0.7)) - arrow.y);
        const yo = f(f(Mth.sqrt(f(f(xd * xd) + f(zd * zd)))) * f(0.2));
        this.level.playSound(
          this,
          'random.bow',
          1.0,
          f(1 / f(f(this.random.nextFloat() * f(0.4)) + f(0.8))),
        );
        this.level.addEntity(arrow);
        arrow.shoot(xd, f(yd + yo), zd, f(1.6), 32);
        this.attackTime = SharedConstants.TicksPerSecond * 3;
      }
      this.yRot = f(f(Math.atan2(zd, xd) * Mth.RADDEG) - 90);
      this.holdGround = true;
    }
  }

  protected override dropDeathLoot(): void {
    let count = this.random.nextInt(3);
    for (let i = 0; i < count; i++) {
      this.spawnAtLocation(Item.arrow.id, 1);
    }
    count = this.random.nextInt(3);
    for (let i = 0; i < count; i++) {
      this.spawnAtLocation(Item.bone.id, 1);
    }
  }

  /** C++ `virtual int Skeleton::getUseDuration()`（只在 Skeleton 里声明） */
  getUseDuration(): number {
    return this.attackTime;
  }
}
