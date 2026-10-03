/**
 * 1:1 移植自 src/world/entity/SynchedEntityData.h 与 SynchedEntityData.cpp（S12 阶段 C）。替换前向声明。
 *
 * ADAPTED(Cpp)：C++ 用模板按值的静态类型选择类型码（getTypeId 的 7 个重载：char、short、int、float、string、ItemInstance、Pos）。
 *   JS 分不出 char / short / int / float，所以 define、set 按类型拆成具名方法（R10 情形 B）：
 *     define<TypeChar>(id, v)  → defineByte(id, v)      set(id, (TypeChar)v) → setByte(id, v)
 *     define<TypeShort>        → defineShort            ……其余同理（Int、Float、String、ItemInstance、Pos）
 *   setFlag<T>、clearFlag<T>、getFlag<T> 的模板参数只用于强转，这里不需要。
 *   数值按 C++ 类型截断：byte 为 signed char、short 为 16 位、int 为 32 位、float 经 Math.fround。
 * std::map<int, DataItem*> 按 id 有序：packDirty、packAll 按 id 升序输出。
 */
import { LOGE } from '@mcpe/platform';
import type { IDataInput, IDataOutput } from '@mcpe/util';
import { ItemInstance } from '../item/ItemInstance';
import { Pos } from '../Pos';

type DataValue = number | string | ItemInstance | Pos;

export class DataItem {
  private readonly type: number;
  private readonly id: number;
  private dirty = true;
  data: DataValue;

  constructor(type: number, id: number, data: DataValue) {
    this.type = type;
    this.id = id;
    this.data = data;
  }

  getId(): number {
    return this.id;
  }

  getType(): number {
    return this.type;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  setDirty(dirty: boolean): void {
    this.dirty = dirty;
  }

  isDataEqual(rhs: DataItem): boolean {
    return this.type === rhs.type;
  }

  // DataItem2<T> 的 setFlag、clearFlag、getFlag（data 是整数类型时）
  setFlag(flag: number): void {
    this.data = SynchedEntityData.wrap(this.type, (this.data as number) | (1 << flag));
  }

  clearFlag(flag: number): void {
    this.data = SynchedEntityData.wrap(this.type, (this.data as number) & ~(1 << flag));
  }

  getFlag(flag: number): boolean {
    return ((this.data as number) & (1 << flag)) !== 0;
  }
}

export class SynchedEntityData {
  static readonly MAX_STRING_DATA_LENGTH = 64;
  static readonly EOF_MARKER = 0x7f;
  private static readonly TYPE_BYTE = 0;
  private static readonly TYPE_SHORT = 1;
  private static readonly TYPE_INT = 2;
  private static readonly TYPE_FLOAT = 3;
  private static readonly TYPE_STRING = 4;
  private static readonly TYPE_ITEMINSTANCE = 5;
  private static readonly TYPE_POS = 6;
  private static readonly TYPE_MASK = 0xe0;
  private static readonly TYPE_SHIFT = 5;
  private static readonly MAX_ID_VALUE = ~SynchedEntityData.TYPE_MASK & 0xff;

  private itemsById = new Map<number, DataItem>();
  private _isDirty = false;

  /** 按 C++ 的类型截断数值 */
  static wrap(type: number, v: DataValue): DataValue {
    switch (type) {
      case SynchedEntityData.TYPE_BYTE:
        return ((v as number) << 24) >> 24;
      case SynchedEntityData.TYPE_SHORT:
        return ((v as number) << 16) >> 16;
      case SynchedEntityData.TYPE_INT:
        return (v as number) | 0;
      case SynchedEntityData.TYPE_FLOAT:
        return Math.fround(v as number);
      default:
        return v;
    }
  }

  private define(idd: number, type: number, value: DataValue): void {
    if (idd > SynchedEntityData.MAX_ID_VALUE) {
      LOGE(`Data value id is too big with ${idd}! (Max is ${SynchedEntityData.MAX_ID_VALUE} )`);
      return;
    }
    if (this.itemsById.has(idd)) {
      LOGE(`Duplicate id value for ${idd}!`);
      return;
    }
    this.itemsById.set(idd, new DataItem(type, idd, SynchedEntityData.wrap(type, value)));
  }

  defineByte(idd: number, value: number): void {
    this.define(idd, SynchedEntityData.TYPE_BYTE, value);
  }
  defineShort(idd: number, value: number): void {
    this.define(idd, SynchedEntityData.TYPE_SHORT, value);
  }
  defineInt(idd: number, value: number): void {
    this.define(idd, SynchedEntityData.TYPE_INT, value);
  }
  defineFloat(idd: number, value: number): void {
    this.define(idd, SynchedEntityData.TYPE_FLOAT, value);
  }
  defineString(idd: number, value: string): void {
    this.define(idd, SynchedEntityData.TYPE_STRING, value);
  }
  defineItemInstance(idd: number, value: ItemInstance): void {
    this.define(idd, SynchedEntityData.TYPE_ITEMINSTANCE, new ItemInstance(value));
  }
  definePos(idd: number, value: Pos): void {
    this.define(idd, SynchedEntityData.TYPE_POS, new Pos(value.x, value.y, value.z));
  }

