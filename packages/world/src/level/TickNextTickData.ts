/**
 * 1:1 移植自 src/world/level/TickNextTickData.h 与 TickNextTickData.cpp（S4）：一条“某个方块在某个时间要 tick”的计划。
 *
 * 【排序】operator< 按 (delay, c) 比较；c 是每构造一个对象就加一的全局序号，所以同一时刻的计划按创建先后执行。
 * 【C++ 的一个行为，照原样保留】Level::addToTickNextTick 先 find 再 insert，想去重；但 std::set 按 operator< 判断
 *   “相等”，而新对象的 c 永远是新的，所以 find 从来找不到，同一个方块重复计划会被重复插入、重复 tick。
 *   不要把它“修”成按坐标去重——液体、火的扩散时序都依赖这一点，改了会和原版不一样。
 * 【delay 的初值】C++ 只有 tileId > 0 时才调用 setDelay，否则 delay 是未初始化的值；这里取 0。
 *
 * 【ADAPTED(Cpp)】C++ 的 std::set<TickNextTickData>（Level.h 里的 TickDataSet）写成下面的 TickDataSet：
 *   Level 只用到 size、begin、erase(begin)、find、insert，所以用按 operator< 排序的小顶堆实现，
 *   begin() 取出的顺序与 std::set 的遍历顺序完全相同。Level 里照 C++ 写：
 *     if (!set.has(td)) set.insert(td);            // if (set.find(td) == set.end()) set.insert(td);
 *     const td = set.begin()!; … ; set.erase(td);  // TickDataSet::iterator td = set.begin(); … ; set.erase(td);
 */

export class TickNextTickData {
  private static C = 0; // static long C
  private readonly c: number;
  x: number;
  y: number;
  z: number;
  tileId: number;
  delay = 0; // long

  constructor(x_: number, y_: number, z_: number, tileId_: number) {
    this.x = x_;
    this.y = y_;
    this.z = z_;
    this.tileId = tileId_;
    this.c = ++TickNextTickData.C;
  }

  hashCode(): number {
    // (((x * 128 * 1024) + (z * 128) + y) * 256) + tileId，按 C++ 的 int 回绕
    return (
      (Math.imul((Math.imul(this.x, 128 * 1024) + Math.imul(this.z, 128) + this.y) | 0, 256) +
        this.tileId) |
      0
    );
  }

  /** C++ 的 operator==：只比较坐标与方块（std::set 不用它） */
  equals(t: TickNextTickData): boolean {
    return this.x === t.x && this.y === t.y && this.z === t.z && this.tileId === t.tileId;
  }

  /** C++ 的 operator<：先比 delay，再比创建序号 c */
  lessThan(tnd: TickNextTickData): boolean {
    if (this.delay < tnd.delay) return true;
    if (this.delay > tnd.delay) return false;
    if (this.c < tnd.c) return true;
    if (this.c > tnd.c) return false;
    return false;
  }

  setDelay(l: number): TickNextTickData {
    this.delay = l;
    return this;
  }

  /** 只给 TickDataSet 用：std::set 判断“等价”看的是 (delay, c) */
  static equivalent(a: TickNextTickData, b: TickNextTickData): boolean {
    return !a.lessThan(b) && !b.lessThan(a);
  }

  /** 只给 TickDataSet 用 */
  static serial(t: TickNextTickData): number {
    return t.c;
  }
}

/** ADAPTED(Cpp)：std::set<TickNextTickData>（见文件头） */
export class TickDataSet {
  private readonly heap: TickNextTickData[] = [];
  private readonly bySerial = new Map<number, TickNextTickData>();

  size(): number {
    return this.heap.length;
  }

  /** set.find(td) != set.end()：按 operator< 的等价判断，新构造的对象永远找不到（见文件头） */
  has(td: TickNextTickData): boolean {
    const e = this.bySerial.get(TickNextTickData.serial(td));
    return e !== undefined && TickNextTickData.equivalent(e, td);
  }

  insert(td: TickNextTickData): void {
    if (this.has(td)) return; // std::set 的 insert 遇到等价元素时什么都不做
    const h = this.heap;
    h.push(td);
    this.bySerial.set(TickNextTickData.serial(td), td);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!h[i]!.lessThan(h[p]!)) break;
      [h[i], h[p]] = [h[p]!, h[i]!];
      i = p;
    }
  }

  /** set.begin()：最小的元素；集合为空时返回 null（C++ 里对空集合解引用是未定义行为） */
  begin(): TickNextTickData | null {
    return this.heap.length > 0 ? this.heap[0]! : null;
  }

  /** set.erase(it)。Level 只会删除 begin()；删除其他元素也支持，只是要线性查找 */
  erase(td: TickNextTickData): void {
    const h = this.heap;
    const i = h[0] === td ? 0 : h.indexOf(td);
    if (i < 0) return;
    this.bySerial.delete(TickNextTickData.serial(td));
    const last = h.pop()!;
    if (i === h.length) return;
    h[i] = last;
    this.siftDown(i);
    // 被换上来的元素也可能比父节点小（只在删除非堆顶元素时发生）
    let k = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!h[k]!.lessThan(h[p]!)) break;
      [h[k], h[p]] = [h[p]!, h[k]!];
      k = p;
    }
  }

  clear(): void {
    this.heap.length = 0;
    this.bySerial.clear();
  }

  private siftDown(i: number): void {
    const h = this.heap;
    const n = h.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && h[l]!.lessThan(h[m]!)) m = l;
      if (r < n && h[r]!.lessThan(h[m]!)) m = r;
      if (m === i) return;
      [h[i], h[m]] = [h[m]!, h[i]!];
      i = m;
    }
  }
}
