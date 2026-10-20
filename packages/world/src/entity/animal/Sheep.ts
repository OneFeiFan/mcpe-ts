/**
 * 1:1 移植自 src/world/entity/animal/Sheep.h 与 Sheep.cpp（任务单 H6）。毛色、剪毛、吃草（吃掉草丛或把草方块啃成泥土）、长回羊毛。
 * 同步数据 DATA_WOOL_ID(16)：低 4 位是颜色、0x10 是“已剪毛”。
 * 原样保留的 C++ 怪癖：`NumColors = sizeof(COLOR) / sizeof(Sheep*)`——拿颜色表的字节数除以**指针**的大小（不是一行的大小），
 *   64 位下得 24、32 位下得 48，都不是 16。参考源码里没有任何地方读它；这里按 64 位构建取 24（ADAPTED(Cpp)：注明来历）。
 */
import { SharedConstants } from '@mcpe/core';
import type { CompoundTag } from '@mcpe/nbt';
import { Mth, type Random } from '@mcpe/util';
import { DyePowderItem } from '../../item/DyePowderItem';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import type { Level } from '../../level/Level';
import { LevelEvent } from '../../level/tile/LevelEvent';
import { TallGrass } from '../../level/tile/TallGrass';
import { Tile } from '../../level/tile/Tile';
import { EntityEvent } from '../EntityEvent';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import type { Player } from '../player/Player';
import { Animal } from './Animal';

const f = Math.fround;

export class Sheep extends Animal {
  private static readonly EAT_ANIMATION_TICKS = SharedConstants.TicksPerSecond * 2;
  private static readonly DATA_WOOL_ID = 16;
  static readonly COLOR: readonly (readonly number[])[] = [
    [1.0, 1.0, 1.0],
    [0.95, 0.7, 0.2],
    [0.9, 0.5, 0.85],
    [0.6, 0.7, 0.95],
    [0.9, 0.9, 0.2],
    [0.5, 0.8, 0.1],
    [0.95, 0.7, 0.8],
    [0.3, 0.3, 0.3],
    [0.6, 0.6, 0.6],
    [0.3, 0.6, 0.7],
    [0.7, 0.4, 0.9],
    [0.2, 0.4, 0.8],
    [0.5, 0.4, 0.3],
    [0.4, 0.5, 0.2],
    [0.8, 0.3, 0.3],
    [0.1, 0.1, 0.1],
  ].map((row) => row.map((v) => f(v)));
  /** 见文件头：sizeof(COLOR) / sizeof(Sheep*) = 192 / 8 */
  static readonly NumColors = (16 * 3 * 4) / 8;

  private eatAnimationTick = 0;

  constructor(level: Level) {
    super(level);
    this.eatAnimationTick = 0;
    this.entityRendererId = EntityRendererId.ER_SHEEP_RENDERER;
    this.textureName = 'mob/sheep.png';
    this.setSize(f(0.9), f(1.3));
    this.entityData.defineByte(Sheep.DATA_WOOL_ID, 0);
  }

  override getMaxHealth(): number {
    return 8;
  }

  override aiStep(): void {
    super.aiStep();
    if (this.eatAnimationTick > 0) {
      this.eatAnimationTick--;
    }
  }

  override handleEntityEvent(id: number): void {
    if (id === EntityEvent.EAT_GRASS) {
      this.eatAnimationTick = Sheep.EAT_ANIMATION_TICKS;
    } else {
      super.handleEntityEvent(id);
    }
  }

  getHeadEatPositionScale(a: number): number {
    a = f(a); // C++ 形参是 float，入口先舍入
    const T = Sheep.EAT_ANIMATION_TICKS;
    if (this.eatAnimationTick <= 0) {
      return 0;
    }
    if (this.eatAnimationTick >= 4 && this.eatAnimationTick <= T - 4) {
      return 1;
    }
    if (this.eatAnimationTick < 4) {
      return f(f(this.eatAnimationTick - a) / 4);
    }
    return f(-f(f(this.eatAnimationTick - T) - a) / 4);
  }

  getHeadEatAngleScale(a: number): number {
    a = f(a); // C++ 形参是 float，入口先舍入
    const T = Sheep.EAT_ANIMATION_TICKS;
    if (this.eatAnimationTick > 4 && this.eatAnimationTick <= T - 4) {
      const scale = f(f(f(this.eatAnimationTick - 4) - a) / (T - 8));
      return f(f(Mth.PI * f(0.2)) + f(f(Mth.PI * f(0.07)) * Mth.sin(f(scale * f(28.7)))));
    }
    if (this.eatAnimationTick > 0) {
      return f(Mth.PI * f(0.2));
    }
    return f(this.xRot / f(180 / Mth.PI));
  }

  override interact(player: Player): boolean {
    const item = player.inventory.getSelected();
    if (item && item.id === Item.shears.id && !this.isSheared() && !this.isBaby()) {
      if (!this.level.isClientSide) {
        this.setSheared(true);
        const count = 1 + this.random.nextInt(3);
        for (let i = 0; i < count; i++) {
          const ie = this.spawnAtLocation(new ItemInstance(Tile.cloth.id, 1, this.getColor()), 1);
          ie.yd = f(ie.yd + f(this.random.nextFloat() * f(0.05)));
          // DEFERRED(待确认): ie->xd += (random.nextFloat() - random.nextFloat()) * 0.1f;（下一行 zd 同款）
          // C++ 里两个 nextFloat() 的求值顺序未指定；不生成新黄金样本，先按从左到右（与 Entity/Mob/ItemEntity/Player/Chicken 的先例一致），待确认。
          ie.xd = f(ie.xd + f(f(this.random.nextFloat() - this.random.nextFloat()) * f(0.1)));
          ie.zd = f(ie.zd + f(f(this.random.nextFloat() - this.random.nextFloat()) * f(0.1)));
        }
      }
      item.hurt(1);
    }
    return super.interact(player);
  }

