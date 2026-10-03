import { Tag, TAG_String } from './Tag';
import type { IDataInput, IDataOutput } from '@mcpe/util';

export class StringTag extends Tag {
  public data: string;
  public len: number;

  constructor(name: string, data: string = '') {
    super(name);
    this.data = data;
    // 复刻 C++ 怪异行为：len 用 name.length，不是 data.length
    this.len = name.length;
  }

  write(dos: IDataOutput): void {
    dos.writeString(this.data);
  }

  load(dis: IDataInput): void {
    this.data = dis.readString();
    // C++ 原代码不更新 len，TS 也不更新
  }

  getId(): number {
    return TAG_String;
  }

  toString(): string {
    return this.data;
  }

  copy(): Tag {
    return new StringTag(this.getName(), this.data);
  }

  override equals(rhs: Tag): boolean {
    if (super.equals(rhs)) {
      return this.data === (rhs as StringTag).data;
    }
    return false;
  }
}
