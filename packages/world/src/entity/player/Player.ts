/**
 * 1:1 移植自 src/world/entity/player/Player.h 与 Player.cpp（S12 阶段 C，部分移植）。替换前向声明。
 * 部分：容器界面（ContainerMenu、合成、熔炉界面）、网络包、睡觉相关的界面提示 DEFERRED。
 * 由 C++ 类转写脚本生成初稿后逐个函数人工核对。
 */
import type { BaseContainerMenu } from '../../inventory/BaseContainerMenu';
import { LOGI } from '@mcpe/platform';
import { CompoundTag, ListTag, TAG_Compound, TAG_List } from '@mcpe/nbt';
import { Mth, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '@mcpe/util';
import { SharedConstants } from '@mcpe/core';
import { Entity } from '../Entity';
import { EntityEvent } from '../EntityEvent';
import { Mob } from '../Mob';
import { ItemEntity } from '../item/ItemEntity';
import { SimpleFoodData } from '../../food/SimpleFoodData';
import { Inventory } from './Inventory';
import { Abilities } from './Abilities';
import { ItemInstance } from '../../item/ItemInstance';
import { Item } from '../../item/Item';
import type { Level } from '../../level/Level';
import { Tile } from '../../level/tile/Tile';
import { TileEntity } from '../../level/tile/entity/TileEntity';
import { Pos } from '../../Pos';
import { Vec3 } from '../../phys/Vec3';
import { AABB } from '../../phys/AABB';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes, EntityTypes } from '../EntityTypes';
import { SharedFlagsInformation } from '../SharedFlags';
import { Difficulty } from '../../Difficulty';
import { BowItem } from '../../item/BowItem';
import type { ArmorItem } from '../../item/ArmorItem';
import { UseAnim } from '../../item/UseAnim';
import { BedTile } from '../../level/tile/BedTile';
import { Direction } from '../../Direction';
import type { ChestTileEntity } from '../../level/tile/entity/ChestTileEntity';
import type { FurnaceTileEntity } from '../../level/tile/entity/FurnaceTileEntity';

const f = Math.fround;

/** Player.cpp 的文件内静态函数 saveArmor */
function saveArmor(armor: ItemInstance[]): ListTag {
  const listTag = new ListTag();
  for (let i = 0; i < 4; ++i) {
    const tag = new CompoundTag();
    armor[i]!.save(tag);
    listTag.add(tag);
  }
  return listTag;
}

/** Player.cpp 的文件内静态函数 loadArmor */
function loadArmor(armor: ItemInstance[], listTag: ListTag | null): void {
  if (!listTag) return;
  const count = Mth.Min(4, listTag.size());
  for (let i = 0; i < count; ++i) {
    const tag = listTag.get(i)!;
    if (tag.getId() !== TAG_Compound) continue;
    armor[i]!.load(tag as CompoundTag);
  }
}

export class BedSleepingResult {
  static readonly OK = 0;
  static readonly NOT_POSSIBLE_HERE = 1;
  static readonly NOT_POSSIBLE_NOW = 2;
  static readonly TOO_FAR_AWAY = 3;
  static readonly OTHER_PROBLEM = 4;
  static readonly NOT_SAFE = 5;
}

export abstract class Player extends Mob {
  private static readonly DATA_PLAYER_FLAGS_ID = 16;
  private static readonly DATA_BED_POSITION_ID = 17;
  private static readonly PLAYER_SLEEP_FLAG = 1;
  static readonly MAX_NAME_LENGTH = 16;
  protected static readonly NUM_ARMOR = 4;
  static readonly MAX_HEALTH = 20;
  static readonly DEFAULT_WALK_SPEED = f(0.1); // Player.cpp:20 const float Player::DEFAULT_WALK_SPEED = 0.1f
  static readonly DEFAULT_FLY_SPEED = f(0.02); // Player.cpp:21 const float Player::DEFAULT_FLY_SPEED = 0.02f
  static readonly SLEEP_DURATION = 100;
  static readonly WAKE_UP_DURATION = 10;
  inventory!: Inventory;
  userType: number = 0;
  score: number = 0;
  oBob: number = 0;
  bob: number = 0;
  name: string = '';
  dimension: number = 0;
  abilities = new Abilities();
  foodData = new SimpleFoodData();
  containerMenu: BaseContainerMenu | null = null;
  owner: unknown = null; // DEFERRED(Network)：RakNet::RakNetGUID
  hasFakeInventory: boolean = false;
  bedPosition = new Pos();
  bedOffsetX: number = 0;
  bedOffsetY: number = 0;
  bedOffsetZ: number = 0;
  protected useItem = new ItemInstance();
  protected useItemDuration: number = 0;
  protected sleepCounter: number = 0;
  private respawnPosition = new Pos(0, -1, 0);
  private armor: ItemInstance[] = Array.from(
    { length: Player.NUM_ARMOR },
    () => new ItemInstance(),
  );
  private playerHasRespawnPosition: boolean = false;
  private playerIsSleeping: boolean = false;
  private allPlayersSleeping: boolean = false;

