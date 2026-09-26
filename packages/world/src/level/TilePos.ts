export class TilePos {
    x: number;
    y: number;
    z: number;

    // 对应 C++ 的两个构造函数：
    //   TilePos(int,int,int)      —— 三参重载
    //   TilePos(const TilePos&)   —— 拷贝构造，映射为接收 TilePos 的重载
    constructor(x: number, y: number, z: number);
    constructor(rhs: TilePos);
    constructor(x: number | TilePos, y?: number, z?: number) {
        if (typeof x === 'number') {
            this.x = x;
            this.y = y!;
            this.z = z!;
        } else {
            // 逐字段快照，等价于 C++ 拷贝构造
            this.x = x.x;
            this.y = x.y;
            this.z = x.z;
        }
    }

    /**
     * 显式拷贝入口。C++ 里 `TilePos b(a);` / `TilePos b = a;` 是值拷贝，
     * TS 里必须显式调用，否则是引用共享。
     */
    clone(): TilePos {
        return new TilePos(this.x, this.y, this.z);
    }

    /**
     * 对应 C++ 的 `operator=`。
     * TS 不能重载 `=`，改成 `a.assign(b)` 且返回 this，用法与 C++ 链式赋值一致。
     */
    assign(rhs: TilePos): this {
        this.x = rhs.x;
        this.y = rhs.y;
        this.z = rhs.z;
        return this;
    }

    /**
     * 对应 C++ 的 `operator==`。
     * TS 不能重载 `==`，改名为 equals。
     */
    equals(rhs: TilePos): boolean {
        return this.x === rhs.x && this.y === rhs.y && this.z === rhs.z;
    }

    /**
     * 对应 C++ 的 `operator<`。
     * 注意：C++ 原语义就是按 hashCode 比较（存在哈希碰撞导致顺序错乱的隐患），
     * 这里刻意保持一致，不做"修正"。
     */
    lessThan(rhs: TilePos): boolean {
        return this.hashCode() < rhs.hashCode();
    }

    /**
     * 对应 C++ 的 `hashCode()`：
     *     return x * 8976890 + y * 981131 + z;
     *
     * C++ 的 int 是 32 位，乘法/加法都会按 int32 回绕（wrap）。
     * JS 的 number 是 double，2^53 之外精度不够，直接乘会得到错误结果。
     * 因此必须：
     *   1. 用 Math.imul 做 32 位有符号乘法（等价于 C++ 的 int * int）
     *   2. 加法后用 `| 0` 截断回 int32（等价于 C++ 的 int + int 回绕）
     */
    hashCode(): number {
        const a = Math.imul(this.x, 8976890);
        const b = Math.imul(this.y, 981131);
        return (((a + b) | 0) + this.z) | 0;
    }

    toString(): string {
        return `TilePos(${this.x},${this.y},${this.z})`;
    }
}