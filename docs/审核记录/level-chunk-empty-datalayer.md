# world/level/chunk：EmptyLevelChunk、DataLayer

第 2 批（world/level/chunk）。2 个文件工作表共 39 行全部有结论。新增编号 W56-W57。

本组**没有发现行为错误**：W56 只修正文件头注释，W57 只补析构函数的 `OMIT` 登记与未初始化成员说明，
两者都不改变运行时行为，因此没有“先红后绿”对照（注释/台账无法用测试观察；先例见 `entity-ai-goal.md` 的 W40/W41）。
新增的 10 条单元测试用来锁定现有行为。两个 C++ 文件都只有 `.h`、没有 `.cpp`
（`clean.py` 对 `.cpp` 报 `FileNotFoundError` 属预期）。

## EmptyLevelChunk（src/world/level/chunk/EmptyLevelChunk.h ↔ packages/world/src/level/chunk/EmptyLevelChunk.ts）

C++ 侧要点：

- 只有 `.h`（196 行）。类无自有字段，全部成员在 `public` 段；两个构造函数都先调 `LevelChunk`，再把 `dontSave = true`。
- 被重写的基类方法在 `LevelChunk.h` 里逐个核对过，全部是 `virtual`（`isAt`、`getHeightmap`、`recalc*`、
  `getTile` / `setTile*` / `getData` / `setData`、`getBrightness*`、`addEntity` / `removeEntity`、
  `isSkyLit`、`skyBrightnessChanged`、`load` / `unload` / `markUnsaved`、`getEntities`、`setBlocks`、
  `getBlocksAndData` / `setBlocksAndData`、`getRandom`、`isEmpty`），TS 的 `override` 关系正确。
- 被注释掉的代码三块，均未复制：`getTile` 里的旧分支（`EmptyLevelChunk.h:56-64`）、
  方块实体的 4 个重写（`:115-131`）、`getEntitiesOfClass` / `countEntities` / `shouldSave`（`:148-160`）。
- 无 float、无 random 取数、无容器、无日志。`getBlocksAndData` / `setBlocksAndData` 返回的是长度而不是 `p + len`，
  这是子类与基类不同的怪癖，TS 已按原样保留并注释。

工作表结论（TS 行号是审核前的工作表行号；W56 只改注释、行数未变）：

