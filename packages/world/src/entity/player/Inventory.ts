// FORWARD-DECL(Inventory)：对应 src/world/entity/player/Inventory.h。S12 由 Claude 部分移植后整体替换。
// 只列出已移植代码调用的成员。
import type { ItemInstance } from '../../item/ItemInstance';

export interface Inventory {
  getSelected(): ItemInstance | null;
  removeResource(resource: number): boolean;
}
