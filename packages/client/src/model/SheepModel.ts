/**
 * 1:1 移植自 src/client/model/SheepModel.h 与 SheepModel.cpp（任务单 H6）。重建头和身体；吃草时头往下压（prepareMobModel 取羊的吃草进度）。
 * C++ 的 `head = ModelPart(this, 0, 0)`：临时对象构造时就 setModel(this) 进了部件表，赋值后临时对象销毁——部件表里留下悬空指针
 *   （只有 onGraphicsReset 会遍历它，属于未定义行为）。TS 里直接新建对象，部件表里是有效对象。
 */
import type { Mob } from '@mcpe/world';
import { ModelPart } from './geom/ModelPart';
import { QuadrupedModel } from './QuadrupedModel';

const f = Math.fround;

type EatingSheep = { getHeadEatPositionScale(a: number): number; getHeadEatAngleScale(a: number): number };

export class SheepModel extends QuadrupedModel {
  private headXRot = 0;

  constructor() {
    super(12, 0);
    this.head = new ModelPart(this, 0, 0);
    this.head.addBox(-3, -4, -6, 6, 6, 8, 0);
    this.head.setPos(0, 12 - 6, -8);
    this.body = new ModelPart(this, 28, 8);
    this.body.addBox(-4, -10, -7, 8, 16, 6, 0);
    this.body.setPos(0, 11 + 6 - 12, 2);
  }

  override prepareMobModel(mob: Mob | null, time: number, r: number, a: number): void {
    super.prepareMobModel(mob, time, r, a);
    const sheep = mob as unknown as EatingSheep;
    this.head.y = f(6 + f(sheep.getHeadEatPositionScale(a) * 9));
    this.headXRot = sheep.getHeadEatAngleScale(a);
  }

  override setupAnim(time: number, r: number, bob: number, yRot: number, xRot: number, scale: number): void {
    super.setupAnim(time, r, bob, yRot, xRot, scale);
    this.head.xRot = this.headXRot;
  }
}
