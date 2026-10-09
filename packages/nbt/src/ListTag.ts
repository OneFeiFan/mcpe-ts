// 1:1 移植自 src/nbt/ListTag.h
import { Tag, TAG_List, TAG_Byte, TAG_Float, TAGERR_OUT_OF_BOUNDS, TAGERR_BAD_TYPE } from './Tag';
import { FloatTag } from './FloatTag';
import type { IDataInput, IDataOutput, PrintStream } from '@mcpe/util';

export class ListTag extends Tag {
  private list: Tag[] = [];
  private type: number = TAG_Byte;

  constructor(name: string = '') {
    super(name);
  }

  write(dos: IDataOutput): void {
    if (this.list.length > 0) {
      this.type = this.list[0]!.getId();
    } else {
      this.type = TAG_Byte;
    }

    dos.writeByte(this.type);
    dos.writeInt(this.list.length);

    for (const t of this.list) {
      t.write(dos);
    }
  }

  load(dis: IDataInput): void {
    this.type = dis.readByte() & 0xff;
    const size = dis.readInt();

    this.list.length = 0;
    for (let i = 0; i < size; i++) {
      const tag = Tag.newTag(this.type, Tag.NullString);
      if (!tag) {
        // C++ 原代码会直接 tag->load 崩掉；
        // TS 里必须做安全处理，否则同样会崩，但这不是“兼容”，是明确的缺陷路径
        this.errorState |= TAGERR_BAD_TYPE;
        throw new Error(`ListTag.load: unknown tag type ${this.type}`);
      }
      tag.load(dis);
      this.list.push(tag);
    }
  }

  getId(): number {
    return TAG_List;
  }

  toString(): string {
    return `${this.list.length} entries of type ${Tag.getTagName(this.type)}`;
  }

  override print(out: PrintStream): void;
  override print(prefix: string, out: PrintStream): void;
  override print(prefixOrOut: string | PrintStream, maybeOut?: PrintStream): void {
    if (typeof prefixOrOut !== 'string') {
      super.print(prefixOrOut);
      return;
    }

    const prefix = prefixOrOut;
    const out = maybeOut!;
    super.print(prefix, out);

    out.print(prefix);
    out.println('{');
    const inner = prefix + '   ';
    for (const t of this.list) {
      t.print(inner, out);
    }
    out.print(prefix);
    out.println('}');
  }

  add(tag: Tag): void {
    this.type = tag.getId();
    this.list.push(tag);
  }

  get(index: number): Tag | null {
    // 只检查上界，与 C++ 一致；负索引 TS 返回 undefined，这里显式返回 null 并设错误位
    if (index >= this.list.length || index < 0) {
      this.errorState |= TAGERR_OUT_OF_BOUNDS;
      return null;
    }
    return this.list[index] || null;
  }

  getFloat(index: number): number {
    const tag = this.get(index);
    if (!tag) return 0;
    if (tag.getId() !== TAG_Float) {
      this.errorState |= TAGERR_BAD_TYPE;
      return 0;
    }
    return (tag as FloatTag).data;
  }

  size(): number {
    return this.list.length;
  }

  copy(): Tag {
    const res = new ListTag(this.getName());
    // 注意：C++ 里可以直接访问私有成员，TS 里用同类型访问
    res.type = this.type;
    for (const t of this.list) {
      res.list.push(t.copy());
    }
    return res;
  }

  override equals(rhs: Tag): boolean {
    if (!super.equals(rhs)) return false;

    const o = rhs as ListTag;
    if (this.type !== o.type) return false;
    if (this.list.length !== o.list.length) return false;

    // 警告：这是 C++ 原代码的 bug，逻辑是反的：
    //   if (element.equals(other)) return false;
    // 也就是说，只要发现一个元素“相等”，整体就判为“不相等”。
    // 第一档要求逐位一致，所以这里刻意复刻。
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i]!.equals(o.list[i]!)) {
        return false;
      }
    }
    return true;
  }

  override deleteChildren(): void {
    // TS 里交给 GC，这里只是语义占位
    for (const t of this.list) {
      t.deleteChildren();
    }
    this.list.length = 0;
  }
}

export class ListTagFloatAdder {
  public tag: ListTag | null = null;

  constructor(arg?: number | ListTag) {
    if (typeof arg === 'number') {
      this.call(arg);
    } else if (arg instanceof ListTag) {
      this.tag = arg;
    }
  }

  call(nameOrValue: string | number, maybeValue?: number): this {
    if (typeof nameOrValue === 'string') {
      this.callInternal(nameOrValue, maybeValue!);
    } else {
      this.callInternal('', nameOrValue);
    }
    return this;
  }

  private callInternal(name: string, value: number): void {
    if (!this.tag) this.tag = new ListTag();
    this.tag.add(new FloatTag(name, value));
  }
}
