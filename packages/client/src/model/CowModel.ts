/**
 * 1:1 移植自 src/client/model/CowModel.h 与 CowModel.cpp（任务单 H5）：腿长 12；头和身体整体重建（加两只角、乳房）。
 * C++ 的 `head = ModelPart(0, 0)` 是给已有成员赋一个临时对象：几何清空、再 setModel(this) 一次——模型的部件表里
 *   会留下同一个 head 两次。TS 里新建对象，旧的那个仍留在部件表里（只影响 onGraphicsReset，等价）。
 * `body.texOffs(52, 0).addBox(-2, 2, -8, 4, 6, 1)` 走 6 参重载（不外扩）。
 */
import { ModelPart } from './geom/ModelPart';
import { QuadrupedModel } from './QuadrupedModel';

export class CowModel extends QuadrupedModel {
  constructor() {
    super(12, 0);
    this.head = new ModelPart(0, 0);
    this.head.setModel(this);
    this.head.addBox(-4, -4, -6, 8, 8, 6, 0);
    this.head.setPos(0, 12 - 6 - 2, -8);
    this.head.texOffs(22, 0).addBox(-5, -5, -4, 1, 3, 1, 0);
    this.head.texOffs(22, 0).addBox(+4, -5, -4, 1, 3, 1, 0);
    this.body = new ModelPart(18, 4);
    this.body.setModel(this);
    this.body.addBox(-6, -10, -7, 12, 18, 10, 0);
    this.body.setPos(0, 11 + 6 - 12, 2);
    this.body.texOffs(52, 0).addBox(-2, 2, -8, 4, 6, 1);
    this.leg0.x -= 1;
    this.leg1.x += 1;
    this.leg0.z += 0;
    this.leg1.z += 0;
    this.leg2.x -= 1;
    this.leg3.x += 1;
    this.leg2.z -= 1;
    this.leg3.z -= 1;
    this.zHeadOffs += 2;
  }
}
