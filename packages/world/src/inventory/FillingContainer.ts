/**
 * 1:1 移植自 src/world/inventory/FillingContainer.h 与 FillingContainer.cpp（S12 阶段 A 补充）。
 *
 * ADAPTED(Cpp)：C++ 的 FillingContainer 既被单继承（Inventory : FillingContainer），又被多重继承
 *   （ChestTileEntity : TileEntity, FillingContainer）。TS 只能单继承，所以写成 mixin：
 *     FillingContainerMixin(Base) 返回“Base + FillingContainer 全部成员”的类；
 *     FillingContainer = FillingContainerMixin(空基类)，供单继承使用（Inventory）。
 *   mixin 不能有自己的带参构造函数，C++ 构造函数 FillingContainer(numTotalSlots, numLinkedSlots, containerType, isCreative)
 *   的初始化部分写成 initFillingContainer(...)，由子类的构造函数调用（FillingContainer 自己的构造函数也调用它）。
 * R10：removeResource 的三个重载（返回类型不同）、getSlot / getNonEmptySlot 的两个重载按情形 B 命名，保留原名的分派入口。
 * 合成系统（Recipe）计划外：removeResource 里用到的 Recipe::isAnyAuxValue 只有几行、不依赖其他合成代码，照抄为本文件的函数。
 * C++ 的 ItemList 是 vector<ItemInstance*>，空位是 NULL；release 里的 delete 交给垃圾回收。
 * 可见性：导出的 mixin 返回类型不允许 protected / private 成员（TS4094），C++ 的 protected、private 成员在这里只能公开，逐个注明。
 */
import { LOGE, LOGI } from '@mcpe/platform';
import { CompoundTag, type ListTag, TAG_Compound } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import { type Container, ContainerType, getSlotCopies } from '../Container';
import type { Player } from '../entity/player/Player';
import { ItemInstance } from '../item/ItemInstance';
import { StoneSlabTile } from '../level/tile/StoneSlabTile';
import { Tile } from '../level/tile/Tile';

const MAGIX_VAL = 255; // FillingContainer.cpp 的 #define
const MAX_SLOTS = 96;

/** Recipe.h 的 ANY_AUX_VALUE 与 Recipe.cpp:100 的 isAnyAuxValue(int id)（ItemInstance* 版本转调它） */
const RECIPE_ANY_AUX_VALUE = -1;
function recipeIsAnyAuxValue(id: number): boolean {
  const isTile = id < 256;
  if (!isTile) return false;
  if (id === Tile.cloth.id || id === Tile.stoneSlabHalf.id || id === Tile.sandStone.id)
    return false;
  return true;
}

/** C++ 的 *dst = src（ItemInstance 按值赋值）：复制 id、count、auxValue */
function assignItem(dst: ItemInstance, src: ItemInstance): void {
  dst.init(src.id, src.count, src.getAuxValue());
}

