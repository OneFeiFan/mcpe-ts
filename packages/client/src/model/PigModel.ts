// 1:1 移植自 src/client/model/PigModel.h 与 PigModel.cpp（任务单 H5）：腿长 6，头上加一个鼻子；幼年时头部下移量 4
import { QuadrupedModel } from './QuadrupedModel';

export class PigModel extends QuadrupedModel {
  constructor(g = 0) {
    super(6, g);
    this.head.texOffs(16, 16).addBox(-2, 0, -9, 4, 3, 1, g);
    this.yHeadOffs = 4;
  }
}
