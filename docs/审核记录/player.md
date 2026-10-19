# world/entity/player

对照：`src/world/entity/player/*.h` / `*.cpp` ↔ `packages/world/src/entity/player/*.ts`。
第 2 批的一部分，按 `docs/全量审核方案.md` 逐函数审核。

## Abilities（src/world/entity/player/Abilities.h ↔ packages/world/src/entity/player/Abilities.ts）

C++ 只有头文件、没有 `.cpp`，两个方法都是内联实现。工作表 3 行，结论如下。

| 函数 / 成员                            | 结论                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 构造函数初始化列表（4 个 bool）        | 一致：C++ `invulnerable(false), flying(false), mayfly(false), instabuild(false)`；TS 四个字段初始化器同为 `false`，声明顺序也相同。工作表把最后一项 `instabuild(false)` 误列成“缺失方法”——它是初始化列表的一项，不是方法                                                                                                         |
| `addSaveData(CompoundTag* parentTag)`  | 怪癖保留：C++ 原句 `tag->putBoolean("flying", invulnerable);` —— 写 `flying` 键时用的是 `invulnerable` 的值（原版 bug）。TS 第 17 行照抄并有注释。其余三行键/值一一对应；`parentTag->put("abilities", tag)` ↔ `parentTag.put('abilities', tag)`（TS 的 `put` 与 C++ 一样先 `setName`、再按 `std::map::insert` 语义不覆盖已有键） |
| `loadSaveData(CompoundTag* parentTag)` | 一致：`contains("abilities")` 只查键存在（不查类型）→ `getCompound`（键存在但类型不是 TAG_Compound 时返回新建空标签）→ 四个 `getBoolean`（`getByte != 0`，类型不符得 false）。TS 的 `CompoundTag` 实现逐项核对过，语义相同                                                                                                       |

补充核对（TS 侧 `CompoundTag`，属 nbt 包已审范围）：`put` 先 `tag.setName(name)` 再 `insertNew`
（不覆盖同名键）、`putBoolean` 写 `1/0`、`getBoolean` 为 `getByte(name) !== 0`、`getCompound`
缺键/类型不符时 `new CompoundTag(name)` —— 均与 C++ `CompoundTag.h` 的内联实现一致。

**调用点**：在参考 C++ 全源码里 `grep` `addSaveData` / `loadSaveData` 只有这两个定义、没有调用者
（`Player.cpp` 也没有调用）。TS 同样无调用点，属于原样保留的死代码，不算 DEFERRED。

## 结论（Abilities）

`Abilities.ts` 审核完成：工作表 3 行全部有结论，两个方法一致或怪癖保留（原版 `flying` 写入 bug
照抄），无代码修改、无新增 DEFERRED/OMIT，台账不变（157）。

## Inventory（src/world/entity/player/Inventory.h / .cpp ↔ packages/world/src/entity/player/Inventory.ts）

18 行工作表全部有结论。C++ 的 `setupDefault` 在网页版构建里展开的是 `#else` 的完整物品表
（`DEMO_MODE`、`RPI`、`WIN32` 都没定义），TS 取的正是这一支；`INVENTORY_SIZE_DEMO = 27` 与
`POP_TIME_DURATION = 5` 在 C++ 里除定义外零使用，TS 保留常量。

