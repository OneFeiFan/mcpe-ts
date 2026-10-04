/**
 * 1:1 移植自 src/client/particle/Particle.h 与 Particle.cpp（46 + 99 行）。
 *
 * 粒子的基类：一个会飘、会落地、会随生命周期消失的**公告板小方块** ——
 * 4 个顶点按相机基向量摊开，贴 `particles.png` 里 16×16 的一格。
 *
 * 【它继承 Entity】所以直接白拿 `move()`（碰撞在 `Entity.move` 里发生，
 * Particle 自己**不调** `level.clip`）、`onGround`、`getBrightness`、`sharedRandom`。
 *
 * 【照抄的四处】
 *   1. **两个随机源不能合并**：初速度抖动用 `Mth::random()`（模块级，C++ 里是按启动时间
 *      播种的 Random，本来就不可复现），而 `uo/vo/size/lifetime` 用 `Entity.sharedRandom`。
 *   2. `tick()` **不调 `super.tick()`**（和 FallingTile / PrimedTnt 一样）——
 *      `baseTick` 那套（着火、入水、掉出世界）一个都不跑。
 *   3. `getEntityTypeId()` 硬编码返回 **0** —— EntityTypes 里没有粒子的 id。
 *   4. 两个 NBT 方法是**空函数体**，C++ 里就是空的，不是忘了写。
 *
 * 【浮点分两档】
 *   构造函数 / `tick` / `setPower` / `scale` 是**物理**，每个浮点运算都过 `f()`；
 *   `render` 是**画面**（PITFALLS 第 3 条第三档，和 ArrowRenderer 一个待遇），
 *   不逐步 fround，但带 `f` 后缀的字面量（`0.999f`）照样包 `f()`。
 *
 * 【UV 里的两个整数除法】`tex % 16` 和 `tex / 16` 在 C++ 里都是 int 运算，
 * 后者要写 `Math.trunc` —— 写成 `/` 会得到小数，纹理直接错乱，
 * 而 typecheck 抓不到、单测不专门写也看不到，只能靠截图。
 *
 * 【这个文件为什么不 import ParticleEngine】见 `ParticleTextures.ts` 的头注释。
 */
import { Mth } from '@mcpe/util';
import type { CompoundTag } from '@mcpe/nbt';
import { Entity, type Level } from '@mcpe/world';
import { Tesselator } from '../renderer/Tesselator';
import { MISC_TEXTURE } from './ParticleTextures';

const f = Math.fround;

export class Particle extends Entity {
  /** C++ `static float xOff, yOff, zOff;` —— 由 `ParticleEngine::render` 设成相机的插值位置 */
  static xOff = 0;
  static yOff = 0;
  static zOff = 0;

  /** C++ `int tex;` —— particles.png 里 16×16 的格号 */
  protected tex: number;
  /** C++ `float uo, vo;` —— 子类用的 UV 抖动（基类的 render 不用） */
  protected uo: number;
  protected vo: number;
  /** C++ `int age;` */
  protected age: number;
  /** C++ `int lifetime;` */
  protected lifetime: number;
  /** C++ `float size;` */
  protected size: number;
  /** C++ `float gravity;` */
  protected gravity: number;
  /** C++ `float rCol, gCol, bCol;` */
  protected rCol: number;
  protected gCol: number;
  protected bCol: number;

