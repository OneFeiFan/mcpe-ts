import { Tag, TAG_Compound, TAG_End, TAG_Byte, TAG_Short, TAG_Int, TAG_Long,
         TAG_Float, TAG_Double, TAG_String, TAG_Byte_Array, TAG_List,
         TAGERR_OUT_OF_BOUNDS } from "./Tag";
import type { IDataInput, IDataOutput, PrintStream } from "@mcpe/util";
import { ByteTag } from "./ByteTag";
import { ShortTag } from "./ShortTag";
import { IntTag } from "./IntTag";
import { LongTag } from "./LongTag";
import { FloatTag } from "./FloatTag";
import { DoubleTag } from "./DoubleTag";
import { StringTag } from "./StringTag";
import { ByteArrayTag } from "./ByteArrayTag";
import { ListTag } from "./ListTag";

// 复刻 std::less<std::string>：按无符号字节的字典序
const encoder = new TextEncoder();

function compareStdString(a: string, b: string): number {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  const n = Math.min(ba.length, bb.length);
  for (let i = 0; i < n; i++) {
    if (ba[i] !== bb[i]) return ba[i]! - bb[i]!;
  }
  return ba.length - bb.length;
}

export class CompoundTag extends Tag {
  private tags = new Map<string, Tag>();
  private sortedKeysCache: string[] | null = null;

  constructor(name: string = "") {
    super(name);
  }

  private invalidate(): void {
    this.sortedKeysCache = null;
  }

  private sortedKeys(): string[] {
    if (this.sortedKeysCache === null) {
      this.sortedKeysCache = Array.from(this.tags.keys()).sort(compareStdString);
    }
    return this.sortedKeysCache;
  }

  // 复刻 std::map::insert 语义：不覆盖
  private insertNew(name: string, tag: Tag): void {
    if (this.tags.has(name)) return;
    this.tags.set(name, tag);
    this.invalidate();
  }

  // ---- 序列化 ----

  write(dos: IDataOutput): void {
    for (const key of this.sortedKeys()) {
      Tag.writeNamedTag(this.tags.get(key)!, dos);
    }
    dos.writeByte(TAG_End);
  }

  load(dis: IDataInput): void {
    this.tags.clear();
    this.invalidate();

    let tag: Tag | null;
    while ((tag = Tag.readNamedTag(dis)) !== null && tag.getId() !== TAG_End) {
      const name = tag.getName();
      if (!this.tags.has(name)) {
        this.tags.set(name, tag);
        this.invalidate();
      }
    }
    // EndTag 和 null 都不需要释放，交给 GC
  }

  // ---- 元信息 ----

  getId(): number {
    return TAG_Compound;
  }

  toString(): string {
    return `${this.tags.size} entries`;
  }

  isEmpty(): boolean {
    return this.tags.size === 0;
  }

  // ---- 写入 API ----

  put(name: string, tag: Tag): void {
    // 复刻 C++：即使插入失败，setName 的副作用也要发生
    tag.setName(name);
    this.insertNew(name, tag);
  }

  putByte(name: string, value: number): void {
    this.insertNew(name, new ByteTag(name, value));
  }

  putShort(name: string, value: number): void {
    this.insertNew(name, new ShortTag(name, value));
  }

  putInt(name: string, value: number): void {
    this.insertNew(name, new IntTag(name, value));
  }

  putLong(name: string, value: bigint): void {
    // 注意：C++ 参数是 long。若目标平台 long 是 32 位（Windows），
    // 调用方传入的值已经被截断为 32 位再符号扩展。
    // 这里按 64 位 bigint 处理，由调用方负责平台差异。
    this.insertNew(name, new LongTag(name, value));
  }

  putFloat(name: string, value: number): void {
    this.insertNew(name, new FloatTag(name, value));
  }

  putDouble(name: string, value: number): void {
    // 复刻 C++ bug：参数类型是 float，必须先 fround
    this.insertNew(name, new DoubleTag(name, Math.fround(value)));
  }

  putString(name: string, value: string): void {
    this.insertNew(name, new StringTag(name, value));
  }

