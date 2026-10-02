// 1:1 移植自 src/client/renderer/DirtyChunkSorter.h：std::sort 的比较器，operator() 返回“c0 是否排在 c1 前面”。
// 用 Array.prototype.sort 时套 sorterComparator()。
import type { Entity } from '@mcpe/world';
import type { Chunk } from './Chunk';

export class DirtyChunkSorter {
  private cameraEntity: Entity;

  constructor(cameraEntity: Entity) {
    this.cameraEntity = cameraEntity;
  }

  /** bool operator() (Chunk* c0, Chunk* c1) */
  compare(c0: Chunk, c1: Chunk): boolean {
    const i0 = c0.visible;
    const i1 = c1.visible;
    if (i0 && !i1) return false; //  1;
    if (i1 && !i0) return true; // -1;
    const d0 = c0.distanceToSqr(this.cameraEntity);
    const d1 = c1.distanceToSqr(this.cameraEntity);
    if (d0 < d1) return false; //  1;
    if (d0 > d1) return true; // -1;
    return c0.id > c1.id; // ? -1 : 1;
  }
}

/** 把 C++ 风格的“小于”比较器转成 Array.prototype.sort 用的比较函数 */
export function sorterComparator<T>(s: { compare(a: T, b: T): boolean }): (a: T, b: T) => number {
  return (a, b) => (s.compare(a, b) ? -1 : s.compare(b, a) ? 1 : 0);
}
