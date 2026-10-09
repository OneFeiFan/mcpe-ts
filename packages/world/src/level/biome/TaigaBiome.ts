// 1:1 移植自 src/world/level/biome/TaigaBiome.h（S4）。唯一的方法 getTreeFeature 依赖地物系统，本轮 OMIT。
import { SpruceFeature } from '../levelgen/feature/SpruceFeature';
import { PineFeature } from '../levelgen/feature/PineFeature';
import type { Feature } from '../levelgen/feature/Feature';
import type { Random } from '@mcpe/util';
import { Biome } from './Biome';

export class TaigaBiome extends Biome {
  constructor() {
    super();
  }

  /** C++ TaigaBiome::getTreeFeature：1/3 松树，否则云杉 */
  override getTreeFeature(random: Random): Feature | null {
    if (random.nextInt(3) === 0) {
      return new PineFeature();
    }
    return new SpruceFeature();
  }
}
