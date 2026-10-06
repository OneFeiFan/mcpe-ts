// 1:1 移植自 src/client/model/CreeperModel.h（任务单 H8）：头、身体、四条短腿
import { Mth } from '@mcpe/util';
import type { Entity } from '@mcpe/world';
import { Model } from './Model';
import { ModelPart } from './geom/ModelPart';

const f = Math.fround;

export class CreeperModel extends Model {
  head = new ModelPart(0, 0);
  body = new ModelPart(16, 16);
  leg0 = new ModelPart(0, 16);
  leg1 = new ModelPart(0, 16);
  leg2 = new ModelPart(0, 16);
  leg3 = new ModelPart(0, 16);

  constructor(g = 0) {
    super();
    const yo = 4;
    this.head.setModel(this);
    this.body.setModel(this);
    this.leg0.setModel(this);
    this.leg1.setModel(this);
    this.leg2.setModel(this);
    this.leg3.setModel(this);
    this.head.addBox(-4, -8, -4, 8, 8, 8, g);
    this.head.setPos(0, yo, 0);
    this.body.addBox(-4, 0, -2, 8, 12, 4, g);
    this.body.setPos(0, yo, 0);
    this.leg0.addBox(-2, 0, -2, 4, 6, 4, g);
    this.leg0.setPos(-2, 12 + yo, 4);
    this.leg1.addBox(-2, 0, -2, 4, 6, 4, g);
    this.leg1.setPos(2, 12 + yo, 4);
    this.leg2.addBox(-2, 0, -2, 4, 6, 4, g);
    this.leg2.setPos(-2, 12 + yo, -4);
    this.leg3.addBox(-2, 0, -2, 4, 6, 4, g);
    this.leg3.setPos(2, 12 + yo, -4);
  }

  override render(_entity: Entity | null, time: number, r: number, bob: number, yRot: number, xRot: number, scale: number): void {
    this.setupAnim(time, r, bob, yRot, xRot, scale);
    this.head.render(scale);
    this.body.render(scale);
    this.leg0.render(scale);
    this.leg1.render(scale);
    this.leg2.render(scale);
    this.leg3.render(scale);
  }

  override setupAnim(time: number, r: number, _bob: number, yRot: number, xRot: number, _scale: number): void {
    const k = f(180 / Mth.PI);
    this.head.yRot = f(yRot / k);
    this.head.xRot = f(xRot / k);
    const pend = f(f(Mth.cos(f(time * f(0.6662))) * f(1.4)) * r);
    this.leg0.xRot = pend;
    this.leg1.xRot = -pend;
    this.leg2.xRot = -pend;
    this.leg3.xRot = pend;
  }
}