| 函数 / 成员                               | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Inventory(Player*, bool)`                | 一致：`super(36 + MAX_SELECTION_SIZE, MAX_SELECTION_SIZE, ContainerType::INVENTORY, creativeMode)`、`player(player)`、`selected(0)`，然后 `setupDefault()` → `compressLinkedSlotList(0)`，顺序相同。成员初始化顺序按 C++ 声明（`selected` 在 `player` 前）也一致                                                                                                                                                                                                      |
| `~Inventory()`                            | 不移植（空析构函数，R3）。**新增 OMIT 行**（以前漏登记，台账 157 → 158）                                                                                                                                                                                                                                                                                                                                                                                              |
| `getSelected()`                           | 一致：`return getLinked(selected)`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `selectSlot(int slot)`                    | 一致：`slot < MAX_SELECTION_SIZE && slot >= 0` 才改 `selected`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `moveToSelectedSlot(int, bool)`           | 一致：`linkSlot(selected, inventorySlot, propagate)`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `getSelectionSize()`                      | **已修 W19**：C++ 是 `static int`，TS 写成了实例方法（`getSelectionSize()`）。行为相同、但按实例调用会误导调用方，且与 C++ 的类型不符；改为 `static getSelectionSize()`。C++ 全源码里除定义外零调用点                                                                                                                                                                                                                                                                 |
| `setupDefault()`                          | 一致：`clearInventory()` → `int Sel[9] = {0}` → 创造模式按顺序 104 次 `addItem`（已用脚本归一化逐条对比，104 条与 C++ 一一对应，顺序相同）→ 清空选中区 → 创造模式把每格 `count` 改成 5 → `linkedSlots[i] = LinkedSlot(Sel[i])`。**已修 W19**：日志原句是 `LOGE("Error: Should not have items on slot %i\n", i)`，TS 以前写成 `'Error: Should not have this.items on slot %i\n'` —— 文字多了 `this.`、且 printf 格式串不会被 TS 的 LOGI 替换，改为模板字符串并改正文字 |
| `clearInventoryWithDefault()`             | 一致：`clearInventory()` + `setupDefault()`。C++ 的基类 `FillingContainer::clearInventoryWithDefault` 只有声明没有定义；TS 基类保留空实现（带注释）                                                                                                                                                                                                                                                                                                                   |
| `getAttackDamage(Entity*)`                | 一致：选中物品非空 → `item->getAttackDamage(entity)`，否则 1                                                                                                                                                                                                                                                                                                                                                                                                          |
| `canDestroy(Tile*)`                       | 一致：`tile->material->isAlwaysDestroyable()` 为真直接 true；否则选中物品非空 → `canDestroySpecial(tile)`；否则 false                                                                                                                                                                                                                                                                                                                                                 |
| `getDestroySpeed(Tile*)`                  | 一致：选中物品 `id >= 256` → `Item::items[id]->getDestroySpeed(NULL, tile)`；否则 `1.0f`（TS 的 `1.0` 与 `f(1.0)` 相同，已加注释）。C++ 返回类型是 float，`Item.getDestroySpeed` 返回 int，TS 侧同样是 int 自动转 number                                                                                                                                                                                                                                              |
| `moveToSelectionSlot(int, int, bool)`     | 一致：`linkSlot(selectionSlot, inventorySlot, propagate)`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `moveToEmptySelectionSlot(int)`           | 一致：`linkEmptySlot(inventorySlot)`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `doDrop(ItemInstance*, bool)`             | 一致：`player->drop(item, randomly)`。C++ 的形参是指针且不删除；TS 传对象引用，`Player.drop` 会 `new ItemInstance(item)` 拷贝后再生成掉落物                                                                                                                                                                                                                                                                                                                           |
| `stillValid(Player*)`                     | 一致：`this->player->removed` → false；`player->distanceToSqr(this->player) > 8 * 8` → false；否则 true（8 格整不算超过）                                                                                                                                                                                                                                                                                                                                             |
| `add(ItemInstance*)`                      | 一致：`_isCreative                                                                                                                                                                                                                                                                                                                                                                                                                                                    |     | player->hasFakeInventory`→ true，否则`super::add(item)`。TS 的 `super.add`形参是`ItemInstance \| null`（基类与 C++ 一样能接 NULL），调用处直接传非空值，无 ADAPTED 需要 |
| `removeItem(const ItemInstance* samePtr)` | 一致：从 `MAX_SELECTION_SIZE` 到 `items.size()` 找**指针相等**的项，`clearSlot(i)` 后返回 true，否则 false。R10 改名 `removeItemInstance`（已登记在 `docs/移植规范.md`）。C++ 调用者：`ArmorScreen.cpp:226`（TS 已接线）、`ServerSideNetworkHandler.cpp:942/966`（网络，DEFERRED）—— 已补进注释                                                                                                                                                                       |
| `print()`                                 | **已修 W19**：C++ 的 `LOGI` 是 `printf` 宏；TS 的 LOGI 只是 console 转发，不会替换 `%s` / `%i`。原 TS 把格式串原样传进去，实际输出会是 `%s's Inventory:` 和 `\t %i: %s (%i) %s`。改为模板字符串，输出文字与 C++ 相同                                                                                                                                                                                                                                                  |

