// 1:1 移植自 src/world/level/chunk/DataLayer.h（S4 前置）：每个方块 4 位的数据层（附加值、天空光、方块光）
export class DataLayer {
  data: Uint8Array | null;
  length: number;
  /** C++ 的默认构造与 (data, length) 构造都不初始化 slotMax（未初始化成员）；按规范取 0。 */
  slotMax = 0;

  constructor();
  constructor(length: number);
  constructor(data: Uint8Array, length: number);
  constructor(a?: number | Uint8Array, b?: number) {
    if (a === undefined) {
      this.data = null;
      this.length = 0;
    } else if (typeof a === 'number') {
      this.length = a >> 1;
      this.data = new Uint8Array(this.length);
      this.setAll(0);
      this.slotMax = this.length;
    } else {
      this.length = b! >> 1;
      this.data = a; // C++ 直接保存指针（不复制）
    }
  }

  // OMIT(DataLayer): ~DataLayer() { delete[] data; }  src/world/level/chunk/DataLayer.h:28 —— 内存由 GC 接管（R3）。

  get(x: number, y: number, z: number): number;
  get(pos: number): number;
  get(a: number, y?: number, z?: number): number {
    const pos = y === undefined ? a : (a << 11) | (z! << 7) | y;
    const slot = pos >> 1;
    const part = pos & 1;
    if (part === 0) {
      return this.data![slot]! & 0xf;
    } else {
      return (this.data![slot]! >> 4) & 0xf;
    }
  }

  set(x: number, y: number, z: number, val: number): void;
  set(pos: number, val: number): void;
  set(a: number, b: number, z?: number, val?: number): void {
    let pos: number;
    if (z === undefined) {
      pos = a;
      val = b;
    } else {
      pos = (a << 11) | (z << 7) | b;
    }
    const data = this.data!;
    const slot = pos >> 1;
    const part = pos & 1;
    if (part === 0) {
      data[slot] = (data[slot]! & 0xf0) | (val! & 0xf);
    } else {
      data[slot] = (data[slot]! & 0x0f) | ((val! & 0xf) << 4);
    }
  }

  isValid(): boolean {
    return this.data !== null;
  }

  setAll(br: number): void {
    // 照原样保留 C++ 的写法：这里是 &，所以 setAll(15) 实际写入 0（15 & 240 = 0）。只有 setAll(0) 被调用过。
    const val = br & (br << 4) & 0xff;
    this.data!.fill(val, 0, this.length);
  }
}