  constructor(level: Level, x: number, y: number, z: number, xa: number, ya: number, za: number) {
    super(level);

    // C++ 的成员初始化列表：age(0), gravity(0), rCol(1), gCol(1), bCol(1), tex(0)
    this.age = 0;
    this.gravity = 0;
    this.rCol = 1;
    this.gCol = 1;
    this.bCol = 1;
    this.tex = 0;

    this.setSize(f(0.2), f(0.2));
    this.heightOffset = f(this.bbHeight / f(2.0));
    this.setPos(x, y, z);

    // xd = xa + (float)(Mth::random() * 2 - 1) * 0.4f;（Mth::random() 返回 float，全程 float 运算）
    this.xd = f(xa + f(f(f(Mth.random() * 2) - 1) * f(0.4)));
    this.yd = f(ya + f(f(f(Mth.random() * 2) - 1) * f(0.4)));
    this.zd = f(za + f(f(f(Mth.random() * 2) - 1) * f(0.4)));

    const speed = f(f(f(Mth.random() + Mth.random()) + 1) * f(0.15));
    const dd = f(
      Math.sqrt(f(f(f(this.xd * this.xd) + f(this.yd * this.yd)) + f(this.zd * this.zd))),
    );
    const mul = f(f(f(0.4) * speed) / dd);
    this.xd = f(this.xd * mul);
    this.yd = f(f(this.yd * mul) + f(0.1));
    this.zd = f(this.zd * mul);

    this.uo = f(Entity.sharedRandom.nextFloat() * 3);
    this.vo = f(Entity.sharedRandom.nextFloat() * 3);
    this.size = f(f(f(Entity.sharedRandom.nextFloat() * f(0.5)) + f(0.5)) * 2);
    // lifetime = (int)(4.0f / (sharedRandom.nextFloat() * 0.9f + 0.1f));
    this.lifetime = Math.trunc(
      f(f(4.0) / f(f(Entity.sharedRandom.nextFloat() * f(0.9)) + f(0.1))),
    );
    this.makeStepSound = false;
  }

  /** C++ `Particle* Particle::setPower(float power)` —— 返回 this 供链式调用 */
  setPower(power: number): this {
    this.xd = f(this.xd * power);
    this.yd = f(f(f(this.yd - f(0.1)) * power) + f(0.1));
    this.zd = f(this.zd * power);
    return this;
  }

  /** C++ `Particle* Particle::scale(float scale)` */
  scale(scale: number): this {
    this.setSize(f(f(0.2) * scale), f(f(0.2) * scale));
    this.size = f(this.size * scale);
    return this;
  }

  /** C++ `void Particle::tick()` —— 注意**不调** `super.tick()` */
  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    if (this.age++ >= this.lifetime) this.remove();
    this.yd = f(this.yd - f(f(0.04) * this.gravity));
    this.move(this.xd, this.yd, this.zd);
    this.xd = f(this.xd * f(0.98));
    this.yd = f(this.yd * f(0.98));
    this.zd = f(this.zd * f(0.98));
    if (this.onGround) {
      this.xd = f(this.xd * f(0.7));
      this.zd = f(this.zd * f(0.7));
    }
  }

  /** C++ `void Particle::render(Tesselator& t, float a, float xa, float ya, float za, float xa2, float za2)` */
  render(t: Tesselator, a: number, xa: number, ya: number, za: number, xa2: number, za2: number): void {
    const u0 = (this.tex % 16) / f(16.0);
    const u1 = u0 + f(0.999) / f(16.0);
    const v0 = Math.trunc(this.tex / 16) / f(16.0);
    const v1 = v0 + f(0.999) / f(16.0);
    const r = f(0.1) * this.size;
    // 世界坐标减掉相机位置 → 顶点是相机相对坐标（xOff/yOff/zOff 由 ParticleEngine::render 设）
    const x = this.xo + (this.x - this.xo) * a - Particle.xOff;
    const y = this.yo + (this.y - this.yo) * a - Particle.yOff;
    const z = this.zo + (this.z - this.zo) * a - Particle.zOff;
    const br = this.getBrightness(a);
    // ⚠ 浮点版 color（会 ×255 截断），不是 colorInt
    t.color(this.rCol * br, this.gCol * br, this.bCol * br);
    t.vertexUV(x - xa * r - xa2 * r, y - ya * r, z - za * r - za2 * r, u1, v1);
    t.vertexUV(x - xa * r + xa2 * r, y + ya * r, z - za * r + za2 * r, u1, v0);
    t.vertexUV(x + xa * r + xa2 * r, y + ya * r, z + za * r + za2 * r, u0, v0);
    t.vertexUV(x + xa * r - xa2 * r, y - ya * r, z + za * r - za2 * r, u0, v1);
  }

  /** C++ `int Particle::getParticleTexture()` */
  getParticleTexture(): number {
    return MISC_TEXTURE;
  }

  /** C++ 里是个空函数体 */
  override addAdditonalSaveData(_entityTag: CompoundTag): void {}

  /** C++ 里是个空函数体 */
  override readAdditionalSaveData(_tag: CompoundTag): void {}

  /** C++ `virtual int getEntityTypeId() const { return 0; }` */
  override getEntityTypeId(): number {
    return 0;
  }
}
