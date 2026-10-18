// 1:1 移植自 src/nbt/DoubleTag.h
import type { IDataInput, IDataOutput } from '@mcpe/util';
import { formatG } from '@mcpe/util';
import { Tag, TAG_Double } from './Tag';

export class DoubleTag extends Tag {
  public data: number;

  constructor(name: string, data: number = 0.0) {
    super(name);
    this.data = data;
  }

  write(dos: IDataOutput): void {
    dos.writeDouble(this.data);
  }

  load(dis: IDataInput): void {
    this.data = dis.readDouble();
  }

  getId(): number {
    return TAG_Double;
  }

  toString(): string {
    // C++：ss << data（默认 6 位有效数字，%g）
    return formatG(this.data);
  }

  copy(): Tag {
    return new DoubleTag(this.getName(), this.data);
  }

  override equals(rhs: Tag): boolean {
    if (super.equals(rhs)) {
      // 使用 === 而不是 Object.is，以匹配 C++ 的 == 语义
      return this.data === (rhs as DoubleTag).data;
    }
    return false;
  }
}
