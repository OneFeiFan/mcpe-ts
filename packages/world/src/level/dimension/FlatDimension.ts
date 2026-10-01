// NEW（S5，决策 D4）：demo 用的维度。只重写 createRandomLevelSource，其余全部沿用 Dimension（getTimeOfDay 恒为 1，skyDarken 为 0）。
// 经 Level 构造函数的 fixedDimension 参数传入，Level 与 Dimension 都不用改。
import type { ChunkSource } from '../chunk/ChunkSource';
import { FlatChunkSource } from '../levelgen/FlatChunkSource';
import { Dimension } from './Dimension';

export class FlatDimension extends Dimension {
  override createRandomLevelSource(): ChunkSource {
    return new FlatChunkSource(this.level);
  }
}