| #   | C++ 函数                                                              | C++ 位置              | TS 方法                | TS 行 | 相似度 | 结论                                                                                                    |
| --- | --------------------------------------------------------------------- | --------------------- | ---------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------- |
| 1   | `EmptyLevelChunk(Level*, int x, int z)`                               | EmptyLevelChunk.h:20  | `constructor`          | 21    | —      | 一致：重载第 1 分支 `super(level, x, z)`，随后 `dontSave = true`                                        |
| 2   | `EmptyLevelChunk(Level*, unsigned char* blocks, int x, int z)`        | EmptyLevelChunk.h:26  | `constructor`          | 21    | —      | 一致：第 2 分支 `super(level, blocks, x, z)`；`blocks` 允许 null（ChunkCache 就这样创建）               |
| 3   | `isAt(int x, int z)`                                                  | EmptyLevelChunk.h:32  | `isAt`                 | 27    | 1.00   | 一致：`x === this.x && z === this.z`                                                                    |
| 4   | `getHeightmap(int x, int z)`                                          | EmptyLevelChunk.h:36  | `getHeightmap`         | 31    | 1.00   | 一致：返回 0                                                                                            |
| 5   | `recalcBlockLights()`                                                 | EmptyLevelChunk.h:40  | `recalcBlockLights`    | 35    | 1.00   | 一致：空体                                                                                              |
| 6   | `recalcHeightmapOnly()`                                               | EmptyLevelChunk.h:43  | `recalcHeightmapOnly`  | 37    | 0.67   | 一致：C++ `return;` 与空体等价                                                                          |
| 7   | `recalcHeightmap()`                                                   | EmptyLevelChunk.h:47  | `recalcHeightmap`      | 39    | 0.67   | 一致：C++ `return;` 与空体等价                                                                          |
| 8   | `lightLava()`                                                         | EmptyLevelChunk.h:51  | `lightLava`            | 41    | 0.67   | 一致：C++ `return;` 与空体等价                                                                          |
| 9   | `getTile(int x, int y, int z)`                                        | EmptyLevelChunk.h:55  | `getTile`              | 43    | 1.00   | 一致：`Tile.invisible_bedrock.id`（95）；`getTile` 内被注释的旧分支未复制                               |
| 10  | `setTileAndData(int, int, int, int, int)`                             | EmptyLevelChunk.h:68  | `setTileAndData`       | 47    | 1.00   | 一致：返回 true，不写                                                                                   |
| 11  | `setTile(int, int, int, int)`                                         | EmptyLevelChunk.h:72  | `setTile`              | 57    | 1.00   | 一致：返回 true，不写                                                                                   |
| 12  | `getData(int x, int y, int z)`                                        | EmptyLevelChunk.h:76  | `getData`              | 61    | 1.00   | 一致：返回 0                                                                                            |
| 13  | `setData(int x, int y, int z, int val)`                               | EmptyLevelChunk.h:80  | `setData`              | 65    | 0.67   | 一致：空体                                                                                              |
| 14  | `getBrightness(const LightLayer&, int, int, int)`                     | EmptyLevelChunk.h:84  | `getBrightness`        | 67    | 1.00   | 一致：返回 7（不区分光照层）                                                                            |
| 15  | `setBrightness(const LightLayer&, int, int, int, int)`                | EmptyLevelChunk.h:88  | `setBrightness`        | 71    | 0.67   | 一致：空体                                                                                              |
| 16  | `getRawBrightness(int, int, int, int)`                                | EmptyLevelChunk.h:92  | `getRawBrightness`     | 79    | 1.00   | 一致：返回 7（忽略 skyDampen）                                                                          |
| 17  | `addEntity(Entity* e)`                                                | EmptyLevelChunk.h:96  | `addEntity`            | 83    | 0.67   | 一致：空体                                                                                              |
| 18  | `removeEntity(Entity* e)`                                             | EmptyLevelChunk.h:100 | `removeEntity`         | 85    | 0.67   | 一致：与第 19 行按 R10 情形 A 合并为 `removeEntity(e, yc?)`；两个 C++ 重载都是空体                      |
| 19  | `removeEntity(Entity* e, int yc)`                                     | EmptyLevelChunk.h:104 | `removeEntity`         | 85    | 0.67   | 一致：同上                                                                                              |
| 20  | `isSkyLit(int x, int y, int z)`                                       | EmptyLevelChunk.h:108 | `isSkyLit`             | 87    | 1.00   | 一致：返回 false                                                                                        |
| 21  | `skyBrightnessChanged()`                                              | EmptyLevelChunk.h:112 | `skyBrightnessChanged` | 91    | 0.67   | 一致：空体                                                                                              |
| 22  | `load()`                                                              | EmptyLevelChunk.h:133 | `load`                 | 93    | 0.67   | 一致：空体                                                                                              |
| 23  | `unload()`                                                            | EmptyLevelChunk.h:137 | `unload`               | 95    | 0.67   | 一致：空体                                                                                              |
| 24  | `markUnsaved()`                                                       | EmptyLevelChunk.h:141 | `markUnsaved`          | 97    | 0.67   | 一致：空体                                                                                              |
| 25  | `getEntities(Entity*, const AABB&, std::vector<Entity*>&)`            | EmptyLevelChunk.h:145 | `getEntities`          | 99    | 0.67   | 一致：空体，不改 `es`                                                                                   |
| 26  | `setBlocks(unsigned char*, int sub)`                                  | EmptyLevelChunk.h:162 | `setBlocks`            | 101   | 0.67   | 一致：空体                                                                                              |
| 27  | `getBlocksAndData(unsigned char*, int, int, int, int, int, int, int)` | EmptyLevelChunk.h:166 | `getBlocksAndData`     | 104   | 0.85   | 一致（怪癖保留）：`fill(95, p, p + len)` 等价 memset；`s / 2` 用 `\| 0` 向零截断；返回 len 而不是 p+len |
| 28  | `setBlocksAndData(unsigned char*, int, int, int, int, int, int, int)` | EmptyLevelChunk.h:178 | `setBlocksAndData`     | 124   | 0.93   | 一致（怪癖保留）：什么都不写，返回 len                                                                  |
| 29  | `getRandom(long l)`                                                   | EmptyLevelChunk.h:187 | `getRandom`            | 142   | 0.55   | 一致：与 `LevelChunk.ts` 的 `getRandom` 逐字相同；`Math.imul` 保留 int 乘法，`Random` 只用低 32 位      |
| 30  | `isEmpty()`                                                           | EmptyLevelChunk.h:191 | `isEmpty`              | 155   | 1.00   | 一致：返回 true                                                                                         |