  override getEntityTypeId(): number {
    return 0;
  }

  constructor(level: Level, isCreative: boolean) {
    // ADAPTED(Cpp)：C++ 在构造函数里调用虚函数时只会调到本类（Player）的版本；JS 会派发到子类，所以显式调用 Player.prototype 上的版本。
    super(level);
    this.userType = 0;
    this.playerHasRespawnPosition = false;
    this.hasFakeInventory = false;
    this.containerMenu = null;
    this.useItemDuration = 0;
    this.playerIsSleeping = false;
    this.sleepCounter = 0;
    this.bedOffsetX = 0;
    this.bedOffsetY = 0;
    this.bedOffsetZ = 0;
    this.respawnPosition = new Pos(0, -1, 0);
    this.allPlayersSleeping = false;
    this.canRemove = false;

    Player.prototype._init.call(this);
    this.entityRendererId = EntityRendererId.ER_PLAYER_RENDERER;

    this.autoSendPosRot = false;
    this.inventory = new Inventory(this, isCreative);

    this.heightOffset = f(1.62);

    let spawnPos = level.getSharedSpawnPos();
    this.moveTo(spawnPos.x + 0.5, spawnPos.y + 1, spawnPos.z + 0.5, 0, 0);

    this.health = Player.MAX_HEALTH;
    this.modelName = 'humanoid';
    this.rotOffs = 180;
    this.flameTime = 20;

    this.textureName = 'mob/char.png';
    this.entityData.defineByte(Player.DATA_PLAYER_FLAGS_ID, 0);
    this.entityData.definePos(Player.DATA_BED_POSITION_ID, new Pos());
  }

  // OMIT(Player): ~Player()  Player.cpp:69 —— 函数体只有 `delete inventory;`，JS 由 GC 接管。
  override _init(): void {
    this.oBob = this.bob = 0;
    this.swinging = false;
    this.swingTime = 0;
    this.score = 0;
  }

  override reset(): void {
    super.reset();
    Player.prototype._init.call(this); // C++ 的 _init 不是 virtual：Player::reset 里调的是 Player::_init 本身（不能派发到子类）
  }

  override isPlayer(): boolean {
    return true;
  }

  /** C++ 的 static bool isPlayer(Entity*) */
  static isPlayer(e: Entity | null): boolean {
    return e !== null && e.isPlayer();
  }

  /** C++ 的 static Player* asPlayer(Entity*) */
  static asPlayer(e: Entity | null): Player | null {
    return Player.isPlayer(e) ? (e as Player) : null;
  }

  override tick(): void {
    let shouldSleep = this.entityData.getFlag(
      Player.DATA_PLAYER_FLAGS_ID,
      Player.PLAYER_SLEEP_FLAG,
    );
    if (shouldSleep !== this.isSleeping()) {
      if (this.isSleeping()) {
        this.stopSleepInBed(true, true, true);
      } else {
        this.bedPosition = this.entityData.getPos(Player.DATA_BED_POSITION_ID);
        this.startSleepInBed(this.bedPosition.x, this.bedPosition.y, this.bedPosition.z);
      }
    }
    if (this.isSleeping()) {
      this.sleepCounter++;
      if (this.sleepCounter > Player.SLEEP_DURATION) {
        this.sleepCounter = Player.SLEEP_DURATION;
      }
      if (!this.level.isClientSide) {
        if (!this.checkBed()) {
          this.stopSleepInBed(true, true, false);
        } else if (this.level.isDay()) {
          this.stopSleepInBed(false, true, true);
        }
      }
    } else if (this.sleepCounter > 0) {
      this.sleepCounter++;
      if (this.sleepCounter >= Player.SLEEP_DURATION + Player.WAKE_UP_DURATION) {
        this.sleepCounter = 0;
      }
    }
    super.tick();

    if (!this.level.isClientSide) {
      if (this.level.containsFireTile(this.bb)) {
        this.hurt(null, 1);

        if (!this.isInWater()) {
          if (this.onFire <= 0) {
            this.onFire = 20 * 15;
          }
        }
      }

      this.foodData.tick(this);
    }
  }

