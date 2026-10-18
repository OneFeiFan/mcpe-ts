/**
 * 1:1 移植自 src/world/entity/projectile/Arrow.h 与 .cpp（346 行 + 头 57 行）—— 这批最大的一个。
 *
 * ⚠ **它继承 `Entity`，不是 `Throwable`**（D8 那三类抛射物才继承 Throwable）。
 * 所以 `shoot` / `lerpMotion` / `tick` 这三个函数和 `Throwable` 里的是**两份相似的代码**，
 * 差别都是原样，别"统一"：
 *
 * | | Throwable（雪球/蛋） | Arrow |
 * | --- | --- | --- |
 * | `shoot` 的除零保护 | 有（`dist >= 0.001` 才除） | **没有** —— 直接除，方向为 0 时得 NaN |
 * | 落地存活 | 硬编码 `life == 20*60` | `++life == 60 * TicksPerSecond` |
 * | 重力 | `getGravity()` 虚函数（0.03） | 写死 `0.05f` |
 * | `lerpMotion` | 只设速度 | 多一句 `moveTo(x, y, z, yRot, xRot)` + `life = 0` |
 * | "插在方块里" | 无 | `tick` 开头用 `Tile.getAABB` 判自己是不是在方块内部 → `inGround = true` |
 * | `clip` | 两参 | `clip(from, to, false, true)`（只看实心方块） |
 * | 命中实体 | 调 `onHit`（子类实现） | 自己算伤害：`ceil(pow * 2.0f)`，暴击再加随机 |
 *
 * 【`inGround` 的另一个来源】`Throwable` 那边只有读存档会写 `inGround`；Arrow 多一条：
 * `tick` 开头那个 AABB 判断 —— 它才是"箭插在方块上"的正常途径（存档那条是读回来之后）。
 *
 * 【三处 int 除法】`dmg / 2 + 2`、`(icon 没有)` —— 凡 `int / int` 都用 `Math.trunc`。
 */
