/**
 * 1:1 移植自 src/world/entity/player/Inventory.h 与 Inventory.cpp（S12 阶段 C）。替换前向声明。
 * setupDefault 按网页版的构建取分支：没有定义 DEMO_MODE、RPI、WIN32（创造模式的默认物品栏是完整版本）。
 * 由 C++ 类转写脚本生成初稿后人工核对。
 */
import { LOGE, LOGI } from '@mcpe/platform';
import { ContainerType } from '../../Container';
import { FillingContainer, LinkedSlot } from '../../inventory/FillingContainer';
import { DyePowderItem } from '../../item/DyePowderItem';
import type { Entity } from '../Entity';
import type { Player } from './Player';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import { Tile } from '../../level/tile/Tile';
import { StoneSlabTile } from '../../level/tile/StoneSlabTile';
import { QuartzBlockTile } from '../../level/tile/QuartzBlockTile';

export class Inventory extends FillingContainer {
  static readonly INVENTORY_SIZE_DEMO = 27;
  static readonly MAX_SELECTION_SIZE = 9;
  static readonly POP_TIME_DURATION = 5;
  selected: number = 0;
  player!: Player;

  constructor(player: Player, creativeMode: boolean) {
    super(
      36 + Inventory.MAX_SELECTION_SIZE,
      Inventory.MAX_SELECTION_SIZE,
      ContainerType.INVENTORY,
      creativeMode,
    );
    this.player = player;
    this.selected = 0;
    this.setupDefault();
    this.compressLinkedSlotList(0);
  }

  // OMIT(Inventory): Inventory::~Inventory() {}  Inventory.cpp:23（空析构函数，R3 不移植）

  override clearInventoryWithDefault(): void {
    this.clearInventory();
    this.setupDefault();
  }

  selectSlot(slot: number): void {
    if (slot < Inventory.MAX_SELECTION_SIZE && slot >= 0) this.selected = slot;
  }

  getSelected(): ItemInstance | null {
    return this.getLinked(this.selected);
  }

  /** C++ `static int Inventory::getSelectionSize()` */
  static getSelectionSize(): number {
    return Inventory.MAX_SELECTION_SIZE;
  }

  moveToSelectionSlot(selectionSlot: number, inventorySlot: number, propagate: boolean): boolean {
    return this.linkSlot(selectionSlot, inventorySlot, propagate);
  }

  moveToSelectedSlot(inventorySlot: number, propagate: boolean): boolean {
    return this.linkSlot(this.selected, inventorySlot, propagate);
  }

  moveToEmptySelectionSlot(inventorySlot: number): boolean {
    return this.linkEmptySlot(inventorySlot);
  }

  /**
   * C++ 的 removeItem(const ItemInstance* samePtr)：与 FillingContainer::removeItem(slot, count) 不同的重载（R10 情形 B）。
   * C++ 的调用者：ArmorScreen（已接线）、ServerSideNetworkHandler.cpp:942/966（网络，DEFERRED(Network)）。
   */
  removeItemInstance(samePtr: ItemInstance): boolean {
    for (let i = Inventory.MAX_SELECTION_SIZE; i < Math.trunc(this.items.length); ++i) {
      if (this.items[i] === samePtr) {
        this.clearSlot(i);
        return true;
      }
    }
    return false;
  }

  override doDrop(item: ItemInstance, randomly: boolean): void {
    this.player.drop(item, randomly);
  }

  override stillValid(player: Player): boolean {
    if (this.player.removed) return false;
    if (player.distanceToSqr(this.player) > 8 * 8) return false;
    return true;
  }

  override add(item: ItemInstance): boolean {
    if (this._isCreative || this.player.hasFakeInventory) return true;

    return super.add(item);
  }

  getAttackDamage(entity: Entity): number {
    let item = this.getSelected();
    if (item !== null) return item.getAttackDamage(entity);
    return 1;
  }

  getDestroySpeed(tile: Tile): number {
    let item = this.getSelected();
    if (item && item.id >= 256) {
      return Item.items[item.id]!.getDestroySpeed(null, tile);
    }
    return 1.0; // C++ 是 `1.0f`：f(1.0) === 1，结果相同
  }

  canDestroy(tile: Tile): boolean {
    if (tile.material.isAlwaysDestroyable()) return true;

    let item = this.getSelected();
    if (item !== null) return item.canDestroySpecial(tile);
    return false;
  }

