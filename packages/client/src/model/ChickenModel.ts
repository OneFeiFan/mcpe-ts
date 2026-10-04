/**
 * 1:1 移植自 src/client/model/ChickenModel.h 与 ChickenModel.cpp（任务单 G 的 G9）。
 *
 * 【这一版包含】构造函数、`render(Entity*, …)`、`setupAnim`。**一条 DEFERRED 都没有** ——
 * 用到的 `Model` / `ModelPart` / `Mth` 在 TS 里都已存在。
 *
 * 【和别的模型不一样的地方】
 *   - 它是**直接继承 `Model`**，不是 `QuadrupedModel`（ChickenModel.h:9）；
 *   - `setupAnim` 里 `head.xRot` 带**负号**（`-(xRot / RADDEG)`）—— 别的模型都没这个负号，
 *     丢了鸡会朝反方向低头；
 *   - 翅膀的摆角直接吃 `bob` 参数（就是 `ChickenRenderer::getBob` 的返回值）：`wing0.zRot = bob`、
 *     `wing1.zRot = -bob`；
 *   - 幼年分支（`young`）把鸡拆成两段画：头/嘴/冠保持原大小，身体/腿/翅膀缩成 1/2 并上移 24。
 *
 * 【原样保留的怪癖】
 *   - `hair` 这个部件 C++ **声明了但从未使用**（构造列表里没有它、也没 `setModel`），
 *     默认构造出来就是 (0,0)，照抄；
 *   - 两条腿的 x **不对称**：`leg0` 在 -2、`leg1` 在 +1（C++ 就这么写，不是镜像笔误）；
 *   - 腿和翅膀的盒子走 `addBox` 的**6 参重载**（外扩 g 固定 0），头/嘴/冠/身体走 7 参那条。
 *
 * 【浮点】全 float：`-1 + yo`、`90 / RADDEG`、`cos(time * 0.6662f) * 1.4f * r` 逐步包 f()。
 *   C++ 写的 `(float)(180 / Mth::PI)` 就是 `Mth.RADDEG` 的定义（同为 float），照 G7 先例用它。
 *
 * 【ADAPTED(Cpp)】构造函数里的 `0 + (float)yo` 直接写 `yo`（冗余加法）。
 */
import { Mth } from '@mcpe/util';
import type { Entity } from '@mcpe/world';
import { glPopMatrix2, glPushMatrix2, glScalef2, glTranslatef2 } from '../renderer/gles';
import { Model } from './Model';
import { ModelPart } from './geom/ModelPart';

const f = Math.fround;

export class ChickenModel extends Model {
  head: ModelPart;
  hair: ModelPart;
  body: ModelPart;
  leg0: ModelPart;
  leg1: ModelPart;
  wing0: ModelPart;
  wing1: ModelPart;
  beak: ModelPart;
  redThing: ModelPart;

  /* ChickenModel.cpp:4 */
  constructor() {
    super();
    this.head = new ModelPart(0, 0);
    // ⚠ C++ 声明了 `ModelPart hair;` 但此后**从未使用** —— 默认构造就是 (0,0)，照抄
    this.hair = new ModelPart(0, 0);
    this.beak = new ModelPart(14, 0);
    this.redThing = new ModelPart(14, 4);
    this.body = new ModelPart(0, 9);
    this.leg0 = new ModelPart(26, 0);
    this.leg1 = new ModelPart(26, 0);
    this.wing0 = new ModelPart(24, 13);
    this.wing1 = new ModelPart(24, 13);

    this.head.setModel(this);
    this.beak.setModel(this);
    this.redThing.setModel(this);
    this.body.setModel(this);
    this.leg0.setModel(this);
    this.leg1.setModel(this);
    this.wing0.setModel(this);
    this.wing1.setModel(this);
    const yo = 16;
    this.head.addBox(-2, -6, -2, 4, 6, 3, 0);
    this.head.setPos(0, f(-1 + yo), -4);
    this.beak.addBox(-2, -4, -4, 4, 2, 2, 0);
    this.beak.setPos(0, f(-1 + yo), -4);
    this.redThing.addBox(-1, -2, -3, 2, 2, 2, 0);
    this.redThing.setPos(0, f(-1 + yo), -4);
    this.body.addBox(-3, -4, -3, 6, 8, 6, 0);
    this.body.setPos(0, yo, 0); // ADAPTED(Cpp): `0 + (float)yo` 的冗余加法省掉
    this.leg0.addBox(-1, 0, -3, 3, 5, 3);
    this.leg0.setPos(-2, f(3 + yo), 1);
    this.leg1.addBox(-1, 0, -3, 3, 5, 3);
    this.leg1.setPos(1, f(3 + yo), 1);
    this.wing0.addBox(0, 0, -3, 1, 4, 6);
    this.wing0.setPos(-4, f(-3 + yo), 0);
    this.wing1.addBox(-1, 0, -3, 1, 4, 6);
    this.wing1.setPos(4, f(-3 + yo), 0);
  }

  /* ChickenModel.cpp:49 */
  override render(
    _e: Entity | null,
    time: number,
    r: number,
    bob: number,
    yRot: number,
    xRot: number,
    scale: number,
  ): void {
    this.setupAnim(time, r, bob, yRot, xRot, scale);
    if (this.young) {
      const ss = 2;
      glPushMatrix2();
      glTranslatef2(0, f(5 * scale), f(2 * scale));
      this.head.render(scale);
      this.beak.render(scale);
      this.redThing.render(scale);
      glPopMatrix2();
      glPushMatrix2();
      glScalef2(f(1 / ss), f(1 / ss), f(1 / ss));
      glTranslatef2(0, f(24 * scale), 0);
      this.body.render(scale);
      this.leg0.render(scale);
      this.leg1.render(scale);
      this.wing0.render(scale);
      this.wing1.render(scale);
      glPopMatrix2();
    } else {
      this.head.render(scale);
      this.beak.render(scale);
      this.redThing.render(scale);
      this.body.render(scale);
      this.leg0.render(scale);
      this.leg1.render(scale);
      this.wing0.render(scale);
      this.wing1.render(scale);
    }
  }

  /* ChickenModel.cpp:82 */
  override setupAnim(
    time: number,
    r: number,
    bob: number,
    yRot: number,
    xRot: number,
    _scale: number,
  ): void {
    // C++ 写的是 `(float)(180 / Mth::PI)`，那正是 Mth.RADDEG 的定义（同为 float）
    this.head.xRot = f(-(xRot / Mth.RADDEG)); // ⚠ 负号是 C++ 原样（与别的模型反号）
    this.head.yRot = f(yRot / Mth.RADDEG);
    this.beak.xRot = this.head.xRot;
    this.beak.yRot = this.head.yRot;
    this.redThing.xRot = this.head.xRot;
    this.redThing.yRot = this.head.yRot;
    this.body.xRot = f(90 / Mth.RADDEG);
    const pend = f(f(Mth.cos(f(time * f(0.6662))) * f(1.4)) * r);
    this.leg0.xRot = pend;
    this.leg1.xRot = f(-pend);
    this.wing0.zRot = bob;
    this.wing1.zRot = f(-bob);
  }
}
