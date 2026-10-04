/**
 * 1:1 移植自 src/client/model/Model.h（48 行）：所有模型的基类。
 *
 * 【它只做三件事】
 *   1. 存几个"当前状态"字段（`attackTime` / `riding` / `young` / 贴图尺寸）——
 *      由渲染器在画之前设好，模型自己按这些值摆姿势；
 *   2. 持有 `cubes`：这个模型的全部部件。`ModelPart::setModel` 会把自己塞进来；
 *   3. 五个虚函数。其中四个在基类里是**空实现**，只有 `onGraphicsReset` 有转发。
 *
 * ⚠ **`young` 的默认值是 `true`**（`Model.h:20` 写的是 `young(true)`）。
 * 不是笔误，照抄 —— 子类靠它决定走不走"幼体"那套缩放分支（`QuadrupedModel::render` 里）。
 *
 * ⚠ 构造函数在 C++ 里是 **protected**（`Model.h:10`），只有子类能建。
 * TS 里同样写 `protected`，所以外面 `new Model()` 是编不过的 —— 这是有意的。
 */
import type { Entity, Mob } from '@mcpe/world';
import type { ModelPart } from './geom/ModelPart';

export class Model {
  attackTime = 0;
  riding = false;
  texWidth = 64;
  texHeight = 32;
  /** 这个模型的全部部件。`ModelPart::setModel` 往里塞，`onGraphicsReset` 遍历它 */
  cubes: ModelPart[] = [];
  young = true;

  protected constructor() {}

  /** C++ `virtual void onGraphicsReset()` —— 基类里唯一有实体的虚函数 */
  onGraphicsReset(): void {
    for (const c of this.cubes) c.onGraphicsReset();
  }

  // 下面四个在 C++ 里都是 `{}`，参数名在基类里没用到。子类覆盖时才用。
  render(
    _e: Entity | null,
    _time: number,
    _r: number,
    _bob: number,
    _yRot: number,
    _xRot: number,
    _scale: number,
  ): void {}
  renderHorrible(
    _time: number,
    _r: number,
    _bob: number,
    _yRot: number,
    _xRot: number,
    _scale: number,
  ): void {}
  setupAnim(
    _time: number,
    _r: number,
    _bob: number,
    _yRot: number,
    _xRot: number,
    _scale: number,
  ): void {}
  prepareMobModel(_mob: Mob | null, _time: number, _r: number, _a: number): void {}
}
