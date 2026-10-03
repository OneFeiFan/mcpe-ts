import { Tag, TAG_Short } from './Tag';
import type { IDataInput, IDataOutput } from '@mcpe/util';

export class ShortTag extends Tag {
  public data: number;

  constructor(name: string, data: number = 0) {
    super(name);
    // 强制 16 位有符号语义，与 C++ short 一致
    this.data = (data << 16) >> 16;
  }

  write(dos: IDataOutput): void {
    dos.writeShort(this.data);
  }

  load(dis: IDataInput): void {
    this.data = dis.readShort();
  }

  getId(): number {
    return TAG_Short;
  }

  toString(): string {
    return String(this.data);
  }

  copy(): Tag {
    return new ShortTag(this.getName(), this.data);
  }

  override equals(rhs: Tag): boolean {
    if (super.equals(rhs)) {
      return this.data === (rhs as ShortTag).data;
    }
    return false;
  }
}
