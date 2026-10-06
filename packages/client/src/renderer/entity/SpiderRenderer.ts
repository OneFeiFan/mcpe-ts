// 1:1 移植自 src/client/renderer/entity/SpiderRenderer.h（任务单 H7）：死亡时翻 180°，按 getModelScale 缩放（恒为 1）
import type { Mob, Spider } from '@mcpe/world';
import { SpiderModel } from '../../model/SpiderModel';
import { glScalef } from '../gles';
import { MobRenderer } from './MobRenderer';

export class SpiderRenderer extends MobRenderer {
  constructor() {
    super(new SpiderModel(), 1.0);
  }

  override getFlipDegrees(_spider: Mob): number {
    return 180;
  }

  override scale(mob: Mob, _a: number): void {
    const scale = (mob as Spider).getModelScale();
    glScalef(scale, scale, scale);
  }
}
