/**
 * 1:1 移植自 src/world/entity/monster/Zombie.h 与 Zombie.cpp（任务单 H7）。白天在露天会着火；死亡有 1/4 概率掉羽毛（原文如此）。
 * 新 AI：构造函数里建立 targetSelector（受伤反击、最近的玩家）、goalSelector（近战、闲逛）、moveControl、jumpControl（任务单 H11）。
 *   `useNewAi()` 返回 `_useNewAi`，只有 `setUseNewAi` 能改，而唯一的调用点
 *   `Level::setZombieAi` 在 Level.cpp:1429 被注释掉——正常游戏中恒为 false，走旧 AI。
 */
import { Item } from '../../item/Item';
import type { Level } from '../../level/Level';
import { Mth } from '@mcpe/util';
import type { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import { Monster } from './Monster';
import { JumpControl } from '../ai/control/JumpControl';
import { MoveControl } from '../ai/control/MoveControl';
import { GoalSelector } from '../ai/goal/GoalSelector';
import { MeleeAttackGoal } from '../ai/goal/MeleeAttackGoal';
import { RandomStrollGoal } from '../ai/goal/RandomStrollGoal';
import { HurtByTargetGoal } from '../ai/goal/target/HurtByTargetGoal';
import { NearestAttackableTargetGoal } from '../ai/goal/target/NearestAttackableTargetGoal';

const f = Math.fround;

export class Zombie extends Monster {
  protected fireCheckTick = 0;
  protected _useNewAi = false;

  constructor(level: Level) {
    super(level);
    this.fireCheckTick = 0;
    this._useNewAi = false;
    this.entityRendererId = EntityRendererId.ER_ZOMBIE_RENDERER;
    this.textureName = 'mob/zombie.png';
    this.runSpeed = f(0.5);
    this.attackDamage = 4;
    this.targetSelector = new GoalSelector();
    this.targetSelector.addGoal(1, new HurtByTargetGoal(this, false));
    this.targetSelector.addGoal(2, new NearestAttackableTargetGoal(this, 1, 16, 0, true));
    this.goalSelector = new GoalSelector();
    this.goalSelector.addGoal(2, new MeleeAttackGoal(this, this.runSpeed, false, 0));
    this.goalSelector.addGoal(7, new RandomStrollGoal(this, this.runSpeed));
    this.moveControl = new MoveControl(this);
    this.jumpControl = new JumpControl(this);
  }

  override getMaxHealth(): number {
    return 12;
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

  override getEntityTypeId(): number {
    return MobTypes.Zombie;
  }

  setUseNewAi(use: boolean): void {
    this._useNewAi = use;
  }

  override getArmorValue(): number {
    let armor = super.getArmorValue() + 2;
    if (armor > 20) armor = 20;
    return armor;
  }

  protected override getAmbientSound(): string | null {
    return 'mob.zombie';
  }

  protected override getHurtSound(): string {
    return 'mob.zombiehurt';
  }

  protected override getDeathSound(): string {
    return 'mob.zombiedeath';
  }

  protected override getDeathLoot(): number {
    return 0;
  }

  protected override useNewAi(): boolean {
    return this._useNewAi;
  }

  override die(source: Entity | null): void {
    super.die(source);
    if (!this.level.isClientSide) {
      if (this.random.nextInt(4) === 0) {
        this.spawnAtLocation(Item.feather.id, this.random.nextInt(1) + 1);
      }
    }
  }

  override getAttackDamage(_target: Entity): number {
    const weapon = this.getCarriedItem();
    let damage = this.attackDamage;
    if (weapon !== null) damage += weapon.getAttackDamage(this);
    return damage;
  }
}