“C++ 有、TS 没有”的两行是构造函数（TS 用重载 `constructor` 表达，已在第 1、2 行说明）；
“TS 有、C++ 没有”的方法：无。

## 修复：W56（无行为修改，清单第 35 条）

文件头注释与代码和 C++ 都对不上：

- 原文写「LevelChunk 里 OMIT 了实体相关的方法，这里对它们的重写也一并 OMIT……移植实体时两边一起恢复」。
  实际 `LevelChunk.ts` 已有 `addEntity` / `removeEntity` / `getEntities`（S12 起），
  `EmptyLevelChunk.ts` 也有对应的三个空实现，早已恢复，注释是旧的。
- 原文写被注释代码在「EmptyLevelChunk.h:72-108」。核对原始头文件后，实际是
  方块实体 4 个重写在 `:115-131`、`getEntitiesOfClass` / `countEntities` / `shouldSave` 在 `:148-160`；
  另外 `getTile` 里还有一段 `:56-64` 的旧分支注释。

已把文件头改成上面的事实，并补上 `getTile` 的注释块说明。只改注释，TS 行数仍为 158，
没有红绿对照（无法用运行时测试观察注释）；用 `tsc` / `vitest` / `prettier` 全绿确认没有改坏。

ADAPTED / DEFERRED：无。OMIT：无新增（C++ 自己注释掉的三块不是“可移植但暂缓的函数”，
按“被注释代码不复制”处理，文件头已说明）。

## EmptyLevelChunk 35 条清单核对要点

- 第 1–2 条：无自有字段；`getTile` / `getHeightmap` / `getData` / `getBrightness` / `getRawBrightness`
  返回的都是 int，逐行一致。没有 float 形参。
- 第 3–7 条：无 float 运算、无 float 常量，不适用。
- 第 8 条：整数除法只有 `getBlocksAndData` / `setBlocksAndData` 的 `s / 2` 两处，
  TS 写 `(s / 2) | 0`，负数时同样向零截断；`divs.py` 列出的就是这两处，已逐条判断。
  `s = xs * ys * zs` 在合法范围（16×128×16）内不溢出；C++ 的有符号溢出属 UB，不复刻。
- 第 9–12 条：无 `Mth` / C 库数学函数、无字符串、无格式化；`getRandom` 的 long 运算见第 29 行。
- 第 13 条（非虚函数）：基类这些方法全部是 `virtual`（见上），TS 的 `override` 正确；
  没有通过 `LevelChunk` 静态类型调用到“子类不该生效”的方法。
- 第 14–15 条：基类构造里只调 `init()`（本类没有重写）；`removeEntity` 的默认参数在基类是
  `yc = e.yChunk`，但本类两个重载都是空体，合并后行为不变。
- 第 16 条（重载）：两个构造函数按实参类型分派正确；`removeEntity` 两个重载按 R10 情形 A 合并。
- 第 17–18 条：无字段遮蔽、无 `super::` 调用（只有构造函数 `super`）。
- 第 19 条：先基类构造（含 `init()` 把 `dontSave` 清 false），再 `dontSave = true`，与 C++ 顺序一致。
- 第 20 条（可见性）：C++ 全部 `public`，TS 也全部 public，无收窄/放宽。
- 第 21–25 条：无按值对象、无容器、无排序、无哈希容器。
- 第 26–29 条：`getRandom` 只是 `new Random(...)`，不取随机数；公式与 `LevelChunk` 相同，
  `Random::setSeed` 只用低 32 位（`init_genrand` 的 `s & 0xffffffffUL`），所以 `Math.imul` + `| 0` 一致。
  被注释掉的代码里没有随机数调用。