  private get(id: number, type: number): DataValue | undefined {
    const it = this.itemsById.get(id);
    if (it !== undefined && it.getType() === type) return it.data;
    return undefined;
  }

  getByte(id: number): number {
    return (this.get(id, SynchedEntityData.TYPE_BYTE) as number | undefined) ?? 0;
  }
  getShort(id: number): number {
    return (this.get(id, SynchedEntityData.TYPE_SHORT) as number | undefined) ?? 0;
  }
  getInt(id: number): number {
    return (this.get(id, SynchedEntityData.TYPE_INT) as number | undefined) ?? 0;
  }
  getFloat(id: number): number {
    return (this.get(id, SynchedEntityData.TYPE_FLOAT) as number | undefined) ?? 0;
  }
  getString(id: number): string {
    return (this.get(id, SynchedEntityData.TYPE_STRING) as string | undefined) ?? '';
  }

  /** C++ 按值返回副本 */
  getItemInstance(id: number): ItemInstance {
    const v = this.get(id, SynchedEntityData.TYPE_ITEMINSTANCE) as ItemInstance | undefined;
    return v ? new ItemInstance(v) : new ItemInstance();
  }

  getPos(id: number): Pos {
    const v = this.get(id, SynchedEntityData.TYPE_POS) as Pos | undefined;
    return v ? new Pos(v.x, v.y, v.z) : new Pos();
  }

  /** C++ 的模板 set(DataItem*, const T&)：类型码由值的静态类型决定，这里由调用的具名方法给出 */
  private setItem(dataItem: DataItem | undefined, type: number, value: DataValue): void {
    if (!dataItem) {
      LOGE('DataItem not found!');
      return;
    }
    if (dataItem.getType() === type) {
      const v = SynchedEntityData.wrap(type, value);
      if (!SynchedEntityData.dataEquals(dataItem.data, v)) {
        dataItem.data =
          v instanceof ItemInstance
            ? new ItemInstance(v)
            : v instanceof Pos
              ? new Pos(v.x, v.y, v.z)
              : v;
        dataItem.setDirty(true);
        this._isDirty = true;
      }
    } else {
      LOGE(`ERROR: Id ${dataItem.getId()} is not correct type. ${dataItem.getType()} != ${type}!`);
    }
  }

  private static dataEquals(a: DataValue, b: DataValue): boolean {
    if (a instanceof ItemInstance && b instanceof ItemInstance) return a.equals(b);
    if (a instanceof Pos && b instanceof Pos) return a.x === b.x && a.y === b.y && a.z === b.z;
    return a === b;
  }

  setByte(id: number, value: number): void {
    this.setItem(this.itemsById.get(id), SynchedEntityData.TYPE_BYTE, value);
  }
  setShort(id: number, value: number): void {
    this.setItem(this.itemsById.get(id), SynchedEntityData.TYPE_SHORT, value);
  }
  setInt(id: number, value: number): void {
    this.setItem(this.itemsById.get(id), SynchedEntityData.TYPE_INT, value);
  }
  setFloat(id: number, value: number): void {
    this.setItem(this.itemsById.get(id), SynchedEntityData.TYPE_FLOAT, value);
  }
  setString(id: number, value: string): void {
    this.setItem(this.itemsById.get(id), SynchedEntityData.TYPE_STRING, value);
  }
  setItemInstance(id: number, value: ItemInstance): void {
    this.setItem(this.itemsById.get(id), SynchedEntityData.TYPE_ITEMINSTANCE, value);
  }
  setPos(id: number, value: Pos): void {
    this.setItem(this.itemsById.get(id), SynchedEntityData.TYPE_POS, value);
  }

  setFlag(id: number, flag: number): void {
    const item = this.itemsById.get(id)!;
    const oldFlag = item.getFlag(flag);
    item.setFlag(flag);
    if (item.getFlag(flag) !== oldFlag) {
      this.markDirty(id);
    }
  }

  clearFlag(id: number, flag: number): void {
    const item = this.itemsById.get(id)!;
    const oldFlag = item.getFlag(flag);
    item.clearFlag(flag);
    if (item.getFlag(flag) !== oldFlag) {
      this.markDirty(id);
    }
  }

  getFlag(id: number, flag: number): boolean {
    return this.itemsById.get(id)!.getFlag(flag);
  }

  markDirty(id: number): void {
    this.itemsById.get(id)!.setDirty(true);
    this._isDirty = true;
  }