补充核对：

- `addItem` 返回的是**槽位号**（C++ `int addItem(ItemInstance*)`），`setupDefault` 的 `Sel[i] = addItem(...)`
  存的也是槽位号，TS 一致。
- 生存模式（`_isCreative == false`）的 `setupDefault` 只清空、不加物品，`else {}` 空分支照抄。
- `print()` 的循环上界是 `numTotalSlots`（C++ 同）；`getItem(i)` 对选中槽返回链接到的物品，
  `getLinked(i)` 为真时打 `(Linked)`，与 C++ 相同。

**W19 验证**：新增 `tests/unit/world/inventory-audit.test.ts`（13 条）。撤掉三处修复后重跑，
`getSelectionSize`（静态）、`print`（格式串）、`setupDefault` 的 LOGE（文字与插值）三条会红；
恢复后 13 条全绿。既有 `tests/golden/inventory.golden.test.ts`（G12-3）逐字节钉住创造模式
104 个物品、9 个链接槽与存档 NBT，不受本次修改影响（仍然通过）。

## 结论（Inventory）

`Inventory.ts` 审核完成：18 行工作表全部有结论。修复 1 个编号 W19（含三处：静态方法、两处 printf
格式串）；新增 1 条 OMIT（空析构函数）；台账 157 → 158。新增审核测试 13 条。

## InventorySlotManager（src/world/entity/player/InventorySlotManager.h ↔ packages/world/src/entity/player/InventorySlotManager.ts）

C++ 头文件里只有一个空类：`class InventorySlotManager { };`，没有 `.cpp`。工作表 0 行。

| 检查项 | 结论                                                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 类体   | 一致：两侧都没有任何成员（用脚本逐行取类体，C++ / TS 均为空）                                                                                                                     |
| 引用   | C++ 全源码 `grep InventorySlotManager` 只有头文件自身的 4 行（include guard 两行 + `class` 行 + `#endif`）—— 零引用；TS 侧只在 `packages/world/src/index.ts:182` 导出，没有使用点 |

## 结论（InventorySlotManager）

`InventorySlotManager.ts` 审核完成：空类与 C++ 一致，无代码修改、无新增台账条目。

## OldInventory（src/world/entity/player/OldInventory.h ↔ packages/world/src/entity/player/OldInventory.ts）

C++ 只有 `OldInventory.h`，**没有 `OldInventory.cpp`**；5 个成员函数只有声明没有定义；类名也叫
`Inventory`，与正式的 `Inventory` 冲突。全源码 `grep OldInventory` 零结果，也没有任何文件包含这个头文件
（是旧版本残留的死代码）。工作表把 5 个方法列进了“TS 里有、C++ 没有”，是因为 C++ 类名也叫
`Inventory`、工作表按文件名匹配不到类；实际上两侧签名一一对应。

| 函数 / 成员                                                                                                                              | 结论                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6 个 `static const int` 常量                                                                                                             | 一致：`POP_TIME_DURATION=5`、`MAX_SELECTION_SIZE=9`、`INVENTORY_ROWS=5`、`INVENTORY_COLS=9`、`INVENTORY_SIZE=COLS*ROWS`（=45）、`INVENTORY_SIZE_DEMO=18`，脚本逐项对比表达式也相同（TS 只是加了 `Inventory.` 前缀）                                 |
| `int selected`                                                                                                                           | 一致：C++ 未初始化（构造函数无定义），按 R3 取 0，已在注释里注明                                                                                                                                                                                    |
| `Player* player`                                                                                                                         | 一致：字段类型对应；C++ 构造函数无定义，TS 在构造函数里保存实参（这是 TS 侧唯一有函数体的成员，见下）                                                                                                                                               |
| `int itemIds[MAX_SELECTION_SIZE]` / `int inventoryIds[INVENTORY_SIZE]`                                                                   | 一致：`Int32Array(9)` / `Int32Array(45)`，C++ 未初始化 → 按 R3 取 0                                                                                                                                                                                 |
| `Inventory(Player*)`                                                                                                                     | 一致：C++ 只有声明没有定义；TS 保留字段赋值（与 C++ 头文件声明的唯一可对应行为）                                                                                                                                                                    |
| `selectSlot(int)` / `getSelectedItemId()` / `getSelectionSlotItemId(int)` / `setSelectionSlotItemId(int,int)` / `getDestroySpeed(Tile*)` | **已修**：C++ 无 `.cpp`、这 5 个函数只有声明没有定义，没有可移植的实现。TS 以前写成 `throw new Error('... not yet ported')` 桩，违反 R3（“不写桩函数体”），且“not yet ported”会让人以为以后要移植。改为 5 行 `OMIT(Inventory): ...`，台账 158 → 163 |