- 第 30–33 条：无字符串、char、bool 转换、日志。
- 第 34 条：没有新增 DEFERRED / OMIT / ADAPTED。
- 第 35 条：文件头已按 W56 修正；`95`、`len` 返回值、`getRandom` 重复实现等注释与 C++ 核对无误。

## DataLayer（src/world/level/chunk/DataLayer.h ↔ packages/world/src/level/chunk/DataLayer.ts）

C++ 侧要点：

- 只有 `.h`（75 行）。三个构造函数 + 一个析构函数，成员和字段全部 `public`：
  `unsigned char* data`、`int length`、`int slotMax`。
- 默认构造：`data(NULL)`、`length(0)`，**`slotMax` 不初始化**（未初始化成员）。
- `DataLayer(int length)`：`length >> 1` → `new unsigned char[length]` → `setAll(0)` → `slotMax = length`。
- `DataLayer(unsigned char* data, int length)`：`length >> 1`，直接保存指针（不复制），**`slotMax` 不初始化**。
- 析构函数 `delete[] data`。
- 无 float、无随机数、无容器、无日志。`setAll` 的怪癖：`unsigned char val = (br & (br << 4))`，
  所以 `setAll(15)` 写入的是 0；游戏里只调用过 `setAll(0)`。

工作表结论（TS 行号是审核前的工作表行号；W57 在构造函数后加了 1 行注释、字段处加了 1 行注释，
第 26 行之后的方法实际行号 +3）：

| #   | C++ 函数                                     | C++ 位置       | TS 方法       | TS 行 | 相似度 | 结论                                                                                                           |
| --- | -------------------------------------------- | -------------- | ------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | `length(0)`（默认构造初始化列表）            | DataLayer.h:13 | 字段/默认分支 | 12    | —      | 一致：`data = null`、`length = 0`；`slotMax` C++ 未初始化 → TS 取 0（已注释）                                  |
| 2   | `DataLayer(int length)`                      | DataLayer.h:16 | `constructor` | 10    | 0.47   | 一致：`length >> 1` → 分配 → `setAll(0)` → `slotMax = length`                                                  |
| 3   | `DataLayer(unsigned char* data, int length)` | DataLayer.h:23 | `constructor` | 10    | 0.28   | 一致：`length >> 1`，直接保存缓冲区别名（不复制）；`slotMax` 不赋值（TS 0，已注释）                            |
| 4   | `get(int x, int y, int z)`                   | DataLayer.h:32 | `get`         | 27    | 0.33   | 一致：坐标重载转 `get(pos)`；`pos = x << 11 \| z << 7 \| y`                                                    |
| 5   | `set(int x, int y, int z, int val)`          | DataLayer.h:36 | `set`         | 40    | 0.35   | 一致（工作表配错：本行实际对应 TS 的 `set` 坐标重载，不是 `setAll`；`setAll` 是第 9 行）；`pos` 按同样公式打包 |
| 6   | `get(int pos)`                               | DataLayer.h:40 | `get`         | 27    | 0.81   | 一致：偶数 pos 取低 4 位，奇数取高 4 位                                                                        |
| 7   | `set(int pos, int val)`                      | DataLayer.h:50 | `set`         | 40    | 0.76   | 一致：写之前保留另一个半字节                                                                                   |
| 8   | `isValid()`                                  | DataLayer.h:61 | `isValid`     | 58    | 0.86   | 一致：`data !== null`                                                                                          |
| 9   | `setAll(int br)`                             | DataLayer.h:65 | `setAll`      | 62    | 0.75   | 怪癖保留：`br & (br << 4)` 后按 unsigned char 截断（TS `& 0xff`），只填 `length` 字节                          |
| 10  | `~DataLayer() { delete[] data; }`            | DataLayer.h:28 | （无）        | —     | —      | OMIT W57：JS 由 GC 接管（R3），本次补登记                                                                      |

