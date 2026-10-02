import type { IDataInput, IDataOutput } from "@mcpe/util";
import { Tag, TAG_Byte } from "./Tag";


export class ByteTag extends Tag {
  public data: number;

  constructor(name: string, data: number = 0) {
    super(name);
    // 统一按有符号 8 位存储
    this.data = (data << 24) >> 24;
  }

  write(dos: IDataOutput): void {
    // 只写低 8 位，保证字节流一致
    dos.writeByte(this.data & 0xff);
  }

  load(dis: IDataInput): void {
    // readByte 返回 0..255，这里转成有符号 -128..127
    const b = dis.readByte() & 0xff;
    this.data = (b << 24) >> 24;
  }

  getId(): number {
    return TAG_Byte;
  }

  toString(): string {
    // C++ 原实现有 bug，这里按合理语义返回十进制字符串
    // 如果必须用于调试，也可以返回 `ByteTag(${this.getName()}): ${this.data}`
    return String(this.data);
  }

  override equals(rhs: Tag): boolean {
    if (super.equals(rhs)) {
      return this.data === (rhs as ByteTag).data;
    }
    return false;
  }

  copy(): Tag {
    return new ByteTag(this.getName(), this.data);
  }
}