/**
 * 1:1 移植自 src/client/particle/LavaParticle.h（63 行，整个内联在头文件里）。
 *
 * 岩浆上跳的火星：**一边往上冒一边时不时撒一颗 smoke**（`tick` 里真的会去调
 * `level.addParticle("smoke", …)` —— 所以岩浆自己会冒烟）。
 *
 * 【照抄的四处】
 *   1. `yd` 先跟着 `*= 0.8f`，**紧接着被下一句整个覆盖掉**（`yd = rand*0.4f + 0.05f`）——
 *      前面那句对 yd 是白做的，原样保留。
 *   2. `lifetime = (int)(16 / (Mth::random() * 0.8 + 0.2))` —— 和 RedDust/Bubble 一样
 *      **0.8 / 0.2 没有 f 后缀 → double 运算**，故意不包 `f()`。
 *   3. `render` 里 `size = oSize * (1 - s*s)` —— 没有 `*0.5f`（火苗那边有），也**不夹 [0,1]**。
 *   4. `getBrightness` 恒返回 1（岩浆粒子永远满亮），和 FlameParticle 同款。
 *
 * 【`oSize` 在 C++ 里是 private】（写在 `public:` 之前），照抄。
 */
import { Mth } from '@mcpe/util';
import { Entity, type Level } from '@mcpe/world';
import { Particle } from './Particle';
import { Tesselator } from '../renderer/Tesselator';

const f = Math.fround;

export class LavaParticle extends Particle {
  private oSize: number;

  constructor(level: Level, x: number, y: number, z: number) {
    super(level, x, y, z, 0, 0, 0);

    this.xd = f(this.xd * f(0.8));
    this.yd = f(this.yd * f(0.8)); // ⚠ 下一句就把 yd 覆盖了，这句对 yd 是白做的（原样）
    this.zd = f(this.zd * f(0.8));
    this.yd = f(f(Entity.sharedRandom.nextFloat() * f(0.4)) + f(0.05));
    this.rCol = 1;
    this.gCol = 1;
    this.bCol = 1;
    this.size = f(this.size * f(f(Entity.sharedRandom.nextFloat() * 2) + f(0.2)));
    this.oSize = this.size;
    // ⚠ double 运算（0.8 / 0.2 无 f 后缀），故意不包 f()
    this.lifetime = Math.trunc(16 / (Mth.random() * 0.8 + 0.2));
    this.noPhysics = false;
    this.tex = 49;
  }

  /** C++ `float getBrightness(float a) { return 1; }` */
  override getBrightness(_a: number): number {
    return f(1.0);
  }

  override render(
    t: Tesselator,
    a: number,
    xa: number,
    ya: number,
    za: number,
    xa2: number,
    za2: number,
  ): void {
    const s = (this.age + a) / this.lifetime;
    this.size = this.oSize * (1 - s * s); // ⚠ 没有 *0.5f，也不夹 [0,1]
    super.render(t, a, xa, ya, za, xa2, za2);
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    if (this.age++ >= this.lifetime) this.remove();
    // odds = age / (float)lifetime → 越老越容易不再冒烟
    const odds = this.age / this.lifetime;
    if (Entity.sharedRandom.nextFloat() > odds) {
      this.level.addParticle('smoke', this.x, this.y, this.z, this.xd, this.yd, this.zd);
    }
    this.yd = f(this.yd - f(0.03));
    this.move(this.xd, this.yd, this.zd);
    this.xd = f(this.xd * f(0.999));
    this.yd = f(this.yd * f(0.999));
    this.zd = f(this.zd * f(0.999));
    if (this.onGround) {
      this.xd = f(this.xd * f(0.7));
      this.zd = f(this.zd * f(0.7));
    }
  }
}
