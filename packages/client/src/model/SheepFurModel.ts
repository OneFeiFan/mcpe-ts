/**
 * 1:1 移植自 src/client/model/SheepFurModel.h 与 SheepFurModel.cpp（任务单 H6）：羊毛那一层，各部件比 SheepModel 外扩（头 0.6、身体 1.75、腿 0.5）。
 * 吃草时的头部动作与 SheepModel 相同。ModelPart(this, …) 临时对象的问题同 SheepModel。
 */
import type { Sheep } from '@mcpe/world';
import type { Mob } from '@mcpe/world';
import { ModelPart } from './geom/ModelPart';
import { QuadrupedModel } from './QuadrupedModel';

const f = Math.fround;


export class SheepFurModel extends QuadrupedModel {
  private headXRot = 0;

  constructor() {
    super(12, 0);
    this.head = new ModelPart(this, 0, 0);
    this.head.addBox(-3, -4, -4, 6, 6, 6, f(0.6));
    this.head.setPos(0, 12 - 6, -8);
    this.body = new ModelPart(this, 28, 8);
    this.body.addBox(-4, -10, -7, 8, 16, 6, f(1.75));
    this.body.setPos(0, 11 + 6 - 12, 2);
    const g = f(0.5);
    this.leg0 = new ModelPart(this, 0, 16);
    this.leg0.addBox(-2, 0, -2, 4, 6, 4, g);
    this.leg0.setPos(-3, 18 + 6 - 12, 7);
    this.leg1 = new ModelPart(this, 0, 16);
    this.leg1.addBox(-2, 0, -2, 4, 6, 4, g);
    this.leg1.setPos(3, 18 + 6 - 12, 7);
    this.leg2 = new ModelPart(this, 0, 16);
    this.leg2.addBox(-2, 0, -2, 4, 6, 4, g);
    this.leg2.setPos(-3, 18 + 6 - 12, -5);
    this.leg3 = new ModelPart(this, 0, 16);
    this.leg3.addBox(-2, 0, -2, 4, 6, 4, g);
    this.leg3.setPos(3, 18 + 6 - 12, -5);
  }

  override prepareMobModel(mob: Mob | null, time: number, r: number, a: number): void {
    super.prepareMobModel(mob, time, r, a);
    const sheep = mob as Sheep;
    this.head.y = f(6 + f(sheep.getHeadEatPositionScale(a) * 9));
    this.headXRot = sheep.getHeadEatAngleScale(a);
  }

  override setupAnim(time: number, r: number, bob: number, yRot: number, xRot: number, scale: number): void {
    super.setupAnim(time, r, bob, yRot, xRot, scale);
    this.head.xRot = this.headXRot;
  }
}
