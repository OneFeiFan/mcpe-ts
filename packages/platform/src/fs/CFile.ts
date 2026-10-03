/**
 * CFile —— C 的 FILE* 在 TS 里的对应物（ADAPTED(Web)，非移植）。
 *
 * 目的：让移植存档代码时，`FILE* file = fopen(name.c_str(), "rb")` 能原样对应成
 * `const file = vfs.open(name, 'rb')`，`if (file == NULL)` 对应 `if (file === null)`，
 * 从而不必改写算法结构。所以下面每个方法的**参数个数、返回值语义都照抄 C 标准库**，
 * 而不是改成更顺手的 TS 写法。
 *
 * 【返回值是元素个数，不是字节数】这是最容易搞错的一点。C 的 fread/fwrite 返回**完整元素的个数**
 * （= 处理字节数 ÷ size）。参考源码里到处靠这个判断成败：
 *     logAssert(fread(offsets, sizeof(int), SECTOR_INTS, file), SECTOR_INTS);   // 比的是 SECTOR_INTS
 *     if (fread(&version, sizeof(version), 1, file) != 1)
 * 按字节数实现会让这些断言全错。
 *
 * 【fread 的部分元素】读到末尾时，凑不满一个完整元素的那些字节**仍会被读进缓冲区、并推进位置**，
 * 只是不计入返回值。C 就是这么定的，这里照做 —— 黄金样本 G14-1 是逐字节比对，含糊不得。
 *
 * 【稀疏写入】fseek 越过末尾之后再写，中间的空洞补 0。内存实现里靠「重新分配一块全 0 的
 * Uint8Array 再拷回旧内容」自然得到这个语义。
 *
 * 【未定义行为不复刻】close() 之后再读写，C 里是 UB（PITFALLS 第 20 条：不复刻 UB）。
 * 这里记一个 closed 标志，之后的操作安静地失败（读返回 0、seek 返回 -1），不抛异常。
 */
import type { VirtualFS } from './VirtualFS.js';

/** C 的 fopen 模式。参考源码实测只用到这四种；`ab` 一次都没出现过，故意不实现。 */
export type FsMode = 'rb' | 'wb' | 'r+b' | 'w+b';

/** 与 <cstdio.h> 的 SEEK_* 一致 */
export const SEEK_SET = 0;
export const SEEK_CUR = 1;
export const SEEK_END = 2;

/**
 * 把任意 TypedArray / DataView 归一成字节视图。
 *
 * 【为什么不能直接把 dest 交给 Uint8Array.set】TypedArray.prototype.set 是逐【元素】拷贝，
 * 不是逐字节。实测：`new Uint8Array(8).set(new Int32Array([0x04030201]))` 得到 `[1,0,0,...]`
 * —— 0x04030201 被当成一个"元素"截断成 1，其余字节全丢。移植 RegionFile 时 `int offsets[1024]`
 * 对应的是 Int32Array，正好会踩中这个坑，而且是静默的。
 * 所以 read/write 都先归一成字节视图再操作。
 */
function asBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength);
}

export class CFile {
  private pos = 0;
  private closed = false;
  private readonly readable: boolean;
  private readonly writable: boolean;

  constructor(
    private readonly vfs: VirtualFS,
    readonly path: string,
    readonly mode: FsMode,
  ) {
    // "rb" 只能读、"wb" 只能写，带 + 的两个可读可写（照 C）
    this.readable = mode === 'rb' || mode === 'r+b' || mode === 'w+b';
    this.writable = mode !== 'rb';
  }

  /**
   * 对应 fread(dest, size, count, file)：最多读 size*count 字节，返回**读到的完整元素个数**。
   * 缓冲区里不足一个元素的尾部字节也会被写入 dest、位置也会前进，只是不计入返回值。
   *
   * dest 收 ArrayBufferView 而不是 Uint8Array，好让移植代码直接传 `Int32Array`（C++ 的 `int*`）。
   */
  read(dest: ArrayBufferView, size: number, count: number): number {
    if (this.closed || !this.readable) return 0;
    const want = size * count;
    if (want <= 0) return 0;
    const buf = this.vfs.getBuffer(this.path);
    if (buf === undefined) return 0;
    const available = buf.length - this.pos;
    const n = available <= 0 ? 0 : Math.min(want, available);
    if (n > 0) asBytes(dest).set(buf.subarray(this.pos, this.pos + n), 0);
    this.pos += n;
    return Math.floor(n / size);
  }

  /**
   * 对应 fwrite(src, size, count, file)：写入 size*count 字节，返回**写入的完整元素个数**。
   * 内存写不会失败，所以正常情况下返回的就是 count。
   *
   * src 同样收 ArrayBufferView（C++ 的 `const void*`），取数组元素地址可以写成
   * `new Uint8Array(arr.buffer, i * 4, 4)` —— 零拷贝，等价于 C 的 `&arr[i]`。
   */
  write(src: ArrayBufferView, size: number, count: number): number {
    if (this.closed || !this.writable) return 0;
    const total = size * count;
    if (total <= 0) return 0;
    const bytes = asBytes(src);
    let buf = this.vfs.getBuffer(this.path) ?? new Uint8Array(0);
    const end = this.pos + total;
    if (end > buf.length) {
      // 新分配的部分全是 0 —— 正好就是 C 在空洞处补 0 的语义
      const grown = new Uint8Array(end);
      grown.set(buf, 0);
      buf = grown;
      this.vfs.setBuffer(this.path, buf); // 数组换了，交回给 VirtualFS 并标脏
    } else {
      this.vfs.markDirty(this.path); // 原地改写，数组没换
    }
    buf.set(bytes.subarray(0, total), this.pos);
    this.pos = end;
    return count;
  }

  /** 对应 fseek：成功返回 0，失败返回 -1。允许越过末尾（C 如此，之后的写会补 0）。 */
  seek(offset: number, whence: number): number {
    if (this.closed) return -1;
    let base: number;
    if (whence === SEEK_SET) base = 0;
    else if (whence === SEEK_CUR) base = this.pos;
    else if (whence === SEEK_END) base = this.vfs.getBuffer(this.path)?.length ?? 0;
    else return -1;
    const next = base + offset;
    if (next < 0) return -1;
    this.pos = next;
    return 0;
  }

  /** 对应 ftell */
  tell(): number {
    return this.closed ? -1 : this.pos;
  }

  /** 对应 fclose */
  close(): void {
    this.closed = true;
  }
}