  override aiStep(): void {
    if (this.level.difficulty === Difficulty.PEACEFUL && this.health < Player.MAX_HEALTH) {
      if (this.tickCount % (12 * SharedConstants.TicksPerSecond) === 0) this.heal(1);
    }

    this.oBob = this.bob;

    let tBob = Mth.sqrt(f(f(this.xd * this.xd) + f(this.zd * this.zd)));
    let tTilt = f(Mth.atan(f(-this.yd * f(0.2))) * f(15));
    if (tBob > f(0.1)) tBob = f(0.1);
    if (!this.onGround || this.hasDied()) tBob = 0;
    if (this.onGround || this.hasDied()) tTilt = 0;
    this.bob = f(this.bob + f(f(tBob - this.bob) * f(0.4)));
    this.tilt = f(this.tilt + f(f(tTilt - this.tilt) * f(0.8)));

    if (this.health > 0) {
      let entities = this.level.getEntities(this, this.bb.grow(1, 0, 1));
      for (let i = 0; i < entities.length; i++) {
        let e = entities[i]!;
        if (!e.removed) {
          this.touch(e);
        }
      }
    }
  }

  override travel(xa: number, ya: number): void {
    if (this.abilities.flying) {
      let ydo = this.yd;
      let ofs = this.flyingSpeed;
      this.flyingSpeed = f(0.05);
      super.travel(xa, ya);
      this.yd = f(ydo * f(0.6));
      this.flyingSpeed = ofs;
    } else {
      super.travel(xa, ya);
    }
  }

  override getWalkingSpeedModifier(): number {
    return 1.0;
  }

  override die(source: Entity | null): void {
    super.die(source);
    this.setSize(0.2, 0.2);
    this.setPos(this.x, this.y, this.z);
    this.yd = f(0.1);

    if (source !== null) {
      const angle = f(f(f(this.hurtDir + this.yRot) * Mth.PI) / f(180));
      this.xd = f(-Mth.cos(angle) * f(0.1));
      this.zd = f(-Mth.sin(angle) * f(0.1));
    } else {
      this.xd = this.zd = 0;
    }
    this.heightOffset = f(0.1);
  }

  override remove(): void {
    this.invisible = true;
    super.remove();
  }

  respawn(): void {}

  override resetPos(clearMore: boolean): void {
    if (!this.isSleeping()) {
      this.heightOffset = f(1.62);
      this.setSize(0.6, 1.8);
      super.resetPos(clearMore);
    }
    this.invisible = false;

    if (clearMore) {
      this.health = this.getMaxHealth();
      this.deathTime = 0;
      this.playerIsSleeping = false;
    }
  }

  getRespawnPosition(): Pos {
    // C++ 按值返回 Pos；返回内部对象的引用会让调用方改到成员。
    return this.respawnPosition.clone();
  }

  setRespawnPosition(respawnPosition: Pos): void {
    if (respawnPosition.y < 0) {
      this.playerHasRespawnPosition = false;
    } else {
      this.playerHasRespawnPosition = true;
    }
    // C++ 的成员是 Pos respawnPosition（按值），这里复制一份（审核 V1）
    this.respawnPosition = new Pos(respawnPosition.x, respawnPosition.y, respawnPosition.z);
  }

  override isShootable(): boolean {
    return true;
  }

  override isCreativeModeAllowed(): boolean {
    return true;
  }

  override isInWall(): boolean {
    return super.isInWall();
  }

  hasResource(id: number): boolean {
    return this.inventory.hasResource(id);
  }

  isUsingItem(): boolean {
    return !this.useItem.isNull();
  }

  getUseItem(): ItemInstance | null {
    return this.useItem;
  }

  startUsingItem(instance: ItemInstance, duration: number): void {
    // C++ 的参数与成员都是按值的 ItemInstance：`instance == useItem` 是 operator==（比较内容），`useItem = instance` 是复制。
    // 以前这里存的是引用——吃完一口后 stopUsingItem 的 useItem.setNull() 会把背包里的那一叠清成 id 0、数量 0，
    // 下次右键 getSelected() 拿到它，getItem() 为 null，ItemInstance.use 崩溃（PITFALLS 第 10 条：按值语义）。
    if (instance.equals(this.useItem)) return;
    this.useItem = new ItemInstance(instance);
    this.useItemDuration = duration;
    if (!this.level.isClientSide) {
      this.setSharedFlag(SharedFlagsInformation.FLAG_USINGITEM, true);
    }
  }

