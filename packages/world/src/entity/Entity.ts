// 1:1 移植自 src/world/entity/Entity.h 与 Entity.cpp
import { getEpochTimeS } from '@mcpe/platform';
import { Level } from '../level/Level';
import { ItemInstance } from '../item/ItemInstance';
import type { ItemEntity } from './item/ItemEntity';
import { AABB } from '../phys/AABB';
import { Vec3 } from '../phys/Vec3';
import { Material } from '../level/material/Material';
import { Tile } from '../level/tile/Tile';
import { EntityRendererId } from './EntityRendererId';
import { SharedConstants } from '@mcpe/core';
import { CompoundTag, ListTagFloatAdder } from '@mcpe/nbt';
import { Random, Mth, f2i } from '@mcpe/util';

const f = Math.fround;
import type { Player } from './player/Player';
import { LevelConstants } from '../level/LevelConstants';
import { LiquidTile } from '../level/tile/LiquidTile';
import type { EntityPos } from './EntityPos';
import { ParticleType } from './EntityTypes';
import type { SynchedEntityData } from './SynchedEntityData';

/**
 * ADAPTED(ESM)：spawnAtLocation 要 new ItemEntity，而 ItemEntity extends Entity。基类 import 子类会在模块加载时
 * 触发“Class extends value undefined”，所以 ItemEntity 的构造器由 ItemEntity.ts 在定义后注册进来（与 TileInclude 同一思路）。
 */
type ItemEntityCtor = new (
  level: Level,
  x: number,
  y: number,
  z: number,
  item: ItemInstance,
) => ItemEntity;
let ItemEntityClass: ItemEntityCtor | null = null;
export function registerItemEntityClass(c: ItemEntityCtor): void {
  ItemEntityClass = c;
}

/** 供 Tile 等创建掉落物（它们与 Entity 只在函数内部互相使用，不形成加载期循环） */
export function createItemEntity(
  level: Level,
  x: number,
  y: number,
  z: number,
  item: ItemInstance,
): ItemEntity {
  return new ItemEntityClass!(level, x, y, z, item);
}

export abstract class Entity {
  static entityCounter = 0;
  static sharedRandom = new Random(getEpochTimeS());
  /** C++ Entity.h:224（protected static const） */
  static readonly DATA_AIR_SUPPLY_ID = 1;
  static readonly TOTAL_AIR_SUPPLY = 15 * SharedConstants.TicksPerSecond;

  // 公共字段
  public x = 0;
  public y = 0;
  public z = 0;
  public xChunk = 0;
  public yChunk = 0;
  public zChunk = 0;
  public entityId: number;
  public viewScale = 1.0;
  public level: Level;
  public xo = 0;
  public yo = 0;
  public zo = 0;
  public xd = 0;
  public yd = 0;
  public zd = 0;
  public yRot = 0;
  public xRot = 0;
  public yRotO = 0;
  public xRotO = 0;
  public bb: AABB;
  public heightOffset = 0 / 16.0;
  public bbWidth = f(0.6);
  public bbHeight = f(1.8);
  public walkDistO = 0;
  public walkDist = 0;
  public xOld = 0;
  public yOld = 0;
  public zOld = 0;
  public ySlideOffset = 0;
  public footSize = 0;
  public pushthrough = 0;
  public tickCount = 0;
  public invulnerableTime = 0;
  public airSupply = Entity.TOTAL_AIR_SUPPLY;
  public onFire = 0;
  public flameTime = 1;
  public entityRendererId: EntityRendererId = EntityRendererId.ER_DEFAULT_RENDERER;
  public fallDistance = 0;
  public blocksBuilding = false;
  public inChunk = false;
  public onGround = false;
  public horizontalCollision = false;
  public verticalCollision = false;
  public collision = false;
  public hurtMarked = false;
  public slide = true;
  public removed = false;
  public noPhysics = false;
  public canRemove = true;
  public invisible = false;
  public reallyRemoveIfPlayer = false;

  protected airCapacity = Entity.TOTAL_AIR_SUPPLY;
  protected makeStepSound = true;
  protected wasInWater = false;
  protected fireImmune = false;
  protected firstTick = true;
  protected nextStep = 1;
  protected isStuckInWeb = false;

