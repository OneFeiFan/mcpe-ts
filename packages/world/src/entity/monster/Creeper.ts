/**
 * 1:1 移植自 src/world/entity/monster/Creeper.h 与 Creeper.cpp（任务单 H8）。靠近目标 3 格内开始膨胀（已在膨胀时 7 格内继续），
 * 30 刻后以 2.4 的威力爆炸并移除自己；看不见目标或走远就慢慢缩回。同步数据 DATA_SWELL_DIR(16) 是膨胀方向（-1/1）。
 * 单机（服务端）时 tick 里“客户端按方向累加 swell”那一段不执行；此时 tick 只在没有攻击目标时让 swell 递减，
 * 膨胀与缩回主要由 checkHurtTarget / checkCantSeeTarget 驱动。
 */
import { Item } from '../../item/Item';
import type { Level } from '../../level/Level';
import type { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import { Monster } from './Monster';

const f = Math.fround;

export class Creeper extends Monster {
  private static readonly DATA_SWELL_DIR = 16;
  private static readonly MAX_SWELL = 30;
  private swell = 0;
  private oldSwell = 0;
  private swellDir = -1;

  constructor(level: Level) {
    super(level);
    this.swell = 0;
    this.oldSwell = 0;
    this.swellDir = -1;
    this.entityRendererId = EntityRendererId.ER_CREEPER_RENDERER;
    this.textureName = 'mob/creeper.png';
    this.entityData.defineByte(Creeper.DATA_SWELL_DIR, -1);
  }

  override getMaxHealth(): number {
    return 16;
  }

  override tick(): void {
    this.oldSwell = this.swell;
    if (this.level.isClientSide) {
      const swellDir = this.getSwellDir();
      if (swellDir > 0 && this.swell === 0) {
        this.level.playSound(this, 'random.fuse', 1, f(0.5));
      }
      this.swell += swellDir;
      if (this.swell < 0) this.swell = 0;
      if (this.swell >= Creeper.MAX_SWELL) this.swell = Creeper.MAX_SWELL;
    }
    super.tick();
    if (!this.level.isClientSide && this.attackTargetId === 0) {
      if (this.swell > 0) {
        this.setSwellDir(-1);
        this.swell--;
        if (this.swell < 0) {
          this.swell = 0;
        }
      }
    }
  }

  getSwelling(a: number): number {
    a = f(a); // C++ 形参是 float，入口先舍入
    return f(f(this.oldSwell + f((this.swell - this.oldSwell) * a)) / (Creeper.MAX_SWELL - 2));
  }

  override getEntityTypeId(): number {
    return MobTypes.Creeper;
  }

  protected override getDeathLoot(): number {
    return Item.sulphur.id;
  }

  protected override checkCantSeeTarget(_target: Entity, _d: number): void {
    if (this.level.isClientSide) return;
    if (this.swell > 0) {
      this.setSwellDir(-1);
      this.swell--;
      if (this.swell < 0) {
        this.swell = 0;
      }
    }
  }

  protected override getHurtSound(): string {
    return 'mob.creeper';
  }

  protected override getDeathSound(): string {
    return 'mob.creeperdeath';
  }

  protected override checkHurtTarget(_target: Entity, d: number): void {
    d = f(d); // C++ 形参是 float，入口先舍入
    if (this.level.isClientSide) return;
    const swellDir = this.getSwellDir();
    if ((swellDir <= 0 && d < 3) || (swellDir > 0 && d < 7)) {
      if (this.swell === 0) {
        this.level.playSound(this, 'random.fuse', 1, f(0.5));
      }
      this.setSwellDir(1);
      if (++this.swell >= Creeper.MAX_SWELL) {
        this.level.explode(this, this.x, this.y, this.z, f(2.4));
        this.remove();
      }
      this.holdGround = true;
    } else {
      this.setSwellDir(-1);
      if (--this.swell < 0) this.swell = 0;
    }
  }

  private getSwellDir(): number {
    return this.entityData.getByte(Creeper.DATA_SWELL_DIR);
  }

  private setSwellDir(dir: number): void {
    this.entityData.setByte(Creeper.DATA_SWELL_DIR, dir);
  }
}
void Creeper.prototype;
