import { describe, expect, it } from 'vitest';
import { BitStream, MemoryDataOutput, RakDataInput, RakDataOutput } from '@mcpe/util';

const bytes = (u: Uint8Array): number[] => [...u];

/** 走一遍各种类型，用来比较「两种 IDataOutput 实现」写出的字节 */
function writeEverything(out: MemoryDataOutput | RakDataOutput): void {
  out.writeByte(0x7f);
  out.writeShort(-1234);
  out.writeInt(0x04030201);
  out.writeLongLong(1234567890123n);
  out.writeFloat(0.5);
  out.writeDouble(-2.25);
  out.writeString('world');
  out.writeBytes(new Uint8Array([1, 2, 3]));
}

describe('util/rakdataio', () => {
  it('RakDataOutput 写出的字节与 MemoryDataOutput 完全一致', () => {
    // 两个类共用 BytesDataOutput 里的实现，只各自提供了 writeBytes 的落点。
    // MemoryDataOutput 的字节已经由 nbt.json 黄金样本间接验证过，
    // 所以「两者一致」就是把 RakDataOutput 也钉在同一个基准上。
    const memory = new MemoryDataOutput();
    writeEverything(memory);

    const bs = new BitStream();
    const rak = new RakDataOutput(bs);
    writeEverything(rak);

    expect(bytes(bs.getData())).toEqual(bytes(memory.toUint8Array()));
  });

  it('写进 BitStream 之后 getNumberOfBytesUsed 与实际长度一致', () => {
    const bs = new BitStream();
    const out = new RakDataOutput(bs);
    out.writeInt(1);
    out.writeString('ab');
    // 4 + (2 字节长度 + 2 字节内容)
    expect(bs.getNumberOfBytesUsed()).toBe(8);
    expect(bs.getData().length).toBe(8);
  });

  it('RakDataOutput → RakDataInput 往返：值一致', () => {
    const bs = new BitStream();
    writeEverything(new RakDataOutput(bs));

    const inp = new RakDataInput(bs);
    expect(inp.readByte()).toBe(0x7f);
    expect(inp.readShort()).toBe(-1234);
    expect(inp.readInt()).toBe(0x04030201);
    expect(inp.readLongLong()).toBe(1234567890123n);
    expect(inp.readFloat()).toBe(0.5);
    expect(inp.readDouble()).toBe(-2.25);
    expect(inp.readString()).toBe('world');
    expect(bytes(inp.readBytes(3))).toEqual([1, 2, 3]);
  });

  it('readBytes 读走之后读指针前进，不会重复读同一段', () => {
    const bs = new BitStream();
    const out = new RakDataOutput(bs);
    out.writeBytes(new Uint8Array([10, 20]));
    out.writeBytes(new Uint8Array([30, 40]));

    const inp = new RakDataInput(bs);
    expect(bytes(inp.readBytes(2))).toEqual([10, 20]);
    expect(bytes(inp.readBytes(2))).toEqual([30, 40]);
  });

  it('getBitStream 返回的就是构造时那个实例（对应 C++ 的同名方法）', () => {
    const bs = new BitStream();
    expect(new RakDataOutput(bs).getBitStream()).toBe(bs);
    expect(new RakDataInput(bs).getBitStream()).toBe(bs);
  });

  it('可以直接读写一个借来的 BitStream（存档读取就是这条路径）', () => {
    // C++：RakNet::BitStream bitStream(data, size, false); RakDataInput stream(bitStream);
    const raw = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const bs = new BitStream(raw, raw.length, false);
    expect(new RakDataInput(bs).readInt()).toBe(0x04030201);
  });
});
