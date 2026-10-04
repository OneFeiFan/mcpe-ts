/**
 * 1:1 移植自 src/client/particle/RedDustParticle.h（73 行，全部内联在头文件里）。
 *
 * 红石粉的红色尘雾：三个颜色分量由**调用方**给（`RedDustParticle(level,x,y,z,r,g,b,scale)`），
 * 再乘一个随机亮度 `brr` 和一个 0.8~1.0 的随机系数。
 *
 * 【⚠ 照抄的三处，其中两处很容易"修"错】
 *   1. **`lifetime` 那一句是 double 运算，不是 float**：
 *      C++ 写的是 `(int)(8 / (Mth::random() * 0.8 + 0.2))` —— `0.8` 和 `0.2` **没有 `f` 后缀**，
 *      所以整条是 double 乘法/加法/除法，最后才 `(int)` 截断。
 *      对比 `SmokeParticle` 的 `scale * 8.0f / (Mth::random() * 0.8f + 0.2f)` —— 那个是 float。
 *      **两处别统一**，这里就不包 `f()`。
 *   2. **`tick` 里没有 `yd += 0.004f`**。SmokeParticle / ExplodeParticle 都有这一句，
 *      红石粉没有 —— 它 tick 完就只剩阻力，别"补齐"。
 *   3. 形参名 `rCol/gCol/bCol` **和成员同名**，构造函数里 `if (rCol == 0) rCol = 1;` 判的是**形参**，
 *      而后面写的是 `this->rCol = …`。TS 里必须显式区分（形参就叫 rCol 等，赋值写 this.）。
 *
 * 【和 SmokeParticle 共有的】基类收到全 0 速度再自己加；`render` 会改 `size`（有副作用）；
 * `tex = 7 - age * 8 / lifetime` 是**整数除法**。
 */
import { Mth } from '@mcpe/util';
import type { Level } from '@mcpe/world';
import { Particle } from './Particle';
import { Tesselator } from '../renderer/Tesselator';

const f = Math.fround;

export class RedDustParticle extends Particle {
  /** C++ 里是 public */
  public oSize: number;

  constructor(
    level: Level,
    x: number,
    y: number,
    z: number,
    rCol: number,
    gCol: number,
    bCol: number,
    scale = f(1.0),
  ) {
    super(level, x, y, z, 0, 0, 0);

    this.xd = f(this.xd * f(0.1));
    this.yd = f(this.yd * f(0.1));
    this.zd = f(this.zd * f(0.1));

    // `if (rCol == 0) rCol = 1;` —— 判的是**形参**
    let r = rCol;
    if (r === 0) r = 1;

    const brr = f(f(Mth.random() * f(0.4)) + f(0.6));
    this.rCol = f(f(f(f(Mth.random() * f(0.2)) + f(0.8)) * r) * brr);
    this.gCol = f(f(f(f(Mth.random() * f(0.2)) + f(0.8)) * gCol) * brr);
    this.bCol = f(f(f(f(Mth.random() * f(0.2)) + f(0.8)) * bCol) * brr);

    this.size = f(this.size * f(0.75));
    this.size = f(this.size * scale);
    this.oSize = this.size;
    // ⚠ 这一句是 **double** 运算（0.8 / 0.2 没有 f 后缀），故意不包 f()
    this.lifetime = Math.trunc(8 / (Mth.random() * 0.8 + 0.2));
    this.lifetime = Math.trunc(f(this.lifetime * scale));
    this.noPhysics = false;
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
    let l = ((this.age + a) / this.lifetime) * 32;
    if (l < 0) l = 0;
    if (l > 1) l = 1;
    this.size = this.oSize * l; // ⚠ 渲染改状态，原样
    super.render(t, a, xa, ya, za, xa2, za2);
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    if (this.age++ >= this.lifetime) this.remove();
    this.tex = 7 - Math.trunc((this.age * 8) / this.lifetime);
    this.move(this.xd, this.yd, this.zd);
    if (this.y === this.yo) {
      this.xd = f(this.xd * f(1.1));
      this.zd = f(this.zd * f(1.1));
    }
    this.xd = f(this.xd * f(0.96));
    this.yd = f(this.yd * f(0.96));
    this.zd = f(this.zd * f(0.96));
    if (this.onGround) {
      this.xd = f(this.xd * f(0.7));
      this.zd = f(this.zd * f(0.7));
    }
    // ⚠ 这里**没有** `yd += 0.004f`（SmokeParticle / ExplodeParticle 有）
  }
}
