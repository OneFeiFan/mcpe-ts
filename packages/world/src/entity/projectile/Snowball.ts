/**
 * 1:1 移植自 src/world/entity/projectile/Snowball.h（50 行，**纯头文件，没有 .cpp**）。
 *
 * 雪球：`Throwable` 的全部行为都在基类里，这个类只做三件事 ——
 * 三个构造函数各设一次 `entityRendererId`、给一个 type id、**重写 `onHit`**。
 *
 * 【`onHit` 是 public】同一个虚函数在 `ThrownEgg` 里是 **protected** ——
 * 可见性不一致是原样（任务单 D0 记过这条），别"统一"。
 *
 * 【`onHit` 里 `hurt(this, 0)` 传的伤害是 0】雪球打人**不掉血**，只推一下 ——
 * 原句如此。真正让人位移的是 `Mob.hurt` 里那套击退。
 *
 * 【`onHit` **没有**设 `inGround`】所以雪球不会走"插在地上躺 20 分钟"那条路 ——
 * 它碰到什么立刻 `remove()`。`Throwable` 里那段落地存活逻辑，雪球这一支根本进不去。
 */
import { EntityRendererId } from '../EntityRendererId';
import { EntityTypes, ParticleType } from '../EntityTypes';
import { Throwable } from './Throwable';
import { type HitResult, HitResultType } from '../../phys/HitResult';
import type { Mob } from '../Mob';
import type { Level } from '../../level/Level';

export class Snowball extends Throwable {
  /** C++ `Snowball(Level*)` */
  constructor(level: Level);
  /** C++ `Snowball(Level*, Mob* mob)` */
  constructor(level: Level, mob: Mob);
  /** C++ `Snowball(Level*, float x, float y, float z)` */
  constructor(level: Level, x: number, y: number, z: number);
  constructor(level: Level, a?: Mob | number, b?: number, c?: number) {
    if (a === undefined) super(level);
    else if (typeof a === 'number') super(level, a, b!, c!);
    else super(level, a);
    this.entityRendererId = EntityRendererId.ER_SNOWBALL_RENDERER;
  }

  /** C++ `virtual int Snowball::getEntityTypeId() const` */
  override getEntityTypeId(): number {
    return EntityTypes.IdSnowball;
  }

  /** C++ `void Snowball::onHit(const HitResult& res)` —— **public**（ThrownEgg 那边是 protected） */
  override onHit(res: HitResult): void {
    if (res.type === HitResultType.ENTITY) res.entity!.hurt(this, 0);
    for (let i = 0; i < 6; i++)
      this.level.addParticle(ParticleType.snowballpoof, this.x, this.y, this.z, 0, 0, 0);
    if (!this.level.isClientSide) this.remove();
  }
}