  override addAdditonalSaveData(tag: CompoundTag): void {
    super.addAdditonalSaveData(tag);
    tag.putBoolean('Sheared', this.isSheared());
    tag.putByte('Color', (this.getColor() << 24) >> 24);
  }

  override readAdditionalSaveData(tag: CompoundTag): void {
    super.readAdditionalSaveData(tag);
    this.setSheared(tag.getBoolean('Sheared'));
    this.setColor(tag.getByte('Color'));
  }

  getColor(): number {
    return this.entityData.getByte(Sheep.DATA_WOOL_ID) & 0x0f;
  }

  setColor(color: number): void {
    const current = this.entityData.getByte(Sheep.DATA_WOOL_ID);
    this.entityData.setByte(Sheep.DATA_WOOL_ID, (current & 0xf0) | (color & 0x0f));
  }

  isSheared(): boolean {
    return (this.entityData.getByte(Sheep.DATA_WOOL_ID) & 0x10) !== 0;
  }

  setSheared(value: boolean): void {
    const current = this.entityData.getByte(Sheep.DATA_WOOL_ID);
    if (value) {
      this.entityData.setByte(Sheep.DATA_WOOL_ID, current | 0x10);
    } else {
      this.entityData.setByte(Sheep.DATA_WOOL_ID, current & ~0x10);
    }
  }

  static getSheepColor(random: Random): number {
    const nextInt = random.nextInt(100);
    if (nextInt < 5) return 15 - DyePowderItem.BLACK;
    if (nextInt < 10) return 15 - DyePowderItem.GRAY;
    if (nextInt < 15) return 15 - DyePowderItem.SILVER;
    if (nextInt < 18) return 15 - DyePowderItem.BROWN;
    if (random.nextInt(500) === 0) return 15 - DyePowderItem.PINK;
    return 0;
  }

  override getEntityTypeId(): number {
    return MobTypes.Sheep;
  }

  protected override dropDeathLoot(): void {
    if (!this.isSheared()) {
      this.spawnAtLocation(new ItemInstance(Tile.cloth.id, 1, this.getColor()), 0);
    }
  }

  protected override getDeathLoot(): number {
    return Tile.cloth.id;
  }

  protected override jumpFromGround(): void {
    if (this.eatAnimationTick <= 0) {
      super.jumpFromGround();
    }
  }

  protected override updateAi(): void {
    super.updateAi();
    if (
      !this.isPathFinding() &&
      this.eatAnimationTick <= 0 &&
      ((this.isBaby() && this.random.nextInt(50) === 0) || this.random.nextInt(1000) === 0)
    ) {
      const xx = Mth.floor(this.x);
      const yy = Mth.floor(this.y);
      const zz = Mth.floor(this.z);
      if (
        (this.level.getTile(xx, yy, zz) === Tile.tallgrass.id &&
          this.level.getData(xx, yy, zz) === TallGrass.TALL_GRASS) ||
        this.level.getTile(xx, yy - 1, zz) === Tile.grass.id
      ) {
        this.eatAnimationTick = Sheep.EAT_ANIMATION_TICKS;
        this.level.broadcastEntityEvent(this, EntityEvent.EAT_GRASS);
      }
    } else if (this.eatAnimationTick === 4) {
      const xx = Mth.floor(this.x);
      const yy = Mth.floor(this.y);
      const zz = Mth.floor(this.z);
      let ate = false;
      if (this.level.getTile(xx, yy, zz) === Tile.tallgrass.id) {
        this.level.levelEvent(
          null,
          LevelEvent.PARTICLES_DESTROY_BLOCK,
          xx,
          yy,
          zz,
          Tile.tallgrass.id + TallGrass.TALL_GRASS * 256,
        );
        this.level.setTile(xx, yy, zz, 0);
        ate = true;
      } else if (this.level.getTile(xx, yy - 1, zz) === Tile.grass.id) {
        this.level.levelEvent(
          null,
          LevelEvent.PARTICLES_DESTROY_BLOCK,
          xx,
          yy - 1,
          zz,
          Tile.grass.id,
        );
        this.level.setTile(xx, yy - 1, zz, Tile.dirt.id);
        ate = true;
      }
      if (ate) {
        this.setSheared(false);
        if (this.isBaby()) {
          let age = this.getAge() + SharedConstants.TicksPerSecond * 60;
          if (age > 0) {
            age = 0;
          }
          this.setAge(age);
        }
      }
    }
  }

  protected override shouldHoldGround(): boolean {
    return this.eatAnimationTick > 0;
  }

  protected override getAmbientSound(): string | null {
    return 'mob.sheep';
  }

  protected override getHurtSound(): string {
    return 'mob.sheep';
  }

  protected override getDeathSound(): string {
    return 'mob.sheep';
  }
}
