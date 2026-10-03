/**
 * 1:1 移植自 src/world/level/tile/entity/FurnaceTileEntity.h 与 FurnaceTileEntity.cpp（S12 阶段 A，部分移植）。
 * ADAPTED(Cpp)：C++ 是 TileEntity 与 Container 的多重继承；这里 extends TileEntity、implements Container（见 Container.ts）。
 * 部分：熔炉配方（FurnaceRecipes，合成系统，计划外）DEFERRED(Crafting)——在它移植之前，任何原料的烧制结果都是空，
 *   canBurn 恒为 false，所以熔炉不会点燃；FurnaceTile::setLit（FurnaceTile 由你在阶段 B 移植）DEFERRED(Tile)，阶段 C 恢复。
 * C++ 的 ItemInstance items[3] 是按值存放的数组：这里用 3 个 ItemInstance 对象，赋值时复制（items[slot] = *item）。
 */
import { LOGE } from '@mcpe/platform';
import {
  type CompoundTag,
  CompoundTag as CompoundTagClass,
  ListTag,
  TAG_Compound,
} from '@mcpe/nbt';
import { Container, ContainerType, getSlotCopies } from '../../../Container';
import type { Player } from '../../../entity/player/Player';
import { Item } from '../../../item/Item';
import { ItemInstance } from '../../../item/ItemInstance';
import { Material } from '../../material/Material';
import { FurnaceTile } from '../FurnaceTile';
import { Tile } from '../Tile';
import { TileEntity, TileEntityType } from './TileEntity';

export class FurnaceTileEntity extends TileEntity implements Container {
  private static readonly BURN_INTERVAL = 10 * 20;
  private static readonly NumItems = 3;
  static readonly SLOT_INGREDIENT = 0;
  static readonly SLOT_FUEL = 1;
  static readonly SLOT_RESULT = 2;

  containerId = -1;
  containerType = ContainerType.FURNACE;
  litTime = 0;
  litDuration = 0;
  tickCount = 0;
  items: ItemInstance[] = Array.from(
    { length: FurnaceTileEntity.NumItems },
    () => new ItemInstance(),
  );
  private _canBeFinished = false;
  private finished = false;

  constructor() {
    super(TileEntityType.Furnace);
  }

  getItem(slot: number): ItemInstance | null {
    // @todo @container @fix
    return this.items[slot]!;
  }

  removeItem(slot: number, count: number): ItemInstance {
    const it = this.items[slot]!;
    if (!it.isNull()) {
      if (it.count <= count) {
        const item = new ItemInstance(it);
        it.setNull();
        return item;
      } else {
        const i = it.remove(count);
        if (it.count === 0) it.setNull();
        return i;
      }
    }
    return new ItemInstance();
  }

  setItem(slot: number, item: ItemInstance | null): void {
    this.items[slot] = new ItemInstance(item!); // items[slot] = *item;（C++ 先解引用、后判空，原样保留）
    if (item !== null && item.count > this.getMaxStackSize())
      this.items[slot]!.count = this.getMaxStackSize();
  }

  getName(): string {
    return 'Furnace';
  }

  shouldSave(): boolean {
    if (this.litTime > 0) return true;
    for (let i = 0; i < FurnaceTileEntity.NumItems; ++i) if (!this.items[i]!.isNull()) return true;
    return false;
  }

  override load(base: CompoundTag): void {
    super.load(base);
    const inventoryList = base.getList('Items');
    for (let i = 0; i < 3; ++i) this.items[i]!.setNull();
    for (let i = 0; i < inventoryList.size(); i++) {
      const tt = inventoryList.get(i)!;
      if (tt.getId() === TAG_Compound) {
        const tag = tt as CompoundTag;
        const slot = tag.getByte('Slot');
        if (slot >= 0 && slot < FurnaceTileEntity.NumItems) {
          const loaded = ItemInstance.fromTag(tag);
          if (loaded) {
            this.items[slot] = new ItemInstance(loaded);
          } else this.items[slot]!.setNull();
        }
      } else {
        LOGE("load @ FurnaceTileEntity failed. item's not a compoundTag!");
      }
    }
    this.litTime = base.getShort('BurnTime');
    this.tickCount = base.getShort('CookTime');
    this.litDuration = FurnaceTileEntity.getBurnDuration(this.items[FurnaceTileEntity.SLOT_FUEL]!);
  }

  override save(base: CompoundTag): boolean {
    if (!super.save(base)) return false;
    base.putShort('BurnTime', (this.litTime << 16) >> 16);
    base.putShort('CookTime', (this.tickCount << 16) >> 16);
    const listTag = new ListTag();
    for (let i = 0; i < FurnaceTileEntity.NumItems; i++) {
      if (!this.items[i]!.isNull()) {
        const tag = new CompoundTagClass();
        tag.putByte('Slot', i);
        this.items[i]!.save(tag);
        listTag.add(tag);
      }
    }
    base.put('Items', listTag);
    return true;
  }