  stopUsingItem(): void {
    if (this.getCarriedItem() !== null && this.useItem.id === this.getCarriedItem()!.id)
      this.getCarriedItem()!.setAuxValue(this.useItem.getAuxValue());
    this.useItem.setNull();
    this.useItemDuration = 0;
    if (!this.level.isClientSide) {
      this.setSharedFlag(SharedFlagsInformation.FLAG_USINGITEM, false);
    }
  }

  releaseUsingItem(): void {
    if (!this.useItem.isNull()) {
      this.useItem.releaseUsing(this.level, this, this.useItemDuration);
    }
    this.stopUsingItem();
  }

  completeUsingItem(): void {
    if (!this.useItem.isNull()) {
      this.spawnEatParticles(this.useItem, 10);

      let selected = this.inventory.getSelected();
      let doOverwrite = selected && ItemInstance.matches(this.useItem, selected);

      let itemInstance = this.useItem.useTimeDepleted(this.level, this);

      if (doOverwrite) {
        selected!.init(this.useItem.id, this.useItem.count, this.useItem.getAuxValue()); // *selected = useItem（按值赋值）
        if (selected!.count === 0) this.inventory.clearSlot(this.inventory.selected);
      }

      this.stopUsingItem();
    }
  }

  override getUseItemDuration(): number {
    return this.useItemDuration;
  }

  getTicksUsingItem(): number {
    if (this.isUsingItem()) {
      return this.useItem.getUseDuration() - this.useItemDuration;
    }
    return 0;
  }

  getScore(): number {
    return this.score;
  }

  override awardKillScore(victim: Entity, score: number): void {
    this.score += score;
  }

  override handleEntityEvent(id: number): void {
    if (id === EntityEvent.USE_ITEM_COMPLETE) {
      this.completeUsingItem();
    } else {
      super.handleEntityEvent(id);
    }
  }

  take(e: Entity, orgCount: number): void {}

  drop(item: ItemInstance, randomly: boolean): void {
    if (item === null || item.isNull()) return;

    let thrownItem = new ItemEntity(
      this.level,
      this.x,
      f(f(this.y - f(0.3)) + this.getHeadHeight()),
      this.z,
      new ItemInstance(item),
    ); // *item（按值复制）
    // { delete item; item = NULL; }（交给垃圾回收）
    thrownItem.throwTime = 20 * 2;

    let pow = f(0.1);
    if (randomly) {
      let _pow = f(this.random.nextFloat() * f(0.5));
      let dir = f(f(this.random.nextFloat() * Mth.PI) * f(2));
      thrownItem.xd = f(-Mth.sin(dir) * _pow);
      thrownItem.zd = f(Mth.cos(dir) * _pow);
      thrownItem.yd = f(0.2);
    } else {
      pow = f(0.3);
      // C++ 的 yRot / 180 是 float 除法；Mth::sin / cos 的实参本身会先转 float。
      const yAngle = f(f(this.yRot / f(180)) * Mth.PI);
      const xAngle = f(f(this.xRot / f(180)) * Mth.PI);
      thrownItem.xd = f(f(-Mth.sin(yAngle) * Mth.cos(xAngle)) * pow);
      thrownItem.zd = f(f(Mth.cos(yAngle) * Mth.cos(xAngle)) * pow);
      thrownItem.yd = f(f(-Mth.sin(xAngle) * pow) + f(0.1));
      pow = f(0.02);

      let dir = f(f(this.random.nextFloat() * Mth.PI) * f(2));
      pow = f(pow * this.random.nextFloat());
      thrownItem.xd = f(thrownItem.xd + f(Mth.cos(dir) * pow));
      // C++ 的 `(random.nextFloat() - random.nextFloat())` 两个实参的求值顺序未指定；沿用 Entity/Mob/ItemEntity 的先例按从左到右。
      thrownItem.yd = f(
        thrownItem.yd + f(f(this.random.nextFloat() - this.random.nextFloat()) * f(0.1)),
      );
      thrownItem.zd = f(thrownItem.zd + f(Mth.sin(dir) * pow));
    }

    this.level.addEntity(thrownItem);
  }

  canDestroy(tile: Tile): boolean {
    return this.inventory.canDestroy(tile);
  }

  getDestroySpeed(tile: Tile): number {
    let speed = this.inventory.getDestroySpeed(tile);

    return speed;
  }

  override getMaxHealth(): number {
    return Player.MAX_HEALTH;
  }

  isHurt(): boolean {
    return this.health > 0 && this.health < this.getMaxHealth();
  }