补充核对：

- 旧头文件里的类名是 `Inventory`，与 `packages/world/src/entity/player/Inventory.ts` 的正式类同名；
  TS 侧不在 `index.ts` 导出它（`index.ts:183` 有注释说明），与 C++ 全源码零引用的状态一致。
- 这 5 个函数的签名在 TS 里删除后，没有调用点需要改（`grep` 全仓库只有它自己的定义）。
- 字段与常量保留：它们是头文件里真实存在、能 1:1 对应的部分，将来若有人翻出旧 `.cpp` 可直接续写。

## 结论（OldInventory）

`OldInventory.ts` 审核完成：常量与字段一致；5 个只有声明没有定义的函数按 R3 改为 OMIT 标记，
台账 158 → 163。无新增测试（没有可执行的行为可测，原有测试不受影响）。

## Player（src/world/entity/player/Player.h / .cpp ↔ packages/world/src/entity/player/Player.ts）

工作表 79 行全部有结论。C++ 的 `Player.cpp` 用 `clean.py` 展开网页版构建后逐函数对照；
`DEMO_MODE` / `RPI` / `WIN32` 分支都不存在。

| # | 函数 | 结论 |
| --- | --- | --- |
| 1 | `Player(Level*, bool)` | 一致。成员初始化列表顺序与 C++ 声明顺序相同；`_init()` 写成 `Player.prototype._init.call(this)`，因为 C++ 构造期调虚函数只会调到本类版本（ADAPTED(Cpp)，已有注释） |
| 2 | `~Player()` | **OMIT**（新增）：函数体只有 `delete inventory;`，JS 由 GC 接管 |
| 3 | `isSleeping()` | 一致 |
| 4 | `startSleepInBed` | **已修 W20**：`heightOffset = 0.2f`、`xo/zo`、`y + 15.0f/16.0f`、`x + 0.5f` 等全部按 float 分步 |
| 5 | `stopSleepInBed` | **已修 W20**：`Pos standUp = bedPosition` 是值拷贝（TS 以前是引用，`findStandUpPosition` 写输出参数会把 `this.bedPosition` 一起改掉）；`standUp.x + 0.5f`、`standUp.y + heightOffset + 0.1f` 按 float 分步 |
| 6 | `getSleepTimer()` | 一致 |
| 7 | `setAllPlayersSleeping()` | 一致 |
| 8 | `setBedOffset(int)` | **已修 W20**：四个分支的 `±1.8f` 用 `f()` |
| 9 | `isSleepingLongEnough()` | 一致 |
| 10 | `getSleepRotation()` | 一致：四方向 90 / 0 / 270 / 180 |
| 11 | `checkBed()` | 一致 |
| 12 | `tick()` | 一致：睡眠状态机、火方块 `hurt(NULL, 1)`、`onFire = 20 * 15`、`foodData.tick(this)` 都在 |
| 13 | `getMaxHealth()` | 一致 |
| 14 | `isUsingItem()` | 一致 |
| 15 | `getUseItem()` | 一致：返回成员引用（C++ 返回 `&useItem`） |
| 16 | `spawnEatParticles` | **已修 W20**：粒子/声音参数全部按 float 分步。最后一句 `playSound(this, "random.eat", .5f + .5f * random.nextInt(2), (random.nextFloat() - random.nextFloat()) * 0.2f + 1.0f)` 两个实参都取随机数，C++ 求值顺序未指定 → **DEFERRED(待确认)**，暂按从左到右（与 Entity/Mob/ItemEntity 的先例一致） |
| 17 | `startUsingItem` | 一致：`instance == useItem` 是 `operator==`（比内容）→ `equals`；`useItem = instance` 是复制 → `new ItemInstance(instance)` |
| 18 | `stopUsingItem()` | 一致 |
| 19 | `releaseUsingItem()` | 一致 |
| 20 | `completeUsingItem()` | 一致：`*selected = useItem` 用 `init(id, count, aux)` 按值赋值 |
| 21 | `getUseItemDuration()` | 一致 |
| 22 | `getTicksUsingItem()` | 一致 |
| 23 | `travel(float, float)` | **已修 W20**：`flyingSpeed = 0.05f`、`yd = ydo * 0.6f`；`ydo` 在 `super.travel` 之前取值（C++ 原顺序） |
| 24 | `isImmobile()` | 一致（protected） |
| 25 | `closeContainer()` | 一致（protected） |
| 26 | `resetPos(bool)` | **已修 W20**：`heightOffset = f(1.62)` |
| 27 | `updateAi()` | 一致（protected） |
| 28 | `getItemInHandIcon` | **已修 W20**：`(2 * MAX_DRAW_DURATION) / 3` 两边都是 int → `Math.trunc(40 / 3) = 13`（以前算成 13.33，`ticksHeld = 13` 会误进 7 档） |
| 29 | `aiStep()` | **已修 W20**：`tBob` / `tTilt` / `bob` / `tilt` 每一步 `f()` |
| 30 | `touch(Entity*)` | 一致（private） |
| 31 | `getScore()` | 一致 |
| 32 | `die(Entity*)` | **已修 W20**：`yd = f(0.1)`、`heightOffset = f(0.1)`、`angle` / `xd` / `zd` 按 float 分步 |
| 33 | `reset()` | 一致：`Player.prototype._init.call(this)`（C++ 的 `_init` 不是 virtual，不能派发到子类） |
| 34 | `_init()` | 一致 |
| 35 | `getWalkingSpeedModifier()` | 一致 |
| 36 | `awardKillScore` | 一致 |
| 37 | `isShootable()` | 一致 |
| 38 | `isCreativeModeAllowed()` | 一致 |
| 39 | `drop(ItemInstance*, bool)` | **已修 W20**：初始 y、两个分支的 `pow` / `dir` / `xd` / `yd` / `zd` 全部按 float 分步；`throwTime = 40`；`(random.nextFloat() - random.nextFloat())` 的求值顺序按先例从左到右 |
| 40 | `getDestroySpeed(Tile*)` | 一致 |
| 41 | `canDestroy(Tile*)` | 一致 |
| 42 | `readAdditionalSaveData` | **已修 W20**：`SleepTimer` 按 short 语义 `(v << 16) >> 16`。**ADAPTED(Cpp)**：C++ 的 `Mob.h:104-105` 把该虚函数重新声明成 public、`Player.h:109` 又收窄回 protected；TS 不允许子类把 public 收窄成 protected（TS2415），只能保持 public |
| 43 | `addAdditonalSaveData` | **已修 W20**：`SleepTimer` 写回前同样按 short 截断。**ADAPTED(Cpp)**：同 #42 的可见性 |
| 44 | `startCrafting` | 一致（空函数） |
| 45 | `startStonecutting` | 一致（空函数） |
| 46 | `openFurnace` | 一致（空函数） |
| 47 | `take` | 一致（空函数） |
| 48 | `getHeadHeight()` | **已修 W20**：返回 `f(0.12)`（以前是 double `0.12`） |
| 49 | `setDefaultHeadHeight()` | **已修 W20**：`f(1.62)` |
| 50 | `isHurt()` | 一致 |
| 51 | `hurt(Entity*, int)` | **已修 W20**：EASY `dmg / 3 + 1`、HARD `dmg * 3 / 2` 是整数运算（`Math.trunc`）；PEACEFUL 归零、`dmg == 0` 返回 false 一致 |
| 52 | `interact(Entity*)` | 一致，R10 改名 `interactWith`（与 `Entity::interact(Player*)` 区分），已登记 |
| 53 | `attack(Entity*)` | 一致：`instabuild != true` 才 `hurtEnemy` |
| 54 | `respawn()` | 一致（空函数） |
| 55 | static `animateRespawn(Player*, Level*)` | **ADAPTED(Cpp)**：R10 改名 `animateRespawnFor`，可见性保持 C++ 的 protected static（测试里用 `@ts-expect-error` 钉住） |
| 56 | `animateRespawn()` | 一致（空函数） |
| 57 | `getCarriedItem()` | 一致 |
| 58 | `remove()` | 一致：先 `invisible = true` 再 `super.remove()` |
| 59 | `isInWall()` | 一致 |
| 60 | `hasResource(int)` | 一致 |
| 61 | `displayClientMessage` | 一致（空函数，由子类重写） |
| 62 | `getRespawnPosition()` | **已修 W20**：C++ 按值返回 `Pos`，改为 `clone()`（以前返回内部对象，调用方改返回值会改到成员） |
| 63 | `setRespawnPosition` | 一致：`y < 0` 清 `playerHasRespawnPosition`，并复制实参 |
| 64 | `isPlayer()` | 一致 |
| 65 | static `isPlayer(Entity*)` | 一致：`e && e->isPlayer()` |
| 66 | static `asPlayer(Entity*)` | 一致 |
| 67 | `openContainer` | 一致（空函数） |
| 68 | `tileEntityDestroyed` | 一致 |
| 69 | `canUseCarriedItemWhileMoving` | 一致：弓或食物 |
| 70 | `handleEntityEvent(char)` | 一致：`USE_ITEM_COMPLETE` → `completeUsingItem`，否则交父类 |
| 71 | `getSelectedItem()` | 一致 |
| 72 | `hasRespawnPosition()` | 一致 |
| 73 | `openTextEdit` | 一致（空函数） |
| 74 | `getArmor(int)` | 一致：越界或空槽返回 NULL |
| 75 | `setArmor(int, const ItemInstance*)` | 一致：NULL → `setNull()`，否则 `armor[slot] = *item` 复制 |
| 76 | `hurtArmor(int)` | **已修 W20**：`dmg / 4` 是整数除法（以前把小数写进 `auxValue`） |
| 77 | `getArmorTypeHash()` | 一致：四个 id 按 0/8/16/24 位移相加 |
| 78 | `getArmorValue()` | 一致：只累加 `isArmorItem` 的 `defense` |
| 79 | `getEntityTypeId()` | 一致：返回 0 |

