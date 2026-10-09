/**
 * 1:1 移植自 src/world/entity/monster/PigZombie.h 与 PigZombie.cpp（任务单 H8）。僵尸猪人：手持金剑、免疫火、
 * 被玩家（或玩家射出的箭）打到时，12 格内的同类一起被激怒。出生 3 秒内“晕眩”不找目标；未被激怒时只攻击 5 格内的目标。
 * 渲染器：EntityRenderDispatcher 里没有给它注册（它沿用 Zombie 构造时设置的 ER_ZOMBIE_RENDERER——C++ 构造函数没改 entityRendererId）。
 * 原样保留：
 *   - 箭的主人找不到时 `attacker->isPlayer()` 在 C++ 里是空指针解引用（崩溃）；这里写成同样会抛错的 `attacker!.isPlayer()`；
 *   - alert 用 `sourceEntity`（可能是箭）而不是 attacker 作为目标。
 */
import { SharedConstants } from '@mcpe/core';
import type { CompoundTag } from '@mcpe/nbt';
import { Difficulty } from '../../Difficulty';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import type { Level } from '../../level/Level';
import type { Entity } from '../Entity';
import { EntityTypes, MobTypes } from '../EntityTypes';
import type { Player } from '../player/Player';
import type { Arrow } from '../projectile/Arrow';
import { Zombie } from './Zombie';

const f = Math.fround;

export class PigZombie extends Zombie {
  private angerTime = 0;
  private playAngrySoundIn = 0;
  private stunedTime: number;
  private weapon: ItemInstance;

  constructor(level: Level) {
    super(level);
    this.angerTime = 0;
    this.playAngrySoundIn = 0;
    this.weapon = new ItemInstance(Item.sword_gold);
    this.stunedTime = SharedConstants.TicksPerSecond * 3;
    this.textureName = 'mob/pigzombie.png';
    this.runSpeed = f(0.7);
    this.fireImmune = true;
    this.attackDamage = 5;
  }

  protected override useNewAi(): boolean {
    return false;
  }

  override tick(): void {
    if (this.stunedTime > 0) this.stunedTime--;
    if (this.playAngrySoundIn > 0) {
      if (--this.playAngrySoundIn === 0) {
        this.level.playSound(
          this.x,
          this.y,
          this.z,
          'mob.zombiepig.zpigangry',
          f(this.getSoundVolume() * 2),
          f(f(f(f(this.random.nextFloat() - this.random.nextFloat()) * f(0.2)) + f(1.0)) * f(1.8)),
        );
      }
    }
    super.tick();
  }

  override getTexture(): string {
    return 'mob/pigzombie.png';
  }

  override canSpawn(): boolean {
    return (
      this.level.difficulty > Difficulty.PEACEFUL &&
      this.level.isUnobstructed(this.bb) &&
      this.level.getCubes(this, this.bb).length === 0
    );
  }

  override addAdditonalSaveData(entityTag: CompoundTag): void {
    super.addAdditonalSaveData(entityTag);
    entityTag.putShort('Anger', (this.angerTime << 16) >> 16);
  }

  override readAdditionalSaveData(tag: CompoundTag): void {
    super.readAdditionalSaveData(tag);
    this.angerTime = tag.getShort('Anger');
  }

  protected override findAttackTarget(): Entity | null {
    if (this.stunedTime !== 0) return null;
    if (this.angerTime === 0) {
      const potentialTarget = super.findAttackTarget();
      if (potentialTarget !== null && potentialTarget.distanceTo(this.x, this.y, this.z) < 5) {
        return potentialTarget;
      }
      return null;
    }
    return super.findAttackTarget();
  }

  override hurt(sourceEntity: Entity | null, dmg: number): boolean {
    let attacker: Entity | null = null;
    if (sourceEntity !== null) {
      if (sourceEntity.isPlayer()) {
        attacker = sourceEntity;
      } else if (sourceEntity.isEntityType(EntityTypes.IdArrow)) {
        const arrow = sourceEntity as Arrow;
        if (arrow.ownerId !== 0) {
          attacker = this.level.getEntity(arrow.ownerId);
          if (!attacker!.isPlayer()) attacker = null; // C++ 在主人不存在时解引用空指针
        }
      }
    }
    if (attacker !== null) {
      const nearby = this.level.getEntities(this, this.bb.grow(12, 12, 12));
      for (const it of nearby) {
        if (it.isEntityType(MobTypes.PigZombie)) {
          (it as PigZombie).alert(sourceEntity!);
        }
      }
    }
    return super.hurt(sourceEntity, dmg);
  }

  private alert(target: Entity): void {
    this.attackTargetId = target.entityId;
    this.angerTime = 20 * 20 * this.random.nextInt(20 * 20);
    this.playAngrySoundIn = this.random.nextInt(20 * 2);
  }

  protected override getAmbientSound(): string | null {
    return 'mob.zombiepig.zpig';
  }

  protected override getHurtSound(): string {
    return 'mob.zombiepig.zpighurt';
  }

  protected override getDeathSound(): string {
    return 'mob.zombiepig.zpigdeath';
  }

  protected override dropDeathLoot(): void {
    const count = this.random.nextInt(2);
    for (let i = 0; i < count; ++i) {
      this.spawnAtLocation(Item.goldIngot.id, 1);
    }
  }

  override interact(_player: Player): boolean {
    return false;
  }

  protected override getDeathLoot(): number {
    return 0;
  }

  override getCarriedItem(): ItemInstance | null {
    return this.weapon;
  }

  override getEntityTypeId(): number {
    return MobTypes.PigZombie;
  }

  protected override getAttackTime(): number {
    return 40;
  }
}
