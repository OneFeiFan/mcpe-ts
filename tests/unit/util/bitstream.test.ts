import { describe, expect, it } from 'vitest';
import { BitStream, LONG_BYTES } from '@mcpe/util';

const bytes = (u: Uint8Array): number[] => [...u];

describe('util/bitstream', () => {
  describe('写入的字节布局', () => {
    it('writeInt 是 4 字节**大端**（对应 C++ 的 Write(int)）', () => {
      // 是黄金样本 G14-2 发现这里该是大端的：模板 Write<T> 会先调 ReverseBytes 再交给 WriteBits。
      // 我最初只读了 WriteBits 那条路（原样 memcpy），漏了交换那一步。
      const bs = new BitStream();
      bs.writeInt(0x04030201);
      expect(bs.getNumberOfBytesUsed()).toBe(4);
      expect(bytes(bs.getData())).toEqual([0x04, 0x03, 0x02, 0x01]);
    });

    it('writeInt 写负数按补码', () => {
      const bs = new BitStream();
      bs.writeInt(-2);
      expect(bytes(bs.getData())).toEqual([0xff, 0xff, 0xff, 0xfe]);
    });

    it('writeLong 是 8 字节**大端**（x86-64 LP64 下 C++ 的 long）', () => {
      const bs = new BitStream();
      bs.writeLong(0x0001020304050607); // 见下条：要挑一个 JS number 存得下的值
      expect(bs.getNumberOfBytesUsed()).toBe(LONG_BYTES);
      expect(bytes(bs.getData())).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('超过 2^53 的值存不进 JS number —— 这是已知限制，不是静默出错', () => {
      // 0x0102030405060708 = 72623859790382856 > Number.MAX_SAFE_INTEGER(9007199254740992)，
      // 用 number 传进来时末尾几位就已经被舍入了，写出去的字节和"原始十六进制"对不上。
      // 存档里的种子和时间戳都远小于这个界限，所以用 number 承载；真需要更大范围时要改 bigint。
      const tooBig = 0x0102030405060708;
      const bs = new BitStream();
      bs.writeLong(tooBig);
      expect(bytes(bs.getData())).not.toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
      // 但存得下的值必须精确往返
      const fine = 0x0001020304050607;
      const bs2 = new BitStream();
      bs2.writeLong(fine);
      bs2.resetReadPointer();
      expect(bs2.readLong()).toBe(fine);
    });

    it('writeUint16 是 2 字节**大端**（RakString 的长度前缀，它也走 Write<T>）', () => {
      const bs = new BitStream();
      bs.writeUint16(0x0201);
      expect(bytes(bs.getData())).toEqual([0x02, 0x01]);
    });

    it('writeBytes 原样写入，不补任何东西', () => {
      const bs = new BitStream();
      bs.writeBytes(new Uint8Array([9, 8, 7, 6]), 3);
      expect(bs.getNumberOfBytesUsed()).toBe(3);
      expect(bytes(bs.getData())).toEqual([9, 8, 7]); // 只写前 3 个
    });
  });

  describe('RakString 的序列化格式', () => {
    it('长度前缀 2 字节（大端）+ 裸字节，不带结尾 0', () => {
      // 参考 RakString::Serialize（RakString.cpp:980-985）：先 bs->Write(l)（无符号短整型，
      // 走 Write<T> 因此是大端），再 WriteAlignedBytes（原样）。
      const bs = new BitStream();
      bs.writeString('ab');
      expect(bytes(bs.getData())).toEqual([0, 2, 0x61, 0x62]);
    });

    it('空串只有长度前缀', () => {
      const bs = new BitStream();
      bs.writeString('');
      expect(bytes(bs.getData())).toEqual([0, 0]);
    });

    it('非 ASCII 按字节算长度', () => {
      const bs = new BitStream();
      bs.writeString('世界'); // 每个汉字 3 字节
      expect(bytes(bs.getData())).toEqual([0, 6, 0xe4, 0xb8, 0x96, 0xe7, 0x95, 0x8c]);
    });

    it('读回来字符串一致（含非 ASCII）', () => {
      const bs = new BitStream();
      bs.writeString('demo 世界');
      bs.resetReadPointer();
      expect(bs.readString()).toBe('demo 世界');
    });
  });

  describe('读写往返', () => {
    it('按写入顺序读回，指针跟着走', () => {
      const bs = new BitStream();
      bs.writeInt(12345);
      bs.writeLong(9876543210);
      bs.writeString('hello');
      bs.writeBytes(new Uint8Array([1, 2, 3]), 3);

      bs.resetReadPointer();
      expect(bs.readInt()).toBe(12345);
      expect(bs.readLong()).toBe(9876543210);
      expect(bs.readString()).toBe('hello');
      expect(bytes(bs.readBytes(3))).toEqual([1, 2, 3]);
    });

    it('resetReadPointer 之后能重读一遍', () => {
      const bs = new BitStream();
      bs.writeInt(7);
      expect(bs.readInt()).toBe(7);
      bs.resetReadPointer();
      expect(bs.readInt()).toBe(7);
    });

    it('writeLong 的边界值', () => {
      for (const v of [0, 1, -1, 2147483647, -2147483648, 9007199254740991]) {
        const bs = new BitStream();
        bs.writeLong(v);
        bs.resetReadPointer();
        expect(bs.readLong()).toBe(v);
      }
    });
  });

  describe('构造函数与缓冲区归属', () => {
    it('无参构造是空的、可增长', () => {
      const bs = new BitStream();
      expect(bs.getNumberOfBytesUsed()).toBe(0);
      bs.writeInt(1);
      expect(bs.getNumberOfBytesUsed()).toBe(4);
    });

    it('copyData=false 是借用外部缓冲区：写进去的就是调用方那块内存', () => {
      // RegionFile 读区块、RakString 反序列化都靠这个模式
      const raw = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const bs = new BitStream(raw, 8, false);
      expect(bs.getNumberOfBytesUsed()).toBe(8); // 借用时长度就是传入的长度
      expect(bs.getData().buffer).toBe(raw.buffer); // 同一块内存，没拷贝
      bs.resetReadPointer();
      expect(bs.readInt()).toBe(0x01020304); // 大端：字节 01 02 03 04 读出来是 0x01020304
      expect(bytes(bs.getData())).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(bs.getData().buffer).toBe(raw.buffer); // 同一块内存，不是副本
    });

    it('copyData=true 是拷贝：改它不影响原数组', () => {
      const raw = new Uint8Array([1, 2, 3, 4]);
      const bs = new BitStream(raw, 4, true);
      bs.resetReadPointer();
      expect(bs.readInt()).toBe(0x01020304); // 大端：字节 01 02 03 04 读出来是 0x01020304
      expect(bs.getData().buffer).not.toBe(raw.buffer);
    });

    it('lengthInBytes 小于实际长度时只取前一段', () => {
      const raw = new Uint8Array([1, 2, 3, 4, 5, 6]);
      const bs = new BitStream(raw, 4, false);
      expect(bs.getNumberOfBytesUsed()).toBe(4);
      expect(bytes(bs.getData())).toEqual([1, 2, 3, 4]);
    });
  });
});