“C++ 有、TS 没有”的只有析构函数（已登记 OMIT）；“TS 有、C++ 没有”的方法：无。

## 修复：W57（无行为修改，清单第 34 条）

C++ 的 `~DataLayer()` 以前没有在任何地方登记，按 R3（析构函数不移植）补：

```
// OMIT(DataLayer): ~DataLayer() { delete[] data; }  src/world/level/chunk/DataLayer.h:28 —— 内存由 GC 接管（R3）。
```

同时按方案第 1 节第 3 条（未初始化成员取 0 并注明）补了 `slotMax` 的说明：
C++ 的默认构造和 `(data, length)` 构造都不初始化它，TS 由字段初始化器取 0（运行时代码本来就是这样，未改）。
顺带注明缓冲构造保存的是别名而不是副本（C++ 原样）。

只增注释/标记，`DataLayer.ts` 从 67 行变为 70 行，无运行时行为变化，因此没有红绿对照；
`Ledger` 中本文件新增 `OMIT` 1 条。测试锁定的是现有行为（构造函数语义、4 位打包、setAll 怪癖）。

ADAPTED / DEFERRED：无。

## DataLayer 35 条清单核对要点

- 第 1 条：`data` 是 `unsigned char*` → `Uint8Array | null`；`length` / `slotMax` 是 int；
  `length >> 1` / `pos >> 1` / `pos & 1` / `<<` 全部按 32 位整数语义写；
  写回 unsigned char 的截断用 `& 0xff`（`setAll`），`set` 的两个分支结果本身不超过 255。
  `slotMax` 未初始化 → 0，已注释。
- 第 2–7 条：无 float 形参、无 float 运算、无 float 常量。
- 第 8 条：没有除法；移位与位运算逐条核对（`get` / `set` / `setAll`）。`divs.py` 无输出。
- 第 9–12 条：无数学函数、无 long、无字符串格式化。
- 第 13–15 条：无虚函数、无构造期虚调用、无默认参数。
- 第 16 条（重载）：`get` / `set` 各两个重载，按参数个数分派；3 个参数（get）/ 4 个参数（set）走坐标重载，
  1 个（get）/ 2 个（set）走 pos 重载，逐个核对，和 C++ 的静态类型选择一致。
- 第 17 条（遮蔽）：C++ 构造函数形参名 `data`、`length` 遮住成员，靠 `this->` 区分；
  TS 用 `a` / `b` 形参，没有遮蔽问题。
- 第 18 条：无 `super::`（没有基类）。
- 第 19 条：初始化顺序与 C++ 一致（默认：data→length；长度构造：length→分配→setAll→slotMax；
  缓冲构造：length→data）。
- 第 20 条（可见性）：C++ 全部 public，TS 也全部 public。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：无随机数、无短路取数、无被注释的随机数调用。
- 第 30–33 条：无字符串、char 符号问题、bool 转换、日志。
- 第 34 条：新增 1 处 `OMIT(DataLayer)`（析构函数）；DEFERRED / ADAPTED 为 0。
- 第 35 条：文件头与 `setAll` 怪癖注释核对属实；新增 `slotMax` 未初始化说明与缓冲区别名说明。

## 验证

- `pnpm exec vitest run tests/unit/world/chunk-empty-datalayer-audit.test.ts`：退出码 0，
  `Test Files 1 passed`、`Tests 10 passed`。
- `npx tsc -p packages/world --noEmit`：退出码 0。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0（中途并行审核文件曾报 2 处错，收尾前已由对应任务修好）。
- `npx prettier --check`（两个 TS 文件 + 本测试文件 + 本记录）：退出码 0。
- 台账：本组两个文件用严格正则实测新增 1 条 `OMIT(DataLayer)`；全仓读数在并行审核期间从 184 涨到 193，
  其中本组贡献 1 条，其余 8 条来自其他并行文件。