  print(): void {
    // C++ 的 LOGI 是 printf 宏；TS 的 LOGI 直接把参数交给 console，所以格式串要自己拼。
    LOGI(`${this.player.name}'s Inventory:\n`);

    for (let i = 0; i < this.numTotalSlots; i++) {
      let item = this.getItem(i);
      if (item)
        LOGI(
          `\t ${i}: ${item.getName()} (${item.count}) ${this.player.inventory.getLinked(i) ? '(Linked)' : ''}\n`,
        );
    }
  }

  private setupDefault(): void {
    this.clearInventory();
    const Sel = new Array<number>(Inventory.MAX_SELECTION_SIZE).fill(0);

    if (this._isCreative) {
      Sel[1] = this.addItem(new ItemInstance(Tile.stoneBrick));
      this.addItem(new ItemInstance(Tile.stoneBrickSmooth, 1, 0));
      this.addItem(new ItemInstance(Tile.stoneBrickSmooth, 1, 1));
      this.addItem(new ItemInstance(Tile.stoneBrickSmooth, 1, 2));
      this.addItem(new ItemInstance(Tile.mossStone));
      Sel[5] = this.addItem(new ItemInstance(Tile.wood));
      Sel[2] = this.addItem(new ItemInstance(Tile.redBrick));

      Sel[0] = this.addItem(new ItemInstance(Tile.rock));
      Sel[4] = this.addItem(new ItemInstance(Tile.dirt));
      this.addItem(new ItemInstance(Tile.grass));
      this.addItem(new ItemInstance(Tile.clay));
      this.addItem(new ItemInstance(Tile.sandStone, 1, 0));
      this.addItem(new ItemInstance(Tile.sandStone, 1, 1));
      this.addItem(new ItemInstance(Tile.sandStone, 1, 2));
      this.addItem(new ItemInstance(Tile.sand));
      this.addItem(new ItemInstance(Tile.gravel));

      Sel[7] = this.addItem(new ItemInstance(Tile.treeTrunk, 1, 0));
      this.addItem(new ItemInstance(Tile.treeTrunk, 1, 1));
      this.addItem(new ItemInstance(Tile.treeTrunk, 1, 2));
      this.addItem(new ItemInstance(Tile.netherBrick));
      this.addItem(new ItemInstance(Tile.netherrack));
      this.addItem(new ItemInstance(Tile.stairs_stone));
      this.addItem(new ItemInstance(Tile.stairs_wood));
      Sel[6] = this.addItem(new ItemInstance(Tile.stairs_brick));
      this.addItem(new ItemInstance(Tile.stairs_sandStone));
      this.addItem(new ItemInstance(Tile.stairs_stoneBrickSmooth));
      this.addItem(new ItemInstance(Tile.stairs_netherBricks));
      this.addItem(new ItemInstance(Tile.stairs_quartz));
      this.addItem(new ItemInstance(Tile.stoneSlabHalf, 1, StoneSlabTile.STONE_SLAB));
      this.addItem(new ItemInstance(Tile.stoneSlabHalf, 1, StoneSlabTile.COBBLESTONE_SLAB));
      this.addItem(new ItemInstance(Tile.stoneSlabHalf, 1, StoneSlabTile.WOOD_SLAB));
      this.addItem(new ItemInstance(Tile.stoneSlabHalf, 1, StoneSlabTile.BRICK_SLAB));
      this.addItem(new ItemInstance(Tile.stoneSlabHalf, 1, StoneSlabTile.SAND_SLAB));
      this.addItem(new ItemInstance(Tile.stoneSlabHalf, 1, StoneSlabTile.SMOOTHBRICK_SLAB));

      this.addItem(new ItemInstance(Tile.quartzBlock, 1, QuartzBlockTile.TYPE_DEFAULT));
      this.addItem(new ItemInstance(Tile.quartzBlock, 1, QuartzBlockTile.TYPE_LINES));
      this.addItem(new ItemInstance(Tile.quartzBlock, 1, QuartzBlockTile.TYPE_CHISELED));

      this.addItem(new ItemInstance(Tile.coalOre));
      this.addItem(new ItemInstance(Tile.ironOre));
      this.addItem(new ItemInstance(Tile.goldOre));
      this.addItem(new ItemInstance(Tile.emeraldOre));
      this.addItem(new ItemInstance(Tile.lapisOre));
      this.addItem(new ItemInstance(Tile.redStoneOre));

      this.addItem(new ItemInstance(Tile.goldBlock));
      this.addItem(new ItemInstance(Tile.ironBlock));
      this.addItem(new ItemInstance(Tile.emeraldBlock));
      this.addItem(new ItemInstance(Tile.lapisBlock));
      this.addItem(new ItemInstance(Tile.obsidian));
      this.addItem(new ItemInstance(Tile.snow));
      this.addItem(new ItemInstance(Tile.glass));
      this.addItem(new ItemInstance(Tile.lightGem));

      this.addItem(new ItemInstance(Tile.netherReactor));

      this.addItem(new ItemInstance(Tile.cloth, 1, 0));
      this.addItem(new ItemInstance(Tile.cloth, 1, 7));
      this.addItem(new ItemInstance(Tile.cloth, 1, 6));
      this.addItem(new ItemInstance(Tile.cloth, 1, 5));
      this.addItem(new ItemInstance(Tile.cloth, 1, 4));
      this.addItem(new ItemInstance(Tile.cloth, 1, 3));
      this.addItem(new ItemInstance(Tile.cloth, 1, 2));
      this.addItem(new ItemInstance(Tile.cloth, 1, 1));

      this.addItem(new ItemInstance(Tile.cloth, 1, 15));
      this.addItem(new ItemInstance(Tile.cloth, 1, 14));
      this.addItem(new ItemInstance(Tile.cloth, 1, 13));
      this.addItem(new ItemInstance(Tile.cloth, 1, 12));
      this.addItem(new ItemInstance(Tile.cloth, 1, 11));
      this.addItem(new ItemInstance(Tile.cloth, 1, 10));
      this.addItem(new ItemInstance(Tile.cloth, 1, 9));
      this.addItem(new ItemInstance(Tile.cloth, 1, 8));
      this.addItem(new ItemInstance(Tile.ladder));
      Sel[3] = this.addItem(new ItemInstance(Tile.torch));
      this.addItem(new ItemInstance(Tile.thinGlass));

      this.addItem(new ItemInstance(Item.door_wood));
      this.addItem(new ItemInstance(Tile.trapdoor));
      this.addItem(new ItemInstance(Tile.fence));
      this.addItem(new ItemInstance(Tile.fenceGate));

      this.addItem(new ItemInstance(Item.bed));
      this.addItem(new ItemInstance(Tile.bookshelf));
      this.addItem(new ItemInstance(Item.painting));
      this.addItem(new ItemInstance(Tile.workBench));
      this.addItem(new ItemInstance(Tile.stonecutterBench));
      this.addItem(new ItemInstance(Tile.chest));
      this.addItem(new ItemInstance(Tile.furnace));
      this.addItem(new ItemInstance(Tile.tnt));

      this.addItem(new ItemInstance(Tile.flower));
      this.addItem(new ItemInstance(Tile.rose));
      this.addItem(new ItemInstance(Tile.mushroom1));
      this.addItem(new ItemInstance(Tile.mushroom2));
      this.addItem(new ItemInstance(Tile.cactus));
      this.addItem(new ItemInstance(Tile.melon));
      this.addItem(new ItemInstance(Item.reeds));
      Sel[8] = this.addItem(new ItemInstance(Tile.sapling, 1, 0));
      this.addItem(new ItemInstance(Tile.sapling, 1, 1));
      this.addItem(new ItemInstance(Tile.sapling, 1, 2));
      this.addItem(new ItemInstance(Tile.leaves, 1, 0));
      this.addItem(new ItemInstance(Tile.leaves, 1, 1));
      this.addItem(new ItemInstance(Tile.leaves, 1, 2));

      this.addItem(new ItemInstance(Item.seeds_wheat));
      this.addItem(new ItemInstance(Item.seeds_melon));
      this.addItem(new ItemInstance(Item.dye_powder, 1, DyePowderItem.WHITE));
      this.addItem(new ItemInstance(Item.hoe_iron));
      this.addItem(new ItemInstance(Item.flintAndSteel));
      this.addItem(new ItemInstance(Item.sword_iron));
      this.addItem(new ItemInstance(Item.bow));
      this.addItem(new ItemInstance(Item.sign));
    } else {
    }

    for (let i = 0; i < this.items.length; ++i) {
      let item = this.items[i];

      if (i < Inventory.MAX_SELECTION_SIZE) {
        // C++ 是 `LOGE("Error: Should not have items on slot %i\n", i)`（printf 宏）
        if (item) LOGE(`Error: Should not have items on slot ${i}\n`);

        this.items[i] = null;
        continue;
      }

      if (item && this._isCreative) item.count = 5;
    }

    for (let i = 0; i < Inventory.MAX_SELECTION_SIZE; ++i) {
      this.linkedSlots[i] = new LinkedSlot(Sel[i]!); // 结构体按值赋值
    }
  }
}