  getMaxStackSize(): number {
    return Container.LARGE_MAX_STACK_SIZE;
  }

  getContainerSize(): number {
    return FurnaceTileEntity.NumItems;
  }

  getBurnProgress(max: number): number {
    return Math.trunc((this.tickCount * max) / FurnaceTileEntity.BURN_INTERVAL);
  }

  getLitProgress(max: number): number {
    if (this.litDuration === 0) this.litDuration = FurnaceTileEntity.BURN_INTERVAL;
    return Math.trunc((this.litTime * max) / this.litDuration);
  }

  isLit(): boolean {
    return this.litTime > 0;
  }

  override tick(): void {
    const wasLit = this.litTime > 0;
    let changed = false;
    if (this.litTime > 0) {
      --this.litTime;
    }
    if (!this.level!.isClientSide) {
      if (this.litTime === 0 && this.canBurn()) {
        this.litDuration = this.litTime = FurnaceTileEntity.getBurnDuration(
          this.items[FurnaceTileEntity.SLOT_FUEL]!,
        );
        if (this.litTime > 0) {
          changed = true;
          const fuel = this.items[FurnaceTileEntity.SLOT_FUEL]!;
          if (!fuel.isNull()) {
            if (--fuel.count === 0) fuel.setNull();
          }
        }
      }
      if (this.isLit() && this.canBurn()) {
        if (++this.tickCount === FurnaceTileEntity.BURN_INTERVAL) {
          this.tickCount = 0;
          this.burn();
          changed = true;
        }
      } else {
        this.tickCount = 0;
      }
      if (wasLit !== this.litTime > 0) {
        changed = true;
        FurnaceTile.setLit(this.litTime > 0, this.level!, this.x, this.y, this.z);
      }
    }
    if (changed) this.setChanged();
    else {
      if (!wasLit) {
        this.finished = true;
      }
    }
  }

  override isFinished(): boolean {
    return this._canBeFinished && this.finished;
  }

  burn(): void {
    if (!this.canBurn()) return;
    // DEFERRED(Crafting): ItemInstance result = FurnaceRecipes::getInstance()->getResult(items[0].getItem()->id);
    const result = new ItemInstance();
    if (this.items[2]!.isNull()) this.items[2] = new ItemInstance(result);
    else if (this.items[2]!.id === result.id) this.items[2]!.count++;
    if (--this.items[0]!.count <= 0) this.items[0]!.setNull();
  }

  stillValid(player: Player): boolean {
    if (this.level!.getTileEntity(this.x, this.y, this.z) !== this) return false;
    if (player.distanceToSqr(this.x + 0.5, this.y + 0.5, this.z + 0.5) > 8 * 8) return false;
    return true;
  }

  startOpen(): void {}

  stopOpen(): void {}

  getSlotCopies(): ItemInstance[] {
    return getSlotCopies(this);
  }

  /*private*/
  private canBurn(): boolean {
    if (this.items[FurnaceTileEntity.SLOT_INGREDIENT]!.isNull()) return false;
    // DEFERRED(Crafting): ItemInstance burnResult = FurnaceRecipes::getInstance()->getResult(items[SLOT_INGREDIENT].getItem()->id);
    const burnResult = new ItemInstance();
    if (burnResult.isNull()) return false;
    const res = this.items[FurnaceTileEntity.SLOT_RESULT]!;
    if (res.isNull()) return true;
    if (!res.sameItem(burnResult)) return false;
    if (res.count < this.getMaxStackSize() && res.count < res.getMaxStackSize()) return true;
    if (res.count < burnResult.getMaxStackSize()) return true;
    return false;
  }

  static getBurnDuration(itemInstance: ItemInstance): number {
    if (itemInstance.isNull()) return 0;
    const id = itemInstance.getItem()!.id;
    if (id < 256 && Tile.tiles[id]!.material === Material.wood)
      return (FurnaceTileEntity.BURN_INTERVAL * 3) / 2;
    if (id === Item.stick.id) return FurnaceTileEntity.BURN_INTERVAL / 2;
    if (id === Item.coal.id) return FurnaceTileEntity.BURN_INTERVAL * 8;
    return 0;
  }

  static isFuel(itemInstance: ItemInstance): boolean {
    return FurnaceTileEntity.getBurnDuration(itemInstance) > 0;
  }

  isSlotEmpty(slot: number): boolean {
    return this.items[slot]!.isNull();
  }
}
