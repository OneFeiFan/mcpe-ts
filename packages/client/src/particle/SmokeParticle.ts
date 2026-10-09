/**
 * 1:1 移植自 src/client/particle/SmokeParticle.h（69 行，全部内联在头文件里）。
 *
 * 向上飘的烟：`yd += 0.004f`（**没有重力**，和基类 tick 完全不同），越飘越淡越大。
 * `largesmoke` 那个分支就是它传 `scale = 2.5f`。
 *
 * 【照抄的三处】
 *   1. 基类构造收到的是**全 0 速度**（`super(level,x,y,z,0,0,0)`），
 *      然后 `xd/yd/zd *= 0.1f` 再把形参 `xa/ya/za` **加**上去 —— 不是直接传进去。
 *   2. `tex = 7 - age * 8 / lifetime` 是**整数除法**（三个都是 int）。
 *      写成 `/` 会得到小数 → 贴图格号错乱。typecheck 抓不到，只能靠截图。
 *   3. `render` 会**改 `size`**（`size = oSize * l`）—— 渲染函数带副作用，是原样，
 *      别"顺手"改成局部量。
 */
import { Mth } from '@mcpe/util';
import type { Level } from '@mcpe/world';
import { Particle } from './Particle';
import { Tesselator } from '../renderer/Tesselator';

const f = Math.fround;

export class SmokeParticle extends Particle {
  /** C++ 里是 public */
  public oSize: number;

  constructor(
    level: Level,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    scale = f(1.0),
  ) {
    super(level, x, y, z, 0, 0, 0);

    this.xd = f(this.xd * f(0.1));
    this.yd = f(this.yd * f(0.1));
    this.zd = f(this.zd * f(0.1));
    this.xd = f(this.xd + xa);
    this.yd = f(this.yd + ya);
    this.zd = f(this.zd + za);
    const c = f(Mth.random() * f(0.5));
    this.rCol = c;
    this.gCol = c;
    this.bCol = c;
    this.size = f(this.size * f(0.75));
    this.size = f(this.size * scale);
    this.oSize = this.size;
    // lifetime = (int)(scale * 8.0f / (Mth::random() * 0.8f + 0.2f))
    this.lifetime = Math.trunc(f(f(scale * f(8.0)) / f(f(Mth.random() * f(0.8)) + f(0.2))));
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
    this.yd = f(this.yd + f(0.004));
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
  }
}
