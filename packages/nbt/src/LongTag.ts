import { Tag, TAG_Long } from "./Tag";
import type { IDataInput, IDataOutput } from "@mcpe/util";

export class LongTag extends Tag {
  public data: bigint;

  constructor(name: string, data: bigint = 0n) {
    super(name);
    // 强制截断到 64 位有符号，与 C++ long long 一致
    this.data = BigInt.asIntN(64, data);
  }

  write(dos: IDataOutput): void {
    dos.writeLongLong(this.data);
  }

  load(dis: IDataInput): void {
    this.data = dis.readLongLong();
  }

  getId(): number {
    return TAG_Long;
  }

  toString(): string {
    return this.data.toString();
  }

  copy(): Tag {
    return new LongTag(this.getName(), this.data);
  }

  override equals(rhs: Tag): boolean {
    if (super.equals(rhs)) {
      return this.data === (rhs as LongTag).data;
    }
    return false;
  }
}