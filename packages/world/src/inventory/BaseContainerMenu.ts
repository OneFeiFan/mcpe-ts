/**
 * 1:1 移植自 src/world/inventory/BaseContainerMenu.h 与 .cpp（熔炉与箱子界面）：容器“菜单”——界面与容器之间的同步层。
 * broadcastChanges 比较当前格子与上次的快照（ItemInstance::matches），变了就通知监听者（界面）。
 */
import { ItemInstance } from '../item/ItemInstance';

export interface IContainerListener {
  refreshContainer(menu: BaseContainerMenu, items: ItemInstance[]): void;
  slotChanged(menu: BaseContainerMenu, slot: number, item: ItemInstance, isResultSlot: boolean): void;
  setContainerData(menu: BaseContainerMenu, id: number, value: number): void;
}

export abstract class BaseContainerMenu {
  containerId = -1;
  containerType: number;
  listener: IContainerListener | null = null;
  lastSlots: ItemInstance[] = [];

  constructor(containerType: number) {
    this.containerType = containerType;
  }

  abstract getItems(): ItemInstance[];
  abstract setSlot(slot: number, item: ItemInstance | null): void;

  setData(_id: number, _value: number): void {}

  setListener(listener: IContainerListener | null): void {
    if (!(this.listener = listener)) return;
    if (listener) listener.refreshContainer(this, (this.lastSlots = this.getItems()));
  }

  broadcastChanges(): void {
    if (!this.listener) return;
    const slots = this.getItems();
    if (slots.length !== this.lastSlots.length) {
      this.listener.refreshContainer(this, (this.lastSlots = slots));
      return;
    }
    for (let i = 0; i < slots.length; i++) {
      const current = slots[i]!;
      const expected = this.lastSlots[i]!;
      if (!ItemInstance.matches(expected, current)) {
        this.lastSlots[i] = new ItemInstance(current); // expected = current（按值）
        this.listener.slotChanged(this, i, this.lastSlots[i]!, this.isResultSlot(i));
      }
    }
  }

  isResultSlot(_slot: number): boolean {
    return false;
  }

  abstract tileEntityDestroyedIsInvalid(tileEntityId: number): boolean;
}
