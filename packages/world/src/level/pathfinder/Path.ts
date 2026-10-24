/**
 * 1:1 移植自 src/world/level/pathfinder/Path.h 与 Path.cpp（任务单 H2）。
 * C++ 的 static int p（路径编号计数）→ 模块级计数器。copyNodes 逐个复制节点（`new Node(*nodes[i])`）。
 * C++ 的默认赋值运算符（PathfinderMob::setPath 里的 `this->path = path`）是浅拷贝：用 assignFrom 表达（ADAPTED(Cpp)）。
 */
import { Mth } from '@mcpe/util';
import type { Entity } from '../../entity/Entity';
import { Vec3 } from '../../phys/Vec3';
import type { Node } from './Node';

const f = Math.fround;
let p = 0;
// OMIT(Path): ~Path() { destroy(); }  Path.cpp:41 —— 逐个 delete 节点由 GC 接管（R3）；destroy() 本身已移植

export class Path {
  id: number;
  private nodes: Node[] | null = null;
  private length = 0;
  private index = 0;

  constructor() {
    this.id = ++p;
  }

  copyNodes(nodes: Node[], length: number): void {
    this.destroy();
    this.length = length;
    this.nodes = new Array<Node>(length);
    for (let i = 0; i < length; ++i) this.nodes[i] = nodes[i]!.copy();
  }

  destroy(): void {
    if (this.nodes) {
      this.nodes = null;
      this.index = this.length = 0;
    }
  }

  next(): void {
    this.index++;
  }

  setSize(size: number): void {
    this.length = size;
  }

  getSize(): number {
    return this.length;
  }

  isEmpty(): boolean {
    return this.length === 0 || this.nodes === null;
  }

  isDone(): boolean {
    return this.index >= this.length;
  }

  last(): Node | null {
    if (this.length > 0) {
      return this.nodes![this.length - 1]!;
    }
    return null;
  }

  get(i: number): Node {
    return this.nodes![i]!;
  }

  getIndex(): number {
    return this.index;
  }

  setIndex(index: number): void {
    this.index = index;
  }

  /** C++ 的两个重载：currentPos(Entity*)（返回 Vec3）与 currentPos()（返回 Node*）——R10 情形 B：后者命名为 currentNode */
  currentPos(e: Entity): Vec3 {
    return this.getPos(e, this.index);
  }

  currentNode(): Node {
    return this.nodes![this.index]!;
  }

  getPos(e: Entity, index: number): Vec3 {
    const half = f(Math.trunc(e.bbWidth + 1) * f(0.5));
    const x = f(this.nodes![index]!.x + half);
    const z = f(this.nodes![index]!.z + half);
    const y = this.nodes![index]!.y;
    return new Vec3(x, y, z);
  }

  sameAs(path: Path | null): boolean {
    if (!path) return false;
    if (path.length !== this.length) return false;
    for (let i = 0; i < this.length; ++i) {
      const node = path.nodes![i]!;
      if (
        this.nodes![i]!.x !== node.x ||
        this.nodes![i]!.y !== node.y ||
        this.nodes![i]!.z !== node.z
      )
        return false;
    }
    return true;
  }

  endsIn(pos: Vec3): boolean {
    const end = this.last();
    if (end === null) return false;
    return end.x === Mth.floor(pos.x) && end.y === Mth.floor(pos.y) && end.z === Mth.floor(pos.z);
  }

  endsInXZ(pos: Vec3): boolean {
    const end = this.last();
    if (end === null) return false;
    return end.x === Mth.floor(pos.x) && end.z === Mth.floor(pos.z);
  }

  /** C++ 的默认赋值 `a = b`（逐成员浅拷贝：节点数组指针共享，id 也一起复制） */
  assignFrom(o: Path): void {
    this.id = o.id;
    this.nodes = o.nodes;
    this.length = o.length;
    this.index = o.index;
  }
}
