/**
 * 1:1 移植自 src/client/model/SpiderModel.h（任务单 H7）：头、两节身体、八条腿。
 * 原样保留的 C++ 笔误：构造函数里 `body0.setModel(this)` 写了两次，**body1 没有 setModel**（它不在模型的部件表里，
 *   贴图尺寸取 ModelPart 的默认 64×32——与模型默认值相同，画面不受影响）。
 */
import { Mth } from '@mcpe/util';
import type { Entity } from '@mcpe/world';
import { Model } from './Model';
import { ModelPart } from './geom/ModelPart';

const f = Math.fround;

export class SpiderModel extends Model {
  head = new ModelPart(32, 4);
  body0 = new ModelPart(0, 0);
  body1 = new ModelPart(0, 12);
  leg0 = new ModelPart(18, 0);
  leg1 = new ModelPart(18, 0);
  leg2 = new ModelPart(18, 0);
  leg3 = new ModelPart(18, 0);
  leg4 = new ModelPart(18, 0);
  leg5 = new ModelPart(18, 0);
  leg6 = new ModelPart(18, 0);
  leg7 = new ModelPart(18, 0);

  constructor() {
    super();
    const g = 0;
    this.head.setModel(this);
    this.body0.setModel(this);
    this.body0.setModel(this);
    this.leg0.setModel(this);
    this.leg1.setModel(this);
    this.leg2.setModel(this);
    this.leg3.setModel(this);
    this.leg4.setModel(this);
    this.leg5.setModel(this);
    this.leg6.setModel(this);
    this.leg7.setModel(this);
    const yo = 18 + 6 - 9;
    this.head.addBox(-4, -4, -8, 8, 8, 8, g);
    this.head.setPos(0, 0 + yo, -3);
    this.body0.addBox(-3, -3, -3, 6, 6, 6, g);
    this.body0.setPos(0, yo, 0);
    this.body1.addBox(-5, -4, -6, 10, 8, 12, g);
    this.body1.setPos(0, 0 + yo, 3 + 6);
    this.leg0.addBox(-15, -1, -1, 16, 2, 2, g);
    this.leg0.setPos(-4, 0 + yo, 2);
    this.leg1.addBox(-1, -1, -1, 16, 2, 2, g);
    this.leg1.setPos(4, 0 + yo, 2);
    this.leg2.addBox(-15, -1, -1, 16, 2, 2, g);
    this.leg2.setPos(-4, 0 + yo, 1);
    this.leg3.addBox(-1, -1, -1, 16, 2, 2, g);
    this.leg3.setPos(4, 0 + yo, 1);
    this.leg4.addBox(-15, -1, -1, 16, 2, 2, g);
    this.leg4.setPos(-4, 0 + yo, 0);
    this.leg5.addBox(-1, -1, -1, 16, 2, 2, g);
    this.leg5.setPos(4, 0 + yo, 0);
    this.leg6.addBox(-15, -1, -1, 16, 2, 2, g);
    this.leg6.setPos(-4, 0 + yo, -1);
    this.leg7.addBox(-1, -1, -1, 16, 2, 2, g);
    this.leg7.setPos(4, 0 + yo, -1);
  }

  override render(
    _entity: Entity | null,
    time: number,
    r: number,
    bob: number,
    yRot: number,
    xRot: number,
    scale: number,
  ): void {
    this.setupAnim(time, r, bob, yRot, xRot, scale);
    this.head.render(scale);
    this.body0.render(scale);
    this.body1.render(scale);
    this.leg0.render(scale);
    this.leg1.render(scale);
    this.leg2.render(scale);
    this.leg3.render(scale);
    this.leg4.render(scale);
    this.leg5.render(scale);
    this.leg6.render(scale);
    this.leg7.render(scale);
  }

  override setupAnim(
    time: number,
    r: number,
    _bob: number,
    yRot: number,
    xRot: number,
    _scale: number,
  ): void {
    const k = f(180 / Mth.PI);
    this.head.yRot = f(yRot / k);
    this.head.xRot = f(xRot / k);
    const sr = f(f(Mth.PI) / 4.0);
    this.leg0.zRot = -sr;
    this.leg1.zRot = sr;
    this.leg2.zRot = f(-sr * f(0.74));
    this.leg3.zRot = f(sr * f(0.74));
    this.leg4.zRot = f(-sr * f(0.74));
    this.leg5.zRot = f(sr * f(0.74));
    this.leg6.zRot = -sr;
    this.leg7.zRot = sr;
    const ur = f(f(Mth.PI) / 8.0);
    const ur2 = sr;
    this.leg0.yRot = ur2;
    this.leg1.yRot = -ur2;
    this.leg2.yRot = ur;
    this.leg3.yRot = -ur;
    this.leg4.yRot = -ur;
    this.leg5.yRot = +ur;
    this.leg6.yRot = -ur2;
    this.leg7.yRot = +ur2;
    const tt = f(f(time * f(0.6662)) * 2);
    const ph = (q: number): number => f(f(f(Mth.PI * 2) * q) / 4.0);
    const c = (q: number): number => f(-f(f(Mth.cos(f(tt + ph(q)))) * f(0.4)) * r);
    const s = (q: number): number =>
      f(Math.abs(f(f(Mth.sin(f(f(time * f(0.6662)) + ph(q)))) * f(0.4))) * r);
    const c0 = c(0),
      c1 = c(2),
      c2 = c(1),
      c3 = c(3);
    const s0 = s(0),
      s1 = s(2),
      s2 = s(1),
      s3 = s(3);
    this.leg0.yRot = f(this.leg0.yRot + c0);
    this.leg1.yRot = f(this.leg1.yRot - c0);
    this.leg2.yRot = f(this.leg2.yRot + c1);
    this.leg3.yRot = f(this.leg3.yRot - c1);
    this.leg4.yRot = f(this.leg4.yRot + c2);
    this.leg5.yRot = f(this.leg5.yRot - c2);
    this.leg6.yRot = f(this.leg6.yRot + c3);
    this.leg7.yRot = f(this.leg7.yRot - c3);
    this.leg0.zRot = f(this.leg0.zRot + s0);
    this.leg1.zRot = f(this.leg1.zRot - s0);
    this.leg2.zRot = f(this.leg2.zRot + s1);
    this.leg3.zRot = f(this.leg3.zRot - s1);
    this.leg4.zRot = f(this.leg4.zRot + s2);
    this.leg5.zRot = f(this.leg5.zRot - s2);
    this.leg6.zRot = f(this.leg6.zRot + s3);
    this.leg7.zRot = f(this.leg7.zRot - s3);
  }
}