  putByteArray(name: string, value: Uint8Array): void {
    this.insertNew(name, new ByteArrayTag(name, value));
  }

  putCompound(name: string, value: CompoundTag): void {
    value.setName(name);
    this.insertNew(name, value);
  }

  putBoolean(name: string, value: boolean): void {
    this.putByte(name, value ? 1 : 0);
  }

  // ---- 读取 API ----

  contains(name: string): boolean;
  contains(name: string, type: number): boolean;
  contains(name: string, type?: number): boolean {
    const tag = this.tags.get(name);
    if (tag === undefined) return false;
    if (type === undefined) return true;
    return tag.getId() === type;
  }

  get(name: string): Tag | null {
    return this.tags.get(name) ?? null;
  }

  getByte(name: string): number {
    if (!this.contains(name, TAG_Byte)) return 0;
    return (this.get(name) as ByteTag).data;
  }

  getShort(name: string): number {
    if (!this.contains(name, TAG_Short)) return 0;
    return (this.get(name) as ShortTag).data;
  }

  getInt(name: string): number {
    if (!this.contains(name, TAG_Int)) return 0;
    return (this.get(name) as IntTag).data;
  }

  getLong(name: string): bigint {
    if (!this.contains(name, TAG_Long)) return 0n;
    return (this.get(name) as LongTag).data;
  }

  getFloat(name: string): number {
    if (!this.contains(name, TAG_Float)) return 0;
    return (this.get(name) as FloatTag).data;
  }

  getDouble(name: string): number {
    if (!this.contains(name, TAG_Double)) return 0;
    return (this.get(name) as DoubleTag).data;
  }

  getString(name: string): string {
    if (!this.contains(name, TAG_String)) return "";
    return (this.get(name) as StringTag).data;
  }

  getByteArray(name: string): Uint8Array {
    if (!this.contains(name, TAG_Byte_Array)) return new Uint8Array(0);
    return (this.get(name) as ByteArrayTag).data;
  }

  getCompound(name: string): CompoundTag {
    if (!this.contains(name, TAG_Compound)) return new CompoundTag(name);
    return this.get(name) as CompoundTag;
  }

  getList(name: string): ListTag {
    if (!this.contains(name, TAG_List)) return new ListTag(name);
    return this.get(name) as ListTag;
  }

  getBoolean(name: string): boolean {
    return this.getByte(name) !== 0;
  }

  getAllTags(out: Tag[]): void {
    for (const key of this.sortedKeys()) {
      out.push(this.tags.get(key)!);
    }
  }

  // ---- 复制与比较 ----

  copy(): Tag {
    const tag = new CompoundTag(this.getName());
    for (const key of this.sortedKeys()) {
      tag.put(key, this.tags.get(key)!.copy());
    }
    return tag;
  }

  override equals(obj: Tag): boolean {
    if (!super.equals(obj)) return false;

    const o = obj as CompoundTag;
    if (this.tags.size !== o.tags.size) return false;

    const keysA = this.sortedKeys();
    const keysB = o.sortedKeys();
    for (let i = 0; i < keysA.length; i++) {
      if (keysA[i] !== keysB[i]) return false;
      const va = this.tags.get(keysA[i]!)!;
      const vb = o.tags.get(keysB[i]!)!;
      if (!va.equals(vb)) return false;
    }
    return true;
  }

  override print(prefix: string, out: PrintStream): void;
  override print(out: PrintStream): void;
  override print(prefixOrOut: string | PrintStream, maybeOut?: PrintStream): void {
    if (typeof prefixOrOut === "string") {
      const prefix = prefixOrOut;
      const out = maybeOut!;
      super.print(prefix, out);
      out.print(prefix);
      out.println("{");
      const inner = prefix + "   ";
      for (const key of this.sortedKeys()) {
        this.tags.get(key)!.print(inner, out);
      }
      out.print(prefix);
      out.println("}");
    } else {
      super.print(prefixOrOut);
    }
  }

  override deleteChildren(): void {
    for (const tag of this.tags.values()) {
      tag.deleteChildren();
    }
    this.tags.clear();
    this.invalidate();
  }
}