补充核对：

- `saveArmor` / `loadArmor` 两个文件内 static 函数一致（`ListTag` 4 项、`Mth::Min(4, size)`、只读 `TAG_Compound`）。
- `tick()` 里 `sleepCounter++` 后 `> SLEEP_DURATION` 才夹到 100；`else if` 分支 `>= SLEEP_DURATION + WAKE_UP_DURATION` 归零——与 C++ 一致。
- `stopSleepInBed` 的 `if (true || saveRespawnPoint)` 原样保留（原版永远为真）。
- `readAdditionalSaveData` 的键、`contains` 的五个条件、`else` 分支重置 `bedPosition = (0,0,0)`、末尾 `playerHasRespawnPosition = respawnPosition.y >= 0` 均一致。

**W20 验证**：新增 `tests/unit/world/player-audit.test.ts`（24 条）。撤掉 11 处修复后重跑，
9 条变红（整数除法、`standUp` 值拷贝、`getHeadHeight`、`getRespawnPosition`、`getItemInHandIcon`、
float 分步各条）；恢复后 24 条全绿。`pnpm check` 全绿（138 文件 / 1468 条测试），prettier 通过。

**台账 163 → 167**：+1 OMIT（`~Player()`）、+2 ADAPTED（两个 NBT 方法的可见性）、
+1 DEFERRED(待确认)（`spawnEatParticles` 的实参求值顺序）。

## 结论（Player）

`Player.ts` 审核完成：79 行工作表全部有结论。修复 8 类问题，统一编号 W20（整数除法 ×3、
值语义 ×2、float 分步 ×3 组）；新增 1 条 OMIT、2 条 ADAPTED、1 条 DEFERRED(待确认)，
台账 163 → 167。新增审核测试 24 条。
