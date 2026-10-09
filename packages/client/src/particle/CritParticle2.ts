/**
 * 1:1 移植自 src/client/particle/CritParticle2.h（74 行，整个内联在头文件里）。
 *
 * 箭的暴击星：往四周炸开的小星星，绿色和蓝色通道随年龄衰减（越飞越"热"）。
 *
 * 【⚠ 构造函数最后那句 `tick()` 调的是**它自己**的 tick，不是基类的】
 * C++ 的规则（[class.cdtor]/4）是：构造函数体内调虚函数，调的是**构造函数所在那一级**的
 * final overrider —— 这里是 `CritParticle2::tick`（它会做 `yd -= 0.02f`、`gCol *= 0.96f` 那一套）。
 * JS 的 `this.tick()` 行为一致，**照写即可**。
 * ⚠ **别照 PITFALLS 第 7 条改成 `Particle.prototype.tick.call(this)`** ——
 * 那条说的是"**基类**构造期间只调到基类自己的版本"，这里不是基类构造。
 * 那样改会把基类的 tick 接上去（少了 `yd -= 0.02f`），是移植 bug。
 *
 * 【其它照抄的】
 *   - `super(level,x,y,z,0,0,0)` —— 基类收全 0 速度，再 `×0.1f` 后加 `形参 × 0.4f`；
 *   - `tex = 16 * 4 + 1`（= 65，写算式不写 65）；
 *   - `lifetime = (int)(6 / (r * 0.8f + 0.6f) * scale)` —— `6` 是 int 但除以 float，
 *     所以**整个是 float 除法**（不是整数除法，别跟 `tex` 那句搞混）；
 *   - `render` 里 `size = oSize * l` 且 `l` 夹在 [0,1]；`visible` 为假直接 return
 *     （`visible` 只在构造里被设成 true，之后再没人改过 —— 原样保留）。
 */
import { Mth } from '@mcpe/util';
import type { Level } from '@mcpe/world';
import { Particle } from './Particle';
import { Tesselator } from '../renderer/Tesselator';

const f = Math.fround;

export class CritParticle2 extends Particle {
  protected visible: boolean;
  protected oSize: number;

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
    this.visible = true;

    this.xd = f(this.xd * f(0.1));
    this.yd = f(this.yd * f(0.1));
    this.zd = f(this.zd * f(0.1));
    this.xd = f(this.xd + f(xa * f(0.4)));
    this.yd = f(this.yd + f(ya * f(0.4)));
    this.zd = f(this.zd + f(za * f(0.4)));
    const c = f(f(Mth.random() * f(0.3)) + f(0.6));
    this.rCol = c;
    this.gCol = c;
    this.bCol = c;
    this.size = f(this.size * f(0.75));
    this.size = f(this.size * scale);
    this.oSize = this.size;
    // lifetime = (int)(6 / (r * 0.8f + 0.6f) * scale) —— float 除法
    this.lifetime = Math.trunc(f(f(6 / f(f(Mth.random() * f(0.8)) + f(0.6))) * scale));
    this.noPhysics = false;
    this.tex = 16 * 4 + 1;
    this.tick(); // ⚠ 调的是本类重写的 tick（见文件头）
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
    if (!this.visible) return;
    let l = ((this.age + a) / this.lifetime) * 32;
    if (l < 0) l = 0;
    if (l > 1) l = 1;
    this.size = this.oSize * l;
    super.render(t, a, xa, ya, za, xa2, za2);
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    if (this.age++ >= this.lifetime) this.remove();
    this.move(this.xd, this.yd, this.zd);
    this.gCol = f(this.gCol * f(0.96));
    this.bCol = f(this.bCol * f(0.9));
    this.xd = f(this.xd * f(0.7));
    this.yd = f(this.yd * f(0.7));
    this.zd = f(this.zd * f(0.7));
    this.yd = f(this.yd - f(0.02));
    if (this.onGround) {
      this.xd = f(this.xd * f(0.7));
      this.zd = f(this.zd * f(0.7));
    }
  }
}
