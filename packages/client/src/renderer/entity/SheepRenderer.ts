// 1:1 移植自 src/client/renderer/entity/SheepRenderer.h 与 SheepRenderer.cpp（任务单 H6）：没剪毛时第 0 层画羊毛（按毛色着色）
import { type Mob, Sheep } from '@mcpe/world';
import type { Model } from '../../model/Model';
import { glColor4f2 } from '../gles';
import { MobRenderer } from './MobRenderer';

const f = Math.fround;


export class SheepRenderer extends MobRenderer {
  constructor(model: Model, armor: Model, shadow: number) {
    super(model, shadow);
    this.setArmor(armor);
  }

  override prepareArmor(mob: Mob, layer: number, a: number): number {
    const sheep = mob as Sheep; // C++ (Sheep*) mob
    if (layer === 0 && !sheep.isSheared()) {
      this.bindTexture('mob/sheep_fur.png');
      const brightness = sheep.getBrightness(a);
      const color = sheep.getColor();
      const COLOR = Sheep.COLOR;
      glColor4f2(f(brightness * COLOR[color]![0]!), f(brightness * COLOR[color]![1]!), f(brightness * COLOR[color]![2]!), 1);
      return 1;
    }
    return -1;
  }
}
