// 1:1 移植自 src/world/entity/player/OldInventory.h。
// C++ 侧只有这个头文件、没有 OldInventory.cpp，5 个成员函数只有声明没有定义；
// 全源码里没有任何文件包含它（类名也叫 Inventory，与正式的 Inventory 冲突），属于死代码。
// 这里只保留头文件里能 1:1 对应的常量、字段与构造函数声明；无定义的函数按 R3 登记 OMIT。
import type { Player } from './Player';

export class Inventory {
  // C++ static const int
  static readonly POP_TIME_DURATION = 5;
  static readonly MAX_SELECTION_SIZE = 9;
  static readonly INVENTORY_ROWS = 5;
  static readonly INVENTORY_COLS = 9;
  static readonly INVENTORY_SIZE = Inventory.INVENTORY_COLS * Inventory.INVENTORY_ROWS; // 45
  static readonly INVENTORY_SIZE_DEMO = 18;

  /** C++ public: int selected（C++ 未初始化，R3 取 0） */
  public selected = 0;

  /** C++ protected: Player* player（C++ 未初始化，构造函数无定义；TS 在构造函数里保存实参） */
  protected player: Player;

  /** C++ protected: int itemIds[MAX_SELECTION_SIZE]（C++ 未初始化，R3 取 0） */
  protected itemIds: Int32Array = new Int32Array(Inventory.MAX_SELECTION_SIZE);

  /** C++ protected: int inventoryIds[INVENTORY_SIZE]（C++ 未初始化，R3 取 0） */
  protected inventoryIds: Int32Array = new Int32Array(Inventory.INVENTORY_SIZE);

  /** C++ 只有 `Inventory(Player* player_)` 声明、没有定义；这里保留声明所需的字段赋值。 */
  constructor(player: Player) {
    this.player = player;
  }

  // OMIT(Inventory): void Inventory::selectSlot(int slot)  OldInventory.h:14（C++ 无 .cpp，只有声明没有定义）
  // OMIT(Inventory): int Inventory::getSelectedItemId()  OldInventory.h:15（同上）
  // OMIT(Inventory): int Inventory::getSelectionSlotItemId(int slot)  OldInventory.h:16（同上）
  // OMIT(Inventory): void Inventory::setSelectionSlotItemId(int slot, int id)  OldInventory.h:17（同上）
  // OMIT(Inventory): float Inventory::getDestroySpeed(Tile* tile)  OldInventory.h:18（同上）
}
