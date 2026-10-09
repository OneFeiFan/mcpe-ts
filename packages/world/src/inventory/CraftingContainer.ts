/**
 * 1:1 移植自 src/world/inventory/CraftingContainer.h（合成）：w×h 的合成格。
 * 原样保留：getItem(slot) 在范围内总是返回 &items[slot]（空格子是 null 的 ItemInstance，**不是** NULL）；
 *   getItem(x, y) 只在 x 越界或 slot ≥ size 时返回 NULL。
 */
import { type Container, ContainerType, getSlotCopies } from '../Container';
import { Container as ContainerConst } from '../Container';
import type { Player } from '../entity/player/Player';
import { ItemInstance } from '../item/ItemInstance';

export class CraftingContainer implements Container {
  containerId = -1;
  containerType = ContainerType.WORKBENCH;
  private items: ItemInstance[];
  private size: number;
  private width: number;

  constructor(w: number, h: number) {
    this.size = w * h;
    this.width = w;
    this.items = Array.from({ length: this.size }, () => new ItemInstance());
  }

  getItem(slot: number): ItemInstance | null {
    if (slot >= this.getContainerSize()) {
      return null;
    }
    return this.items[slot]!;
  }

  /** C++ 的重载 getItem(int x, int y)（R10 情形 B） */
  getItemAt(x: number, y: number): ItemInstance | null {
    if (x < 0 || x >= this.width) {
      return null;
    }
    const pos = x + y * this.width;
    return this.getItem(pos);
  }

  setItem(slot: number, item: ItemInstance | null): void {
    this.items[slot] = item ? new ItemInstance(item) : new ItemInstance(); // 按值赋值
  }

  removeItem(slot: number, count: number): ItemInstance {
    const it = this.items[slot]!;
    if (!it.isNull()) {
      if (it.count <= count) {
        const item = new ItemInstance(it);
        this.items[slot] = new ItemInstance();
        return item;
      } else {
        const i = it.remove(count);
        if (it.count === 0) this.items[slot] = new ItemInstance();
        return i;
      }
    }
    return new ItemInstance();
  }

  getContainerSize(): number {
    return this.size;
  }

  getMaxStackSize(): number {
    return ContainerConst.LARGE_MAX_STACK_SIZE;
  }

  getName(): string {
    return 'Crafting';
  }

  setContainerChanged(): void {}

  stillValid(_player: Player): boolean {
    return true;
  }

  startOpen(): void {}

  stopOpen(): void {}

  getSlotCopies(): ItemInstance[] {
    return getSlotCopies(this);
  }
}
