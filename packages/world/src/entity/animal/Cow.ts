// 1:1 移植自 src/world/entity/animal/Cow.h 与 Cow.cpp（任务单 H5）
import type { CompoundTag } from '@mcpe/nbt';
import { Item } from '../../item/Item';
import type { Level } from '../../level/Level';
import type { Player } from '../player/Player';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import { Animal } from './Animal';

const f = Math.fround;

export class Cow extends Animal {
  constructor(level: Level) {
    super(level);
    this.entityRendererId = EntityRendererId.ER_COW_RENDERER;
    this.textureName = 'mob/cow.png';
    this.setSize(f(0.9), f(1.3));
  }

  override getEntityTypeId(): number {
    return MobTypes.Cow;
  }

  override getMaxHealth(): number {
    return 10;
  }

  override addAdditonalSaveData(tag: CompoundTag): void {
    super.addAdditonalSaveData(tag);
  }

  override readAdditionalSaveData(tag: CompoundTag): void {
    super.readAdditionalSaveData(tag);
  }

  override interact(player: Player): boolean {
    return super.interact(player);
  }

  protected override getAmbientSound(): string | null {
    return 'mob.cow';
  }

  protected override getHurtSound(): string {
    return 'mob.cowhurt';
  }

  protected override getDeathSound(): string {
    return 'mob.cowhurt';
  }

  protected override getSoundVolume(): number {
    return f(0.4);
  }

  protected override getDeathLoot(): number {
    return Item.leather.id;
  }

  protected override dropDeathLoot(): void {
    let count = this.random.nextInt(3);
    for (let i = 0; i < count; i++) {
      this.spawnAtLocation(Item.leather.id, 1);
    }
    count = this.random.nextInt(3) + 1;
    for (let i = 0; i < count; i++) {
      if (this.isOnFire()) {
        this.spawnAtLocation(Item.beef_cooked.id, 1);
      } else {
        this.spawnAtLocation(Item.beef_raw.id, 1);
      }
    }
  }

  getBreedOffspring(_target: Animal): Animal {
    return new Cow(this.level);
  }
}
