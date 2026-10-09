// 1:1 移植自 src/nbt/FloatTag.h
import { Tag, TAG_Float } from './Tag';
import type { IDataInput, IDataOutput } from '@mcpe/util';


const f = Math.fround;
export class FloatTag extends Tag {
  public data: number;

  constructor(name: string, data: number = 0.0) {
    super(name);
    this.data = f(data);
  }

  write(dos: IDataOutput): void {
    dos.writeFloat(this.data);
  }

  load(dis: IDataInput): void {
    this.data = f(dis.readFloat());
  }

  getId(): number {
    return TAG_Float;
  }

  toString(): string {
    // 与 DoubleTag 相同，若仅用于调试，用 String(this.data) 即可
    return String(this.data);
  }

  copy(): Tag {
    return new FloatTag(this.getName(), this.data);
  }

  override equals(rhs: Tag): boolean {
    if (super.equals(rhs)) {
      return this.data === (rhs as FloatTag).data;
    }
    return false;
  }
}
