/**
 * RakNet::BitStream 的最小子集（ADAPTED(Network)，S-B2）。只实现存档代码实际用到的那几个重载，
 * 不是把 RakNet 的位流搬过来（它还有压缩、增量、向量编码等一大批用不上的东西）。
 *
 * 【字节序：小端、字节对齐】从参考源码确认，不是猜的：
 * RakNet 的 BitStream::WriteBits 在「当前字节对齐 且 要写的是 8 的整数倍位」时直接走
 * `memcpy(data + numberOfBitsUsed / 8, inByteArray, numberOfBitsToWrite / 8)`
 * （src/raknet/BitStream.cpp:424-428），也就是**把变量在内存里的样子原样拷进去**。
 * 而所有调用点（整数、字节数组、RakString 的裸字节）都满足这个条件，所以落盘格式就是
 * 宿主内存序 —— 在本项目生成黄金样本的 x86-64 Linux 上是**小端**。
 *
 * 【宽度必须显式指定】C++ 靠 `sizeof(T)` 决定写几个字节，TS 没有这个信息，所以这里拆成
 * writeInt / writeLong / writeUint16 几个方法，由移植时逐个字段判断（对应 C++ 的字段类型）：
 *   - `int`（xSpawn/ySpawn/zSpawn/lastPlayed 等）→ 4 字节
 *   - `long`（seed/time/sizeOnDisk）→ **8 字节**。注意：x86-64 Linux 是 LP64，`long` 为 8 字节；
 *     MCPE 原始目标（ARM 32 位）上 `long` 是 4 字节。本项目以 WSL x86-64 跑出的黄金样本为准，
 *     所以取 8。B4 的 G14-2（level.dat 字节）会最终判定这一点。
 *   - `unsigned short`（RakString 的长度前缀）→ 2 字节
 *
 * 【只支持字节对齐】RakNet 的位流能写到任意位边界，存档代码没有这种用法。真出现了再扩展，
 * 不要假装支持。
 *
 * 【数值精度】long 用 JS 的 number 承载（内部经 BigInt 转换）。超过 2^53 的值会丢精度，
 * 存档里的种子和时间戳都远小于这个界限。真需要更大范围时改用 bigint，不要静默截断。
 */
import { LOGW } from '@mcpe/platform';

/** C++ 的 long 在 x86-64 Linux 上的宽度；换平台要重新确认 */
export const LONG_BYTES = 8;

export class BitStream {
  private data: Uint8Array;
  /** 写指针（字节）。RakNet 里是位数，这里只支持字节对齐 */
  private writeOffset = 0;
  /** 读指针（字节） */
  private readOffset = 0;
  /** 是否拥有这块内存；构造时 copyData=false 表示只是借用外部缓冲区，不负责扩容 */
  private readonly ownsData: boolean;

  constructor();
  constructor(data: Uint8Array, lengthInBytes: number, copyData: boolean);
  constructor(data?: Uint8Array, lengthInBytes?: number, copyData?: boolean) {
    if (data === undefined) {
      this.data = new Uint8Array(0);
      this.ownsData = true;
    } else {
      const len = lengthInBytes ?? data.length;
      // copyData=false 对应 C++ 的「借用这块内存」：RakString 反序列化、RegionFile 读区块都用它
      this.data = copyData === true ? data.slice(0, len) : data.subarray(0, len);
      this.ownsData = copyData === true;
      this.writeOffset = len;
    }
  }

  // ---- 查询 ----

  /** 已写入的字节数（不是容量） */
  getNumberOfBytesUsed(): number {
    return this.writeOffset;
  }

  /**
   * 已写入的字节。借用模式下就是外部那块内存的前一段。
   *
   * 注意这里返回的是**恰好 getNumberOfBytesUsed() 那么长**的视图，而不是内部缓冲区本身 ——
   * 内部缓冲区为了增长会多留容量（可能全是 0），C++ 那边 GetData() 返回的是缓冲区指针、
   * 长度靠 GetNumberOfBytesUsed() 另给，调用方从不读超出的部分（RegionFile::write 就是
   * `fwrite(GetData(), 1, GetNumberOfBytesUsed(), file)`）。返回精确长度能让调用方少踩坑。
   */
  getData(): Uint8Array {
    return this.data.subarray(0, this.writeOffset);
  }

  getReadOffset(): number {
    return this.readOffset;
  }

  resetReadPointer(): void {
    this.readOffset = 0;
  }

  // ---- 写 ----

