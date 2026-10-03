/**
 * 1:1 移植自 src/util/RakDataIO.h。
 *
 * 作用：把 RakNet 的 BitStream 包成 NBT 要的 IDataInput / IDataOutput。
 * 存档的 level.dat 走的就是这条路 —— `RakDataOutput buf(data); NbtIo::write(tag, &buf);`
 * 把 NBT 写进 BitStream，再原样落到文件里。
 *
 * 为什么这么薄：两个类各自只实现基类的一个抽象方法，其余（writeInt/writeString/readShort…）
 * 全在 BytesDataOutput / BytesDataInput 里，由它们拼好字节再调 writeBytes / readBytes。
 * 所以这里只负责把「一串字节」倒进 / 取自 BitStream，不做任何数值转换。
 *
 * 与 C++ 的差别：
 *  - C++ 的 `readBytes(void* data, int bytes)` 是写进调用方缓冲区；TS 的基类约定是**返回**一个
 *    Uint8Array（见 DataIO.ts 的 IDataInput），这里跟随 TS 的约定。
 *  - C++ 的 `WriteBits(data, bytes * 8)` / `ReadBits(data, bytes * 8)` 都落在字节边界上，
 *    走的是 BitStream 里 memcpy 那条快路径，等价于「原样写 n 字节」。所以这里直接用
 *    BitStream 的 writeBytes / readBytes，不去动位运算（那个 BitStream 子集本来也只支持字节对齐）。
 */
import { BitStream } from './BitStream.js';
import { BytesDataInput, BytesDataOutput } from './DataIO.js';

export class RakDataOutput extends BytesDataOutput {
  constructor(private readonly bitStream: BitStream) {
    super();
  }

  override writeBytes(data: Uint8Array): void {
    this.bitStream.writeBytes(data, data.length);
  }

  /** 对应 C++ 的 `RakNet::BitStream& getBitStream()` */
  getBitStream(): BitStream {
    return this.bitStream;
  }
}

export class RakDataInput extends BytesDataInput {
  constructor(private readonly bitStream: BitStream) {
    super();
  }

  override readBytes(length: number): Uint8Array {
    return this.bitStream.readBytes(length);
  }

  /** 对应 C++ 的 `RakNet::BitStream& getBitStream()` */
  getBitStream(): BitStream {
    return this.bitStream;
  }
}
