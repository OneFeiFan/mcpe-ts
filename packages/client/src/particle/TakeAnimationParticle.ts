/**
 * 1:1 移植自 src/client/particle/TakeAnimationParticle.h（63 行；整个类内联在头文件里，
 * 参考树里**没有**对应的 .cpp）。
 *
 * 捡起掉落物时"那件物品飞向玩家"的动画。它不是公告板，而是内部藏了一个**真 ItemEntity**，
 * 每帧算一个插值位置，再交给实体渲染器去画 —— 所以它落在第 4 档纹理
 * （`ENTITY_PARTICLE_TEXTURE`），由 `ParticleEngine::renderLit` 负责。
 *
 * 【照抄的六处】
 *   1. **它是唯一一个不画 quad 的粒子**：走 `EntityRenderDispatcher`。
 *      ⚠ 调的是 **6 参数的 `render(entity, x, y, z, rot, a)`**（TS 里叫 `renderAt`），
 *      **不是** `render(entity, a)` —— 后者会自己再减一遍 `xOff/yOff/zOff`、并按
 *      `entity.xOld` 重新插值，位置就错了两遍。
 *   2. 内部那个 `ItemEntity e` **不在世界里**（没 addToLevel）—— 它只是个"用来画"的壳，
 *      连 `level` 都只用来查亮度。
 *   3. 构造时把 `e.item.count` 改成 **1**：掉落物可能是一叠，飞过去的那份只画一个。
 *   4. `tick()` **完全不调 `Particle::tick()`** —— 不移动、不碰撞、不吃阻力，
 *      只把 `life` 加一，第 `lifeTime`(=3) 次 tick 时 `remove()`。
 *      判据是 `==` 而不是基类那种 `age++ >= lifetime`，原样保留。
 *   5. `render` 里的 `time` 是**平方过的**（`time = time*time`）—— 先慢后快的缓动，别漏。
 *   6. `yOffs` 加在 `(target->y - target->yOld) * a` **之后**（`A + B*a + yOffs`），
 *      不是加在最终插值结果上 —— 这一步影响的是"目标点"，不是"画出来的点"。
 *
 * 【浮点分档】`tick` 只有整数；`render` 是画面（PITFALLS 第 3 条第三档），
 * 不逐步 fround，只把带 `f` 后缀的字面量（`0.5f`）包起来。
 *
 * 【它为什么排在最后】它是这批里唯一一个**不 bind 纹理、不 t.begin/draw** 的：
 * 顶点全由内部 `ItemRenderer` 自己成批，所以能独立工作（`renderLit` 不给它任何 GL 状态）。
 */
import { Mth } from '@mcpe/util';
import { type Entity, ItemEntity, type Level } from '@mcpe/world';
import { Tesselator } from '../renderer/Tesselator';
import { EntityRenderDispatcher } from '../renderer/entity/EntityRenderDispatcher';
import { glColor4f2 } from '../renderer/gles';
import { Particle } from './Particle';
import { ENTITY_PARTICLE_TEXTURE } from './ParticleTextures';

const f = Math.fround;

export class TakeAnimationParticle extends Particle {
  /** C++ `ItemEntity e;` —— 没进世界的壳，只用来画 */
  private readonly e: ItemEntity;
  /** C++ `Entity* target;` —— 飞向谁（通常是捡东西的那个玩家） */
  private readonly target: Entity;
  /** C++ `int life;` */
  private life: number;
  /** C++ `int lifeTime;` */
  private readonly lifeTime: number;
  /** C++ `float yOffs;` */
  private readonly yOffs: number;

  constructor(level: Level, item: ItemEntity, target: Entity, yOffs: number) {
    // ⚠ 基类先构造（实参全从形参 item 读，不碰 e），然后才是 e —— 与 C++ 的初始化顺序一致。
    //   两边各消耗各自的随机流：基类先抽 5 个 Mth::random() + 3 个 sharedRandom，
    //   然后 ItemEntity 构造函数再抽 3 个 Mth::random()。
    super(level, item.x, item.y, item.z, item.xd, item.yd, item.zd);

    this.e = new ItemEntity(level, item.x, item.y, item.z, item.item);
    this.target = target;
    this.yOffs = yOffs;
    this.life = 0;
    this.lifeTime = 3;

    this.e.item.count = 1;
  }

  /** C++ `void render(Tesselator& t, float a, float xa, float ya, float za, float xa2, float za2)` */
  override render(
    _t: Tesselator,
    a: number,
    _xa: number,
    _ya: number,
    _za: number,
    _xa2: number,
    _za2: number,
  ): void {
    let time = (this.life + a) / this.lifeTime;
    time = time * time; // 先慢后快
    const xo = this.e.x;
    const yo = this.e.y;
    const zo = this.e.z;
    const xt = this.target.xOld + (this.target.x - this.target.xOld) * a;
    const yt = this.target.yOld + (this.target.y - this.target.yOld) * a + this.yOffs; // ⚠ yOffs 在这
    const zt = this.target.zOld + (this.target.z - this.target.zOld) * a;
    let xx = xo + (xt - xo) * time;
    let yy = yo + (yt - yo) * time;
    let zz = zo + (zt - zo) * time;
    const xTile = Mth.floor(xx);
    const yTile = Mth.floor(yy + this.heightOffset * f(0.5));
    const zTile = Mth.floor(zz);
    const br = this.level.getBrightness(xTile, yTile, zTile);
    glColor4f2(br, br, br, 1);
    xx -= Particle.xOff;
    yy -= Particle.yOff;
    zz -= Particle.zOff;
    // ⚠ 6 参数那个（renderAt），不是 render(entity, a)
    EntityRenderDispatcher.getInstance().renderAt(this.e, xx, yy, zz, this.e.yRot, a);
  }

  /** C++ `void tick()` —— 不调 `super.tick()`，只数 3 下然后自己走 */
  override tick(): void {
    this.life++;
    if (this.life === this.lifeTime) this.remove();
  }

  /** C++ `int getParticleTexture() { return ParticleEngine::ENTITY_PARTICLE_TEXTURE; }` */
  override getParticleTexture(): number {
    return ENTITY_PARTICLE_TEXTURE;
  }
}
