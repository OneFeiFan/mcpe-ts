# LevelChunk（src/world/level/chunk/LevelChunk.h / .cpp ↔ packages/world/src/level/chunk/LevelChunk.ts）

第 2 批（world/level/chunk）。工作表 50 行全部有结论。C++ `.h` 142 行 + `.cpp` 717 行，TS 审核前 643 行、审核后 653 行。新增编号 **W54**。

C++ 侧要点：

- 两个构造函数共用一份函数体：`x/z`、`xt/zt`、`init()`；带 `blocks` 的版本还按 `ChunkBlockCount` 建三个 `DataLayer` 并设 `blocksLength`。
- C++ 构造 1 的 `blocks` / `blocksLength`、两个构造函数的 `loaded` / `minHeight` 都没有初始化；TS 取 `null / 0 / false / 0`，标 `ADAPTED(Cpp)`。
- 析构函数只有一个被注释掉的 `//delete blocks;`，TS 由 GC 接管，登记 `OMIT`。
- `tileEntities` 是 `std::map<TilePos, TileEntity*>`，在 `LevelChunk.h` 的 `protected` 段；`TilePos::operator<` 比较 `hashCode()`，所以 TS 用 `Map<number, TileEntity>` 并以 hashCode 为键。`insert` 不覆盖已有键。
- 可见性：`blocks` / `entityBlocks` / `tileEntities` 是 `protected`；`recalcHeight`、`lightGap`、`lightGaps` 是 `private`；其余成员函数是 `public`。
- 被 C++ 注释掉、未复制的代码：`shouldSave` 的时间/实体判断、`load` / `unload` 里加回/移除方块实体与实体的循环。
- 日志：`setBlocks` 的 `LOGI("LevelChunk::setBlocks\n")`（`LevelChunk.cpp:295`）以及 `setTileEntity` 的 `LOGW(... \n)`（`LevelChunk.cpp:607`）都带显式换行；`addEntity` 的 `LOGE` 没有换行。

## 工作表结论

