// FORWARD-DECL(Player)：对应 src/world/entity/player/Player.h。S12 由 Claude 部分移植后整体替换。
// 只列出已移植代码读写的成员（名字与 C++ 一致）；所有引用必须用 import type。
import type { Tile } from '../../level/tile/Tile';
import type { ItemInstance } from '../../item/ItemInstance';
import type { Mob } from '../Mob';
import type { Abilities } from './Abilities';
import type { Inventory } from './Inventory';

export interface Player extends Mob {
  inventory: Inventory;
  abilities: Abilities;
  canDestroy(tile: Tile): boolean;
  getDestroySpeed(tile: Tile): number;
  getSelectedItem(): ItemInstance | null;
  hasResource(id: number): boolean;
  startUsingItem(instance: ItemInstance, duration: number): void;
  isHurt(): boolean;
  isSleeping(): boolean;
  tileEntityDestroyed(tileEntityId: number): void;
}