  override hurt(source: Entity | null, dmg: number): boolean {
    if (this.abilities.invulnerable) return false;

    this.noActionTime = 0;
    if (this.hasDied()) return false;
    if (this.isSleeping() && !this.level.isClientSide) {
      this.stopSleepInBed(true, true, false);
    }

    if (
      source !== null &&
      (source.getCreatureBaseType() === MobTypes.BaseEnemy ||
        source.getEntityTypeId() === EntityTypes.IdArrow)
    ) {
      if (source.isMob() && this.level.adventureSettings.noMvP) return false;

      if (this.level.difficulty === Difficulty.PEACEFUL) dmg = 0;
      // C++ 的 dmg 是 int：dmg / 3、dmg * 3 / 2 都是整数运算
      else if (this.level.difficulty === Difficulty.EASY) dmg = Math.trunc(dmg / 3) + 1;
      else if (this.level.difficulty === Difficulty.HARD) dmg = Math.trunc((dmg * 3) / 2);
    }

    if (dmg === 0) return false;

    return super.hurt(source, dmg);
  }

  override hurtArmor(dmg: number): void {
    // C++ 的 dmg 是 int：dmg / 4 是整数除法
    dmg = Mth.Max(1, Math.trunc(dmg / 4));

    for (let i = 0; i < Player.NUM_ARMOR; i++) {
      let item = this.armor[i]!;
      if (!ItemInstance.isArmorItem(item)) continue;

      item.hurt(dmg);
      if (item.count === 0) {
        item.setNull();
      }
    }
  }

  setArmor(slot: number, item: ItemInstance | null): void {
    if (item === null) this.armor[slot]!.setNull();
    else {
      this.armor[slot] = new ItemInstance(item); // this.armor[slot] = *item
    }
  }

  getArmor(slot: number): ItemInstance | null {
    if (slot < 0 || slot >= Player.NUM_ARMOR) return null;

    if (this.armor[slot]!.isNull()) return null;

    return this.armor[slot]!;
  }

  getArmorTypeHash(): number {
    return (
      this.armor[0]!.id +
      (this.armor[1]!.id << 8) +
      (this.armor[2]!.id << 16) +
      (this.armor[3]!.id << 24)
    );
  }

  /** C++ Player::interact(Entity*)：与 Entity::interact(Player*) 不同（R10 情形 B） */
  interactWith(entity: Entity): void {
    if (entity.interact(this)) return;
    let item = this.inventory.getSelected();
    if (item !== null && entity.isMob()) {
      item.interactEnemy(entity as Mob);
      if (item.count <= 0) {
        this.inventory.clearSlot(this.inventory.selected);
      }
    }
  }

  attack(entity: Entity): void {
    let dmg = this.inventory.getAttackDamage(entity);
    if (dmg > 0) {
      entity.hurt(this, dmg);
      let item = this.inventory.getSelected();
      if (item !== null && entity.isMob() && this.abilities.instabuild !== true) {
        item.hurtEnemy(entity as Mob);
        if (item.count <= 0) {
          this.inventory.clearSlot(this.inventory.selected);
        }
      }
    }
  }

  override getCarriedItem(): ItemInstance | null {
    return this.inventory.getSelected();
  }

  canUseCarriedItemWhileMoving(): boolean {
    let item = this.getCarriedItem();
    return item !== null && (item.id === Item.bow.id || item.getItem()!.isFood());
  }

  startCrafting(x: number, y: number, z: number, tableSize: number): void {}

  startStonecutting(x: number, y: number, z: number): void {}

  openContainer(_container: ChestTileEntity): void {}

  openFurnace(_e: FurnaceTileEntity): void {}

  tileEntityDestroyed(tileEntityId: number): void {
    if (!this.containerMenu) return;

    if (this.containerMenu.tileEntityDestroyedIsInvalid(tileEntityId)) this.closeContainer();
  }

  displayClientMessage(messageId: string): void {}

  protected static animateRespawnFor(_player: Player, _level: Level): void {
    // C++ 的 static animateRespawn(Player*, Level*)（R10）
  }

  animateRespawn(): void {}

  override getHeadHeight(): number {
    return f(0.12); // Player.cpp:647 return 0.12f
  }

  override getItemInHandIcon(item: ItemInstance, layer: number): number {
    let icon = item.getIcon();
    if (this.useItem.id !== 0 && item.id === Item.bow.id) {
      let ticksHeld = item.getUseDuration() - this.useItemDuration;
      if (ticksHeld >= BowItem.MAX_DRAW_DURATION - 2) {
        return 5 + 8 * 16;
      }
      // C++ 两边都是 int：(2 * MAX_DRAW_DURATION) / 3 = 40 / 3 = 13
      if (ticksHeld > Math.trunc((2 * BowItem.MAX_DRAW_DURATION) / 3)) {
        return 5 + 7 * 16;
      }
      if (ticksHeld > 0) {
        return 5 + 6 * 16;
      }
    }
    return icon;
  }

