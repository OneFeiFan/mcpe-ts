/**
 * 1:1 移植自 src/world/entity/animal/Pig.h 与 Pig.cpp（任务单 H5）。
 * 原样保留：鞍（DATA_SADDLE_ID = 16）只声明了常量，构造函数里没有 define；hasSaddle 恒为 false、setSaddle 空函数、interact 恒为 false。
 */
import { Item } from '../../item/Item';
import type { Level } from '../../level/Level';
import type { Player } from '../player/Player';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import { Animal } from './Animal';

const f = Math.fround;

export class Pig extends Animal {
  private static readonly DATA_SADDLE_ID = 16;

  constructor(level: Level) {
    super(level);
    this.entityRendererId = EntityRendererId.ER_PIG_RENDERER;
    this.textureName = 'mob/pig.png';
    this.setSize(f(0.9), f(0.9));
  }

  override getEntityTypeId(): number {
    return MobTypes.Pig;
  }

  override interact(_player: Player): boolean {
    return false;
  }

  hasSaddle(): boolean {
    return false;
  }

  setSaddle(_value: boolean): void {}

  protected override getAmbientSound(): string | null {
    return 'mob.pig';
  }

  protected override getHurtSound(): string {
    return 'mob.pig';
  }

  protected override getDeathSound(): string {
    return 'mob.pigdeath';
  }

  protected override getDeathLoot(): number {
    if (this.isOnFire()) return Item.porkChop_cooked.id;
    return Item.porkChop_raw.id;
  }

  /** C++ `Animal* Pig::getBreedOffspring(Animal*)`（与 Chicken 一样，全参考源码零调用方，照抄） */
  getBreedOffspring(_target: Animal): Animal {
    return new Pig(this.level);
  }

  override getMaxHealth(): number {
    return 10;
  }
}
void Pig;
