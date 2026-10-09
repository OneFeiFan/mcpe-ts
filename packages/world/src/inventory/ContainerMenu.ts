// 1:1 移植自 src/world/inventory/ContainerMenu.h 与 .cpp：普通容器（箱子）的菜单
import { type Container, ContainerType } from '../Container';
import { ItemInstance } from '../item/ItemInstance';
import { BaseContainerMenu } from './BaseContainerMenu';

export class ContainerMenu extends BaseContainerMenu {
  container: Container;
  protected tileEntityId: number;

  constructor(container: Container, tileEntityId = -1) {
    super(ContainerType.CONTAINER);
    this.container = container;
    this.tileEntityId = tileEntityId;
  }

  setSlot(slot: number, item: ItemInstance | null): void {
    this.container.setItem(slot, item);
  }

  getItems(): ItemInstance[] {
    const out: ItemInstance[] = [];
    for (let i = 0; i < this.container.getContainerSize(); ++i) {
      const item = this.container.getItem(i);
      out.push(item ? new ItemInstance(item) : new ItemInstance());
    }
    return out;
  }

  tileEntityDestroyedIsInvalid(tileEntityId: number): boolean {
    return this.tileEntityId === tileEntityId;
  }
}
