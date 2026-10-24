import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BinaryHeap, Node, Path, Vec3 } from '@mcpe/world';
import type { Entity } from '@mcpe/world';

// 全量审核 W95–W97（BinaryHeap / Node / Path）。三个文件行为全部一致，没有运行时修改；
// 这里锁定的是会影响寻路结果的细节：short 截断、哈希碰撞、float 距离、堆的相等代价出队顺序、
// Path 的深拷贝与浅赋值。

const f = Math.fround;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const makeNode = (cost: number): Node => {
  const n = new Node();
  n.f = cost;
  return n;
};

describe('Node 审核（W96）', () => {
  it('W96：x/y/z 按 short 截断，hash 用截断前的参数计算', () => {
    const n = new Node(1, 70000, -70000);
    expect([n.x, n.y, n.z]).toEqual([1, 4464, -4464]);
    expect(n.hashCode()).toBe(Node.createHash(1, 70000, -70000));
  });

  it('W96：distanceTo 每一步按 float 算，返回 float', () => {
    const d = new Node(0, 0, 0).distanceTo(new Node(1, 1, 0));
    expect(d).toBe(f(Math.sqrt(2)));
    expect(new Node(0, 0, 0).distanceTo(new Node(3, 4, 0))).toBe(5);
  });

  it('W96：operator== 同时比较 hash 与坐标——哈希碰撞不算相等', () => {
    const a = new Node(1, 2, 3);
    const b = new Node(1, 2, 3);
    const collide = new Node(1, 258, 3); // y 的低 8 位相同 → hash 相同
    expect(collide.hashCode()).toBe(a.hashCode());
    expect(a.equals(b)).toBe(true);
    expect(a.equals(collide)).toBe(false);
  });

  it('W96：copy 复制全部字段（含 private hash），是新的对象', () => {
    const n = new Node(3, 4, 5);
    n.heapIdx = 7;
    n.g = 1.5;
    n.h = 2.5;
    n.f = 4;
    n.closed = true;
    n.cameFrom = new Node(1, 1, 1);
    const c = n.copy();
    expect(c).not.toBe(n);
    expect([c.x, c.y, c.z, c.heapIdx, c.g, c.h, c.f, c.closed]).toEqual([
      3,
      4,
      5,
      7,
      1.5,
      2.5,
      4,
      true,
    ]);
    expect(c.cameFrom).toBe(n.cameFrom);
    expect(c.hashCode()).toBe(n.hashCode());
  });
});

describe('BinaryHeap 审核（W95）', () => {
  it('W95：代价相等时按“左子 < 右子”取右支，出队顺序是确定的', () => {
    const heap = new BinaryHeap();
    const a = makeNode(1);
    const b = makeNode(1);
    const c = makeNode(1);
    heap.insert(a);
    heap.insert(b);
    heap.insert(c);
    // C++ downHeap：leftCost < rightCost 不成立（相等）时走右支；右子又不小于自己 → 不动。
    expect(heap.pop()).toBe(a);
    expect(heap.pop()).toBe(c);
    expect(heap.pop()).toBe(b);
    expect(heap.isEmpty()).toBe(true);
  });

  it('W95：changeCost 变小会往上浮，pop 先出它', () => {
    const heap = new BinaryHeap();
    const a = makeNode(1);
    const b = makeNode(2);
    const c = makeNode(3);
    heap.insert(a);
    heap.insert(b);
    heap.insert(c);
    heap.changeCost(c, 0.5);
    expect(c.f).toBe(0.5);
    expect(heap.pop()).toBe(c);
  });

  it('W95：clear 只清 _size，不重置节点的 heapIdx（原版怪癖）', () => {
    const heap = new BinaryHeap();
    const a = makeNode(1);
    heap.insert(a);
    heap.clear();
    expect(heap.isEmpty()).toBe(true);
    expect(a.inOpenSet()).toBe(true); // C++ clear 同样不遍历节点复位
  });

  it('W95：remove 把最后一个节点搬过来并复位 heapIdx', () => {
    const heap = new BinaryHeap();
    const a = makeNode(1);
    const b = makeNode(2);
    heap.insert(a);
    heap.insert(b);
    heap.remove(a);
    expect(a.heapIdx).toBe(-1);
    expect(heap.size()).toBe(1);
    expect(heap.pop()).toBe(b);
  });
});

describe('Path 审核（W97）', () => {
  it('W97：id 从 1 开始递增（C++ 的 static int p）', () => {
    const a = new Path();
    const b = new Path();
    expect(b.id).toBe(a.id + 1);
  });

  it('W97：copyNodes 是深拷贝（new Node(*nodes[i])），destroy 后清空', () => {
    const a = new Node(1, 2, 3);
    const b = new Node(4, 5, 6);
    const p = new Path();
    p.copyNodes([a, b], 2);
    expect(p.getSize()).toBe(2);
    expect(p.get(0)).not.toBe(a);
    expect([p.get(0)!.x, p.get(0)!.y, p.get(0)!.z]).toEqual([1, 2, 3]);
    expect(p.last()).toBe(p.get(1));
    p.destroy();
    expect(p.isEmpty()).toBe(true);
    expect(p.getSize()).toBe(0);
  });

  it('W97：assignFrom 是 C++ 默认赋值的浅拷贝（节点数组共享，id 一起复制）', () => {
    const p1 = new Path();
    p1.copyNodes([new Node(1, 2, 3)], 1);
    const p2 = new Path();
    p2.assignFrom(p1);
    expect(p2.id).toBe(p1.id);
    expect(p2.get(0)).toBe(p1.get(0));
    expect(p2.getSize()).toBe(1);
  });

  it('W97：getPos 的半格偏移是 (int)(bbWidth + 1) * 0.5f', () => {
    const p = new Path();
    p.copyNodes([new Node(3, 5, -2)], 1);
    const e = { bbWidth: 1.5 } as unknown as Entity; // (int)(2.5) = 2，* 0.5 = 1
    const pos = p.getPos(e, 0);
    expect([pos.x, pos.y, pos.z]).toEqual([4, 5, -1]);
  });

  it('W97：endsIn / endsInXZ 用 Mth.floor 比较最后节点', () => {
    const p = new Path();
    expect(p.last()).toBeNull();
    expect(p.endsIn(new Vec3(0, 0, 0))).toBe(false);
    p.copyNodes([new Node(4, 5, -1)], 1);
    expect(p.endsIn(new Vec3(4.9, 5.9, -0.1))).toBe(true);
    expect(p.endsInXZ(new Vec3(4.9, 0, -0.1))).toBe(true);
    expect(p.endsInXZ(new Vec3(4.9, 0, 0))).toBe(false);
  });
});