  /** 对应 C++ 的 `Write(int)`；4 字节小端 */
  writeInt(value: number): void {
    this.ensure(this.writeOffset + 4);
    new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength).setInt32(
      this.writeOffset,
      value | 0,
      true,
    );
    this.writeOffset += 4;
  }

  /** 对应 C++ 的 `Write(long)`；8 字节小端（见文件头关于宽度的说明） */
  writeLong(value: number): void {
    this.ensure(this.writeOffset + LONG_BYTES);
    new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength).setBigInt64(
      this.writeOffset,
      BigInt(Math.trunc(value)),
      true,
    );
    this.writeOffset += LONG_BYTES;
  }

  /** RakString::Serialize 内部用；存档代码不直接调 */
  writeUint16(value: number): void {
    this.ensure(this.writeOffset + 2);
    new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength).setUint16(
      this.writeOffset,
      value & 0xffff,
      true,
    );
    this.writeOffset += 2;
  }

  /** 对应 C++ 的 `Write(const char* inputByteArray, unsigned int numberOfBytes)` */
  writeBytes(bytes: Uint8Array, numberOfBytes: number): void {
    this.ensure(this.writeOffset + numberOfBytes);
    this.data.set(bytes.subarray(0, numberOfBytes), this.writeOffset);
    this.writeOffset += numberOfBytes;
  }

  /**
   * 对应 C++ 的 `Write(const RakString&)`，即 RakString::Serialize
   * （src/raknet/RakString.cpp:980-985）：先写 `unsigned short` 的长度，再写裸字节，**不带结尾 0**。
   */
  writeString(value: string): void {
    const bytes = utf8Bytes(value);
    this.writeUint16(bytes.length); // 与 C++ 一致：长度按字节算，不是字符数
    this.writeBytes(bytes, bytes.length);
  }

  // ---- 读 ----

  readInt(): number {
    this.need(4);
    const v = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength).getInt32(
      this.readOffset,
      true,
    );
    this.readOffset += 4;
    return v;
  }

  readLong(): number {
    this.need(LONG_BYTES);
    const v = new DataView(
      this.data.buffer,
      this.data.byteOffset,
      this.data.byteLength,
    ).getBigInt64(this.readOffset, true);
    this.readOffset += LONG_BYTES;
    return Number(v);
  }

  readUint16(): number {
    this.need(2);
    const v = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength).getUint16(
      this.readOffset,
      true,
    );
    this.readOffset += 2;
    return v;
  }

  /** 读走 numberOfBytes 个字节（拷贝一份返回，调用方拿到的不再随读指针变化） */
  readBytes(numberOfBytes: number): Uint8Array {
    this.need(numberOfBytes);
    const out = this.data.slice(this.readOffset, this.readOffset + numberOfBytes);
    this.readOffset += numberOfBytes;
    return out;
  }

  /** 对应 C++ 的 `Read(RakString&)`，即 RakString::Deserialize：先读 unsigned short 长度，再读字节 */
  readString(): string {
    const len = this.readUint16();
    return utf8Decode(this.readBytes(len));
  }

  // ---- 内部 ----

  /** 借用外部缓冲区（copyData=false）时不能扩容：C++ 那边同样会越界写，是 UB，这里报出来 */
  private ensure(needed: number): void {
    if (needed <= this.data.length) return;
    if (!this.ownsData) {
      LOGW(`BitStream: 借用的缓冲区不够（需要 ${needed} 字节，只有 ${this.data.length}）`);
      return;
    }
    // 倍增，避免逐字节写入变成 O(n²)
    let cap = Math.max(this.data.length * 2, 64);
    while (cap < needed) cap *= 2;
    const grown = new Uint8Array(cap);
    grown.set(this.data);
    this.data = grown;
  }

  /** 读越界时不像 C++ 那样读脏内存（UB 不复刻，见 PITFALLS 第 20 条），补 0 并留警告 */
  private need(n: number): void {
    if (this.readOffset + n <= this.data.length) return;
    LOGW(`BitStream: 读越界（要 ${n} 字节，只剩 ${this.data.length - this.readOffset}）`);
    const grown = new Uint8Array(this.readOffset + n);
    grown.set(this.data);
    this.data = grown; // 新补的部分是 0
  }
}

/**
 * UTF-8 编码。不用 TextEncoder：它会产生 BOM 相关差异、且在跨环境上行为不完全一致；
 * 这里手写，保证「一个字符几个字节」可预期，与 C++ 按字节算长度对得上。
 * 存档里的世界名基本都是 ASCII，多字节路径走这里也能正确处理。
 */
function utf8Bytes(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000)
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if ((b & 0xe0) === 0xc0) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1]! & 0x3f);
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f);
      i += 3;
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1]! & 0x3f) << 12) |
        ((bytes[i + 2]! & 0x3f) << 6) |
        (bytes[i + 3]! & 0x3f);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}
