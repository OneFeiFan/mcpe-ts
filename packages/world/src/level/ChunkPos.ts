import type { Entity } from '../entity/Entity';

export class ChunkPos {
  // 对应 C++ 的 `const int x, z;`
  // TS 没有真正的 const 字段，readonly 是编译期最接近的表达。
  readonly x: number;
  readonly z: number;

  /**
   * 对应 C++ 的两个构造函数：
   *   ChunkPos()          —— 默认构造，x=0, z=0
   *   ChunkPos(int,int)   —— 二参构造
   * 默认参数把两者合并。
   *
   * `| 0` 用来模拟 C++ 的 `int x_` 参数：C++ 会把传入的浮点截断为 int32，
   * JS 不写 `| 0` 会保留 double 小数部分。坐标不超范围时二者等价，
   * 写了则严格对齐 C++ 语义。
   */
  constructor(x: number = 0, z: number = 0) {
    this.x = x | 0;
    this.z = z | 0;
  }

  /**
   * C++ 因为字段是 const，隐式删除了 copy assignment（`a = b` 编译不过），
   * 但默认拷贝构造 `ChunkPos b(a);` 仍然可用。
   * TS 里对应：不提供 assign，只提供 clone。
   */
  clone(): ChunkPos {
    return new ChunkPos(this.x, this.z);
  }

  /**
   * 对应 C++ 的静态 `hashCode(int x, int z)`。
   *
   * C++ 里 0x80000000 是 unsigned int 字面量，整个 `|` 链按 unsigned 运算，
   * 最后隐式转回 int（位重解释）。
   *
   * JS 里 `|` 的操作数会被 ToInt32，结果就是有符号 int32，
   * 位模式与 C++ 的 unsigned 结果完全相同，转回 int 后的值也相同。
   * 所以这里逐字照抄即可，不需要额外 Math.imul / | 0 —— `|` 本身已经
   * 保证了 32 位语义。
   */
  static hashCode(x: number, z: number): number {
    return (
      (x < 0 ? 0x80000000 : 0) | ((x & 0x7fff) << 16) | (z < 0 ? 0x00008000 : 0) | (z & 0x7fff)
    );
  }

  hashCode(): number {
    return ChunkPos.hashCode(this.x, this.z);
  }

  /** 对应 C++ 的 `operator==`（不可重载，改名）。 */
  equals(rhs: ChunkPos): boolean {
    return this.x === rhs.x && this.z === rhs.z;
  }

  /**
   * 对应 C++ 的 `operator<`：只比 hashCode。
   * 保持原语义，不要顺手改成先比 hashCode 再比 x/z，
   * 否则会改变容器里的排序/去重行为。
   */
  lessThan(rhs: ChunkPos): boolean {
    return this.hashCode() < rhs.hashCode();
  }

  /**
   * 对应 C++：
   *   float xPos = (float)(x * 16 + 8);
   *   float zPos = (float)(z * 16 + 8);
   *   float xd = xPos - e->x;
   *   float zd = zPos - e->z;
   *   return xd * xd + zd * zd;
   *
   * C++ 每一步都是 32 位 float；TS 的 number 是 64 位 double。
   * 下面这个版本用 double 计算，数值更精确、性能更好，
   * 绝大多数场景（比较距离、AABB 判定）结果一致。
   *
   * 若要位级对齐 C++ 的 float 行为，见下文「float 位级对齐版」。
   */
  distanceToSqr(e: Entity): number {
    const xPos = this.x * 16 + 8;
    const zPos = this.z * 16 + 8;
    const xd = xPos - e.x;
    const zd = zPos - e.z;
    return xd * xd + zd * zd;
  }

  toString(): string {
    return `ChunkPos(${this.x},${this.z})`;
  }
}
