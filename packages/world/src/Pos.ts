export class Pos {
  x: number;
  y: number;
  z: number;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * 对应 C++ 的拷贝构造 `Pos(const Pos& position)`。
   * 显式拷贝的入口，所有跨边界传递 Pos 的地方都应先 clone()。
   */
  clone(): Pos {
    return new Pos(this.x, this.y, this.z);
  }

  // ---------- 哈希 / 比较 ----------

  static createHashCode(x: number, y: number, z: number): number {
    return x + (z << 8) + (y << 16);
  }

  hashCode(): number {
    return this.x + (this.z << 8) + (this.y << 16);
  }

  equals(rhs: Pos): boolean {
    return this.x === rhs.x && this.y === rhs.y && this.z === rhs.z;
  }

  compareTo(pos: Pos): number {
    return (this.hashCode() - pos.hashCode()) | 0;
  }

  // ---------- 返回新对象：本身已是"拷贝"，无需再 clone ----------

  offset(x: number, y: number, z: number): Pos {
    return new Pos(this.x + x, this.y + y, this.z + z);
  }

  above(steps = 1): Pos {
    return new Pos(this.x, this.y + steps, this.z);
  }
  below(steps = 1): Pos {
    return new Pos(this.x, this.y - steps, this.z);
  }
  north(steps = 1): Pos {
    return new Pos(this.x, this.y, this.z - steps);
  }
  south(steps = 1): Pos {
    return new Pos(this.x, this.y, this.z + steps);
  }
  west(steps = 1): Pos {
    return new Pos(this.x - steps, this.y, this.z);
  } // 修掉原 C++ 的 bug（原来无论 steps 都是 -1）
  east(steps = 1): Pos {
    return new Pos(this.x + steps, this.y, this.z);
  }

  // ---------- 入参拷贝：防止调用方传入的 Pos 被后续修改影响内部状态 ----------

  /**
   * 对应 C++ 的两个 set 重载。
   * - set(x,y,z)：纯值，无需拷贝
   * - set(pos)  ：C++ 是 `const Pos&` + 逐字段赋值，这里也逐字段拷贝，
   *               并且即使后续 rhs 被改，也不影响 this。
   */
  set(x: number, y: number, z: number): void;
  set(pos: Pos): void;
  set(a: number | Pos, b?: number, c?: number): void {
    if (typeof a === 'number') {
      this.x = a;
      this.y = b!;
      this.z = c!;
    } else {
      // 逐字段快照，等价于 C++ 值赋值
      this.x = a.x;
      this.y = a.y;
      this.z = a.z;
    }
  }

  /**
   * 对应 C++ 的 move 重载。这里语义是"累加"，本来就只读 rhs，
   * 但为防 rhs 后续被外部改动造成重新读取，仍然一次性快照。
   */
  move(x: number, y: number, z: number): void;
  move(pos: Pos): void;
  move(a: number | Pos, b?: number, c?: number): void {
    if (typeof a === 'number') {
      this.x += a;
      this.y += b!;
      this.z += c!;
    } else {
      this.x += a.x;
      this.y += a.y;
      this.z += a.z; // 读取即快照
    }
  }

  // ---------- 单轴移动（纯值，无需拷贝） ----------

  moveX(steps: number): void {
    this.x += steps;
  }
  moveY(steps: number): void {
    this.y += steps;
  }
  moveZ(steps: number): void {
    this.z += steps;
  }

  moveUp(steps = 1): void {
    this.y += steps;
  }
  moveDown(steps = 1): void {
    this.y -= steps;
  }
  moveEast(steps = 1): void {
    this.x += steps;
  }
  moveWest(steps = 1): void {
    this.x -= steps;
  }
  moveNorth(steps = 1): void {
    this.z -= steps;
  }
  moveSouth(steps = 1): void {
    this.z += steps;
  }

  toString(): string {
    return `Pos(${this.x},${this.y},${this.z})`;
  }
}
