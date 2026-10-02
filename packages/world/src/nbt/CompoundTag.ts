// FORWARD-DECL(CompoundTag)：对应 src/nbt/CompoundTag.h。
// S11 由你完整移植 NBT：用真正的 class CompoundTag 整体替换本文件（决策 D11：放在 packages/world/src/nbt/）。
// 已移植代码只调用下面这些成员；新建标签（new CompoundTag、new ListTag）的语句标 DEFERRED(NBT)，由 Claude 在阶段 C 恢复。
export interface CompoundTag {
  getInt(name: string): number;
  putInt(name: string, value: number): void;
  getShort(name: string): number;
  putShort(name: string, value: number): void;
  getByte(name: string): number;
  putByte(name: string, value: number): void;
  getString(name: string): string;
  putString(name: string, value: string): void;
  contains(name: string): boolean;
}
