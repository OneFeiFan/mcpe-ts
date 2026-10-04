/**
 * 1:1 移植自 src/client/renderer/entity/ChickenRenderer.h 与 .cpp（任务单 G 的 G9）。
 *
 * 【它是谁】鸡的渲染器 —— TS 里**第一只用得上模型系统的生物**（G9 之前这只鸡在逻辑上存在、
 * 在画面上不存在）。它就三件事：构造转发给 `MobRenderer`；`render` 转调父类（C++ 里就是这句
 * 空转，照抄不省）；`getBob` 把扇翅膀的两个插值量算成翅膀摆角 —— `ChickenModel::setupAnim`
 * 的 `bob` 参数就是它的返回值。
 *
 * 【和 C++ 的一处差异】`getBob` 在 C++ 里挂在 `protected:` 下，而 TS 的 `MobRenderer`（G6）
 * 把它写成了 public —— 子类**只能跟着 public**（收窄可见性编译不过）。行为不变。
 *
 * 【浮点】`oFlap + (flap - oFlap) * a` 与 `(sin + 1) * flapSpeed` 按 C++ 逐步包 f()。
 */
import { Mth } from '@mcpe/util';
import type { Chicken, Entity, Mob } from '@mcpe/world';
import type { Model } from '../../model/Model';
import { MobRenderer } from './MobRenderer';

const f = Math.fround;

export class ChickenRenderer extends MobRenderer {
  /* ChickenRenderer.cpp:6 */
  constructor(model: Model, shadow: number) {
    super(model, shadow);
  }

  /* ChickenRenderer.cpp:11 */
  override render(mob: Entity, x: number, y: number, z: number, rot: number, a: number): void {
    super.render(mob, x, y, z, rot, a);
  }

  /* ChickenRenderer.cpp:16 */
  override getBob(mob_: Mob, a: number): number {
    const mob = mob_ as Chicken;
    const flap = f(mob.oFlap + f(f(mob.flap - mob.oFlap) * a));
    const flapSpeed = f(mob.oFlapSpeed + f(f(mob.flapSpeed - mob.oFlapSpeed) * a));
    return f(f(Mth.sin(flap) + f(1)) * flapSpeed);
  }
}
