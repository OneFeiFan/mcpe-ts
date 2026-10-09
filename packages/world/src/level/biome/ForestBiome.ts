// 1:1 移植自 src/world/level/biome/ForestBiome.h（S4）。唯一的方法 getTreeFeature 依赖地物系统，本轮 OMIT。
import { TreeFeature } from '../levelgen/feature/TreeFeature';
import { BirchFeature } from '../levelgen/feature/BirchFeature';
import type { Feature } from '../levelgen/feature/Feature';
import type { Random } from '@mcpe/util';
import { Biome } from './Biome';

export class ForestBiome extends Biome {
  constructor() {
    super();
  }

  /** C++ ForestBiome::getTreeFeature：1/5 白桦；再取一次 nextInt(3)（原来返回 BasicTree 的分支被注释掉）；否则橡树 */
  override getTreeFeature(random: Random): Feature | null {
    if (random.nextInt(5) === 0) {
      return new BirchFeature();
    }
    if (random.nextInt(3) === 0) {
      // return new BasicTree(false); // temporarily disabled（C++ 原注释）
    }
    return new TreeFeature(false);
  }
}
