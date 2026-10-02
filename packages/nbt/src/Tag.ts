// import
import type { IDataInput, IDataOutput, PrintStream } from "@mcpe/util";
// ADAPTED(ESM)：C++ 的 Tag.cpp 直接 #include 全部子类，newTag 里逐个 new。ES 模块里基类若 import 子类、子类又 extends 基类，
// 加载时会触发“Class extends value undefined”。所以子类构造器由 TagInclude.ts 注入（与 TileInclude、MaterialInclude 同一做法），
// 包入口 index.ts 第一行就导入 TagInclude，使用者无需额外初始化。
export interface TagClasses {
  EndTag: new () => Tag;
  ByteTag: new (name: string) => Tag;
  ShortTag: new (name: string) => Tag;
  IntTag: new (name: string) => Tag;
  LongTag: new (name: string) => Tag;
  FloatTag: new (name: string) => Tag;
  DoubleTag: new (name: string) => Tag;
  ByteArrayTag: new (name: string) => Tag;
  StringTag: new (name: string) => Tag;
  ListTag: new (name: string) => Tag;
  CompoundTag: new (name: string) => Tag;
}
let C: TagClasses | null = null;
/** TagInclude.ts 调用；其他代码不要调用 */
export function registerTagClasses(classes: TagClasses): void {
  C = classes;
}
function classes(): TagClasses {
  if (!C) throw new Error("NBT 标签类尚未注册：请经包入口 @mcpe/nbt 导入（index.ts 会先加载 TagInclude）");
  return C;
}

export const TAG_End        = 0;
export const TAG_Byte       = 1;
export const TAG_Short      = 2;
export const TAG_Int        = 3;
export const TAG_Long       = 4;
export const TAG_Float      = 5;
export const TAG_Double     = 6;
export const TAG_Byte_Array = 7;
export const TAG_String     = 8;
export const TAG_List       = 9;
export const TAG_Compound   = 10;

export const TAGERR_OUT_OF_BOUNDS = 1;
export const TAGERR_BAD_TYPE      = 2;

export abstract class Tag {
  /** C++: virtual void deleteChildren() {}（只有 CompoundTag、ListTag 重写） */
  deleteChildren(): void {}
  static readonly NullString = "";

  static readonly TAG_End        = TAG_End;
  static readonly TAG_Byte       = TAG_Byte;
  static readonly TAG_Short      = TAG_Short;
  static readonly TAG_Int        = TAG_Int;
  static readonly TAG_Long       = TAG_Long;
  static readonly TAG_Float      = TAG_Float;
  static readonly TAG_Double     = TAG_Double;
  static readonly TAG_Byte_Array = TAG_Byte_Array;
  static readonly TAG_String     = TAG_String;
  static readonly TAG_List       = TAG_List;
  static readonly TAG_Compound   = TAG_Compound;

  static readonly TAGERR_OUT_OF_BOUNDS = TAGERR_OUT_OF_BOUNDS;
  static readonly TAGERR_BAD_TYPE      = TAGERR_BAD_TYPE;

  errorState = 0;

  protected name: string;

  protected constructor(name: string) {
    this.name = name;
  }

  abstract write(dos: IDataOutput): void;
  abstract load(dis: IDataInput): void;
  abstract toString(): string;
  abstract getId(): number;
  abstract copy(): Tag;

  equals(rhs: Tag): boolean {
    return this.getId() === rhs.getId() && this.name === rhs.name;
  }

  print(out: PrintStream): void;
  print(prefix: string, out: PrintStream): void;
  print(prefixOrOut: string | PrintStream, maybeOut?: PrintStream): void {
    if (typeof prefixOrOut === "string") {
      const prefix = prefixOrOut;
      const out = maybeOut!;
      const name = this.getName();
      out.print(prefix);
      out.print(Tag.getTagName(this.getId()));
      if (name.length > 0) {
        out.print(`("${name}")`);
      }
      out.print(": ");
      out.println(this.toString());
    } else {
      this.print("", prefixOrOut);
    }
  }

  setName(name: string): Tag {
    this.name = name;
    return this;
  }

  getName(): string {
    return this.name;
  }

  static readNamedTag(dis: IDataInput): Tag | null {
    const type = dis.readByte() & 0xff;
    if (type === TAG_End) return new (classes().EndTag)();

    const tag = Tag.newTag(type, dis.readString());
    if (!tag) return null;

    tag.load(dis);
    return tag;
  }

  static writeNamedTag(tag: Tag, dos: IDataOutput): void {
    dos.writeByte(tag.getId());
    if (tag.getId() === TAG_End) return;

    dos.writeString(tag.getName());
    tag.write(dos);
  }

  static newTag(type: number, name: string): Tag | null {
    switch (type) {
      case TAG_End:        return new (classes().EndTag)();
      case TAG_Byte:       return new (classes().ByteTag)(name);
      case TAG_Short:      return new (classes().ShortTag)(name);
      case TAG_Int:        return new (classes().IntTag)(name);
      case TAG_Long:       return new (classes().LongTag)(name);
      case TAG_Float:      return new (classes().FloatTag)(name);
      case TAG_Double:     return new (classes().DoubleTag)(name);
      case TAG_Byte_Array: return new (classes().ByteArrayTag)(name);
      case TAG_String:     return new (classes().StringTag)(name);
      case TAG_List:       return new (classes().ListTag)(name);
      case TAG_Compound:   return new (classes().CompoundTag)(name);
      default:             return null;
    }
  }

  static getTagName(type: number): string {
    switch (type) {
      case TAG_End:        return "TAG_End";
      case TAG_Byte:       return "TAG_Byte";
      case TAG_Short:      return "TAG_Short";
      case TAG_Int:        return "TAG_Int";
      case TAG_Long:       return "TAG_Long";
      case TAG_Float:      return "TAG_Float";
      case TAG_Double:     return "TAG_Double";
      case TAG_Byte_Array: return "TAG_Byte_Array";
      case TAG_String:     return "TAG_String";
      case TAG_List:       return "TAG_List";
      case TAG_Compound:   return "TAG_Compound";
      default:             return "UNKNOWN";
    }
  }
}