/**
 * 1:1 移植自 src/client/model/SkeletonModel.h（任务单 H8）：在僵尸模型上把四肢换成 2×12×2 的细骨头；setupAnim 前总是举弓（bowAndArrow = true）。
 * C++ 的 `arm0 = ModelPart(...)` 给成员赋临时对象，再 setModel(this)；TS 里新建对象，旧部件仍留在部件表里（只影响 onGraphicsReset）。
 */
import { ModelPart } from './geom/ModelPart';
import { ZombieModel } from './ZombieModel';

export class SkeletonModel extends ZombieModel {
  constructor() {
    super();
    const g = 0;
    this.arm0 = new ModelPart(24 + 16, 16);
    this.arm0.setModel(this);
    this.arm0.addBox(-1, -2, -1, 2, 12, 2, g);
    this.arm0.setPos(-5, 2, 0);
    this.arm1 = new ModelPart(24 + 16, 16);
    this.arm1.setModel(this);
    this.arm1.mirror = true;
    this.arm1.addBox(-1, -2, -1, 2, 12, 2, g);
    this.arm1.setPos(5, 2, 0);
    this.leg0 = new ModelPart(0, 16);
    this.leg0.setModel(this);
    this.leg0.addBox(-1, 0, -1, 2, 12, 2, g);
    this.leg0.setPos(-2, 12, 0);
    this.leg1 = new ModelPart(0, 16);
    this.leg1.setModel(this);
    this.leg1.mirror = true;
    this.leg1.addBox(-1, 0, -1, 2, 12, 2, g);
    this.leg1.setPos(2, 12, 0);
  }

  override setupAnim(time: number, r: number, bob: number, yRot: number, xRot: number, scale: number): void {
    this.bowAndArrow = true;
    super.setupAnim(time, r, bob, yRot, xRot, scale);
  }
}
