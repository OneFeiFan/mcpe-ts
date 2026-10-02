// 1:1 移植自 src/client/renderer/DistanceChunkSorter.h（std::sort 的比较器；用 sorterComparator 套给 Array.sort）
import type { Entity } from '@mcpe/world';
import type { Chunk } from './Chunk';

export class DistanceChunkSorter {
  private player: Entity;

  constructor(player: Entity) {
    this.player = player;
  }

  /** bool operator() (const Chunk* c0, const Chunk* c1) */
  compare(c0: Chunk, c1: Chunk): boolean {
    let d0 = c0.distanceToSqr(this.player);
    let d1 = c1.distanceToSqr(this.player);
    if (d0 > 32 * 32 && c0.y < 64) d0 *= 10.0;
    if (d1 > 32 * 32 && c1.y < 64) d1 *= 10.0;
    return d0 < d1; //? -1 : 1;
  }
}
