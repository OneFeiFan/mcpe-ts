/**
 * 1:1 移植自 src/client/renderer/entity/PigRenderer.h（任务单 H5；实现全在头文件里）。
 * 第二个参数（鞍的模型）C++ 接收了但不用——EntityRenderDispatcher 里也传 NULL。
 */
import type { Model } from '../../model/Model';
import { MobRenderer } from './MobRenderer';

export class PigRenderer extends MobRenderer {
  constructor(model: Model, _armor: Model | null, shadow: number) {
    super(model, shadow);
  }
}
