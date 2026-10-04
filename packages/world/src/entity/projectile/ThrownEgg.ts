/**
 * 1:1 移植自 src/world/entity/projectile/ThrownEgg.h（63 行，**纯头文件，没有 .cpp**）。
 *
 * 蛋：和雪球一样，实体体全在 D8 的 `Throwable` 里。这个类只做三件事 ——
 * 三个构造函数各设一次 `entityRendererId`、给一个 type id、**重写 `onHit`**（孵鸡）。
 *
 * 【和 `Snowball` 那三处对照着看，都是原样】
 *   1. `onHit` 在这里是 **protected**（`Snowball` 那边是 public）—— 同一个虚函数、可见性不一致。
 *   2. `hurt(this, 0)` —— 伤害还是 0。
 *   3. 也**不设 `inGround`**。
 *
 * 【孵鸡用的是 `sharedRandom`，不是 level.random】`Throwable::shoot` 那边也是这个静态量。
 * 两次抽取是**连着**的：先 `nextInt(8) == 0` 决定孵不孵，孵的话再 `nextInt(32) == 0`
 * 决定孵 1 只还是 4 只 —— 顺序不能换，换了下游随机流就错位。
 *
 * 孵出来的鸡从 G9 起**画面上看得见**（`ChickenRenderer` 已注册）；
 * 蛋本身用的是 D9.5 注册的 `ItemSpriteRenderer`（`ER_THROWNEGG_RENDERER`，图标 12）。
 */
import { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { EntityTypes, ParticleType } from '../EntityTypes';
import { Throwable } from './Throwable';
import { type HitResult, HitResultType } from '../../phys/HitResult';
import { Chicken } from '../animal/Chicken';
import type { Mob } from '../Mob';
import type { Level } from '../../level/Level';

export class ThrownEgg extends Throwable {
  /** C++ `ThrownEgg(Level*)` */
  constructor(level: Level);
  /** C++ `ThrownEgg(Level*, Mob* mob)` */
  constructor(level: Level, mob: Mob);
  /** C++ `ThrownEgg(Level*, float x, float y, float z)` */
  constructor(level: Level, x: number, y: number, z: number);
  constructor(level: Level, a?: Mob | number, b?: number, c?: number) {
    if (a === undefined) super(level);
    else if (typeof a === 'number') super(level, a, b!, c!);
    else super(level, a);
    this.entityRendererId = EntityRendererId.ER_THROWNEGG_RENDERER;
  }

  /** C++ `virtual int ThrownEgg::getEntityTypeId() const` */
  override getEntityTypeId(): number {
    return EntityTypes.IdThrownEgg;
  }

  /** C++ `void ThrownEgg::onHit(const HitResult& res)` —— **protected**（Snowball 那边是 public） */
  protected override onHit(res: HitResult): void {
    if (res.type === HitResultType.ENTITY) res.entity!.hurt(this, 0);
    if (!this.level.isClientSide && Entity.sharedRandom.nextInt(8) === 0) {
      let count = 1;
      if (Entity.sharedRandom.nextInt(32) === 0) count = 4;
      for (let i = 0; i < count; i++) {
        const chicken = new Chicken(this.level);
        chicken.moveTo(this.x, this.y, this.z, this.yRot, 0);
        this.level.addEntity(chicken);
      }
    }
    for (let i = 0; i < 6; i++)
      this.level.addParticle(ParticleType.snowballpoof, this.x, this.y, this.z, 0, 0, 0);
    if (!this.level.isClientSide) this.remove();
  }
}
