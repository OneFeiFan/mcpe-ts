// 1:1 移植自 src/nbt/ByteArrayTag.h
import { Tag, TAG_Byte_Array } from './Tag';
import type { IDataInput, IDataOutput } from '@mcpe/util';

export class ByteArrayTag extends Tag {
  public data: Uint8Array;

  constructor(name: string, data: Uint8Array = new Uint8Array(0)) {
    super(name);
    this.data = data;
  }

  getId(): number {
    return TAG_Byte_Array;
  }

  write(dos: IDataOutput): void {
    dos.writeInt(this.data.length);
    dos.writeBytes(this.data);
  }

  load(dis: IDataInput): void {
    const length = dis.readInt();
    if (length < 0) {
      // C++ 里是 UB（new char[负数]），TS 里抛错
      // 这是不可避免的行为差异，测试不要覆盖负长度输入
      throw new Error(`ByteArrayTag.load: negative length ${length}`);
    }
    // 复刻 C++ 原代码的 bug（与 copy() 同一处）：load 读入了 length 个字节，却从不设置 data.len，
    //   len 保持原值（新建的标签是 0），所以读回后再写出时长度为 0、没有数据。黄金样本 G11-3 的 reread 正是如此。
    //   原值大于 length 时 C++ 会越界读（UB），这里截到 length。
    const bytes = dis.readBytes(length);
    this.data = bytes.subarray(0, Math.min(this.data.length, length));
  }

  toString(): string {
    return `[${this.data.length} bytes]`;
  }

  override equals(rhs: Tag): boolean {
    if (!super.equals(rhs)) return false;

    const o = rhs as ByteArrayTag;
    if (this.data.length !== o.data.length) return false;

    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] !== o.data[i]) return false;
    }
    return true;
  }

  copy(): Tag {
    // ====================================================================
    // 复刻 C++ 原代码的 bug：
    //   C++ 中 TagMemoryChunk 的默认构造函数把 len 设为 0，
    //   copy() 只设置 chunk.data，从不设置 chunk.len，
    //   所以 copy() 返回的 ByteArrayTag 的 data.len 是 0，数据丢失。
    //
    // 如果 C++ 侧从未依赖此路径，或者你决定修正，改为：
    //   return new ByteArrayTag(this.getName(), this.data.slice());
    // ====================================================================
    return new ByteArrayTag(this.getName(), new Uint8Array(0));
  }
}