| #   | C++ 函数                                            | C++ 位置           | 结论                                                                                                                                                             |
| --- | --------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `LevelChunk(Level*, int x, int z)`                  | LevelChunk.cpp:17  | ADAPTED(Cpp)：未初始化的 `blocks` / `blocksLength` / `loaded` / `minHeight` 取 `null / 0 / false / 0`；`x/z`、`xt/zt`、三个 `DataLayer`、`init()` 一致。         |
| 2   | `LevelChunk(Level*, unsigned char*, int x, int z)`  | LevelChunk.cpp:17  | ADAPTED(Cpp)：`loaded` / `minHeight` 未初始化，取 `false / 0`；`blocks` 可空、`blocksLength = ChunkBlockCount`、`DataLayer(ChunkBlockCount)` 一致。              |
| 3   | `~LevelChunk()`                                     | LevelChunk.cpp:42  | OMIT：函数体只有被注释掉的 `//delete blocks;`；已在文件头登记，JS 由 GC 接管（R3）。                                                                             |
| 4   | `init()`                                            | LevelChunk.cpp:47  | 一致：分配 `heightmap` / `updateMap` 并清零，复位 8 个标志与 `lastSaveTime`；C++ 的 `memset` 由新 TypedArray 的零初始化等价实现。                                |
| 5   | `setTileAndData(int,int,int,int,int)`               | LevelChunk.cpp:63  | 一致：数据相同早退、旧方块 `onRemove` / 客户端 `removeTileEntity`、天空光/方块光、`lightGaps`、`onPlace`、`updateMap` 的位运算顺序全部相同。                     |
| 6   | `setTile(int,int,int,int)`                          | LevelChunk.cpp:110 | 一致（怪癖保留）：早退比较用未 mask 的 `tile_`，`Tile.tiles[tile_]` 也不 mask，与 C++ 原句相同；数据层清 0 与光照逻辑一致。                                      |
| 7   | `setTileRaw(int,int,int,int)`                       | LevelChunk.cpp:148 | 一致：只写 `blocks`，不触发任何通知。                                                                                                                            |
| 8   | `getData(int,int,int)`                              | LevelChunk.cpp:153 | 一致。                                                                                                                                                           |
| 9   | `recalcHeightmapOnly()`                             | LevelChunk.cpp:158 | 一致：16×16 扫描、`lightBlock` 掩码、`minHeight` 更新与 C++ 相同。                                                                                               |
| 10  | `recalcHeightmap()`                                 | LevelChunk.cpp:175 | 一致：在 9 的基础上按 `hasCeiling` 填 `skyLight`，最后对每列调用 `lightGaps`。                                                                                   |
| 11  | `recalcHeight(int,int,int)`                         | LevelChunk.cpp:211 | 一致：`lightColumnChanged`、`minHeight` 全扫、升/降两路 `skyLight` 与 `updateLight`、末段亮度重算和二次 `updateLight` 都一致。                                   |
| 12  | `skyBrightnessChanged()`                            | LevelChunk.cpp:268 | 一致：`minHeight - 16` 到 127 的脏标记范围相同。                                                                                                                 |
| 13  | `shouldSave(bool force)`                            | LevelChunk.cpp:280 | 一致：C++ 被注释掉的时间/实体判断没有复制；只看 `dontSave` 与 `unsaved`。                                                                                        |
| 14  | `setBlocks(unsigned char*, int sub)`                | LevelChunk.cpp:294 | **已修 W54a**：补上 C++ 的 `LOGI("LevelChunk::setBlocks\n")`；数据复制、4 列 `recalcHeight`、两路 `updateLight`、`setTilesDirty` 的范围一致。                    |
| 15  | `getRandom(long l)`                                 | LevelChunk.cpp:318 | 一致：`Math.imul` 链加 `\| 0` 取低 32 位；`Random` 的 `init_genrand` 只保留 seed 低 32 位，异或后取低 32 位等价；s4 黄金样本 2268 组覆盖 64 位 seed 与坐标溢出。 |
| 16  | `lightGap(int,int,int)`                             | LevelChunk.cpp:323 | 一致：按高度大小决定 `updateLight` 的方向与范围。                                                                                                                |
| 17  | `clearUpdateMap()`                                  | LevelChunk.cpp:333 | 一致：`fill(0)` 等价 `memset`，并清 `unsaved`。                                                                                                                  |
| 18  | `deleteBlockData()`                                 | LevelChunk.cpp:339 | 一致：`blocks = null`；C++ `delete[]` 的释放由 GC 接管。                                                                                                         |
| 19  | `isAt(int,int)`                                     | LevelChunk.cpp:345 | 一致。                                                                                                                                                           |
| 20  | `getHeightmap(int,int)`                             | LevelChunk.cpp:350 | 一致：`Int8Array` 读取后 `& 0xff`，等价 C++ `char` 提升为 int。                                                                                                  |
| 21  | `recalcBlockLights()`                               | LevelChunk.cpp:355 | 一致：空函数。                                                                                                                                                   |
| 22  | `lightGaps(int,int)`                                | LevelChunk.cpp:360 | 一致：四邻 `lightGap` 的顺序与坐标相同。                                                                                                                         |
| 23  | `getTile(int,int,int)`                              | LevelChunk.cpp:372 | 一致：`& 0xff`。                                                                                                                                                 |
| 24  | `setData(int,int,int,int)`                          | LevelChunk.cpp:377 | 一致。                                                                                                                                                           |
| 25  | `getBrightness(const LightLayer&,int,int,int)`      | LevelChunk.cpp:383 | 一致：Sky / Block 两路，其他层返回 0。                                                                                                                           |
| 26  | `setBrightness(const LightLayer&,int,int,int,int)`  | LevelChunk.cpp:390 | 一致：只写 Sky / Block 两路。                                                                                                                                    |
| 27  | `getRawBrightness(int,int,int,int)`                 | LevelChunk.cpp:398 | 一致：天空光大于 0 时置 `touchedSky`，减 `skyDampen`，再与方块光取大。                                                                                           |
| 28  | `addEntity(Entity*)`                                | LevelChunk.cpp:409 | 一致：`lastSaveHadEntities`、区块坐标不符时的 `LOGE`（无换行）、`yc` 夹取、`inChunk` / 三个 chunk 字段、push。                                                   |
| 29  | `removeEntity(Entity*)`                             | LevelChunk.cpp:429 | 一致（R10）：默认参数 `yc = e.yChunk` 转调长重载。                                                                                                               |
| 30  | `removeEntity(Entity*, int yc)`                     | LevelChunk.cpp:429 | 一致：`yc` 夹取后按 `std::remove + erase` 压缩数组，保留其他元素顺序。                                                                                           |
| 31  | `isSkyLit(int,int,int)`                             | LevelChunk.cpp:443 | 一致：与高度图比较。                                                                                                                                             |
| 32  | `load()`                                            | LevelChunk.cpp:448 | 一致：`loaded = true`；C++ 注释掉的恢复逻辑未复制。                                                                                                              |
| 33  | `unload()`                                          | LevelChunk.cpp:458 | 一致：`loaded = false`；C++ 注释掉的移除逻辑未复制，已补注释。                                                                                                   |
| 34  | `markUnsaved()`                                     | LevelChunk.cpp:468 | 一致。                                                                                                                                                           |
| 35  | `getEntities(Entity*, const AABB&, vector&)`        | LevelChunk.cpp:473 | 一致：`yc` 范围夹取、排除 `except`、`AABB` 相交判断。                                                                                                            |
| 36  | `getEntitiesOfType(int, const AABB&, EntityList&)`  | LevelChunk.cpp:490 | 一致：`yc` 范围与 C++ 相同（TS 用等价私有 `entityRange` 拆分），按 `getEntityTypeId()` 过滤。                                                                    |
| 37  | `getEntitiesOfClass(int, const AABB&, EntityList&)` | LevelChunk.cpp:515 | 一致：同上，按 `getCreatureBaseType()` 过滤。                                                                                                                    |
| 38  | `countEntities()`                                   | LevelChunk.cpp:540 | 一致：累加 8 个实体段的长度。                                                                                                                                    |
| 39  | `getTileEntity(int,int,int)`                        | LevelChunk.cpp:550 | 一致；ADAPTED(Safety)：C++ 在 `cit == end()` 时也 `erase(cit)` 是未定义行为，TS 只在找到时删除；懒创建与 `isRemoved` 处理一致。                                  |
| 40  | `hasTileEntityAt(int,int,int)`                      | LevelChunk.cpp:582 | 一致（R10 分派入口）：按 `TilePos.hashCode()` 查 map。                                                                                                           |
| 41  | `hasTileEntityAt(TileEntity*)`                      | LevelChunk.cpp:582 | 一致：用 `te.x & 15` / `te.z & 15` / `te.y` 组成区块局部坐标。                                                                                                   |
| 42  | `addTileEntity(TileEntity*)`                        | LevelChunk.cpp:591 | 一致：世界坐标转局部后 `setTileEntity`；`loaded` 时加进 `level.tileEntities`。                                                                                   |
| 43  | `setTileEntity(int,int,int,TileEntity*)`            | LevelChunk.cpp:602 | **已修 W54b**：`LOGW` 格式串补上结尾 `\n`；`setLevelAndPos`、无实体方块时告警返回、`clearRemoved`、`insert` 不覆盖已有键均一致。                                 |
| 44  | `removeTileEntity(int,int,int)`                     | LevelChunk.cpp:616 | 一致：`loaded` 才执行；`setRemoved` 用 `TileEntity.prototype` 调用模拟 C++ 非虚函数；客户端广播 `runningId`；删除键。                                            |
| 45  | `getBlocksAndData(unsigned char*,...)`              | LevelChunk.cpp:634 | 一致：blocks → data → blockLight → skyLight，段内 x/z 顺序与 `subarray` 复制长度相同，`p` 推进一致。                                                             |
| 46  | `setBlocksAndData(unsigned char*,...)`              | LevelChunk.cpp:671 | 一致：写 blocks 后 `recalcHeightmapOnly()`，再按 data → blockLight → skyLight 写回，顺序与 `p` 推进一致。                                                        |
| 47  | `isEmpty()`                                         | LevelChunk.cpp:710 | 一致：恒 `false`。                                                                                                                                               |
| 48  | `getTileEntityMap()`                                | LevelChunk.cpp:715 | ADAPTED(Cpp)：C++ 返回 `const TEMap&`（按 hashCode 有序的活引用）；TS 返回按 hashCode 排序的新 `Map`。                                                           |
| 49  | `getBlockData()`                                    | LevelChunk.h:47    | 一致：返回底层 `blocks`（可能为 `null`）。                                                                                                                       |
| 50  | `lightLava()`                                       | LevelChunk.h:72    | 一致：空函数。                                                                                                                                                   |