  constructor(level: Level) {
    // ADAPTED(Cpp)：C++ 在基类构造期间调用虚函数只会调到本类（Entity）的版本；JS 会派发到子类，
    // 所以 _init 与 setPos 都显式调用 Entity.prototype 上的版本（_init 本身不是 virtual，同样不派发）。
    this.level = level;
    this.bb = new AABB(0, 0, 0, 0, 0, 0);
    Entity.prototype._init.call(this);
    this.entityId = ++Entity.entityCounter;
    Entity.prototype.setPos.call(this, 0, 0, 0);
  }

  // ---- 抽象方法 ----

  /** C++ Entity::getEntityTypeId() — pure virtual */
  abstract getEntityTypeId(): number;

  /** C++ Entity::readAdditionalSaveData(CompoundTag*) — pure virtual */
  protected abstract readAdditionalSaveData(tag: CompoundTag): void;

  /** C++ Entity::addAdditonalSaveData(CompoundTag*) — pure virtual，注意拼写 */
  protected abstract addAdditonalSaveData(tag: CompoundTag): void;

  // ---- 生命周期 ----

  /** C++ Entity::_init() */
  protected _init(): void {
    this.xo = this.xOld = this.x;
    this.yo = this.yOld = this.y;
    this.zo = this.zOld = this.z;
    this.xRotO = this.xRot;
    this.yRotO = this.yRot;
    this.onFire = 0;
    this.removed = false;
    this.fallDistance = 0;
  }

  /** C++ Entity::reset() */
  reset(): void {
    Entity.prototype._init.call(this); // C++ 的 _init 不是 virtual：Entity::reset 里调的是 Entity::_init 本身（不能派发到子类）
  }

  hashCode(): number {
    return this.entityId;
  }

  /** C++ `bool operator==(Entity&)` 的 R10 写法 */
  equals(rhs: Entity): boolean {
    return this.entityId === rhs.entityId;
  }

  setLevel(level: Level): void {
    this.level = level;
  }

  remove(): void {
    this.removed = true;
  }

  // ---- 位置与形状 ----

  /** C++ Entity::setPos(float, float, float) */
  setPos(x: number, y: number, z: number): void {
    x = f(x);
    y = f(y);
    z = f(z);
    this.x = x;
    this.y = y;
    this.z = z;
    const w = f(this.bbWidth / 2);
    const h = this.bbHeight;
    // C++：y - heightOffset + ySlideOffset 是两个 float 步骤；AABB.set 对每个参数只会再舍入一次（单步，等价）。
    const y0 = f(f(y - this.heightOffset) + this.ySlideOffset);
    this.bb.set(x - w, y0, z - w, x + w, y0 + h, z + w);
  }

  /** C++ Entity::setPos(EntityPos*) */
  protected setPosFromEntityPos(pos: EntityPos): void {
    if (pos.move) this.setPos(pos.x, pos.y, pos.z);
    else this.setPos(this.x, this.y, this.z);

    if (pos.rot) this.setRot(pos.yRot, pos.xRot);
    else this.setRot(this.yRot, this.xRot);
  }

  /** C++ Entity::setSize(float, float) */
  protected setSize(w: number, h: number): void {
    this.bbWidth = f(w);
    this.bbHeight = f(h);
  }

  /** C++ Entity::setRot(float, float) */
  protected setRot(yRot: number, xRot: number): void {
    this.yRot = this.yRotO = f(yRot);
    this.xRot = this.xRotO = f(xRot);
  }

  /** C++ Entity::moveTo(float, float, float, float, float) */
  moveTo(x: number, y: number, z: number, yRot: number, xRot: number): void {
    x = f(x);
    y = f(y);
    z = f(z);
    yRot = f(yRot);
    xRot = f(xRot);
    this.xOld = this.xo = this.x = x;
    this.yOld = this.yo = this.y = f(y + this.heightOffset);
    this.zOld = this.zo = this.z = z;
    this.yRot = this.yRotO = yRot;
    this.xRot = this.xRotO = xRot;
    this.setPos(this.x, this.y, this.z);
  }

  // ---- 碰撞检测 ----

  /** C++ Entity::isInWall() */
  isInWall(): boolean {
    const xt = Mth.floor(this.x);
    const yt = Mth.floor(this.y + this.getHeadHeight());
    const zt = Mth.floor(this.z);
    return this.level.isSolidBlockingTile(xt, yt, zt);
  }

  /** C++ Entity::isInWater() */
  isInWater(): boolean {
    return this.level.checkAndHandleWater(this.bb.grow(0, -0.4, 0), Material.water, this);
  }

