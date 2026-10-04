/**
 * 1:1 移植自 src/client/particle/BubbleParticle.h（51 行，整个内联在头文件里）。
 *
 * 水里的气泡：**只有在水里才活**（材质不是水就立刻 remove），一路往上飘。
 *
 * 【照抄的四处 —— 这个类的生命周期和其它粒子都不一样】
 *   1. `tick` 里**没有** `age++ >= lifetime` 那套，用的是 `if (lifetime-- <= 0) remove();`
 *      —— **后置递减**，判完再减。所以 lifetime 既是"寿命"又被当计数器用。
 *   2. `tick` 里**没有** `xo = x` 之外的任何快照逻辑差异 —— 但有 `yd += 0.002f`（往上）。
 *   3. `setSize(0.02f, 0.02f)` 写成了 `this->setSize(...)`（C++ 里显式 this），
 *      缩到极小；`size` 还再乘一个 `(rand*0.6f + 0.2f)`。
 *   4. `lifetime` 那句 `(int)(8 / (Mth::random() * 0.8 + 0.2))` 和 RedDustParticle 一样，
 *      **0.8 / 0.2 没有 f 后缀 → double 运算**，故意不包 `f()`。
 */
import { Mth } from '@mcpe/util';
import { Entity, Material, type Level } from '@mcpe/world';
import { Particle } from './Particle';

const f = Math.fround;

export class BubbleParticle extends Particle {
  constructor(level: Level, x: number, y: number, z: number, xa: number, ya: number, za: number) {
    super(level, x, y, z, xa, ya, za);

    this.rCol = f(1.0);
    this.gCol = f(1.0);
    this.bCol = f(1.0);
    this.tex = 32;
    this.setSize(f(0.02), f(0.02));
    this.size = f(this.size * f(f(Entity.sharedRandom.nextFloat() * f(0.6)) + f(0.2)));
    this.xd = f(f(xa * f(0.2)) + f(f(f(Mth.random() * 2) - 1) * f(0.02)));
    this.yd = f(f(ya * f(0.2)) + f(f(f(Mth.random() * 2) - 1) * f(0.02)));
    this.zd = f(f(za * f(0.2)) + f(f(f(Mth.random() * 2) - 1) * f(0.02)));
    // ⚠ 这一句是 **double** 运算（0.8 / 0.2 没有 f 后缀），故意不包 f()
    this.lifetime = Math.trunc(8 / (Mth.random() * 0.8 + 0.2));
  }

  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yd = f(this.yd + f(0.002));
    this.move(this.xd, this.yd, this.zd);
    this.xd = f(this.xd * f(0.85));
    this.yd = f(this.yd * f(0.85));
    this.zd = f(this.zd * f(0.85));
    if (
      this.level.getMaterial(Mth.floor(this.x), Mth.floor(this.y), Mth.floor(this.z)) !==
      Material.water
    ) {
      this.remove();
    }
    // ⚠ 后置递减：判完再减（所以 lifetime = N 时能活 N+1 刻）
    if (this.lifetime-- <= 0) this.remove();
  }
}
