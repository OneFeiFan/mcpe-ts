import { Tag, TAG_Int } from './Tag';
import type { IDataInput, IDataOutput } from '@mcpe/util';

export class IntTag extends Tag {
  public data: number;

  constructor(name: string, data: number = 0) {
    super(name);
    // 强制 32 位有符号语义，与 C++ int 一致
    this.data = data | 0;
  }

  write(dos: IDataOutput): void {
    dos.writeInt(this.data);
  }

  load(dis: IDataInput): void {
    this.data = dis.readInt();
  }

  getId(): number {
    return TAG_Int;
  }

  toString(): string {
    return String(this.data);
  }

  copy(): Tag {
    return new IntTag(this.getName(), this.data);
  }

  override equals(rhs: Tag): boolean {
    if (super.equals(rhs)) {
      return this.data === (rhs as IntTag).data;
    }
    return false;
  }
}
