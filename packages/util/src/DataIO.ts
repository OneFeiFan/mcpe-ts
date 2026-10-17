// 1:1 移植自 src/util/DataIO.h 与 DataIO.cpp
// DataIO.ts

export interface IDataOutput {
  writeString(v: string): void;
  writeFloat(v: number): void;
  writeDouble(v: number): void;
  writeByte(v: number): void;
  writeShort(v: number): void;
  writeInt(v: number): void;
  writeLongLong(v: bigint): void;
  writeBytes(data: Uint8Array): void;
}

export interface IDataInput {
  readString(): string;
  readFloat(): number;
  readDouble(): number;
  readByte(): number;
  readShort(): number;
  readInt(): number;
  readLongLong(): bigint;
  readBytes(length: number): Uint8Array;
}

export abstract class BytesDataOutput implements IDataOutput {
  writeString(v: string): void {
    // C++ 的 std::string 存原始字节；游戏里的字符串在 TS 里是 JS 字符串，按 UTF-8 编码成字节（ASCII 与 C++ 逐字节相同）
    const bytes = new TextEncoder().encode(v);
    const length = bytes.length & 0x7fff;
    this.writeShort(length);
    this.writeBytes(bytes.subarray(0, length));
  }

  writeFloat(v: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, v, true); // 小端
    this.writeBytes(new Uint8Array(buf));
  }

  writeDouble(v: number): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, v, true);
    this.writeBytes(new Uint8Array(buf));
  }

  writeByte(v: number): void {
    this.writeBytes(new Uint8Array([v & 0xff]));
  }

  writeShort(v: number): void {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, v, true); // 小端，有符号
    this.writeBytes(new Uint8Array(buf));
  }

  writeInt(v: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, v, true);
    this.writeBytes(new Uint8Array(buf));
  }

  writeLongLong(v: bigint): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigInt64(0, v, true);
    this.writeBytes(new Uint8Array(buf));
  }

  abstract writeBytes(data: Uint8Array): void;
}

export abstract class BytesDataInput implements IDataInput {
  private static readonly MAX_STRING_LENGTH = 32767;

  readString(): string {
    let len = this.readShort();

    // 复刻 C++ 的截断逻辑
    if (len > BytesDataInput.MAX_STRING_LENGTH - 1) {
      len = BytesDataInput.MAX_STRING_LENGTH - 1;
    }
    if (len < 0) {
      // ADAPTED(Safety)：C++ 此处 new char[len + 1] 的长度为负，行为未定义；TS 直接抛错
      throw new Error(`Negative string length: ${len}`);
    }

    const bytes = this.readBytes(len);

    // 复刻 std::string out(buffer) 在第一个 \0 截断的行为
    let end = bytes.indexOf(0);
    if (end === -1) end = bytes.length;

    // UTF-8 解码：ASCII 与 C++ 相同；非法的多字节序列会被换成 U+FFFD（C++ 保留原始字节），只在存档被截断或损坏时出现
    return new TextDecoder().decode(bytes.subarray(0, end));
  }

  readFloat(): number {
    const bytes = this.readBytes(4);
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
  }

  readDouble(): number {
    const bytes = this.readBytes(8);
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(0, true);
  }

  /** C++ 返回 char（x86 上有符号）：-128..127（审核：以前返回 0..255；NBT 的调用方自己 & 0xff，不受影响） */
  readByte(): number {
    const bytes = this.readBytes(1);
    return (bytes[0]! << 24) >> 24;
  }

  readShort(): number {
    const bytes = this.readBytes(2);
    return new DataView(bytes.buffer, bytes.byteOffset, 2).getInt16(0, true);
  }

  readInt(): number {
    const bytes = this.readBytes(4);
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getInt32(0, true);
  }

  readLongLong(): bigint {
    const bytes = this.readBytes(8);
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigInt64(0, true);
  }

  abstract readBytes(length: number): Uint8Array;
}

// ---- 内存实现示例 ----

export class MemoryDataOutput extends BytesDataOutput {
  private chunks: Uint8Array[] = [];
  private totalLength = 0;

  writeBytes(data: Uint8Array): void {
    // 拷贝一份，避免外部修改
    this.chunks.push(data.slice());
    this.totalLength += data.length;
  }

  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

export class MemoryDataInput extends BytesDataInput {
  private data: Uint8Array;
  private offset = 0;

  constructor(data: Uint8Array) {
    super();
    this.data = data;
  }

  readBytes(length: number): Uint8Array {
    if (length < 0) throw new Error(`Negative read length: ${length}`);
    if (this.offset + length > this.data.length) {
      throw new Error(`Not enough bytes: need ${length}, left ${this.data.length - this.offset}`);
    }
    const slice = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  getOffset(): number {
    return this.offset;
  }
}

// ---- 其他辅助 ----

export class PrintStream {
  print(s: string): void {
    // 默认空实现；需要时改为 console.log 或写入缓冲区
  }
  println(s: string): void {
    this.print(s);
    this.print('\n');
  }
}

export class FileError {
  static readonly NOT_OPENED = 1;
  static readonly NOT_FULLY_HANDLED = 2;
}
