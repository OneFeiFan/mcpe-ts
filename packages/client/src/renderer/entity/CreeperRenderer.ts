// 1:1 移植自 src/client/renderer/entity/CreeperRenderer.h（任务单 H8）：膨胀时按 swelling 放大并抖动，每隔一档闪白
import { Mth } from '@mcpe/util';
import type { Creeper, Mob } from '@mcpe/world';
import { CreeperModel } from '../../model/CreeperModel';
import { glScalef } from '../gles';
import { MobRenderer } from './MobRenderer';

const f = Math.fround;

export class CreeperRenderer extends MobRenderer {
  constructor() {
    super(new CreeperModel(), f(0.5));
  }

  override scale(mob: Mob, a: number): void {
    const creeper = mob as Creeper;
    let g = creeper.getSwelling(a);
    const wobble = f(1.0 + f(f(Mth.sin(f(g * 100)) * g) * f(0.01)));
    if (g < 0) g = 0;
    if (g > 1) g = 1;
    g = f(g * g);
    g = f(g * g);
    const s = f(f(1.0 + f(g * f(0.4))) * wobble);
    const hs = f(f(1.0 + f(g * f(0.1))) / wobble);
    glScalef(s, hs, s);
  }

  override getOverlayColor(mob: Mob, _br: number, a: number): number {
    const creeper = mob as Creeper;
    const step = creeper.getSwelling(a);
    if (Math.trunc(step * 10) % 2 === 0) return 0;
    let _a = Math.trunc(f(f(step * f(0.2)) * 255));
    if (_a < 0) _a = 0;
    if (_a > 255) _a = 255;
    const r = 255;
    const g = 255;
    const b = 255;
    return (_a << 24) | (r << 16) | (g << 8) | b;
  }
}