C++ 有、TS 没有的方法：析构函数（见第 3 行，OMIT）。TS 有、C++ 没有的方法：`entityRange`，只是把 `getEntitiesOfType` / `getEntitiesOfClass` 里逐字相同的 `yc0/yc1` 计算抽成一个私有方法，行为等价。

## 修复

**W54a `setBlocks` 漏掉 C++ 的日志。**
C++ `LevelChunk.cpp:294-295` 在函数开头调用 `LOGI("LevelChunk::setBlocks\n")`，TS 没有对应调用。修复：从 `@mcpe/platform` 引入 `LOGI`，在 `setBlocks` 开头原样输出带换行的字符串。

**W54b `setTileEntity` 的 `LOGW` 缺少结尾换行。**
C++ `LevelChunk.cpp:607` 的格式串是 `"Attempted to place a tile entity where there was no entity tile! %d, %d, %d\n"`，TS 模板串末尾没有 `\n`。修复：补上 `\n`。

**W54c `tileEntities` 可见性与 C++ 不一致（清单第 20 条）。**
C++ `LevelChunk.h:90` 把 `tileEntities` 写在 `protected` 段，TS 原为 public。全仓只有 `LevelChunk` 内部与 `getTileEntityMap()` 访问它，收窄不会破坏调用方。修复：改为 `protected`，并在注释里保留 `std::map` 的 hashCode 键说明；测试用 `keyof LevelChunk` 的类型断言锁定（`keyof` 只列 public 成员）。