  /** C++ Entity::isInLava() */
  isInLava(): boolean {
    return this.level.containsMaterial(this.bb.grow(-0.1, -0.4, -0.1), Material.lava);
  }

  /** C++ Entity::isFree(float, float, float, float) */
  isFree(xa: number, ya: number, za: number, grow: number): boolean;
  /** C++ Entity::isFree(float, float, float) */
  isFree(xa: number, ya: number, za: number): boolean;
  isFree(xa: number, ya: number, za: number, grow?: number): boolean {
    const box =
      grow !== undefined
        ? this.bb.grow(grow, grow, grow).cloneMove(xa, ya, za)
        : this.bb.cloneMove(xa, ya, za);
    if (this.level.getCubes(this, box).length > 0) return false;
    if (this.level.containsAnyLiquid(box)) return false;
    return true;
  }

  /** C++ Entity::isUnderLiquid(const Material*) */
  isUnderLiquid(material: Material): boolean {
    const yp = f(this.y + this.getHeadHeight());
    const xt = Mth.floor(this.x);
    const yt = Mth.floor(f(Mth.floor(yp)));
    const zt = Mth.floor(this.z);
    const t = this.level.getTile(xt, yt, zt);
    if (t !== 0 && Tile.tiles[t]?.material === material) {
      const hh = f(LiquidTile.getHeight(this.level.getData(xt, yt, zt)) - f(1 / 9));
      const h = f(yt + 1 - hh);
      return yp < h;
    }
    return false;
  }

  // ---- move（核心物理）----