  override isSleeping(): boolean {
    return this.playerIsSleeping;
  }

  startSleepInBed(x: number, y: number, z: number): number {
    if (!this.level.isClientSide) {
      if (this.isSleeping() || !this.isAlive()) {
        return BedSleepingResult.OTHER_PROBLEM;
      }
      if (Mth.abs(this.x - x) > 3 || Mth.abs(this.y - y) > 4 || Mth.abs(this.z - z) > 3) {
        return BedSleepingResult.TOO_FAR_AWAY;
      }
      if (this.level.dimension.isNaturalDimension()) {
        return BedSleepingResult.NOT_POSSIBLE_HERE;
      }
      if (this.level.isDay()) {
        return BedSleepingResult.NOT_POSSIBLE_NOW;
      }
      let hRange = 8;
      let vRange = 5;
      let monsters: Entity[] = [];
      this.level.getEntitiesOfClass(
        MobTypes.BaseEnemy,
        new AABB(x - hRange, y - vRange, z - hRange, x + hRange, y + vRange, z + hRange),
        monsters,
      );
      if (!(monsters.length === 0)) {
        return BedSleepingResult.NOT_SAFE;
      }
    }

    this.setSize(0.2, 0.2);
    this.heightOffset = f(0.2);
    if (this.level.hasChunkAt(x, y, z)) {
      let data = this.level.getData(x, y, z);
      let direction = BedTile.getDirection(data);
      let xo = f(0.5),
        zo = f(0.5);
      switch (direction) {
        case Direction.SOUTH:
          zo = f(0.9);
          break;
        case Direction.NORTH:
          zo = f(0.1);
          break;
        case Direction.WEST:
          xo = f(0.1);
          break;
        case Direction.EAST:
          xo = f(0.9);
          break;
      }
      this.setBedOffset(direction);
      this.setPos(f(f(x) + xo), f(f(y) + f(15.0 / 16.0)), f(f(z) + zo));
    } else {
      this.setPos(f(f(x) + f(0.5)), f(f(y) + f(1.0 / 16.0)), f(f(z) + f(0.5)));
    }
    this.playerIsSleeping = true;
    this.sleepCounter = 0;
    this.bedPosition = new Pos(x, y, z);
    this.xd = this.zd = this.yd = 0;
    if (!this.level.isClientSide) {
      this.level.updateSleepingPlayerList();
    }
    this.entityData.setPos(Player.DATA_BED_POSITION_ID, this.bedPosition);
    this.entityData.setFlag(Player.DATA_PLAYER_FLAGS_ID, Player.PLAYER_SLEEP_FLAG);
    return BedSleepingResult.OK;
  }

  stopSleepInBed(
    forcefulWakeUp: boolean,
    updateLevelList: boolean,
    saveRespawnPoint: boolean,
  ): void {
    if (!this.isSleeping()) return;
    this.setSize(0.6, 1.8);
    this.setDefaultHeadHeight();
    // C++: `Pos standUp = bedPosition;` 是值拷贝。以前这里直接引用 bedPosition，
    // findStandUpPosition 通过输出参数改掉 standUp 时会把 this.bedPosition 一起改掉。
    let standUp = this.bedPosition.clone();
    if (
      this.level.getTile(
        Math.trunc(this.bedPosition.x),
        Math.trunc(this.bedPosition.y),
        Math.trunc(this.bedPosition.z),
      ) === Tile.bed.id
    ) {
      BedTile.setOccupied(
        this.level,
        Math.trunc(this.bedPosition.x),
        Math.trunc(this.bedPosition.y),
        Math.trunc(this.bedPosition.z),
        false,
      );
      let foundStandUpPosition = BedTile.findStandUpPosition(
        this.level,
        Math.trunc(this.bedPosition.x),
        Math.trunc(this.bedPosition.y),
        Math.trunc(this.bedPosition.z),
        0,
        standUp,
      );
      if (!foundStandUpPosition) {
        standUp = new Pos(this.bedPosition.x, this.bedPosition.y, this.bedPosition.z);
      }
      this.setPos(
        f(standUp.x + f(0.5)),
        f(f(f(standUp.y) + this.heightOffset) + f(0.1)),
        f(standUp.z + f(0.5)),
      );
    }
    this.playerIsSleeping = false;
    if (!this.level.isClientSide && updateLevelList) {
      this.level.updateSleepingPlayerList();
    }
    if (forcefulWakeUp) {
      this.sleepCounter = 0;
    } else {
      this.sleepCounter = Player.SLEEP_DURATION;
    }

    if (true || saveRespawnPoint) {
      let newRespawnPos = new Pos();
      BedTile.findStandUpPosition(
        this.level,
        this.bedPosition.x,
        this.bedPosition.y,
        this.bedPosition.z,
        0,
        newRespawnPos,
      );
      this.setRespawnPosition(newRespawnPos);
    }
    this.entityData.clearFlag(Player.DATA_PLAYER_FLAGS_ID, Player.PLAYER_SLEEP_FLAG);
    this.allPlayersSleeping = false;
  }

