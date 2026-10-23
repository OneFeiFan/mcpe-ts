/**
 * 1:1 移植自 src/world/level/Explosion.h 与 Explosion.cpp（164 行 + 头 38 行）。
 *
 * 一次爆炸：`explode()` 从爆炸中心朝 16×16×16 立方体的**表面**（`i != 0 && i != 15`
 * 三面都成立的格子直接跳过）射出 16³-14³ = 1352 条射线，每条按 0.3 格一步往前走，
 * 撞到方块就按它的爆炸抗性削剩余能量，能量耗尽前经过的格子都记进 `toBlow`；
 * `finalizeExplosion()` 再挨个把 `toBlow` 里的方块清掉、掉资源、放粒子。
 *
 * 【两处必须原样保留的怪癖】
 *   1. **随机数来自两个不同的源**：`explode()` 里的射线能量用 `level->random`，
 *      而 `fire` 分支里"要不要点火"用的是**成员** `random`（`Explosion` 自己那个、从没被 seed 过）。
 *      两者的状态完全不同 —— 弄混了随机流就对不上。
 *   2. `r += r;` 之后又把 `r = org;` 还原回去。中间那段（算 AABB、给实体推力）用的是
 *      **翻倍**的半径，伤害公式 `(pow*pow+pow)/2*8*r+1` 里那个 r 也是翻倍的。
 *
 * 【float 边界】C++ 的 `float` 形参/返回值在 TS 里都是 `number`（double）：
 * 构造函数入口、`getSeenPercent` 与 `getExplosionResistance` 的返回值都要用 `f()` 收一次；
 * `(int)` 用 `f2i`（NaN / 越界 → INT_MIN），不能用 `Math.trunc`。
 *
 * 【粒子/声音】`level->addParticle` / `level->playSound` 在 TS 的 `Level` 里**是真实现**
 * （转发给 listener），客户端的播放端（ParticleEngine / SoundEngine）没移植 —— 那是另一批，
 * 所以这里照常调用，不是 DEFERRED。
 *
 * 【网络】`ExplodePacket` 那句照例 DEFERRED(Network)。
 */
import { f2i, Mth, Random } from '@mcpe/util';
import { AABB } from '../phys/AABB';
import { Vec3 } from '../phys/Vec3';
import type { Entity } from '../entity/Entity';
import { ParticleType } from '../entity/EntityTypes';
import type { Level } from './Level';
import { TilePos } from './TilePos';
import { Tile } from './tile/Tile';

const f = Math.fround;

/**
 * ADAPTED(Cpp)：C++ 里 `typedef std::set<TilePos> TilePosSet;`。
 *
 * `std::set` 按 `operator<` 排序，而 `TilePos::operator<` 比的是 **hashCode** ——
 * 于是遍历顺序是 **hashCode 升序**，而且**两个 hashCode 相同的不同坐标会被当成同一个元素**
 * （插入第二个时 `set` 认为已存在，直接丢弃）。这是原样的行为，不"修正"。
 * `finalizeExplosion` 里那个 `j & 7` 决定哪一格放粒子，就建立在这个顺序上。
 */
export class TilePosSet {
  /** 按 hashCode 升序保存（= std::set 的遍历顺序） */
  private readonly items: TilePos[] = [];

  size(): number {
    return this.items.length;
  }

  insert(tp: TilePos): void {
    const h = tp.hashCode();
    // 二分找第一个 hashCode >= h 的位置；std::set 就是把新元素插在那儿
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid]!.hashCode() < h) lo = mid + 1;
      else hi = mid;
    }
    // 等价元素已存在 → std::set::insert 什么都不做
    if (lo < this.items.length && this.items[lo]!.hashCode() === h) return;
    this.items.splice(lo, 0, tp);
  }

  /** std::set 的遍历：升序。返回内部数组，调用方只读 */
  entries(): readonly TilePos[] {
    return this.items;
  }
}

export class Explosion {
  x: number;
  y: number;
  z: number;
  r: number;
  toBlow = new TilePosSet();
  fire: boolean;
  source: Entity | null;
  /** C++ `Random random;`（成员，从没被 seed）—— 只给 fire 分支用，见文件头第 1 条 */
  private random = new Random();
  private level: Level;

