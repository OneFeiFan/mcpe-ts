// 1:1 移植自 src/world/entity/player/OldInventory.h
import type { Tile } from '../../level/tile/Tile';
import type { Player } from './Player';

export class Inventory {
  // C++ static const int
  static readonly POP_TIME_DURATION = 5;
  static readonly MAX_SELECTION_SIZE = 9;
  static readonly INVENTORY_ROWS = 5;
  static readonly INVENTORY_COLS = 9;
  static readonly INVENTORY_SIZE = Inventory.INVENTORY_COLS * Inventory.INVENTORY_ROWS; // 45
  static readonly INVENTORY_SIZE_DEMO = 18;

  /** C++ public: int selected */
  public selected = 0;

  /** C++ protected: Player* player */
  protected player: Player;

  /** C++ protected: int itemIds[MAX_SELECTION_SIZE] (9) */
  protected itemIds: Int32Array = new Int32Array(Inventory.MAX_SELECTION_SIZE);

  /** C++ protected: int inventoryIds[INVENTORY_SIZE] (45) */
  protected inventoryIds: Int32Array = new Int32Array(Inventory.INVENTORY_SIZE);

  /** C++ Inventory::Inventory(Player* player_) */
  constructor(player: Player) {
    this.player = player;
  }

  /** C++ Inventory::selectSlot(int slot) */
  selectSlot(slot: number): void {
    // 需要 Inventory.cpp 的实现
    throw new Error('Inventory.selectSlot: not yet ported');
  }

  /** C++ Inventory::getSelectedItemId() */
  getSelectedItemId(): number {
    throw new Error('Inventory.getSelectedItemId: not yet ported');
  }

  /** C++ Inventory::getSelectionSlotItemId(int slot) */
  getSelectionSlotItemId(slot: number): number {
    throw new Error('Inventory.getSelectionSlotItemId: not yet ported');
  }

  /** C++ Inventory::setSelectionSlotItemId(int slot, int id) */
  setSelectionSlotItemId(slot: number, id: number): void {
    throw new Error('Inventory.setSelectionSlotItemId: not yet ported');
  }

  /** C++ Inventory::getDestroySpeed(Tile* tile) */
  getDestroySpeed(tile: Tile): number {
    throw new Error('Inventory.getDestroySpeed: not yet ported');
  }
}
