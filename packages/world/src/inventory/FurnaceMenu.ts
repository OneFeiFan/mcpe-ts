// 1:1 移植自 src/world/inventory/FurnaceMenu.h 与 .cpp：熔炉的菜单——除了 3 个格子，还同步进度（tickCount）、剩余燃烧时间与总燃烧时间
import { ContainerType } from '../Container';
import { ItemInstance } from '../item/ItemInstance';
import type { FurnaceTileEntity } from '../level/tile/entity/FurnaceTileEntity';
import { BaseContainerMenu, type IContainerListener } from './BaseContainerMenu';

export class FurnaceMenu extends BaseContainerMenu {
  furnace: FurnaceTileEntity;
  furnaceTileEntityId: number;
  private lastTickCount = 0;
  private lastLitTime = 0;
  private lastLitDuration = 0;

  constructor(furnace: FurnaceTileEntity) {
    super(ContainerType.FURNACE);
    this.furnace = furnace;
    this.furnaceTileEntityId = furnace.runningId;
  }

  setSlot(slot: number, item: ItemInstance | null): void {
    this.furnace.setItem(slot, item);
  }

  override setData(id: number, value: number): void {
    if (id === 0) this.furnace.tickCount = value;
    if (id === 1) this.furnace.litTime = value;
    if (id === 2) this.furnace.litDuration = value;
  }

  getItems(): ItemInstance[] {
    const out: ItemInstance[] = [];
    for (let i = 0; i < this.furnace.getContainerSize(); ++i) out.push(new ItemInstance(this.furnace.getItem(i)!));
    return out;
  }

  override broadcastChanges(): void {
    super.broadcastChanges();
    const listener = this.listener;
    if (!listener) return;
    const fu = this.furnace;
    if (fu.tickCount !== this.lastTickCount) {
      listener.setContainerData(this, 0, fu.tickCount);
      this.lastTickCount = fu.tickCount;
    }
    if (fu.litTime !== this.lastLitTime) {
      listener.setContainerData(this, 1, fu.litTime);
      this.lastLitTime = fu.litTime;
    }
    if (fu.litDuration !== this.lastLitDuration) {
      listener.setContainerData(this, 2, fu.litDuration);
      this.lastLitDuration = fu.litDuration;
    }
  }

  override setListener(listener: IContainerListener | null): void {
    super.setListener(listener);
    if (listener) {
      listener.setContainerData(this, 0, this.furnace.tickCount);
      listener.setContainerData(this, 1, this.furnace.litTime);
      listener.setContainerData(this, 2, this.furnace.litDuration);
    }
  }

  tileEntityDestroyedIsInvalid(tileEntityId: number): boolean {
    return tileEntityId === this.furnaceTileEntityId;
  }
}
