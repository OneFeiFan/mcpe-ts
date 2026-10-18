// 1:1 移植自 src/world/entity/item/ItemEntity.h 与 ItemEntity.cpp
import { Entity, registerItemEntityClass } from '../Entity';
import { Level } from '../../level/Level';
import type { Player } from '../player/Player';
import { ItemInstance } from '../../item/ItemInstance';
import { Material } from '../../level/material/Material';
import { Tile } from '../../level/tile/Tile';
import { SharedConstants } from '@mcpe/core';
import { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import { EntityTypes } from '../EntityTypes';
import { EntityRendererId } from '../EntityRendererId';

const f = Math.fround;
export class ItemEntity extends Entity {
  public static readonly LIFETIME: number = 5 * 60 * SharedConstants.TicksPerSecond;
  public item: ItemInstance;
  public age: number;
  public throwTime: number;
  public bobOffs: number;

  private itemTickCount: number;
  private health: number;
  private lifeTime: number;

  /** C++ ItemEntity::ItemEntity(Level*, float, float, float, const ItemInstance&) */
  constructor(level: Level, x: number, y: number, z: number, item: ItemInstance);
  /** C++ ItemEntity::ItemEntity(Level*) */
  constructor(level: Level);
  constructor(level: Level, x?: number, y?: number, z?: number, item?: ItemInstance) {
    super(level);

    this.health = 5;
    this.age = 0;
    this.itemTickCount = 0;
    this.throwTime = 0;
    this.lifeTime = ItemEntity.LIFETIME;
    // 初始化列表里的 bobOffs 先消耗一次 Mth::random()
    this.bobOffs = Mth.random() * Mth.PI * 2;

    this.entityRendererId = EntityRendererId.ER_ITEM_RENDERER;

    this.setSize(0.25, 0.25);
    this.heightOffset = this.bbHeight / 2.0;

    if (x !== undefined) {
      // 五参数构造：item 按值拷贝，位置和速度随机
      this.item = new ItemInstance(item!);
      this.setPos(x, y!, z!);

      this.yRot = Mth.random() * 360;
      this.xd = Mth.random() * 0.2 - 0.1;
      this.yd = +0.2;
      this.zd = Mth.random() * 0.2 - 0.1;
      this.makeStepSound = false;
    } else {
      // 三参数构造：item 走默认构造
      this.item = new ItemInstance();
      // 不调 setPos
    }
  }

  /** C++ ItemEntity::tick() */
  override tick(): void {
    super.tick();
    if (this.throwTime > 0) this.throwTime--;
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;

    // 速度是 float（审核：以前按 double 算，与 C++ 差末位；G12-2 黄金样本现在逐位一致）
    this.yd = f(this.yd - f(0.04));

    const fx = Mth.floor(this.x);
    const fy = Mth.floor(this.y);
    const fz = Mth.floor(this.z);
    if (this.level.getMaterial(fx, fy, fz) === Material.lava) {
      this.yd = f(0.2);
      this.xd = f(
        f(ItemEntity.sharedRandom.nextFloat() - ItemEntity.sharedRandom.nextFloat()) * f(0.2),
      );
      this.zd = f(
        f(ItemEntity.sharedRandom.nextFloat() - ItemEntity.sharedRandom.nextFloat()) * f(0.2),
      );
      this.level.playSound(
        this,
        'random.fizz',
        0.4,
        f(2.0 + f(ItemEntity.sharedRandom.nextFloat() * f(0.4))),
      );
    }

    this.checkInTile(this.x, this.y, this.z);
    this.move(this.xd, this.yd, this.zd);

    let friction = f(0.98);
    if (this.onGround) {
      friction = f(f(0.6) * f(0.98));
      const t = this.level.getTile(Mth.floor(this.x), Mth.floor(this.bb.y0) - 1, Mth.floor(this.z));
      if (t > 0) {
        friction = f(Tile.tiles[t]!.friction * f(0.98));
      }
    }

    this.xd = f(this.xd * friction);
    this.yd = f(this.yd * f(0.98));
    this.zd = f(this.zd * friction);

    if (this.onGround) {
      this.yd = f(this.yd * -0.5);
    }

    this.tickCount++;
    this.age++;
    if (this.age >= this.lifeTime) {
      this.remove();
    }
  }

  /** C++ ItemEntity::isInWater() */
  override isInWater(): boolean {
    return this.level.checkAndHandleWater(this.bb, Material.water, this);
  }

  /** C++ ItemEntity::hurt(Entity*, int) */
  override hurt(_source: Entity | null, damage: number): boolean {
    this.markHurt();
    this.health -= damage;
    if (this.health <= 0) {
      this.remove();
    }
    return false;
  }

  /** C++ ItemEntity::playerTouch(Player*) */
  override playerTouch(player: Player): void {
    if (this.level.isClientSide) return;

    const orgCount = this.item.count;
    if (this.throwTime === 0 && player.isAlive() && player.inventory.add(this.item)) {
      this.level.playSound(
        this,
        'random.pop',
        0.3,
        ((ItemEntity.sharedRandom.nextFloat() - ItemEntity.sharedRandom.nextFloat()) * 0.7 + 1.0) *
          2.0,
      );
      player.take(this, orgCount);
      this.remove();
    }
  }

  /** C++ ItemEntity::burn(int) — protected */
  protected override burn(dmg: number): void {
    this.hurt(null, dmg);
  }

  /** C++ ItemEntity::checkInTile(float, float, float) — private */
  private checkInTile(x: number, y: number, z: number): boolean {
    const xTile = Mth.floor(x);
    const yTile = Mth.floor(y);
    const zTile = Mth.floor(z);

    const xd = x - xTile;
    const yd = y - yTile;
    const zd = z - zTile;

    if (Tile.solid[this.level.getTile(xTile, yTile, zTile)] === true) {
      const west = Tile.solid[this.level.getTile(xTile - 1, yTile, zTile)] !== true;
      const east = Tile.solid[this.level.getTile(xTile + 1, yTile, zTile)] !== true;
      const up = Tile.solid[this.level.getTile(xTile, yTile - 1, zTile)] !== true;
      const down = Tile.solid[this.level.getTile(xTile, yTile + 1, zTile)] !== true;
      const north = Tile.solid[this.level.getTile(xTile, yTile, zTile - 1)] !== true;
      const south = Tile.solid[this.level.getTile(xTile, yTile, zTile + 1)] !== true;

      let dir = -1;
      let closest = 9999;
      if (west && xd < closest) {
        closest = xd;
        dir = 0;
      }
      if (east && 1 - xd < closest) {
        closest = 1 - xd;
        dir = 1;
      }
      if (up && yd < closest) {
        closest = yd;
        dir = 2;
      }
      if (down && 1 - yd < closest) {
        closest = 1 - yd;
        dir = 3;
      }
      if (north && zd < closest) {
        closest = zd;
        dir = 4;
      }
      if (south && 1 - zd < closest) {
        // C++ 里 closest = 1 - zd; 被注释掉了（//@note: not read）
        dir = 5;
      }

      const speed = ItemEntity.sharedRandom.nextFloat() * 0.2 + 0.1;
      if (dir === 0) this.xd = -speed;
      if (dir === 1) this.xd = +speed;
      if (dir === 2) this.yd = -speed;
      if (dir === 3) this.yd = +speed;
      if (dir === 4) this.zd = -speed;
      if (dir === 5) this.zd = +speed;
    }

    return false;
  }

  /** C++ ItemEntity::addAdditonalSaveData(CompoundTag*) — protected，注意拼写 */
  protected override addAdditonalSaveData(entityTag: CompoundTag): void {
    // C++: putShort("Health", (char) health)
    entityTag.putShort('Health', (this.health << 24) >> 24); // (char) 是有符号的：-1 写成 -1，而不是 255
    entityTag.putShort('Age', this.age);
    entityTag.putCompound('Item', this.item.save(new CompoundTag()));
  }

  /** C++ ItemEntity::readAdditionalSaveData(CompoundTag*) — protected */
  protected override readAdditionalSaveData(tag: CompoundTag): void {
    this.health = tag.getShort('Health') & 0xff;
    this.age = tag.getShort('Age');
    const itemTag = tag.getCompound('Item');
    this.item.load(itemTag);
  }

  /** C++ ItemEntity::isItemEntity() */
  override isItemEntity(): boolean {
    return true;
  }

  /** C++ ItemEntity::getEntityTypeId() */
  override getEntityTypeId(): number {
    return EntityTypes.IdItemEntity;
  }

  /** C++ ItemEntity::getLifeTime() */
  getLifeTime(): number {
    return this.lifeTime;
  }
}

registerItemEntityClass(ItemEntity); // 见 Entity.ts 的 registerItemEntityClass（ADAPTED(ESM)）
