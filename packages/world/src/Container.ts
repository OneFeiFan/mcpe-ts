/**
 * 1:1 移植自 src/world/Container.h（S12 阶段 A）：ContainerType 与容器接口。
 * ADAPTED(Cpp)：C++ 的 Container 是带构造函数和一个默认实现的抽象基类，而且被多重继承（FurnaceTileEntity : TileEntity, Container；
 *   ChestTileEntity : TileEntity, FillingContainer）。TS 只能单继承，所以 Container 写成接口（containerId、containerType 两个字段 +
 *   纯虚函数），默认实现的 getSlotCopies 写成函数 getSlotCopies(container)，实现类在自己的 getSlotCopies 里调用它。
 */
import type { Player } from './entity/player/Player';
import { ItemInstance } from './item/ItemInstance';

export class ContainerType {
  static readonly NONE = -9;
  static readonly INVENTORY = -1;
  static readonly CONTAINER = 0;
  static readonly WORKBENCH = 1;
  static readonly FURNACE = 2;
  static readonly TRAP = 3;
  static readonly ENCHANTMENT = 4;
  static readonly BREWING_STAND = 5;
}

export interface Container {
  containerId: number; // C++ 构造函数初值 -1
  containerType: number;
  getItem(slot: number): ItemInstance | null;
  setItem(slot: number, item: ItemInstance | null): void;
  removeItem(slot: number, i: number): ItemInstance;
  getName(): string;
  getContainerSize(): number;
  getMaxStackSize(): number;
  stillValid(player: Player): boolean;
  startOpen(): void;
  stopOpen(): void;
  getSlotCopies(): ItemInstance[];
}

export const Container = {
  LARGE_MAX_STACK_SIZE: 64,
} as const;

/** C++ Container::getSlotCopies 的默认实现 */
export function getSlotCopies(container: Container): ItemInstance[] {
  const items: ItemInstance[] = [];
  const NullItem = new ItemInstance();
  for (let i = 0; i < container.getContainerSize(); ++i) {
    const item = container.getItem(i);
    items.push(item ? new ItemInstance(item) : new ItemInstance(NullItem));
  }
  return items;
}
