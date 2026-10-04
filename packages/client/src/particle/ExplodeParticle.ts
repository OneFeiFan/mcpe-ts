/**
 * 1:1 移植自 src/client/particle/ExplodeParticle.h（51 行，全部内联在头文件里）。
 *
 * 爆炸的火光：比 SmokeParticle 飞得快、掉得也快（阻力 `0.90f`，烟是 `0.96f`）。
 *
 * 【和 SmokeParticle 的三处不同，都是原样】
 *   1. 基类构造收的是**形参速度**（`super(level,x,y,z,xa,ya,za)`），
 *      然后**用形参 xa/ya/za 重新算一遍** xd/yd/zd（注意右边是形参，不是 `this->xd`）。
 *   2. `size` 是**两次 `sharedRandom.nextFloat()` 相乘**再乘 6.0f 加 1.0f ——
 *      不是一次；少抽一次随机数，后面所有粒子的随机序列都会跟着错位。
 *   3. `lifetime` 末尾有个 **`+ 2`**（在 `(int)` 截断**之后**加）。
 */
import { Mth } from '@mcpe/util';
import { Entity, type Level } from '@mcpe/world';
import { Particle } from './Particle';

const f = Math.fround;

export class ExplodeParticle extends Particle {
  constructor(level: Level, x: number, y: number, z: number, xa: number, ya: number, za: number) {
    super(level, x, y, z, xa, ya, za);

    const jx = f(f(f(Mth.random() * f(2.0)) - f(1.0)) * f(0.05));
    const jy = f(f(f(Mth.random() * f(2.0)) - f(1.0)) * f(0.05));
    const jz = f(f(f(Mth.random() * f(2.0)) - f(1.0)) * f(0.05));
    this.xd = f(xa + jx);
    this.yd = f(ya + jy);
    this.zd = f(za + jz);

    const c = f(f(Entity.sharedRandom.nextFloat() * f(0.3)) + f(0.7));
    this.rCol = c;
    this.gCol = c;
    this.bCol = c;
    // ⚠ 两次 nextFloat() 相乘
    this.size = f(
      f(Entity.sharedRandom.nextFloat() * Entity.sharedRandom.nextFloat() * f(6.0)) + f(1.0),
    );
    // lifetime = (int)(16.0f / (r * 0.8f + 0.2f)) + 2
    this.lifetime =
      Math.trunc(f(f(16.0) / f(f(Entity.sharedRandom.nextFloat() * f(0.8)) + f(0.2)))) + 2;
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    if (this.age++ >= this.lifetime) this.remove();
    this.tex = 7 - Math.trunc((this.age * 8) / this.lifetime);
    this.yd = f(this.yd + f(0.004));
    this.move(this.xd, this.yd, this.zd);
    this.xd = f(this.xd * f(0.9));
    this.yd = f(this.yd * f(0.9));
    this.zd = f(this.zd * f(0.9));
    if (this.onGround) {
      this.xd = f(this.xd * f(0.7));
      this.zd = f(this.zd * f(0.7));
    }
  }
}
// render 不重写：直接用基类那个（C++ 里 ExplodeParticle 没有 render）。
