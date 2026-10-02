// 1:1 移植自 src/client/renderer/ChunkRenderer.h（分支里是一个空壳：只持有 Region，render() 什么都不做）
import type { Region } from '@mcpe/world';

export class ChunkRenderer {
  private readonly r: Region;

  constructor(region: Region) {
    this.r = region;
  }

  render(): void {}
}