  /** C++ `Explosion(Level*, Entity*, float x, float y, float z, float r)` */
  constructor(level: Level, source: Entity | null, x: number, y: number, z: number, r: number) {
    this.level = level;
    this.source = source;
    // C++ 形参是 float，进构造函数时已经是 float；TS 的 number 是 double，入口收一次
    this.x = f(x);
    this.y = f(y);
    this.z = f(z);
    this.r = f(r);
    this.fire = false;
  }

  /** C++ `void Explosion::explode()` */
  explode(): void {
    const org = this.r;
    const size = 16;
    for (let xx = 0; xx < size; xx++)
      for (let yy = 0; yy < size; yy++)
        for (let zz = 0; zz < size; zz++) {
          // 只走立方体的表面那一层
          if (
            xx !== 0 &&
            xx !== size - 1 &&
            yy !== 0 &&
            yy !== size - 1 &&
            zz !== 0 &&
            zz !== size - 1
          )
            continue;
          let xd = f(f(f(xx / f(size - 1)) * 2) - 1);
          let yd = f(f(f(yy / f(size - 1)) * 2) - 1);
          let zd = f(f(f(zz / f(size - 1)) * 2) - 1);
          const d = f(Math.sqrt(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd))));
          xd = f(xd / d);
          yd = f(yd / d);
          zd = f(zd / d);
          // ⚠ 这里用的是 level->random（不是成员 random）
          let remainingPower = f(this.r * f(f(0.7) + f(this.level.random.nextFloat() * f(0.6))));
          let xp = this.x;
          let yp = this.y;
          let zp = this.z;
          const stepSize = f(0.3);
          while (remainingPower > 0) {
            const xt = Mth.floor(xp);
            const yt = Mth.floor(yp);
            const zt = Mth.floor(zp);
            const t = this.level.getTile(xt, yt, zt);
            if (t > 0) {
              // C++ 的 getExplosionResistance 返回 float；TS 返回 double，在调用点收一次
              remainingPower = f(
                remainingPower -
                  f(f(f(Tile.tiles[t]!.getExplosionResistance(this.source)) + f(0.3)) * stepSize),
              );
            }
            if (remainingPower > 0) {
              this.toBlow.insert(new TilePos(xt, yt, zt));
            }
            xp = f(xp + f(xd * stepSize));
            yp = f(yp + f(yd * stepSize));
            zp = f(zp + f(zd * stepSize));
            remainingPower = f(remainingPower - f(stepSize * f(0.75)));
          }
        }
    // 从这里到 `r = org;` 之间用的是**翻倍**的半径
    this.r = f(this.r + this.r);
    const x0 = Mth.floor(f(f(this.x - this.r) - 1));
    const x1 = Mth.floor(f(f(this.x + this.r) + 1));
    const y0 = Mth.floor(f(f(this.y - this.r) - 1));
    const y1 = Mth.floor(f(f(this.y + this.r) + 1));
    const z0 = Mth.floor(f(f(this.z - this.r) - 1));
    const z1 = Mth.floor(f(f(this.z + this.r) + 1));
    const entities = this.level.getEntities(this.source, new AABB(x0, y0, z0, x1, y1, z1));
    const center = new Vec3(this.x, this.y, this.z);
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      const dist = f(e.distanceTo(this.x, this.y, this.z) / this.r);
      if (dist <= 1) {
        let xa = f(e.x - this.x);
        let ya = f(e.y - this.y);
        let za = f(e.z - this.z);
        const ida = Mth.invSqrt(f(f(f(xa * xa) + f(ya * ya)) + f(za * za)));
        xa = f(xa * ida);
        ya = f(ya * ida);
        za = f(za * ida);
        // C++ 的 getSeenPercent 返回 float；TS 返回 double，在调用点收一次
        const sp = f(this.level.getSeenPercent(center, e.bb));
        const pow = f(f(1 - dist) * sp);
        // C++ 的 `(int)` 是向零截断；NaN / 越界按 x86 cvttss2si 落到 INT_MIN
        e.hurt(this.source, f2i(f(f(f(f(f(f(pow * pow) + pow) / 2) * 8) * this.r) + 1)));
        const push = pow;
        e.xd = f(e.xd + f(xa * push));
        e.yd = f(e.yd + f(ya * push));
        e.zd = f(e.zd + f(za * push));
      }
    }
    this.r = org;
    const toBlowArray = this.toBlow.entries();
    if (this.fire) {
      for (let j = toBlowArray.length - 1; j >= 0; j--) {
        const tp = toBlowArray[j]!;
        const xt = tp.x;
        const yt = tp.y;
        const zt = tp.z;
        const t = this.level.getTile(xt, yt, zt);
        const b = this.level.getTile(xt, yt - 1, zt);
        // ⚠ 这里用的是成员 random（不是 level->random），见文件头第 1 条
        if (t === 0 && Tile.solid[b]! && this.random.nextInt(3) === 0) {
          this.level.setTileNoUpdate(xt, yt, zt, Tile.fire.id);
        }
      }
    }
  }

  /** C++ `void Explosion::finalizeExplosion()` */
  finalizeExplosion(): void {
    // DEFERRED(待确认): level->playSound(x, y, z, "random.explode", 4, (1 + (level->random.nextFloat() - level->random.nextFloat()) * 0.2f) * 0.7f);
    // C++ 没有规定同一个表达式里两个函数调用的先后顺序；TS 按从左到右调用（与 Chicken/PigZombie/Sheep/Skeleton 的先例一致）。
    // ⚠ 那两次 nextFloat() **必须照调** —— 它们消耗的是 level->random，而下面放粒子用的
    //   也是同一个 level->random，跳过就把随机流错位了。
    //   TS 的 Level.playSound 是真实现（转发给 listener），只是客户端没接 SoundEngine，
    //   所以**听着没声音**——那是"播放端没做"，不是"这一句没移植"。
    this.level.playSound(
      this.x,
      this.y,
      this.z,
      'random.explode',
      4,
      f(
        f(1 + f(f(this.level.random.nextFloat() - this.level.random.nextFloat()) * f(0.2))) *
          f(0.7),
      ),
    );
    const toBlowArray = this.toBlow.entries();
    let j = 0;
    for (const tp of toBlowArray) {
      const xt = tp.x;
      const yt = tp.y;
      const zt = tp.z;
      const t = this.level.getTile(xt, yt, zt);
      // C++ 是个 `do { … } while (0)`，里面 `if (j & 7) break;` —— 效果就是"每 8 格放一次粒子"
      if ((j & 7) === 0) {
        const xa = f(xt + this.level.random.nextFloat());
        const ya = f(yt + this.level.random.nextFloat());
        const za = f(zt + this.level.random.nextFloat());
        let xd = f(xa - this.x);
        let yd = f(ya - this.y);
        let zd = f(za - this.z);
        const invdd = f(1.0 / Mth.sqrt(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd))));
        xd = f(xd * invdd);
        yd = f(yd * invdd);
        zd = f(zd * invdd);
        let speed = f(f(0.5) / f(f(this.r / invdd) + f(0.1)));
        speed = f(
          speed * f(f(this.level.random.nextFloat() * this.level.random.nextFloat()) + f(0.3)),
        );
        xd = f(xd * speed);
        yd = f(yd * speed);
        zd = f(zd * speed);
        this.level.addParticle(
          ParticleType.explode,
          f(f(xa + this.x * 1) / 2),
          f(f(ya + this.y * 1) / 2),
          f(f(za + this.z * 1) / 2),
          xd,
          yd,
          zd,
        );
        this.level.addParticle(ParticleType.smoke, xa, ya, za, xd, yd, zd);
      }
      if (t > 0) {
        if (!this.level.isClientSide)
          Tile.tiles[t]!.spawnResources(
            this.level,
            xt,
            yt,
            zt,
            this.level.getData(xt, yt, zt),
            f(0.3),
          );
        if (this.level.setTileNoUpdate(xt, yt, zt, 0)) this.level.updateNeighborsAt(xt, yt, zt, 0);
        this.level.setTileDirty(xt, yt, zt);
        if (!this.level.isClientSide) Tile.tiles[t]!.wasExploded(this.level, xt, yt, zt);
      }
      j++;
    }
  }
}