import { SharedConstants } from '@mcpe/core';
import { Mth } from '@mcpe/util';
import type { CompoundTag } from '@mcpe/nbt';
import { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { EntityTypes, ParticleType } from '../EntityTypes';
import { HitResult, HitResultType } from '../../phys/HitResult';
import { Vec3 } from '../../phys/Vec3';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import { Tile } from '../../level/tile/Tile';
import type { Player } from '../player/Player';
import type { Mob } from '../Mob';
import type { Level } from '../../level/Level';

const f = Math.fround;

export class Arrow extends Entity {
  /** C++ `static const float ARROW_BASE_DAMAGE = 2.0f;` */
  static readonly ARROW_BASE_DAMAGE = f(2.0);

  playerArrow!: boolean;
  shakeTime!: number;
  ownerId!: number;
  critArrow!: boolean;
  private xTile!: number;
  private yTile!: number;
  private zTile!: number;
  private lastTile!: number;
  private lastData!: number;
  private inGround!: boolean;
  private life!: number;
  private flightTime!: number;

  /** C++ `Arrow(Level*)` */
  constructor(level: Level);
  /** C++ `Arrow(Level*, float x, float y, float z)` */
  constructor(level: Level, x: number, y: number, z: number);
  /** C++ `Arrow(Level*, Mob* mob, float power)` */
  constructor(level: Level, mob: Mob, power: number);
  constructor(level: Level, a?: number | Mob, b?: number, c?: number) {
    super(level);
    this.playerArrow = false;
    this.ownerId = 0;
    this._initArrow();

    if (a === undefined) {
      // C++ `Arrow(Level*)`
    } else if (typeof a === 'number') {
      // C++ `Arrow(Level*, float x, float y, float z)`
      this.setPos(a, b!, c!);
      this.heightOffset = 0;
    } else {
      // C++ `Arrow(Level*, Mob* mob, float power)` —— 构造初始化列表里先取 owner/player 再 _init()
      const mob = a;
      const power = b!;
      this.ownerId = mob.entityId;
      this.playerArrow = mob.isPlayer();
      this.moveTo(mob.x, f(mob.y + mob.getHeadHeight()), mob.z, mob.yRot, mob.xRot);
      const dx = f(Mth.cos(f(mob.yRot * Mth.DEGRAD)));
      const dz = f(Mth.sin(f(mob.yRot * Mth.DEGRAD)));
      this.x = f(this.x - f(dx * f(0.16)));
      this.y = f(this.y - f(0.1));
      this.z = f(this.z - f(dz * f(0.16)));
      this.setPos(this.x, this.y, this.z);
      this.heightOffset = 0;
      const dxx = f(Mth.cos(f(f(mob.xRot / 180) * Mth.PI)));
      const xd = f(f(-dz) * dxx);
      const zd = f(dx * dxx);
      const yd = f(-Mth.sin(f(f(mob.xRot / 180) * Mth.PI)));
      this.shoot(xd, yd, zd, f(power * f(1.5)), 1);
    }
  }

  /**
   * C++ `void Arrow::_init()`。
   * ⚠ 不能沿用 C++ 那个名字：TS 的 `Entity` 已经有一个 `_init()`（构造器里绕虚函数用的），
   * 同名会撞成 override（`Throwable` 那边也是这么处理的）。
   */
  private _initArrow(): void {
    this.entityRendererId = EntityRendererId.ER_ARROW_RENDERER;
    this.setSize(f(0.5), f(0.5));
    this.shakeTime = 0;
    this.critArrow = false;
    this.xTile = -1;
    this.yTile = -1;
    this.zTile = -1;
    this.lastTile = 0;
    this.lastData = 0;
    this.inGround = false;
    this.life = 0;
    this.flightTime = 0;
  }

  /**
   * C++ `void Arrow::shoot(float xd, float yd, float zd, float pow, float uncertainty)`。
   * ⚠ **没有除零保护**（`Throwable::shoot` 那边有 `dist >= 0.001` 的守卫）—— 原样：
   * 方向向量长度为 0 时这里直接除出 NaN/Inf。C++ 就是这样的。
   */
  shoot(xd_: number, yd_: number, zd_: number, pow: number, uncertainty: number): void {
    let xd = xd_;
    let yd = yd_;
    let zd = zd_;
    const dist = f(Mth.sqrt(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd))));
    xd = f(xd / dist);
    yd = f(yd / dist);
    zd = f(zd / dist);
    const radius = f(f(0.0075) * uncertainty);
    xd = f(xd + f(Entity.sharedRandom.nextGaussian() * radius));
    yd = f(yd + f(Entity.sharedRandom.nextGaussian() * radius));
    zd = f(zd + f(Entity.sharedRandom.nextGaussian() * radius));
    xd = f(xd * pow);
    yd = f(yd * pow);
    zd = f(zd * pow);
    this.xd = xd;
    this.yd = yd;
    this.zd = zd;
    const sd = f(Mth.sqrt(f(f(xd * xd) + f(zd * zd))));
    this.yRotO = this.yRot = f(f(Mth.atan2(xd, zd) * 180) / Mth.PI);
    this.xRotO = this.xRot = f(f(Mth.atan2(yd, sd) * 180) / Mth.PI);
    this.life = 0;
  }

  /** C++ `void Arrow::lerpMotion(float xd, float yd, float zd)` */
  override lerpMotion(xd: number, yd: number, zd: number): void {
    this.xd = xd;
    this.yd = yd;
    this.zd = zd;
    if (this.xRotO === 0 && this.yRotO === 0) {
      const sd = f(Mth.sqrt(f(f(xd * xd) + f(zd * zd))));
      this.yRotO = this.yRot = f(f(Mth.atan2(xd, zd) * 180) / Mth.PI);
      this.xRotO = this.xRot = f(f(Mth.atan2(yd, sd) * 180) / Mth.PI);
      this.moveTo(this.x, this.y, this.z, this.yRot, this.xRot);
      this.life = 0;
    }
  }

  /** C++ `void Arrow::tick()` —— **调 `super.tick()`** */
  override tick(): void {
    super.tick();
    if (this.xRotO === 0 && this.yRotO === 0) {
      const sd = f(Mth.sqrt(f(f(this.xd * this.xd) + f(this.zd * this.zd))));
      this.yRotO = this.yRot = f(f(Mth.atan2(this.xd, this.zd) * 180) / Mth.PI);
      this.xRotO = this.xRot = f(f(Mth.atan2(this.yd, sd) * 180) / Mth.PI);
    }
    {
      // 自己是不是插在某个方块的碰撞盒里（这是 inGround 的主要来源）
      const t = this.level.getTile(this.xTile, this.yTile, this.zTile);
      if (t > 0) {
        const tile = Tile.tiles[t];
        // ⚠ C++ 是 `Tile::tiles[t]->updateShape(...)`，索引越界/表里是 NULL 时会崩。
        //   这里多一个 `if (tile)` 是**没法照抄的 UB 保护**（同 FallingTileRenderer 那条），
        //   不是改写了原句：正常注册表范围内两者行为完全一致（D6 的 DropItem 那条同理）。
        if (tile) {
          tile.updateShape(this.level, this.xTile, this.yTile, this.zTile);
          const aabb = tile.getAABB(this.level, this.xTile, this.yTile, this.zTile);
          if (aabb !== null && aabb.contains(this.x, this.y, this.z)) {
            this.inGround = true;
          }
        }
      }
    }
    if (this.shakeTime > 0) this.shakeTime--;
    if (this.inGround) {
      const tile = this.level.getTile(this.xTile, this.yTile, this.zTile);
      const data = this.level.getData(this.xTile, this.yTile, this.zTile);
      if (tile !== this.lastTile || data !== this.lastData) {
        this.inGround = false;
        this.xd = f(this.xd * f(Entity.sharedRandom.nextFloat() * f(0.2)));
        this.yd = f(this.yd * f(Entity.sharedRandom.nextFloat() * f(0.2)));
        this.zd = f(this.zd * f(Entity.sharedRandom.nextFloat() * f(0.2)));
        this.life = 0;
        this.flightTime = 0;
        return;
      } else {
        // ⚠ 这边是 `60 * TicksPerSecond`（Throwable 那边硬编码 20*60）
        if (++this.life === 60 * SharedConstants.TicksPerSecond) this.remove();
        return;
      }
    } else {
      this.flightTime++;
    }
    const from = new Vec3(this.x, this.y, this.z);
    const to = new Vec3(f(this.x + this.xd), f(this.y + this.yd), f(this.z + this.zd));
    let res = this.level.clip(from, to, false, true);
    from.set(this.x, this.y, this.z);
    to.set(f(this.x + this.xd), f(this.y + this.yd), f(this.z + this.zd));
    if (res.isHit()) {
      to.set(res.pos.x, res.pos.y, res.pos.z);
    }
    let hitEntity: Entity | null = null;
    const objects = this.level.getEntities(
      this,
      this.bb.expand(this.xd, this.yd, this.zd).grow(1, 1, 1),
    );
    let nearest = 0;
    for (const e of objects) {
      if (!e.isPickable() || (e.entityId === this.ownerId && this.flightTime < 5)) continue;
      const rr = f(0.3);
      const bb = e.bb.grow(rr, rr, rr);
      const p = bb.clip(from, to);
      if (p.isHit()) {
        const dd = from.distanceTo(p.pos.x, p.pos.y, p.pos.z);
        if (dd < nearest || nearest === 0) {
          hitEntity = e;
          nearest = dd;
        }
      }
    }
    if (hitEntity !== null) {
      res = new HitResult(hitEntity);
    }
    if (res.isHit()) {
      if (res.type === HitResultType.ENTITY) {
        const pow = f(
          Mth.sqrt(f(f(f(this.xd * this.xd) + f(this.yd * this.yd)) + f(this.zd * this.zd))),
        );
        let dmg = Math.trunc(Math.ceil(f(pow * Arrow.ARROW_BASE_DAMAGE)));
        if (this.critArrow) dmg += Entity.sharedRandom.nextInt(Math.trunc(dmg / 2) + 2);
        if (res.entity!.hurt(this, dmg)) {
          if (res.entity!.isMob()) {
            (res.entity as Mob).arrowCount++;
          }
          this.level.playSound(
            this,
            'random.bowhit',
            f(1.0),
            f(f(1.2) / f(f(Entity.sharedRandom.nextFloat() * f(0.2)) + f(0.9))),
          );
          this.remove();
        } else {
          this.xd = f(this.xd * f(-0.1));
          this.yd = f(this.yd * f(-0.1));
          this.zd = f(this.zd * f(-0.1));
          this.yRot += 180;
          this.yRotO += 180;
          this.flightTime = 0;
        }
      } else {
        this.xTile = res.x;
        this.yTile = res.y;
        this.zTile = res.z;
        this.lastTile = this.level.getTile(this.xTile, this.yTile, this.zTile);
        this.lastData = this.level.getData(this.xTile, this.yTile, this.zTile);
        this.xd = f(res.pos.x - this.x);
        this.yd = f(res.pos.y - this.y);
        this.zd = f(res.pos.z - this.z);
        const dd = f(
          Mth.sqrt(f(f(f(this.xd * this.xd) + f(this.yd * this.yd)) + f(this.zd * this.zd))),
        );
        this.x = f(this.x - f(f(this.xd / dd) * f(0.05)));
        this.y = f(this.y - f(f(this.yd / dd) * f(0.05)));
        this.z = f(this.z - f(f(this.zd / dd) * f(0.05)));
        this.level.playSound(
          this,
          'random.bowhit',
          f(1.0),
          f(f(1.2) / f(f(Entity.sharedRandom.nextFloat() * f(0.2)) + f(0.9))),
        );
        this.inGround = true;
        this.shakeTime = 7;
        this.critArrow = false;
      }
    }
    if (this.critArrow) {
      for (let i = 0; i < 4; i++) {
        this.level.addParticle(
          ParticleType.crit,
          f(this.x + f(f(this.xd * i) / f(4.0))),
          f(this.y + f(f(this.yd * i) / f(4.0))),
          f(this.z + f(f(this.zd * i) / f(4.0))),
          -this.xd,
          f(-this.yd + f(0.2)),
          -this.zd,
        );
      }
    }
    this.x = f(this.x + this.xd);
    this.y = f(this.y + this.yd);
    this.z = f(this.z + this.zd);
    const sd = f(Mth.sqrt(f(f(this.xd * this.xd) + f(this.zd * this.zd))));
    this.yRot = f(f(Mth.atan2(this.xd, this.zd) * 180) / Mth.PI);
    this.xRot = f(f(Mth.atan2(this.yd, sd) * 180) / Mth.PI);
    while (this.xRot - this.xRotO < -180) this.xRotO -= 360;
    while (this.xRot - this.xRotO >= 180) this.xRotO += 360;
    while (this.yRot - this.yRotO < -180) this.yRotO -= 360;
    while (this.yRot - this.yRotO >= 180) this.yRotO += 360;
    this.xRot = f(this.xRotO + f(f(this.xRot - this.xRotO) * f(0.2)));
    this.yRot = f(this.yRotO + f(f(this.yRot - this.yRotO) * f(0.2)));
    let inertia = f(0.99);
    const gravity = f(0.05);
    if (this.isInWater()) {
      for (let i = 0; i < 4; i++) {
        const s = f(1 / f(4.0));
        this.level.addParticle(
          ParticleType.bubble,
          f(this.x - f(this.xd * s)),
          f(this.y - f(this.yd * s)),
          f(this.z - f(this.zd * s)),
          this.xd,
          this.yd,
          this.zd,
        );
      }
      inertia = f(0.8);
    }
    this.xd = f(this.xd * inertia);
    this.yd = f(this.yd * inertia);
    this.zd = f(this.zd * inertia);
    this.yd = f(this.yd - gravity);
    this.setPos(this.x, this.y, this.z);
  }

  /** C++ `void Arrow::addAdditonalSaveData(CompoundTag* tag)` —— 注意拼写、`player` 是布尔 */
  protected override addAdditonalSaveData(tag: CompoundTag): void {
    tag.putShort('xTile', (this.xTile << 16) >> 16);
    tag.putShort('yTile', (this.yTile << 16) >> 16);
    tag.putShort('zTile', (this.zTile << 16) >> 16);
    tag.putByte('inTile', (this.lastTile << 24) >> 24);
    tag.putByte('inData', (this.lastData << 24) >> 24);
    tag.putByte('shake', (this.shakeTime << 24) >> 24);
    tag.putByte('inGround', this.inGround ? 1 : 0);
    tag.putBoolean('player', this.playerArrow);
  }

  /** C++ `void Arrow::readAdditionalSaveData(CompoundTag* tag)` —— 这几个都带 `& 0xff` */
  protected override readAdditionalSaveData(tag: CompoundTag): void {
    this.xTile = tag.getShort('xTile');
    this.yTile = tag.getShort('yTile');
    this.zTile = tag.getShort('zTile');
    this.lastTile = tag.getByte('inTile') & 0xff;
    this.lastData = tag.getByte('inData') & 0xff;
    this.shakeTime = tag.getByte('shake') & 0xff;
    this.inGround = tag.getByte('inGround') === 1;
    this.playerArrow = tag.getBoolean('player');
  }

  /** C++ `void Arrow::playerTouch(Player* player)` —— 玩家走过去把插着的自己的箭捡回来 */
  override playerTouch(player: Player): void {
    if (this.level.isClientSide) return;
    if (this.inGround && this.playerArrow && this.shakeTime <= 0) {
      const item = new ItemInstance(Item.arrow, 1);
      if (player.inventory.add(item)) {
        this.level.playSound(
          this,
          'random.pop',
          f(0.2),
          f(
            f(
              f(f(Entity.sharedRandom.nextFloat() - Entity.sharedRandom.nextFloat()) * f(0.7)) +
                f(1.0),
            ) * f(2.0),
          ),
        );
        player.take(this, 1);
        this.remove();
      }
    }
  }

  /** C++ `float Arrow::getShadowHeightOffs()` */
  override getShadowHeightOffs(): number {
    return 0;
  }

  /** C++ `int Arrow::getEntityTypeId() const` */
  override getEntityTypeId(): number {
    return EntityTypes.IdArrow;
  }

  /** C++ `int Arrow::getAuxData()` */
  override getAuxData(): number {
    return this.ownerId;
  }
}
