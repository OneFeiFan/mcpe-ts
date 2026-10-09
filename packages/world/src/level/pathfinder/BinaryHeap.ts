/**
 * 1:1 移植自 src/world/level/pathfinder/BinaryHeap.h（任务单 H2）：按 f 排序的数组最小堆。
 * ⚠ 上浮、下沉的比较（严格小于、左右子相等时取右子）决定了同代价节点的出队顺序，进而决定路径；必须逐句照抄，不能换成别的优先队列。
 * C++ 的扩容（_maxSize 翻倍）在 JS 数组里是自动的，保留 _maxSize 字段只为对照。
 */
import { LOGE } from '@mcpe/platform';
import type { Node } from './Node';


const f = Math.fround;
const FLT_MAX = 3.4028234663852886e38;

export class BinaryHeap {
  private _heap: (Node | null)[] = [];
  private _size = 0;
  private _maxSize = 1024;

  insert(node: Node): Node {
    if (node.heapIdx >= 0) {
      LOGE('BinaryHeap::insert. Node already added!\n');
    }
    if (this._size === this._maxSize) {
      this._maxSize = this._size << 1;
    }
    this._heap[this._size] = node;
    node.heapIdx = this._size;
    this.upHeap(this._size++);
    return node;
  }

  clear(): void {
    this._size = 0;
  }

  pop(): Node {
    const popped = this._heap[0]!;
    this._heap[0] = this._heap[--this._size]!;
    this._heap[this._size] = null;
    if (this._size > 0) this.downHeap(0);
    popped.heapIdx = -1;
    return popped;
  }

  remove(node: Node): void {
    this._heap[node.heapIdx] = this._heap[--this._size]!;
    this._heap[this._size] = null;
    if (this._size > node.heapIdx) {
      if (this._heap[node.heapIdx]!.f < node.f) {
        this.upHeap(node.heapIdx);
      } else {
        this.downHeap(node.heapIdx);
      }
    }
    node.heapIdx = -1;
  }

  changeCost(node: Node, newCost: number): void {
    const oldCost = node.f;
    node.f = f(newCost);
    if (newCost < oldCost) {
      this.upHeap(node.heapIdx);
    } else {
      this.downHeap(node.heapIdx);
    }
  }

  size(): number {
    return this._size;
  }

  isEmpty(): boolean {
    return this._size === 0;
  }

  private upHeap(idx: number): void {
    const node = this._heap[idx]!;
    const cost = node.f;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this._heap[parentIdx]!;
      if (cost < parent.f) {
        this._heap[idx] = parent;
        parent.heapIdx = idx;
        idx = parentIdx;
      } else break;
    }
    this._heap[idx] = node;
    node.heapIdx = idx;
  }

  private downHeap(idx: number): void {
    const node = this._heap[idx]!;
    const cost = node.f;
    while (true) {
      const leftIdx = 1 + (idx << 1);
      const rightIdx = leftIdx + 1;
      if (leftIdx >= this._size) break;
      const leftNode = this._heap[leftIdx]!;
      const leftCost = leftNode.f;
      let rightNode: Node | null;
      let rightCost: number;
      if (rightIdx >= this._size) {
        rightNode = null;
        rightCost = FLT_MAX;
      } else {
        rightNode = this._heap[rightIdx]!;
        rightCost = rightNode.f;
      }
      if (leftCost < rightCost) {
        if (leftCost < cost) {
          this._heap[idx] = leftNode;
          leftNode.heapIdx = idx;
          idx = leftIdx;
        } else break;
      } else {
        if (rightCost < cost) {
          this._heap[idx] = rightNode!;
          rightNode!.heapIdx = idx;
          idx = rightIdx;
        } else break;
      }
    }
    this._heap[idx] = node;
    node.heapIdx = idx;
  }
}
