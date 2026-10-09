/**
 * 1:1 移植自 src/world/entity/monster/Monster.h 与 Monster.cpp（任务单 H7）：所有敌对生物的基类。
 * 亮处 noActionTime 加速（促使消失）、和平难度下自行移除、被打后把攻击者设为目标、16 格内能看见的玩家作为目标、贴身 2 格内攻击。
 * 原样保留的 C++ 怪癖：`getLastHurtByMob()` 判断的是 `targetId == 0`（不是 lastHurtByMobId）。
 */
import { Mth } from '@mcpe/util';
import { Difficulty } from '../../Difficulty';
import type { Level } from '../../level/Level';
import { LightLayer } from '../../level/LightLayer';
import type { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import type { Mob } from '../Mob';
import { PathfinderMob } from '../PathfinderMob';

const f = Math.fround;

export abstract class Monster extends PathfinderMob {
  protected attackDamage = 2;
  protected targetId = 0;
  protected lastHurtByMobId = 0;

  constructor(level: Level) {
    super(level);
    this.attackDamage = 2;
    this.targetId = 0;
    this.lastHurtByMobId = 0;
    this.entityRendererId = EntityRendererId.ER_HUMANOID_RENDERER;
  }

  override aiStep(): void {
    this.updateAttackAnim();
    const br = this.getBrightness(1);
    if (br > f(0.5)) {
      this.noActionTime += 2;
    }
    super.aiStep();
  }

  override tick(): void {
    super.tick();
    if (!this.level.isClientSide && this.level.difficulty === Difficulty.PEACEFUL) this.remove();
  }

  override hurt(sourceEntity: Entity | null, dmg: number): boolean {
    if (super.hurt(sourceEntity, dmg)) {
      if (sourceEntity !== this) {
        this.attackTargetId = 0;
        if (sourceEntity !== null) {
          this.attackTargetId = sourceEntity.entityId;
          if (sourceEntity.isMob()) this.lastHurtByMobId = sourceEntity.entityId;
        }
      }
      return true;
    }
    return false;
  }

  override canSpawn(): boolean {
    return this.isDarkEnoughToSpawn() && super.canSpawn();
  }

  override getCreatureBaseType(): number {
    return MobTypes.BaseEnemy;
  }

  doHurtTarget(target: Entity): boolean {
    this.swing();
    const dmg = this.attackDamage;
    return target.hurt(this, dmg);
  }

  setTarget(mob: Mob | null): void {
    this.targetId = mob ? mob.entityId : 0;
  }

  getTarget(): Mob | null {
    if (this.targetId === 0) return null;
    return this.level.getMob(this.targetId);
  }

  getLastHurtByMob(): Mob | null {
    if (this.targetId === 0) return null; // 原样：判断的是 targetId
    return this.level.getMob(this.lastHurtByMobId);
  }

  setLastHurtByMob(mob: Mob | null): void {
    this.lastHurtByMobId = mob ? mob.entityId : 0;
  }

  getAttackDamage(_target: Entity): number {
    return this.attackDamage;
  }

  protected override findAttackTarget(): Entity | null {
    const player = this.level.getNearestPlayer(this, 16);
    if (player !== null && this.canSee(player)) return player;
    return null;
  }

  protected isDarkEnoughToSpawn(): boolean {
    const xt = Mth.floor(this.x);
    const yt = Mth.floor(this.bb.y0);
    const zt = Mth.floor(this.z);
    if (this.level.getBrightness(LightLayer.Sky, xt, yt, zt) > this.random.nextInt(32))
      return false;
    const br = this.level.getRawBrightness(xt, yt, zt);
    return br <= this.random.nextInt(8);
  }

  protected override checkHurtTarget(target: Entity, distance: number): void {
    if (
      this.attackTime <= 0 &&
      distance < f(2.0) &&
      target.bb.y1 > this.bb.y0 &&
      target.bb.y0 < this.bb.y1
    ) {
      this.attackTime = this.getAttackTime();
      this.doHurtTarget(target);
    }
  }

  override getWalkTargetValue(x: number, y: number, z: number): number {
    return f(f(0.5) - this.level.getBrightness(x, y, z));
  }

  protected getAttackTime(): number {
    return 20;
  }
}
