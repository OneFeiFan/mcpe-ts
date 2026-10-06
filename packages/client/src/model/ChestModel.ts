/**
 * 1:1 移植自 src/client/model/ChestModel.h（箱子的方块实体模型：盖子、锁扣、箱体）。
 * C++ 的 render() 没有参数，遮蔽了基类 Model::render(Entity*, …)；TS 里写成重写（参数更少的重写在 TS 里合法），
 *   只由 ChestRenderer 直接调用。
 * C++ 的成员声明顺序是 lid、bottom、lock（初始化列表的顺序不同，但 ModelPart(0, 0) 构造没有副作用，顺序无关）。
 */
import { Model } from './Model';
import { ModelPart } from './geom/ModelPart';

const f = Math.fround;

export class ChestModel extends Model {
  lid = new ModelPart(0, 0);
  bottom = new ModelPart(0, 0);
  lock = new ModelPart(0, 0);

  constructor() {
    super();
    this.lid.setModel(this);
    this.lid.setTexSize(64, 64);
    this.lid.addBox(0.0, -5, -14, 14, 5, 14, 0);
    this.lid.x = 1;
    this.lid.y = 7;
    this.lid.z = 15;
    this.lock.setModel(this);
    this.lock.setTexSize(64, 64);
    this.lock.addBox(-1, -2, -15, 2, 4, 1, 0);
    this.lock.x = 8;
    this.lock.y = 7;
    this.lock.z = 15;
    this.bottom.setModel(this);
    this.bottom.setTexSize(64, 64);
    this.bottom.addBox(0.0, 0, 0, 14, 10, 14, 0);
    this.bottom.x = 1;
    this.bottom.y = 6;
    this.bottom.z = 1;
  }

  /** C++ ChestModel::render() */
  override render(): void {
    this.lock.xRot = this.lid.xRot;
    this.lid.render(f(1 / 16.0));
    this.lock.render(f(1 / 16.0));
    this.bottom.render(f(1 / 16.0));
  }
}
