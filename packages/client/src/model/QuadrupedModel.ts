/**
 * 1:1 移植自 src/client/model/QuadrupedModel.h 与 QuadrupedModel.cpp（任务单 H5；猪、牛、羊的基类）。
 * R10：render(Entity*, …) 是对 Model::render 的重写；render(QuadrupedModel* model, float scale)（拷贝另一个模型的姿态再画，
 *   羊毛那一层用）命名为 renderFrom。
 * 原样保留：`hair` 声明了但没有构造参数、没有 setModel、从不渲染；young 分支的头部平移用 yHeadOffs/zHeadOffs，
 *   而 renderFrom 里写死成 8、4。
 */
import { Mth } from '@mcpe/util';
import type { Entity } from '@mcpe/world';
import { glPopMatrix, glPushMatrix, glScalef, glTranslatef } from '../renderer/gles';
import { Model } from './Model';
import { ModelPart } from './geom/ModelPart';

const f = Math.fround;

export class QuadrupedModel extends Model {
  head: ModelPart;
  hair: ModelPart;
  body: ModelPart;
  leg0: ModelPart;
  leg1: ModelPart;
  leg2: ModelPart;
  leg3: ModelPart;
  protected yHeadOffs: number;
  protected zHeadOffs: number;

  constructor(legSize: number, g: number) {
    super();
    this.yHeadOffs = 8;
    this.zHeadOffs = 4;
    this.head = new ModelPart(0, 0);
    this.hair = new ModelPart();
    this.body = new ModelPart(28, 8);
    this.leg0 = new ModelPart(0, 16);
    this.leg1 = new ModelPart(0, 16);
    this.leg2 = new ModelPart(0, 16);
    this.leg3 = new ModelPart(0, 16);
    this.head.setModel(this);
    this.body.setModel(this);
    this.leg0.setModel(this);
    this.leg1.setModel(this);
    this.leg2.setModel(this);
    this.leg3.setModel(this);
    this.head.addBox(-4, -4, -8, 8, 8, 8, g);
    this.head.setPos(0, 12 + 6 - legSize, -6);
    this.body.addBox(-5, -10, -7, 10, 16, 8, g);
    this.body.setPos(0, 11 + 6 - legSize, 2);
    this.leg0.addBox(-2, 0, -2, 4, legSize, 4, g);
    this.leg0.setPos(-3, 18 + 6 - legSize, 7);
    this.leg1.addBox(-2, 0, -2, 4, legSize, 4, g);
    this.leg1.setPos(3, 18 + 6 - legSize, 7);
    this.leg2.addBox(-2, 0, -2, 4, legSize, 4, g);
    this.leg2.setPos(-3, 18 + 6 - legSize, -5);
    this.leg3.addBox(-2, 0, -2, 4, legSize, 4, g);
    this.leg3.setPos(3, 18 + 6 - legSize, -5);
  }

  override render(_entity: Entity | null, time: number, r: number, bob: number, yRot: number, xRot: number, scale: number): void {
    this.setupAnim(time, r, bob, yRot, xRot, scale);
    if (this.young) {
      const ss = 2.0;
      glPushMatrix();
      glTranslatef(0, f(this.yHeadOffs * scale), f(this.zHeadOffs * scale));
      this.head.render(scale);
      glPopMatrix();
      glPushMatrix();
      glScalef(1 / ss, 1 / ss, 1 / ss);
      glTranslatef(0, f(24 * scale), 0);
      this.body.render(scale);
      this.leg0.render(scale);
      this.leg1.render(scale);
      this.leg2.render(scale);
      this.leg3.render(scale);
      glPopMatrix();
    } else {
      this.head.render(scale);
      this.body.render(scale);
      this.leg0.render(scale);
      this.leg1.render(scale);
      this.leg2.render(scale);
      this.leg3.render(scale);
    }
  }

  /** C++ `void QuadrupedModel::render(QuadrupedModel* model, float scale)` */
  renderFrom(model: QuadrupedModel, scale: number): void {
    this.head.yRot = model.head.yRot;
    this.head.xRot = model.head.xRot;
    this.head.y = model.head.y;
    this.head.x = model.head.x;
    this.body.yRot = model.body.yRot;
    this.body.xRot = model.body.xRot;
    this.leg0.xRot = model.leg0.xRot;
    this.leg1.xRot = model.leg1.xRot;
    this.leg2.xRot = model.leg2.xRot;
    this.leg3.xRot = model.leg3.xRot;
    if (this.young) {
      const ss = 2.0;
      glPushMatrix();
      glTranslatef(0, f(8 * scale), f(4 * scale));
      this.head.render(scale);
      glPopMatrix();
      glPushMatrix();
      glScalef(1 / ss, 1 / ss, 1 / ss);
      glTranslatef(0, f(24 * scale), 0);
      this.body.render(scale);
      this.leg0.render(scale);
      this.leg1.render(scale);
      this.leg2.render(scale);
      this.leg3.render(scale);
      glPopMatrix();
    } else {
      this.head.render(scale);
      this.body.render(scale);
      this.leg0.render(scale);
      this.leg1.render(scale);
      this.leg2.render(scale);
      this.leg3.render(scale);
    }
  }

  override setupAnim(time: number, r: number, _bob: number, yRot: number, xRot: number, _scale: number): void {
    const k = f(f(180.0) / Mth.PI);
    this.head.xRot = f(xRot / k);
    this.head.yRot = f(yRot / k);
    this.body.xRot = f(90 / k);
    const pend = f(f(Mth.cos(f(time * f(0.6662))) * f(1.4)) * r);
    this.leg0.xRot = pend;
    this.leg1.xRot = -pend;
    this.leg2.xRot = -pend;
    this.leg3.xRot = pend;
  }
}