先红后绿：

- 红（旧实现）：`pnpm exec vitest run tests/unit/world/levelchunk-audit.test.ts` → `Test Files 1 failed (1)`、`Tests 2 failed (2)`；W54a 期望 `['[I]', 'LevelChunk::setBlocks\n']` 但实际未调用日志，W54b 实际字符串缺少 `\n`。
- 红（旧实现）：`npx tsc -p tests/tsconfig.json --noEmit` → 退出码 2，`tests/unit/world/levelchunk-audit.test.ts(13,3): error TS2344: Type 'false' does not satisfy the constraint 'true'.`，证明当时 `tileEntities` 仍是 public。
- 绿（修复后）：同一 vitest 命令 `Test Files 1 passed (1)`、`Tests 2 passed (2)`；`npx tsc -p tests/tsconfig.json --noEmit` 退出码 0。

## ADAPTED / OMIT / DEFERRED

- 新增 `OMIT(LevelChunk)` 1 处：`~LevelChunk()`（`LevelChunk.cpp:42`），函数体只有被注释掉的 `delete blocks`。
- 新增 `ADAPTED(Cpp)` 2 处：构造函数未初始化字段的取值说明（1 处，覆盖两个构造函数）；`getTileEntityMap` 返回排序后的新 Map（1 处）。
- 新增 `ADAPTED(Safety)` 1 处：`getTileEntity` 不在 `cit == end()` 时删除。
- `DEFERRED`：0 处。
- 已有的 `removeTileEntity` 非虚调用用 `TileEntity.prototype.setRemoved.call(...)` 模拟，与 C++ 静态分派一致，属于等价实现，不另标 ADAPTED。

## 35 条清单核对要点