  getSleepTimer(): number {
    return this.allPlayersSleeping ? this.sleepCounter : 0;
  }

  setAllPlayersSleeping(): void {
    this.sleepCounter = 0;
    this.allPlayersSleeping = true;
  }

  getSleepRotation(): number {
    if (this.isSleeping()) {
      let data = this.level.getData(this.bedPosition.x, this.bedPosition.y, this.bedPosition.z);
      let direction = BedTile.getDirection(data);
      switch (direction) {
        case Direction.SOUTH:
          return 90;
        case Direction.WEST:
          return 0;
        case Direction.NORTH:
          return 270;
        case Direction.EAST:
          return 180;
      }
    }
    return 0;
  }

  isSleepingLongEnough(): boolean {
    return this.isSleeping() && this.sleepCounter >= Player.SLEEP_DURATION;
  }

  getSelectedItem(): ItemInstance | null {
    return this.inventory.getSelected();
  }

  hasRespawnPosition(): boolean {
    return this.playerHasRespawnPosition;
  }

  openTextEdit(tileEntity: TileEntity): void {}

  override getArmorValue(): number {
    let val = 0;

    for (let i = 0; i < Player.NUM_ARMOR; i++) {
      let item = this.armor[i]!;
      if (!ItemInstance.isArmorItem(item)) continue;

      let baseProtection = (item.getItem() as ArmorItem).defense; // ((ArmorItem*)item->getItem())->defense
      val += baseProtection;
    }
    return val;
  }

  protected override isImmobile(): boolean {
    return this.hasDied() || this.isSleeping();
  }

  protected override updateAi(): void {
    this.updateAttackAnim();
  }

  protected closeContainer(): void {
    this.containerMenu = null;
  }

  protected setDefaultHeadHeight(): void {
    this.heightOffset = f(1.62);
  }

  // ADAPTED(Cpp)：C++ 的 Mob.h:104-105 把这两个虚函数重新声明成 public，Player.h:109-110 又收窄回 protected
  // （C++ 允许子类收窄可见性）。TS 不允许子类把 public 成员改成 protected（TS2415），只能保持 public。
  override readAdditionalSaveData(entityTag: CompoundTag): void {
    super.readAdditionalSaveData(entityTag);

    if (entityTag.contains('Inventory', TAG_List)) {
      let inventoryList = entityTag.getList('Inventory');
      this.inventory.loadItems(inventoryList);
    }
    if (entityTag.contains('Armor', TAG_List)) {
      loadArmor(this.armor, entityTag.getList('Armor'));
    }

    this.dimension = entityTag.getInt('Dimension');

    if (
      entityTag.contains('Sleeping') &&
      entityTag.contains('SleepTimer') &&
      entityTag.contains('BedPositionX') &&
      entityTag.contains('BedPositionY') &&
      entityTag.contains('BedPositionZ')
    ) {
      this.playerIsSleeping = entityTag.getBoolean('Sleeping');
      this.sleepCounter = (entityTag.getShort('SleepTimer') << 16) >> 16;
      this.bedPosition = new Pos(
        entityTag.getInt('BedPositionX'),
        entityTag.getInt('BedPositionY'),
        entityTag.getInt('BedPositionZ'),
      );
    } else {
      this.playerIsSleeping = false;
      this.bedPosition = new Pos(0, 0, 0);
    }

    if (!this.playerIsSleeping) {
      this.stopSleepInBed(true, true, false);
      this.entityData.clearFlag(Player.DATA_PLAYER_FLAGS_ID, Player.PLAYER_SLEEP_FLAG);
    } else {
      this.playerIsSleeping = false;
      this.startSleepInBed(this.bedPosition.x, this.bedPosition.y, this.bedPosition.z);
      this.entityData.setFlag(Player.DATA_PLAYER_FLAGS_ID, Player.PLAYER_SLEEP_FLAG);
    }
    this.entityData.setPos(Player.DATA_BED_POSITION_ID, this.bedPosition);
    if (
      entityTag.contains('SpawnX') &&
      entityTag.contains('SpawnY') &&
      entityTag.contains('SpawnZ')
    ) {
      this.respawnPosition.set(
        entityTag.getInt('SpawnX'),
        entityTag.getInt('SpawnY'),
        entityTag.getInt('SpawnZ'),
      );
    }
    this.playerHasRespawnPosition = this.respawnPosition.y >= 0;
  }

