// 1:1 移植自 src/world/level/biome/RainforestBiome.h（S4）。唯一的方法 getTreeFeature 依赖地物系统，本轮 OMIT。
import { Biome } from './Biome';

export class RainforestBiome extends Biome {
  constructor() {
    super();
  }

  // OMIT(LevelgenFeature): getTreeFeature(random)  RainforestBiome.h:14
}
