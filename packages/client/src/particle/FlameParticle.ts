/**
 * 1:1 移植自 src/client/particle/FlameParticle.h（73 行，整个内联在头文件里）。
 *
 * 火把/火堆上跳的小火苗：**永远满亮**（`getBrightness` 被重写成恒返回 1.0f），
 * 无重力、无 `yd +=`，只吃阻力。
 *
 * 【照抄的四处】
 *   1. `noPhysics = true` —— 不撞地形，所以火苗会穿墙（原样）。
 *   2. 构造函数里直接改 **`x/y/z`**（`x += (rand-rand)*0.05f`），**不重新 setPos** ——
 *      也就是说**碰撞盒没跟着挪**。C++ 就是这样，别"顺手"补一句 setPos。
 *   3. 位置抖动一次要抽 **6 个** `sharedRandom`（三个轴各两次，相减）。
 *   4. `render` 里 `size = oSize * (1 - s*s*0.5f)` —— **没有夹 [0,1]**，
 *      和 SmokeParticle/RedDustParticle 那两个不一样；渲染改 `size` 也一样保留。
 *
 * 【`oSize` 在 C++ 里是 private】（写在 `public:` 之前），照抄。
 */
import { Mth } from '@mcpe/util';
import { Entity, type Level } from '@mcpe/world';
import { Particle } from './Particle';
import { Tesselator } from '../renderer/Tesselator';

const f = Math.fround;

export class FlameParticle extends Particle {
  private oSize: number;

  constructor(level: Level, x: number, y: number, z: number, xa: number, ya: number, za: number) {
    super(level, x, y, z, xa, ya, za);

    this.xd = f(f(this.xd * f(0.01)) + xa);
    this.yd = f(f(this.yd * f(0.01)) + ya);
    this.zd = f(f(this.zd * f(0.01)) + za);
    // ⚠ 直接改 x/y/z，不 setPos（碰撞盒不动）
    this.x = f(
      this.x + f(f(Entity.sharedRandom.nextFloat() - Entity.sharedRandom.nextFloat()) * f(0.05)),
    );
    this.y = f(
      this.y + f(f(Entity.sharedRandom.nextFloat() - Entity.sharedRandom.nextFloat()) * f(0.05)),
    );
    this.z = f(
      this.z + f(f(Entity.sharedRandom.nextFloat() - Entity.sharedRandom.nextFloat()) * f(0.05)),
    );
    this.oSize = this.size;
    this.rCol = f(1.0);
    this.gCol = f(1.0);
    this.bCol = f(1.0);
    // lifetime = (int)(8.0f / (r * 0.8f + 0.2f)) + 4
    this.lifetime = Math.trunc(f(f(8.0) / f(f(Mth.random() * f(0.8)) + f(0.2)))) + 4;
    this.noPhysics = true;
    this.tex = 48;
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
    this.size = this.oSize * (1 - s * s * f(0.5)); // ⚠ 没有夹 [0,1]，原样
    super.render(t, a, xa, ya, za, xa2, za2);
  }

  /** C++ `float getBrightness(float a) { return 1.0f; }` —— 火苗永远满亮 */
  override getBrightness(_a: number): number {
    return f(1.0);
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    if (this.age++ >= this.lifetime) this.remove();
    this.move(this.xd, this.yd, this.zd);
    this.xd = f(this.xd * f(0.96));
    this.yd = f(this.yd * f(0.96));
    this.zd = f(this.zd * f(0.96));
    if (this.onGround) {
      this.xd = f(this.xd * f(0.7));
      this.zd = f(this.zd * f(0.7));
    }
  }
}