  isDirty(): boolean {
    return this._isDirty;
  }

  private sortedItems(): DataItem[] {
    return [...this.itemsById.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }

  static pack(items: DataItem[] | null, output: IDataOutput): void {
    if (items !== null) {
      for (const it of items) SynchedEntityData.writeDataItem(output, it);
    }
    output.writeByte(SynchedEntityData.EOF_MARKER);
  }

  packDirty(): DataItem[] {
    const result: DataItem[] = [];
    if (this._isDirty) {
      for (const dataItem of this.sortedItems()) {
        if (dataItem.isDirty()) {
          dataItem.setDirty(false);
          result.push(dataItem);
        }
      }
    }
    this._isDirty = false;
    return result;
  }

  packAll(output: IDataOutput): void {
    for (const it of this.sortedItems()) SynchedEntityData.writeDataItem(output, it);
    output.writeByte(SynchedEntityData.EOF_MARKER);
  }

  static unpack(input: IDataInput): DataItem[] {
    const result: DataItem[] = [];
    let currentHeader = input.readByte();
    while (currentHeader !== SynchedEntityData.EOF_MARKER) {
      const itemType =
        (currentHeader & SynchedEntityData.TYPE_MASK) >> SynchedEntityData.TYPE_SHIFT;
      const itemId = currentHeader & SynchedEntityData.MAX_ID_VALUE;
      let item: DataItem | null = null;
      switch (itemType) {
        case SynchedEntityData.TYPE_BYTE:
          item = new DataItem(itemType, itemId, input.readByte());
          break;
        case SynchedEntityData.TYPE_SHORT:
          item = new DataItem(itemType, itemId, input.readShort());
          break;
        case SynchedEntityData.TYPE_INT:
          item = new DataItem(itemType, itemId, input.readInt());
          break;
        case SynchedEntityData.TYPE_FLOAT:
          item = new DataItem(itemType, itemId, input.readFloat());
          break;
        case SynchedEntityData.TYPE_STRING:
          item = new DataItem(itemType, itemId, input.readString());
          break;
        case SynchedEntityData.TYPE_ITEMINSTANCE: {
          const id = input.readShort();
          const count = input.readByte();
          const auxValue = input.readShort();
          item = new DataItem(itemType, itemId, new ItemInstance(id, count, auxValue));
          break;
        }
        case SynchedEntityData.TYPE_POS: {
          const x = input.readInt();
          const y = input.readInt();
          const z = input.readInt();
          item = new DataItem(itemType, itemId, new Pos(x, y, z));
          break;
        }
      }
      result.push(item!); // C++ 遇到未知类型也会 push_back(NULL)
      currentHeader = input.readByte();
    }
    return result;
  }

  assignValues(items: DataItem[]): void {
    for (const item of items) {
      const jt = this.itemsById.get(item.getId());
      if (jt !== undefined) {
        switch (item.getType()) {
          case SynchedEntityData.TYPE_BYTE:
          case SynchedEntityData.TYPE_SHORT:
          case SynchedEntityData.TYPE_INT:
          case SynchedEntityData.TYPE_FLOAT:
          case SynchedEntityData.TYPE_STRING:
          case SynchedEntityData.TYPE_ITEMINSTANCE:
          case SynchedEntityData.TYPE_POS:
            this.setItem(jt, item.getType(), item.data);
            break;
          default:
            LOGE(`Incorrect type id: ${item.getType()}`);
            break;
        }
      }
    }
  }

  private static writeDataItem(output: IDataOutput, dataItem: DataItem): void {
    const header =
      ((dataItem.getType() << SynchedEntityData.TYPE_SHIFT) |
        (dataItem.getId() & SynchedEntityData.MAX_ID_VALUE)) &
      0xff;
    output.writeByte(header);
    switch (dataItem.getType()) {
      case SynchedEntityData.TYPE_BYTE:
        output.writeByte(dataItem.data as number);
        break;
      case SynchedEntityData.TYPE_SHORT:
        output.writeShort(dataItem.data as number);
        break;
      case SynchedEntityData.TYPE_INT:
        output.writeInt(dataItem.data as number);
        break;
      case SynchedEntityData.TYPE_FLOAT:
        output.writeFloat(dataItem.data as number);
        break;
      case SynchedEntityData.TYPE_STRING:
        output.writeString(dataItem.data as string);
        break;
      case SynchedEntityData.TYPE_ITEMINSTANCE: {
        const instance = dataItem.data as ItemInstance;
        output.writeShort(instance.getItem()!.id);
        output.writeByte(instance.count);
        output.writeShort(instance.getAuxValue());
        break;
      }
      case SynchedEntityData.TYPE_POS: {
        const instance = dataItem.data as Pos;
        output.writeInt(instance.x);
        output.writeInt(instance.y);
        output.writeInt(instance.z);
        break;
      }
    }
  }
}
