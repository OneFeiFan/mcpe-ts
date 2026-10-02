// FORWARD-DECL(ItemInstance)：对应 src/world/item/ItemInstance.h。
// S11 由你完整移植：用真正的 class ItemInstance 整体替换本文件（同名同路径），成员名与 C++ 一致即可，调用方不用改。
// 在此之前，已移植代码只读写下面这些成员；需要构造 ItemInstance（ItemInstance(...)、按值复制）的语句标 DEFERRED(ItemInstance)，
// 由 Claude 在 S11 阶段 C 恢复。
import type { Item } from './Item';

export interface ItemInstance {
  id: number;
  count: number;
  getAuxValue(): number;
  setAuxValue(value: number): void;
  hurt(i: number): void;
  getItem(): Item | null;
  isNull(): boolean;
}
