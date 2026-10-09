/**
 * 1:1 移植自 src/world/level/pathfinder/Node.h（任务单 H2）。Node 与 TNode。
 * x、y、z 是 short（按 C++ 截断成 16 位）；g、h、f 是 float（Math.fround）。
 * createHash 里的 `0x0080000000` 进 int 之后就是符号位：`| 0` 之后与 C++ 相同（PITFALLS 第 4 条）。
 * C++ 的 operator==：哈希相同且坐标相同。PathFinder 的节点表只按哈希查（std::map<int, TNode>），哈希碰撞时会当成同一个节点——照原样。
 */
import { Mth } from '@mcpe/util';

const f = Math.fround;
const short = (v: number): number => (v << 16) >> 16;

export class Node {
  heapIdx = -1;
  g = 0;
  h = 0;
  f = 0;
  cameFrom: Node | null = null;
  x: number;
  y: number;
  z: number;
  closed = false;
  private hash: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = short(x);
    this.y = short(y);
    this.z = short(z);
    this.hash = Node.createHash(x, y, z);
  }

  static createHash(x: number, y: number, z: number): number {
    return (
      (y & 0xff) |
      ((x & 0x7fff) << 8) |
      ((z & 0x7fff) << 24) |
      (x < 0 ? 0x80000000 : 0) |
      (z < 0 ? 0x0000008000 : 0) |
      0
    );
  }

  distanceTo(to: Node): number {
    const xd = f(to.x - this.x);
    const yd = f(to.y - this.y);
    const zd = f(to.z - this.z);
    return f(Mth.sqrt(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd))));
  }

  /** C++ operator== */
  equals(rhs: Node): boolean {
    return this.hash === rhs.hash && this.x === rhs.x && this.y === rhs.y && this.z === rhs.z;
  }

  hashCode(): number {
    return this.hash;
  }

  inOpenSet(): boolean {
    return this.heapIdx >= 0;
  }

  toString(): string {
    return 'Node::toString not implemented';
  }

  /** C++ 的拷贝构造 `new Node(*nodes[i])`（Path::copyNodes 用） */
  copy(): Node {
    const n = new Node(this.x, this.y, this.z);
    n.heapIdx = this.heapIdx;
    n.g = this.g;
    n.h = this.h;
    n.f = this.f;
    n.cameFrom = this.cameFrom;
    n.closed = this.closed;
    n.hash = this.hash;
    return n;
  }
}

/** C++ 的 TNode：给 std::map / set 排序用的包装（operator< 按 z、x、y） */
export class TNode {
  constructor(public node: Node) {}

  equals(rhs: TNode): boolean {
    return this.node.equals(rhs.node);
  }

  lessThan(rhs: TNode): boolean {
    if (this.node.z !== rhs.node.z) return this.node.z < rhs.node.z;
    if (this.node.x !== rhs.node.x) return this.node.x < rhs.node.x;
    return this.node.y < rhs.node.y;
  }
}