  // ADAPTED(Cpp)：同 readAdditionalSaveData —— Player.h:110 收窄成 protected，TS 只能保持 public。
  override addAdditonalSaveData(entityTag: CompoundTag): void {
    super.addAdditonalSaveData(entityTag);

    let inventoryTag = this.inventory.saveItems(new ListTag());

    entityTag.put('Inventory', inventoryTag);

    let armorTag = saveArmor(this.armor);
    entityTag.put('Armor', armorTag);

    entityTag.putInt('Dimension', this.dimension);

    entityTag.putBoolean('Sleeping', this.isSleeping());
    entityTag.putShort('SleepTimer', (this.sleepCounter << 16) >> 16);
    entityTag.putInt('BedPositionX', this.bedPosition.x);
    entityTag.putInt('BedPositionY', this.bedPosition.y);
    entityTag.putInt('BedPositionZ', this.bedPosition.z);

    entityTag.putInt('SpawnX', this.respawnPosition.x);
    entityTag.putInt('SpawnY', this.respawnPosition.y);
    entityTag.putInt('SpawnZ', this.respawnPosition.z);
  }

  protected setBedOffset(bedDirection: number): void {
    this.bedOffsetX = 0;
    this.bedOffsetZ = 0;
    switch (bedDirection) {
      case Direction.SOUTH:
        this.bedOffsetZ = f(-1.8);
        break;
      case Direction.NORTH:
        this.bedOffsetZ = f(1.8);
        break;
      case Direction.WEST:
        this.bedOffsetX = f(1.8);
        break;
      case Direction.EAST:
        this.bedOffsetX = f(-1.8);
        break;
    }
  }

  protected checkBed(): boolean {
    return (
      this.level.getTile(this.bedPosition.x, this.bedPosition.y, this.bedPosition.z) === Tile.bed.id
    );
  }

  protected spawnEatParticles(useItem: ItemInstance, count: number): void {
    if (useItem.getUseAnimation() === UseAnim.drink) {
      this.level.playSound(
        this,
        'random.drink',
        f(0.5),
        f(f(this.level.random.nextFloat() * f(0.1)) + f(0.9)),
      );
    } else if (useItem.getUseAnimation() === UseAnim.eat) {
      for (let i = 0; i < count; i++) {
        // C++: const float xx = -xRot * Mth::PI / 180;（左结合：((-xRot) * PI) / 180）
        const xx = f(f(f(-this.xRot) * Mth.PI) / f(180));
        const yy = f(f(f(-this.yRot) * Mth.PI) / f(180));
        let d = new Vec3(
          f(f(this.random.nextFloat() - f(0.5)) * f(0.1)),
          f(f(Mth.random() * f(0.1)) + f(0.1)),
          0,
        );
        d.xRot(xx);
        d.yRot(yy);
        let p = new Vec3(
          f(f(this.random.nextFloat() - f(0.5)) * f(0.3)),
          f(f(-this.random.nextFloat() * f(0.6)) - f(0.3)),
          f(0.6),
        );
        p.xRot(xx);
        p.yRot(yy);
        p = p.add(this.x, f(this.y + this.getHeadHeight()), this.z);
        this.level.addParticle(
          'iconcrack',
          p.x,
          p.y,
          p.z,
          d.x,
          f(d.y + f(0.05)),
          d.z,
          useItem.getItem()!.id,
        );
      }
      // DEFERRED(待确认): level->playSound(this, "random.eat", .5f + .5f * random.nextInt(2), (random.nextFloat() - random.nextFloat()) * 0.2f + 1.0f);
      // C++ 一条语句里两个实参都取随机数，求值顺序未指定；用户不生成新黄金样本，先按从左到右（与 Entity/Mob/ItemEntity 的先例一致），待确认。
      this.level.playSound(
        this,
        'random.eat',
        f(f(0.5) + f(f(0.5) * this.random.nextInt(2))),
        f(f(f(this.random.nextFloat() - this.random.nextFloat()) * f(0.2)) + f(1.0)),
      );
    }
  }

  private touch(entity: Entity): void {
    entity.playerTouch(this);
  }
}