/** C++ 的 struct LinkedSlot（按值复制：赋值时复制字段） */
export class LinkedSlot {
  inventorySlot: number;
  constructor(slot = -1) {
    this.inventorySlot = slot;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtor = abstract new (...args: any[]) => object;

export function FillingContainerMixin<TBase extends AnyCtor>(Base: TBase) {
  abstract class FillingContainerImpl extends Base implements Container {
    static readonly MAX_INVENTORY_STACK_SIZE = 254;

    containerId = -1;
    containerType = ContainerType.NONE;
    linkedSlots: LinkedSlot[] = [];
    numTotalSlots = 0;
    numLinkedSlots = 0; // C++ 里是 const
    /** C++ protected */ items: (ItemInstance | null)[] = [];
    /** C++ protected */ _isCreative = false;

    /** C++ 构造函数的初始化部分（见文件头） */
    /** C++ protected */ initFillingContainer(
      numTotalSlots: number,
      numLinkedSlots: number,
      containerType: number,
      isCreative: boolean,
    ): void {
      this.containerType = containerType;
      this.numTotalSlots = numTotalSlots;
      this.numLinkedSlots = numLinkedSlots;
      this._isCreative = isCreative;
      if (numLinkedSlots > 0)
        this.linkedSlots = Array.from({ length: numLinkedSlots }, () => new LinkedSlot());
      this.items.length = numTotalSlots;
      this.items.fill(null);
    }

    clearInventory(): void {
      for (let i = 0; i < this.numLinkedSlots; ++i) {
        this.linkedSlots[i] = new LinkedSlot(i);
      }
      for (let i = this.numLinkedSlots; i < this.items.length; i++) {
        this.release(i);
      }
      this.resizeItems(this.numTotalSlots);
    }

    /** C++ 的三个重载：removeResource(int type)、removeResource(const ItemInstance&)、removeResource(const ItemInstance&, bool) */
    removeResource(type: number): boolean;
    removeResource(item: ItemInstance): boolean;
    removeResource(item: ItemInstance, requireExactAux: boolean): number;
    removeResource(a: number | ItemInstance, requireExactAux?: boolean): boolean | number {
      if (typeof a === 'number') return this.removeResourceOfType(a);
      if (requireExactAux === undefined) return this.removeResourceMatching(a);
      return this.removeResourceCount(a, requireExactAux);
    }

    removeResourceOfType(type: number): boolean {
      if (this._isCreative) return true;
      const slot = this.getSlotForId(type);
      if (slot < 0) return false;
      if (--this.items[slot]!.count <= 0) this.release(slot);
      return true;
    }

    removeResourceMatching(item: ItemInstance): boolean {
      return this.removeResourceCount(item, false) === 0;
    }

    removeResourceCount(item: ItemInstance, requireExactAux: boolean): number {
      if (this._isCreative) return 0;
      let count = item.count;
      while (count > 0) {
        let slot = -1;
        if (
          !requireExactAux &&
          (recipeIsAnyAuxValue(item.id) || item.getAuxValue() === RECIPE_ANY_AUX_VALUE)
        )
          slot = this.getNonEmptySlotForId(item.id);
        else slot = this.getNonEmptySlotForIdAndData(item.id, item.getAuxValue());
        if (slot < 0) return count;
        const slotItem = this.items[slot]!;
        const toRemove = Mth.Min(count, slotItem.count);
        slotItem.count -= toRemove;
        count -= toRemove;
        if (slotItem.count <= 0) this.clearSlot(slot);
      }
      return 0;
    }

    hasResource(type: number): boolean {
      if (this._isCreative) return true;
      const slot = this.getSlotForId(type);
      if (slot < 0) return false;
      return true;
    }

    swapSlots(from: number, to: number): void {
      const tmp = this.items[to] ?? null;
      this.items[to] = this.items[from] ?? null;
      this.items[from] = tmp;
    }

    add(item: ItemInstance | null): boolean {
      if (this._isCreative) return true;
      if (!item || item.isNull()) return true;
      if (!item.isDamaged()) {
        let lastSize: number;
        do {
          lastSize = item.count;
          item.count = this.addResource(item);
        } while (item.count > 0 && item.count < lastSize);
        return item.count < lastSize;
      }
      const slot = this.getFreeSlot();
      if (slot >= 0) {
        this.items[slot] = ItemInstance.clone(item);
        this.linkEmptySlot(slot);
        item.count = 0;
        return true;
        // （C++ 在 return 之后还有一段打印物品栏的死代码）
      }
      return false;
    }

    /** C++ 的 getSlotList(int& slot)：slot 没有用到，返回 items 本身 */
    getSlotList(_slot: number): (ItemInstance | null)[] {
      return this.items;
    }

    dropSlot(slot: number, onlyClearContainer: boolean, randomly = false): void {
      if (slot >= 0 && slot < this.numLinkedSlots) slot = this.linkedSlots[slot]!.inventorySlot;
      if (slot < 0 || slot >= this.items.length) return;
      const it = this.items[slot];
      if (it && it.count) {
        if (!onlyClearContainer) this.doDrop(it.copy(), randomly);
        it.count = 0;
        this.release(slot); //@itodo:
        this.compressLinkedSlotList(slot);
      }
    }

    dropAll(onlyClearContainer: boolean): void {
      for (let i = this.numLinkedSlots; i < this.items.length; i++) {
        this.dropSlot(i, onlyClearContainer, true);
      }
    }

    removeItem(slot: number, count: number): ItemInstance {
      const item = this.getItem(slot);
      if (item) {
        if (count > item.count) count = item.count;
        item.count -= count;
        if (item.count <= 0) this.clearSlot(slot);
      }
      return new ItemInstance();
    }

    clearSlot(slot: number): void {
      if (slot < 0) return;
      if (slot < this.numLinkedSlots) {
        this.release(this.linkedSlots[slot]!.inventorySlot);
        this.linkedSlots[slot]!.inventorySlot = -1;
      } else {
        this.release(slot);
      }
      this.compressLinkedSlotList(slot);
    }

    clearInventoryWithDefault(): void {
      // C++ 只有声明，没有定义（不会被调用）
    }

    /** C++ 的 save(ListTag*)。ADAPTED(Cpp)：与 TileEntity::save(CompoundTag*) 同名（ChestTileEntity 同时继承两者），TS 单一原型链里会互相遮蔽，改名为 saveItems */
    saveItems(listTag: ListTag): ListTag {
      if (!this._isCreative) {
        let selTmp = new ItemInstance();
        for (let i = 0; i < this.items.length; i++) {
          let item = this.items[i] ?? null;
          if (i < this.numLinkedSlots) {
            const slot = this.linkedSlots[i]!.inventorySlot;
            selTmp = new ItemInstance(MAGIX_VAL, MAGIX_VAL, slot);
            item = selTmp;
          }
          if (item !== null) {
            const tag = new CompoundTag();
            tag.putByte('Slot', (i << 24) >> 24);
            if (item.count < 0) item.count = 0;
            if (item.count > 255) item.count = 255;
            const iitem = new ItemInstance(item);
            iitem.save(tag);
            listTag.add(tag);
          }
        }
      }
      return listTag;
    }

    /** C++ 的 load(ListTag*)，改名原因同 saveItems */
    loadItems(inventoryList: ListTag): void {
      if (this._isCreative) return;
      this.clearInventory();
      for (let i = inventoryList.size() - 1; i >= 0; --i) {
        const t = inventoryList.get(i)!;
        if (t.getId() !== TAG_Compound) continue;
        const tag = t as CompoundTag;
        const slot = tag.getByte('Slot') & 0xff;
        if (slot < 0) continue;
        const item = ItemInstance.fromTag(tag);
        if (item !== null) {
          if (slot < this.numLinkedSlots) {
            if (slot < this.items.length && item.id === MAGIX_VAL && item.count === MAGIX_VAL) {
              const invSlot = item.getAuxValue();
              if (invSlot >= this.numLinkedSlots && invSlot < this.items.length)
                this.linkSlot(slot, invSlot, false);
            } else {
              // Something's wrong, shouldnt go here
              LOGE(
                `Error: Slot ${slot} is selection slot (inventory size: ${this.items.length}) but id/count is ${item.id}/${item.count}`,
              );
            }
            continue;
          }
          if (slot < MAX_SLOTS && slot >= this.numLinkedSlots) {
            if (item.count === 0) {
              continue;
            }
            if (slot >= this.items.length) {
              this.doDrop(item, true);
              continue;
            }
            this.fixBackwardCompabilityItem(item);
            this.items[slot] = item;
          } else {
            if (slot >= MAX_SLOTS) {
              LOGE(`Error: Too large slot ID in Inventory: ${slot}!`);
            }
          }
        }
      }
      this.compressLinkedSlotList(0);
    }

    /** C++ 的 replace(std::vector<ItemInstance> newItems, int count = -1)：按值传入，所以先复制 */
    replace(newItems: readonly ItemInstance[], maxCount = -1): void {
      const copies = newItems.map((it) => new ItemInstance(it));
      this.clearInventory();
      maxCount = maxCount < 0 ? copies.length : Mth.Min(copies.length, maxCount);
      const base = this.numLinkedSlots;
      const iMax = Mth.Min(this.getContainerSize() - base, maxCount);
      for (let i = 0; i < iMax; ++i) {
        this.replaceSlot(base + i, copies[i]!.isNull() ? null : copies[i]!);
      }
    }

    replaceSlot(slotId: number, ins: ItemInstance | null): void {
      if (ins) {
        if (!this.items[slotId]) this.items[slotId] = new ItemInstance();
        assignItem(this.items[slotId]!, ins);
      } else {
        this.release(slotId);
      }
    }

    setItem(slot: number, item: ItemInstance | null): void {
      if (slot < 0 || slot >= this.numTotalSlots) return;
      const pile = this.getSlotList(slot);
      const value = item ? item : new ItemInstance();
      if (pile[slot]) assignItem(pile[slot]!, value);
      else pile[slot] = new ItemInstance(value);
    }

    getItem(slot: number): ItemInstance | null {
      if (slot < 0 || slot >= this.numTotalSlots) return null;
      if (slot >= this.numLinkedSlots) return this.getSlotList(slot)[slot] ?? null;
      return this.getLinked(slot); //@note
    }

    getName(): string {
      return 'Inventory';
    }

    getContainerSize(): number {
      const sz = this.items.length;
      if (sz !== this.numTotalSlots) {
        LOGE(`Error@getContainerSize: num items != InventorySize: ${sz} != ${this.numTotalSlots}`);
      }
      return this.numTotalSlots;
    }

    getMaxStackSize(): number {
      return FillingContainerImpl.MAX_INVENTORY_STACK_SIZE;
    }

    setContainerChanged(): void {}

    stillValid(player: Player): boolean {
      return !player.removed;
    }

    contains(itemInstance: ItemInstance): boolean {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (it != null && it.matches(itemInstance)) return true;
      }
      return false;
    }

    startOpen(): void {}

    stopOpen(): void {}

    getSlotCopies(): ItemInstance[] {
      return getSlotCopies(this);
    }

    doDrop(_item: ItemInstance, _randomly: boolean): void {
      // delete item;
    }

    /** C++ 的两个重载：protected getSlot(tileId) 与 public getSlot(tileId, data) */
    getSlot(tileId: number, data?: number): number {
      return data === undefined
        ? this.getSlotForId(tileId)
        : this.getSlotForIdAndData(tileId, data);
    }

    getSlotForIdAndData(tileId: number, data: number): number {
      for (let i = this.numLinkedSlots; i < this.items.length; i++) {
        const it = this.items[i];
        if (it != null && it.id === tileId && it.getAuxValue() === data) return i;
      }
      return -1;
    }

    /** C++ 的两个重载：protected getNonEmptySlot(tileId) 与 public getNonEmptySlot(tileId, data) */
    getNonEmptySlot(tileId: number, data?: number): number {
      return data === undefined
        ? this.getNonEmptySlotForId(tileId)
        : this.getNonEmptySlotForIdAndData(tileId, data);
    }

    getNonEmptySlotForIdAndData(tileId: number, data: number): number {
      for (let i = this.numLinkedSlots; i < this.items.length; i++) {
        const it = this.items[i];
        if (it != null && it.id === tileId && it.getAuxValue() === data && it.count > 0) return i;
      }
      return -1;
    }

    getNumEmptySlots(): number {
      let numEmpty = 0;
      for (let i = this.numLinkedSlots; i < this.items.length; ++i) {
        const it = this.items[i];
        if (!it || it.isNull()) ++numEmpty;
      }
      return numEmpty;
    }

    getNumLinkedSlots(): number {
      return this.numLinkedSlots;
    }

    /** C++ protected */ getSlotForId(tileId: number): number {
      for (let i = this.numLinkedSlots; i < this.items.length; i++) {
        const it = this.items[i];
        if (it != null && it.id === tileId) return i;
      }
      return -1;
    }

    /** C++ protected */ getNonEmptySlotForId(tileId: number): number {
      for (let i = this.numLinkedSlots; i < this.items.length; i++) {
        const it = this.items[i];
        if (it != null && it.id === tileId && it.count > 0) return i;
      }
      return -1;
    }

    /** C++ protected */ getSlotWithRemainingSpace(item: ItemInstance): number {
      for (let i = 0; i < this.items.length; i++) {
        const it = this.items[i];
        if (
          it != null &&
          it.id === item.id &&
          it.isStackable() &&
          it.count < it.getMaxStackSize() &&
          it.count < this.getMaxStackSize() &&
          (!it.isStackedByData() || it.getAuxValue() === item.getAuxValue())
        ) {
          return i;
        }
      }
      return -1;
    }

    /** C++ protected */ getFreeSlot(): number {
      for (let i = this.numLinkedSlots; i < this.items.length; i++) {
        const it = this.items[i];
        if (it == null || it.isNull()) return i;
      }
      return -1;
    }

    /** C++ protected */ addResource(itemInstance: ItemInstance): number {
      const type = itemInstance.id;
      let count = itemInstance.count;
      if (itemInstance.getMaxStackSize() === 1) {
        const slot = this.getFreeSlot();
        if (slot < 0) return count;
        if (this.items[slot] == null) {
          this.items[slot] = ItemInstance.clone(itemInstance);
          this.linkEmptySlot(slot);
        } else if (this.items[slot]!.isNull()) {
          assignItem(this.items[slot]!, itemInstance);
          this.linkEmptySlot(slot);
        }
        return 0;
      }
      let slot = this.getSlotWithRemainingSpace(itemInstance);
      if (slot < 0) slot = this.getFreeSlot();
      if (slot < 0) return count;
      if (this.items[slot] == null) {
        this.items[slot] = new ItemInstance(type, 0, itemInstance.getAuxValue());
      } else if (this.items[slot]!.isNull()) {
        //@attn: added when doing chests
        assignItem(this.items[slot]!, new ItemInstance(type, 0, itemInstance.getAuxValue()));
      }
      this.linkEmptySlot(slot);
      const it = this.items[slot]!;
      let toAdd = count;
      if (toAdd > it.getMaxStackSize() - it.count) {
        toAdd = it.getMaxStackSize() - it.count;
      }
      if (toAdd > this.getMaxStackSize() - it.count) {
        toAdd = this.getMaxStackSize() - it.count;
      }
      if (toAdd === 0) return count;
      count -= toAdd;
      it.count += toAdd;
      return count;
    }

    /** C++ protected */ addItem(item: ItemInstance): number {
      for (let i = this.numLinkedSlots; i < this.items.length; ++i)
        if (!this.items[i]) {
          this.items[i] = item;
          return i;
        }
      const newSize = this.items.length + 1;
      if (this._isCreative && newSize > this.numTotalSlots) this.numTotalSlots = newSize;
      if (newSize <= this.numTotalSlots) {
        this.items.push(item);
        return newSize - 1;
      }
      LOGE(
        `Error@addItem: adding an item to an already full inventory: ${item.getDescriptionId()}!`,
      );
      return 0;
    }

    /** C++ protected */ release(slot: number): void {
      if (this.items[slot]) {
        this.items[slot] = null; // @itodo（C++ 先 delete）
      }
    }

    /** C++ protected */ fixBackwardCompabilityItem(item: ItemInstance): void {
      if (item.id === Tile.stoneSlabHalf.id)
        item.setAuxValue(item.getAuxValue() & StoneSlabTile.TYPE_MASK);
    }

    linkSlot(selectionSlot: number, inventorySlot: number, propagate: boolean): boolean {
      if (selectionSlot < 0 || selectionSlot >= this.numLinkedSlots) return false;
      if (inventorySlot < this.numLinkedSlots || inventorySlot >= this.numTotalSlots) return false;
      if (inventorySlot === this.linkedSlots[selectionSlot]!.inventorySlot) return false;
      if (propagate) {
        let i = 0;
        for (; i < this.numLinkedSlots - 1; ++i)
          if (this.linkedSlots[i]!.inventorySlot === inventorySlot) break;
        for (; i > selectionSlot; --i) {
          this.linkedSlots[i]!.inventorySlot = this.linkedSlots[i - 1]!.inventorySlot;
        }
      }
      this.linkedSlots[selectionSlot]!.inventorySlot = inventorySlot;
      return true;
    }

    linkEmptySlot(inventorySlot: number): boolean {
      for (let i = 0; i < this.numLinkedSlots; ++i)
        if (this.linkedSlots[i]!.inventorySlot === inventorySlot) return true;
      for (let i = 0; i < this.numLinkedSlots; ++i) {
        const item = this.getLinked(i);
        if (!item) {
          this.linkedSlots[i]!.inventorySlot = inventorySlot;
          return true;
        }
      }
      return false;
    }

    getLinked(slot: number): ItemInstance | null {
      if (slot < this.numLinkedSlots && slot >= 0) {
        const i = this.linkedSlots[slot]!.inventorySlot;
        return i >= this.numLinkedSlots && i < this.numTotalSlots ? (this.items[i] ?? null) : null;
      }
      return null;
    }

    compressLinkedSlotList(slot: number): void {
      let i = slot - 1;
      let j = 0;
      while (++i < this.numLinkedSlots) {
        this.linkedSlots[i - j]!.inventorySlot = this.linkedSlots[i]!.inventorySlot; // 结构体按值复制
        const item = this.getLinked(i);
        if (!item) ++j;
      }
      for (let k = i - j; k < i; ++k) this.linkedSlots[k]!.inventorySlot = -1;
    }

    /** std::vector::resize：截断或用 NULL 补齐 */
    /** C++ private */ resizeItems(n: number): void {
      const old = this.items.length;
      this.items.length = n;
      if (n > old) this.items.fill(null, old);
    }
  }
  void LOGI;
  return FillingContainerImpl;
}

class FillingContainerRoot {}

/** 单继承用（Inventory : FillingContainer） */
export class FillingContainer extends FillingContainerMixin(FillingContainerRoot) {
  constructor(
    numTotalSlots: number,
    numLinkedSlots: number,
    containerType: number,
    isCreative: boolean,
  ) {
    super();
    this.initFillingContainer(numTotalSlots, numLinkedSlots, containerType, isCreative);
  }
}