  /** C++ Entity::move(float, float, float) */
  /**
   * C++ `void Entity::move(float xa, float ya, float za)`。2026-10 审核后按 float 逐步运算（形参先转 float、每步 f()），
   * 并修正潜行分支：C++ 在三个 while 循环里都会把 xaOrg / zaOrg 更新为收缩后的值（以前的注释说“C++ 没有重新赋值”是读错了），
   * 漏掉这一步会让潜行走到方块边缘时被误判为水平碰撞、水平速度被清零。
   */
  move(xa: number, ya: number, za: number): void {
    xa = f(xa);
    ya = f(ya);
    za = f(za);
    if (this.noPhysics) {
      this.bb.move(xa, ya, za);
      this.x = f(f(this.bb.x0 + this.bb.x1) / 2.0);
      this.y = f(f(this.bb.y0 + this.heightOffset) - this.ySlideOffset);
      this.z = f(f(this.bb.z0 + this.bb.z1) / 2.0);
      return;
    }

    const xo = this.x;
    const zo = this.z;

    if (this.isStuckInWeb) {
      this.isStuckInWeb = false;
      xa = f(xa * f(0.25));
      ya = f(ya * f(0.05));
      za = f(za * f(0.25));
      this.xd = 0;
      this.yd = 0;
      this.zd = 0;
    }

    let xaOrg = xa;
    const yaOrg = ya;
    let zaOrg = za;

    const bbOrg = this.bb.copy();
    const sneaking = this.onGround && this.isSneaking();

    if (sneaking) {
      const d = f(0.05);
      while (xa !== 0 && this.level.getCubes(this, this.bb.cloneMove(xa, -1.0, 0)).length === 0) {
        if (xa < d && xa >= -d) xa = 0;
        else if (xa > 0) xa = f(xa - d);
        else xa = f(xa + d);
        xaOrg = xa;
      }
      while (za !== 0 && this.level.getCubes(this, this.bb.cloneMove(0, -1.0, za)).length === 0) {
        if (za < d && za >= -d) za = 0;
        else if (za > 0) za = f(za - d);
        else za = f(za + d);
        zaOrg = za;
      }
      while (
        xa !== 0 &&
        za !== 0 &&
        this.level.getCubes(this, this.bb.cloneMove(xa, -1.0, za)).length === 0
      ) {
        if (xa < d && xa >= -d) xa = 0;
        else if (xa > 0) xa = f(xa - d);
        else xa = f(xa + d);
        if (za < d && za >= -d) za = 0;
        else if (za > 0) za = f(za - d);
        else za = f(za + d);
        xaOrg = xa;
        zaOrg = za;
      }
    }

    let aABBs = this.level.getCubes(this, this.bb.expand(xa, ya, za));

    for (let i = 0; i < aABBs.length; i++) ya = aABBs[i]!.clipYCollide(this.bb, ya);
    this.bb.move(0, ya, 0);
    if (!this.slide && yaOrg !== ya) {
      xa = ya = za = 0;
    }

    const og = this.onGround || (yaOrg !== ya && yaOrg < 0);

    for (let i = 0; i < aABBs.length; i++) xa = aABBs[i]!.clipXCollide(this.bb, xa);
    this.bb.move(xa, 0, 0);
    if (!this.slide && xaOrg !== xa) {
      xa = ya = za = 0;
    }

    for (let i = 0; i < aABBs.length; i++) za = aABBs[i]!.clipZCollide(this.bb, za);
    this.bb.move(0, 0, za);
    if (!this.slide && zaOrg !== za) {
      xa = ya = za = 0;
    }

    if (this.footSize > 0 && og && this.ySlideOffset < f(0.05) && (xaOrg !== xa || zaOrg !== za)) {
      const xaN = xa;
      const yaN = ya;
      const zaN = za;

      xa = xaOrg;
      ya = f(this.footSize);
      za = zaOrg;

      const normal = this.bb.copy();
      this.bb.setFrom(bbOrg);
      aABBs = this.level.getCubes(this, this.bb.expand(xa, ya, za));

      for (let i = 0; i < aABBs.length; i++) ya = aABBs[i]!.clipYCollide(this.bb, ya);
      this.bb.move(0, ya, 0);
      if (!this.slide && yaOrg !== ya) {
        xa = ya = za = 0;
      }

      for (let i = 0; i < aABBs.length; i++) xa = aABBs[i]!.clipXCollide(this.bb, xa);
      this.bb.move(xa, 0, 0);
      if (!this.slide && xaOrg !== xa) {
        xa = ya = za = 0;
      }

      for (let i = 0; i < aABBs.length; i++) za = aABBs[i]!.clipZCollide(this.bb, za);
      this.bb.move(0, 0, za);
      if (!this.slide && zaOrg !== za) {
        xa = ya = za = 0;
      }

      if (f(f(xaN * xaN) + f(zaN * zaN)) >= f(f(xa * xa) + f(za * za))) {
        xa = xaN;
        ya = yaN;
        za = zaN;
        this.bb.setFrom(normal);
      } else {
        this.ySlideOffset = f(this.ySlideOffset + f(0.5));
      }
    }

    this.x = f(f(this.bb.x0 + this.bb.x1) / 2.0);
    this.y = f(f(this.bb.y0 + this.heightOffset) - this.ySlideOffset);
    this.z = f(f(this.bb.z0 + this.bb.z1) / 2.0);

    this.horizontalCollision = xaOrg !== xa || zaOrg !== za;
    this.verticalCollision = yaOrg !== ya;
    this.onGround = yaOrg !== ya && yaOrg < 0;
    this.collision = this.horizontalCollision || this.verticalCollision;
    this.checkFallDamage(ya, this.onGround);

    if (xaOrg !== xa) this.xd = 0;
    if (yaOrg !== ya) this.yd = 0;
    if (zaOrg !== za) this.zd = 0;

    const xm = f(this.x - xo);
    const zm = f(this.z - zo);

    if (this.makeStepSound && !sneaking) {
      this.walkDist = f(this.walkDist + f(Mth.sqrt(f(f(xm * xm) + f(zm * zm))) * f(0.6)));
      const xt = Mth.floor(this.x);
      const yt = Mth.floor(f(f(this.y - f(0.2)) - this.heightOffset));
      const zt = Mth.floor(this.z);

      let t = this.level.getTile(xt, yt, zt);
      if (t === 0) {
        const under = this.level.getTile(xt, yt - 1, zt);
        if (Tile.fence.id === under || Tile.fenceGate.id === under) {
          t = under;
        }
      }

      if (this.walkDist > this.nextStep && t > 0) {
        this.nextStep = f2i(this.walkDist) + 1;
        this.playStepSound(xt, yt, zt, t);
      }
    }

    const x0 = Mth.floor(this.bb.x0);
    const y0 = Mth.floor(this.bb.y0);
    const z0 = Mth.floor(this.bb.z0);
    const x1 = Mth.floor(this.bb.x1);
    const y1 = Mth.floor(this.bb.y1);
    const z1 = Mth.floor(this.bb.z1);

    if (this.level.hasChunksAt(x0, y0, z0, x1, y1, z1)) {
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            const t = this.level.getTile(x, y, z);
            if (t > 0) {
              Tile.tiles[t]?.entityInside(this.level, x, y, z, this);
            }
          }
        }
      }
    }

    this.ySlideOffset = f(this.ySlideOffset * f(0.4));

    const water = this.isInWater();
    if (this.level.containsFireTile(this.bb)) {
      this.burn(1);
      if (!water) {
        this.onFire++;
        if (this.onFire === 0) this.onFire = 20 * 15;
      }
    } else {
      if (this.onFire <= 0) {
        this.onFire = -this.flameTime;
      }
    }

    if (water && this.onFire > 0) {
      this.onFire = -this.flameTime;
    }
  }

  // ---- 旋转 ----

  turn(xo: number, yo: number): void {
    xo = f(xo);
    yo = f(yo);
    const xRotOld = this.xRot;
    const yRotOld = this.yRot;

    this.yRot = f(this.yRot + f(xo * f(0.15)));
    this.xRot = f(this.xRot - f(yo * f(0.15)));
    if (this.xRot < -90) this.xRot = -90;
    if (this.xRot > 90) this.xRot = 90;

    this.xRotO = f(this.xRotO + f(this.xRot - xRotOld));
    this.yRotO = f(this.yRotO + f(this.yRot - yRotOld));
  }

  interpolateTurn(xo: number, yo: number): void {
    xo = f(xo);
    yo = f(yo);
    this.yRot = f(this.yRot + f(xo * f(0.15)));
    this.xRot = f(this.xRot - f(yo * f(0.15)));
    if (this.xRot < -90) this.xRot = -90;
    if (this.xRot > 90) this.xRot = 90;
  }

  // ---- tick ----

  tick(): void {
    this.baseTick();
  }

  baseTick(): void {
    this.tickCount++;
    this.walkDistO = this.walkDist;
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.xRotO = this.xRot;
    this.yRotO = this.yRot;

    if (this.isInWater()) {
      if (!this.wasInWater && !this.firstTick) {
        // C++：`sqrt(xd*xd*0.2f + yd*yd + zd*zd*0.2f) * 0.2f` —— 内层逐项 float，
        // ::sqrt 按 double 算，乘 0.2f 后存回 float。
        const speedArg = f(
          f(f(f(this.xd * this.xd) * f(0.2)) + f(this.yd * this.yd)) +
            f(f(this.zd * this.zd) * f(0.2)),
        );
        let speed = f(Math.sqrt(speedArg) * f(0.2));
        if (speed > 1) speed = 1;
        this.level.playSound(
          this,
          'random.splash',
          speed,
          f(1 + f(f(Entity.sharedRandom.nextFloat() - Entity.sharedRandom.nextFloat()) * f(0.4))),
        );
        const yt = f(Math.floor(this.bb.y0));
        const count = f(1 + f(this.bbWidth * 20));
        for (let i = 0; i < count; i++) {
          const xo = f(f(f(Entity.sharedRandom.nextFloat() * 2) - 1) * this.bbWidth);
          const zo = f(f(f(Entity.sharedRandom.nextFloat() * 2) - 1) * this.bbWidth);
          this.level.addParticle(
            ParticleType.bubble,
            f(this.x + xo),
            f(yt + 1),
            f(this.z + zo),
            this.xd,
            f(this.yd - f(Entity.sharedRandom.nextFloat() * f(0.2))),
            this.zd,
          );
        }
      }
      this.fallDistance = 0;
      this.wasInWater = true;
      this.onFire = 0;
    } else {
      this.wasInWater = false;
    }

    if (this.level.isClientSide) {
      this.onFire = 0;
    } else {
      if (this.onFire > 0) {
        if (this.fireImmune) {
          this.onFire -= 4;
          if (this.onFire < 0) this.onFire = 0;
        } else {
          if (this.onFire % 20 === 0) {
            this.hurt(null, 1);
          }
          this.onFire--;
        }
      }
    }

    if (this.isInLava()) {
      this.lavaHurt();
    }

    if (this.y < -64) {
      this.outOfWorld();
    }

    this.firstTick = false;
  }

  // ---- 回调 ----

  protected outOfWorld(): void {
    this.remove();
  }
  protected causeFallDamage(_fallDamage2: number): void {}
  protected markHurt(): void {
    this.hurtMarked = true;
  }
  protected resetPos(_clearMore: boolean): void {
    if (this.level == null) return;
    while (this.y > 0) {
      this.setPos(this.x, this.y, this.z);
      if (this.level.getCubes(this, this.bb).length === 0) break;
      this.y = f(this.y + 1);
    }
    this.xd = this.yd = this.zd = 0;
    this.xRot = 0;
  }
  protected setOnFire(numberOfSeconds: number): void {
    const newValue = numberOfSeconds * 20;
    if (this.onFire < newValue) this.onFire = newValue;
  }

  getHeadHeight(): number {
    return 0;
  }
  getShadowHeightOffs(): number {
    return f(this.bbHeight / 2);
  }
  getBrightness(_a: number): number {
    const xTile = Mth.floor(this.x);
    const hh = f(f(this.bb.y1 - this.bb.y0) * f(0.66));
    const yTile = Mth.floor(f(f(this.y - this.heightOffset) + hh));
    const zTile = Mth.floor(this.z);
    if (
      this.level.hasChunksAt(
        Mth.floor(this.bb.x0),
        Mth.floor(this.bb.y0),
        Mth.floor(this.bb.z0),
        Mth.floor(this.bb.x1),
        Mth.floor(this.bb.y1),
        Mth.floor(this.bb.z1),
      )
    ) {
      return this.level.getBrightness(xTile, yTile, zTile);
    }
    return 0;
  }

  // ---- 距离 ----

  distanceTo(e: Entity): number;
  distanceTo(x2: number, y2: number, z2: number): number;
  distanceTo(a: Entity | number, b?: number, c?: number): number {
    let xd: number, yd: number, zd: number;
    if (typeof a === 'number') {
      xd = f(this.x - f(a));
      yd = f(this.y - f(b!));
      zd = f(this.z - f(c!));
    } else {
      xd = f(this.x - a.x);
      yd = f(this.y - a.y);
      zd = f(this.z - a.z);
    }
    // C++：xd*xd + yd*yd + zd*zd 从左到右逐步 float；C 库 sqrt 按 double 算，结果存回 float。
    return f(Math.sqrt(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd))));
  }

  distanceToSqr(e: Entity): number;
  distanceToSqr(x2: number, y2: number, z2: number): number;
  distanceToSqr(a: Entity | number, b?: number, c?: number): number {
    let xd: number, yd: number, zd: number;
    if (typeof a === 'number') {
      xd = f(this.x - f(a));
      yd = f(this.y - f(b!));
      zd = f(this.z - f(c!));
    } else {
      xd = f(this.x - a.x);
      yd = f(this.y - a.y);
      zd = f(this.z - a.z);
    }
    return f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd));
  }

  // ---- 推力 ----

  push(e: Entity): void;
  push(xa: number, ya: number, za: number): void;
  push(a: Entity | number, b?: number, c?: number): void {
    if (typeof a === 'number') {
      this.xd = f(this.xd + f(a));
      this.yd = f(this.yd + f(b!));
      this.zd = f(this.zd + f(c!));
      return;
    }

    const e = a;
    let xa = f(e.x - this.x);
    let za = f(e.z - this.z);

    let dd = Mth.absMax(xa, za);
    if (dd >= f(0.01)) {
      dd = f(Math.sqrt(dd));
      xa = f(xa / dd);
      za = f(za / dd);

      let pow = f(1 / dd);
      if (pow > 1) pow = 1;
      xa = f(xa * pow);
      za = f(za * pow);

      xa = f(xa * f(0.05));
      za = f(za * f(0.05));

      const k = f(1 - this.pushthrough);
      xa = f(xa * k);
      za = f(za * k);

      this.push(-xa, 0, -za);
      e.push(xa, 0, za);
    }
  }

  // ---- 伤害 ----

  hurt(_source: Entity | null, _damage: number): boolean {
    this.markHurt();
    return false;
  }

  protected burn(dmg: number): void {
    if (!this.fireImmune) {
      this.hurt(null, dmg);
    }
  }

  protected lavaHurt(): void {
    if (!this.fireImmune) {
      this.hurt(null, 4);
      this.onFire = 30 * SharedConstants.TicksPerSecond;
    }
  }

  // ---- 存档 ----

  save(entityTag: CompoundTag): boolean {
    const id = this.getEntityTypeId();
    if (this.removed || id === 0) return false;
    entityTag.putInt('id', id);
    this.saveWithoutId(entityTag);
    return true;
  }

  saveWithoutId(entityTag: CompoundTag): void {
    entityTag.put('Pos', new ListTagFloatAdder(this.x).call(this.y).call(this.z).tag!);
    entityTag.put('Motion', new ListTagFloatAdder(this.xd).call(this.yd).call(this.zd).tag!);
    entityTag.put('Rotation', new ListTagFloatAdder(this.yRot).call(this.xRot).tag!);

    entityTag.putFloat('FallDistance', this.fallDistance);
    entityTag.putShort('Fire', this.onFire);
    entityTag.putShort('Air', this.airSupply);
    entityTag.putBoolean('OnGround', this.onGround);

    this.addAdditonalSaveData(entityTag);
  }

  load(tag: CompoundTag): boolean {
    const pos = tag.getList('Pos');
    const motion = tag.getList('Motion');
    const rotation = tag.getList('Rotation');
    this.setPos(0, 0, 0);

    this.xd = motion.getFloat(0);
    this.yd = motion.getFloat(1);
    this.zd = motion.getFloat(2);

    if (Mth.abs(this.xd) > 10.0) this.xd = 0;
    if (Mth.abs(this.yd) > 10.0) this.yd = 0;
    if (Mth.abs(this.zd) > 10.0) this.zd = 0;

    let xx = pos.getFloat(0);
    let yy = pos.getFloat(1);
    let zz = pos.getFloat(2);

    const padding = f(f(this.bbWidth * f(0.5)) + f(0.001));
    xx = Mth.clamp(xx, padding, f(f(LevelConstants.LEVEL_WIDTH) - padding));
    zz = Mth.clamp(zz, padding, f(f(LevelConstants.LEVEL_DEPTH) - padding));

    this.xo = this.xOld = this.x = xx;
    this.yo = this.yOld = this.y = yy;
    this.zo = this.zOld = this.z = zz;

    this.yRotO = this.yRot = f(fmod(rotation.getFloat(0), f(360)));
    this.xRotO = this.xRot = f(fmod(rotation.getFloat(1), f(360)));

    this.fallDistance = tag.getFloat('FallDistance');
    this.onFire = tag.getShort('Fire');
    this.airSupply = tag.getShort('Air');
    this.onGround = tag.getBoolean('OnGround');

    this.setPos(this.x, this.y, this.z);
    this.readAdditionalSaveData(tag);
    return tag.errorState === 0;
  }

  // ---- 掉落物 ----

  spawnAtLocation(resource: number, count: number): ItemEntity;
  spawnAtLocation(resource: number, count: number, yOffs: number): ItemEntity;
  spawnAtLocation(itemInstance: ItemInstance, yOffs: number): ItemEntity;
  spawnAtLocation(a: number | ItemInstance, b: number, c?: number): ItemEntity {
    let itemInstance: ItemInstance;
    let yOffs: number;
    if (typeof a === 'number') {
      if (c === undefined) {
        // (resource, count) -> 委托 (resource, count, 0)
        return this.spawnAtLocation(a, b, 0);
      }
      // (resource, count, yOffs)
      itemInstance = new ItemInstance(a, b, 0);
      yOffs = c;
    } else {
      // (itemInstance, yOffs)
      itemInstance = a;
      yOffs = b;
    }

    yOffs = f(yOffs);
    const ie = new ItemEntityClass!(this.level, this.x, f(this.y + yOffs), this.z, itemInstance);
    ie.throwTime = 10;
    this.level.addEntity(ie);
    return ie;
  }

  // ---- 查询 ----

  isOnFire(): boolean {
    return this.onFire > 0;
  }
  isAlive(): boolean {
    return !this.removed;
  }
  isPlayer(): boolean {
    return false;
  }
  isMob(): boolean {
    return false;
  }
  isSneaking(): boolean {
    return false;
  }
  isPickable(): boolean {
    return false;
  }
  isPushable(): boolean {
    return false;
  }
  isShootable(): boolean {
    return false;
  }
  isCreativeModeAllowed(): boolean {
    return false;
  }
  isItemEntity(): boolean {
    return false;
  }
  isHangingEntity(): boolean {
    return false;
  }
  getAuxData(): number {
    return 0;
  }
  getPickRadius(): number {
    return f(0.1);
  }
  getCreatureBaseType(): number {
    return 0;
  }
  queryEntityRenderer(): EntityRendererId {
    return EntityRendererId.ER_DEFAULT_RENDERER;
  }

  shouldRender(c: Vec3): boolean {
    if (this.invisible) return false;
    const xd = f(this.x - c.x);
    const yd = f(this.y - c.y);
    const zd = f(this.z - c.z);
    return this.shouldRenderAtSqrDistance(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd)));
  }

  shouldRenderAtSqrDistance(distance: number): boolean {
    distance = f(distance);
    let size = this.bb.getSize();
    size = f(size * f(64 * this.viewScale));
    return distance < f(size * size);
  }

  // ---- 空实现 ----

  playerTouch(_player: Player): void {}
  interact(_player: Player): boolean {
    return false;
  }
  interactPreventDefault(): boolean {
    return false;
  }
  awardKillScore(_victim: Entity, _score: number): void {}
  animateHurt(): void {}
  setEquippedSlot(_slot: number, _item: number, _auxValue: number): void {}
  handleEntityEvent(_eventId: number): void {}
  playStepSound(xt: number, yt: number, zt: number, t: number): void {
    let soundType = Tile.tiles[t]!.soundType;
    if (this.level.getTile(xt, yt + 1, zt) === Tile.topSnow.id) {
      soundType = Tile.topSnow.soundType;
      this.level.playSound(
        this,
        soundType.getStepSound(),
        f(soundType.getVolume() * f(0.25)),
        soundType.getPitch(),
      ); // was * 0.15f
    } else if (!Tile.tiles[t]!.material.isLiquid()) {
      this.level.playSound(
        this,
        soundType.getStepSound(),
        f(soundType.getVolume() * f(0.25)),
        soundType.getPitch(),
      );
    }
  }
  checkFallDamage(ya: number, onGround: boolean): void {
    ya = f(ya);
    if (onGround) {
      if (this.fallDistance > 0) {
        if (this.isMob()) {
          const xt = Mth.floor(this.x);
          const yt = Mth.floor(f(f(this.y - f(0.2)) - this.heightOffset));
          const zt = Mth.floor(this.z);
          let t = this.level.getTile(xt, yt, zt);
          if (t === 0 && this.level.getTile(xt, yt - 1, zt) === Tile.fence.id) {
            t = this.level.getTile(xt, yt - 1, zt);
          }
          if (t > 0) {
            Tile.tiles[t]!.fallOn(this.level, xt, yt, zt, this, this.fallDistance);
          }
        }
        this.causeFallDamage(this.fallDistance);
        this.fallDistance = 0;
      }
    } else {
      if (ya < 0) this.fallDistance = f(this.fallDistance - ya);
    }
  }

  makeStuckInWeb(): void {
    this.isStuckInWeb = true;
    this.fallDistance = 0;
  }

  lerpTo(x: number, y: number, z: number, yRot: number, xRot: number, _steps: number): void {
    this.setPos(x, y, z);
    this.setRot(yRot, xRot);
  }

  lerpMotion(xd: number, yd: number, zd: number): void {
    this.xd = f(xd);
    this.yd = f(yd);
    this.zd = f(zd);
  }

  moveRelative(xa: number, za: number, speed: number): void {
    xa = f(xa);
    za = f(za);
    speed = f(speed);
    let dist = f(Math.sqrt(f(f(xa * xa) + f(za * za))));
    if (dist < f(0.01)) return;
    if (dist < 1) dist = 1;
    dist = f(speed / dist);
    xa = f(xa * dist);
    za = f(za * dist);

    // `yRot * Mth::PI / 180` 是两个 float 步骤，(float)sin/cos 再舍入一次。
    const sin_ = f(Math.sin(f(f(this.yRot * Mth.PI) / 180)));
    const cos_ = f(Math.cos(f(f(this.yRot * Mth.PI) / 180)));

    this.xd = f(this.xd + f(f(xa * cos_) - f(za * sin_)));
    this.zd = f(this.zd + f(f(za * cos_) + f(xa * sin_)));
  }

  intersects(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    // C++ 的 6 参 intersects 重载：形参在调用处转 float（AABB.intersectsXYZ 已按此实现）。
    return this.bb.intersectsXYZ(x0, y0, z0, x1, y1, z1);
  }

  getEntityData(): SynchedEntityData | null {
    return null;
  }

  isEntityType(type: number): boolean {
    return this.getEntityTypeId() === type;
  }
}

// 辅助
function fmod(a: number, b: number): number {
  return a % b;
}