- 第 1–2 条：本文件没有 float 字段；坐标、高度、光照、数据层全是整数。`Mth.floor(e.x / 16)` 等实体坐标除法在 C++ 是 float 除法，`Mth.floor` 内部先 `Math.fround`，与 float 形参一致。
- 第 3–7 条：无 float 逐步运算、无 float 常量、无 int/float 混算；`minHeight`、`heightmap`、`skyLight` 的加减都是整数。
- 第 8 条：`divs.py` 列出 9 处除法：`128 / 16` 是常量 8；6 处实体/AABB 坐标除以 16 走 `Mth.floor`（float 除法）；两处 `((y1 - y0) / 2) | 0` 的 `y1 >= y0`，C++ 整数除法向零截断与 `| 0` 相同。没有其他整数除法。
- 第 9–11 条：无 `Mth.sin/cos`、无 C 库数学函数、无 `long long`；`getRandom` 的 64 位 `long` seed 由 `Random` 只保留低 32 位与 s4 黄金样本覆盖。
- 第 12 条：本文件没有字符串格式化数字；日志只有 `setBlocks` 的固定串、`setTileEntity` 的三个 int 和 `addEntity` 的四个 int，均为 `%d` 语义。
- 第 13–15 条：`removeTileEntity` 显式用 `TileEntity.prototype.setRemoved.call` 模拟 C++ 非虚调用；构造函数内没有虚调用；无带默认参数的虚函数重写。
- 第 16 条：`removeEntity(e)` 与 `removeEntity(e, yc)` 按 R10 用默认参数转调；`hasTileEntityAt` 的两个重载按实参类型分派（number / TileEntity）。
- 第 17–18 条：无字段遮蔽；无 `super::` 调用。
- 第 19 条：字段声明顺序与 C++ 一致；`ChunkSize` / `entityBlocks` 的字段初始化不依赖构造参数，`blocks` / `data` / `skyLight` / `blockLight` 在构造函数体内按 C++ 顺序赋值，`heightmap` / `updateMap` 在 `init()` 中分配，不依赖子类。
- 第 20 条：`tileEntities` 见 W54c；`blocks` / `entityBlocks` 为 `protected`，`recalcHeight` / `lightGap` / `lightGaps` 为 `private`，与 C++ 头文件一致；`entityRange` 是 TS 私有辅助方法。
- 第 21–22 条：没有按值保存的对象；`TilePos` 只在 `new TilePos(...).hashCode()` 中临时使用。`std::map` 语义用 hashCode 键实现，`setTileEntity` 先 `has` 再 `set` 以保持 `insert` 不覆盖；`getTileEntityMap` 排序后返回。
- 第 23 条：`removeEntity` 用读写双下标压缩，等价 `std::remove + erase`，不改变其余元素顺序。
- 第 24 条：`getTileEntityMap` 的排序键是唯一 hashCode，相等元素不存在，稳定性不影响结果。
- 第 25 条：无哈希容器。
- 第 26–29 条：`getRandom` 只构造 `Random`，不取数；`getRawBrightness` 的 `if` / `&&` 短路与 C++ 相同；被注释掉的代码里没有随机数调用。
- 第 30–32 条：日志字符串均为 ASCII；`heightmap` 用 `Int8Array` 并在读取处 `& 0xff`，`getTile` 也 `& 0xff`，与 x86 有符号 `char` 的提升结果一致；布尔与整数转换均按 C++ 非零为真。
- 第 33 条：`setBlocks` 的 `LOGI`、`setTileEntity` 的 `LOGW` 已按 W54a / W54b 对齐 C++ 格式串（含换行）；`addEntity` 的 `LOGE` 保持 C++ 的无换行格式。
- 第 34 条：`OMIT` 析构函数仍成立；新增 3 个 ADAPTED 标记；没有 DEFERRED。
- 第 35 条：文件头已改正未初始化字段的说明（原来只提 `loaded` / `minHeight`，漏了构造 1 的 `blocks` / `blocksLength`）；`tileEntities` 注释同时保留 hashCode 键与 protected 可见性说明。

## 验证

- `pnpm exec vitest run tests/unit/world/levelchunk-audit.test.ts`：`Test Files 1 passed (1)`，`Tests 2 passed (2)`，退出码 0。
- `npx tsc -p packages/world --noEmit`：0 错误，退出码 0。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误，退出码 0（W54c 红绿对照见上）。
- `npx prettier --check`（LevelChunk.ts、levelchunk-audit.test.ts、本记录）：通过。
- `python tools/porting/divs.py packages/world/src/level/chunk/LevelChunk.ts`：9 处除法全部核对，见第 8 条。
- TS 行数：审核前 643，审核后 653。
