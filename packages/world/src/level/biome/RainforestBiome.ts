// 1:1 移植自 src/world/level/biome/RainforestBiome.h（S4）。唯一的方法 getTreeFeature 依赖地物系统，本轮 OMIT。
import { TreeFeature } from '../levelgen/feature/TreeFeature';
import type { Feature } from '../levelgen/feature/Feature';
import type { Random } from '@mcpe/util';
import { Biome } from './Biome';

export class RainforestBiome extends Biome {
  constructor() {
    super();
  }

  /** C++ RainforestBiome::getTreeFeature：取一次 nextInt(3)（BasicTree 分支被注释掉），返回橡树 */
  override getTreeFeature(random: Random): Feature | null {
    if (random.nextInt(3) === 0) {
      // return new BasicTree(false); // temporarily disabled（C++ 原注释）
    }
    return new TreeFeature(false);
  }
}
