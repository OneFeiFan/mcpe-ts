/**
 * 1:1 移植自 src/client/model/SignModel.h（告示牌：牌面 cube 与立杆 cube2）。
 * 与 ChestModel 一样，无参的 render() 遮蔽了基类的 render(Entity*, …)，只由 SignRenderer 调用。
 * 原样保留：C++ 先 addBox 再 setModel（与 ChestModel 的顺序相反），纹理尺寸用 Model 的默认 64×32。
 */
import { Model } from './Model';
import { ModelPart } from './geom/ModelPart';

const f = Math.fround;

export class SignModel extends Model {
  cube = new ModelPart(0, 0);
  cube2 = new ModelPart(0, 14);

  constructor() {
    super();
    this.cube.addBox(-12, -14, -1, 24, 12, 2, 0);
    this.cube2.addBox(-1, -2, -1, 2, 14, 2, 0);
    this.cube.setModel(this);
    this.cube2.setModel(this);
  }

  /** C++ SignModel::render() */
  override render(): void {
    this.cube.render(f(1 / 16.0));
    this.cube2.render(f(1 / 16.0));
  }
}
