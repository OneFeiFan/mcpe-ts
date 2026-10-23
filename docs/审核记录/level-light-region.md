# world/level：LightUpdate、Region

第 2 批（world/level）。2 个文件工作表共 18 行全部有结论。新增编号 W65-W66。

本组**没有发现行为错误**：W65、W66 只补标记/注释、删掉一处照抄的被注释代码，运行时代码未改，
因此没有“先红后绿”对照（先例：`level-chunk-empty-datalayer.md` 的 W56/W57）。
新增 15 条单元测试锁定现有行为（含 `hasLast` 从不置 true、边界判断 x/z 不对称两处怪癖）。

## LightUpdate（src/world/level/LightUpdate.h / .cpp ↔ packages/world/src/level/LightUpdate.ts）

C++ 侧要点：

- 类没有基类、没有析构函数。字段全 `public`：`const LightLayer* layer`、`int x0,y0,z0,x1,y1,z1`。
  三个构造函数：`const LightUpdate*` 拷贝、`const LightUpdate&` 拷贝、`(const LightLayer&, int×6)`；
  另有 `void operator=(const LightUpdate* t)`。
- `update(Level*)` 全是整数逻辑：`size = xd*yd*zd`（int 乘法），`> 16*16*128`（32768）直接返回；
  `hasLast` 初始化为 `false` 后**从未置 true**，所以“复用上一列区块”的分支永远不生效；
  `y0` / `y1` 的夹取写回**成员本身**；`block = Tile::lightBlock[tile]`，为 0 时取 1；
  Sky 层 `isSkyLit` 给 15，Block 层取 `lightEmission`；`block >= 15 && emit == 0` 目标直接 0；
  否则取 6 个邻居最大亮度减 `block`，夹到 ≥0 再与 `emit` 取大。
  变化后对 6 个邻居发检查，其中后三个的条件是 `x+1 >= x1` / `y+1 >= y1` / `z+1 >= z1`：
  循环里 `x <= x1`，所以这三个条件**恒成立**（怪癖）。
- `expandToContain`：已包含直接 true；只差一圈（r=1）且体积增量 `ns-os <= 2` 时把参数并进成员。
  `os` / `ns` 是 int 乘法。
- 两份 C++ 被注释掉的代码均未复制：被注释的默认构造函数（`LightUpdate.cpp:5-14`）、
  “Light too large, skipping” 的打印（`LightUpdate.cpp:72`）。

工作表结论（TS 行号是审核前工作表的行号；W65 在构造函数前加了 1 行注释，之后的方法实际行号 +1）：

| #   | C++ 函数                                                       | C++ 位置            | TS 方法           | TS 行 | 相似度 | 结论                                                                                          |
| --- | -------------------------------------------------------------- | ------------------- | ----------------- | ----- | ------ | --------------------------------------------------------------------------------------------- |
| 1   | `LightUpdate(const LightUpdate* t)`                            | LightUpdate.cpp:5   | `constructor`     | 35    | 1.00   | 一致（ADAPTED(Cpp)：与引用拷贝构造合并，`instanceof` 分支逐字段复制；W65 补标记）             |
| 2   | `LightUpdate(const LightUpdate& t)`                            | LightUpdate.cpp:17  | `constructor`     | 35    | 1.00   | 一致（同上；两个拷贝构造在 TS 里是同一个重载）                                                |
| 3   | `LightUpdate(const LightLayer&, int, int, int, int, int, int)` | LightUpdate.cpp:29  | `constructor`     | 35    | 1.00   | 一致：`layer` 保存引用，`x0..z1` 原样保存                                                     |
| 4   | `update(Level* level)`                                         | LightUpdate.cpp:65  | `update`          | 74    | 0.97   | 一致（怪癖保留）：`hasLast` 从不置 true；`x+1 >= x1` 等三个条件恒成立，均照抄并有注释         |
| 5   | `expandToContain(int, int, int, int, int, int)`                | LightUpdate.cpp:161 | `expandToContain` | 155   | 0.94   | 一致：`Math.imul` 保持 int 乘法，`<= 2` 的边界与参数夹取逐行对应                              |
| —   | `operator=(const LightUpdate*)`（工作表“TS 有”清单）           | LightUpdate.cpp:40  | `assign`          | 64    | —      | ADAPTED(Cpp)：改写为 `assign(t)`；既有 `/** ADAPTED(Cpp) */` 标记保留（该形式不计入台账正则） |

“C++ 有、TS 没有的方法”：无（`operator=` 由 `assign` 承接，见表末行）。
“TS 有、C++ 没有的方法”：`assign`，即上面的 `operator=`。

## 修复：W65（无行为修改）

1. 构造函数前补 `// ADAPTED(Cpp)` 标记：C++ 的 `const LightUpdate*` / `const LightUpdate&` 两个拷贝构造
   在 TS 里合并为一个重载（文件头原来只写了“合成一个重载”，没有可被台账统计的标记）。
2. 邻居检查处补“怪癖保留”注释：C++ 写的是 `x+1 >= x1`、`y+1 >= y1`、`z+1 >= z1`。
   因为循环条件是 `x <= x1`，这三个判断永远成立；不是移植错误，照抄。

两处都只动注释，运行时代码未改，因此没有红绿对照。新增测试锁定的是现有行为：体积阈值是 `>` 而不是 `>=`、
`hasLast` 导致的逐列区块检查、y 成员夹取、不透光方块目标为 0、6 邻居检查、`expandToContain` 的 `<= 2`
边界、拷贝/assign 的 7 个字段。

ADAPTED：构造函数重载合并（新增标记）；`assign`（既有）。OMIT / DEFERRED：无。

## LightUpdate 35 条清单核对要点

- 第 1–2 条：字段和形参全是 `int` / `LightLayer` 引用，没有 float，不需要 `f()` 或形参转 float。
- 第 3–7 条：无 float 运算、无 float 常量，不适用。
- 第 8 条：`size` 与 `expandToContain` 的 `os` / `ns` 用 `Math.imul`（C++ int 乘法）；
  没有除法；`>> 4` 是有符号右移，`& 15` 与 C++ 一致。合法区域尺寸下乘积不溢出；
  `ns - os` 的溢出只可能出现在 C++ 本身是 UB 的极端坐标，TS 用 double 计算，未额外 `| 0`。
- 第 9–12 条：无 `Mth` / C 库数学函数、无 long、无字符串与格式化。
- 第 13–15 条：类无基类、无虚函数、无构造期虚调用、无默认参数。
- 第 16 条（重载）：三个构造函数按第一个实参的类型（`LightUpdate` / `LightLayer`）分派；
  `update`、`expandToContain` 各只有一个签名。分派与 C++ 静态类型一致。
- 第 17 条（遮蔽）：C++ 构造函数形参 `_x0` 等与成员 `x0` 不同名；TS 复制分支用 `this.`，无遮蔽。
- 第 18 条：无 `super::`（没有基类）。
- 第 19 条：字段声明顺序 `layer,x0,y0,z0,x1,y1,z1`；两个构造分支都按该顺序赋值。
- 第 20 条（可见性）：C++ 全部 public，TS 也全部 public。
- 第 21–25 条：无按值结构、无容器、无排序、无哈希容器；`layer` 按指针身份比较，
  TS 用 `LightLayer.Sky` / `Block` 两个静态实例的 `===`，与 C++ 比较地址等价。
- 第 26–29 条：无随机数；嵌套循环顺序 x→z→y 与 C++ 相同；短路判断（`hasLast && …`）保留；
  被注释的默认构造函数与打印未复制。
- 第 30–33 条：无字符串、char、bool 转整数、日志。
- 第 34 条：新增 1 条可统计的 `ADAPTED(Cpp)`（构造函数合并）；`assign` 的既有标记是 `/** */` 形式，
  台账正则不计入；DEFERRED / OMIT 无。
- 第 35 条：文件头与代码一致；本次补了 `x+1 >= x1` 的怪癖注释。

## Region（src/world/level/Region.h / .cpp ↔ packages/world/src/level/Region.ts）

C++ 侧要点：

- `class Region : public LevelSource`。方法全 `public`；字段全 `private`：`int xc1,zc1`、
  `LevelChunk*** chunks`、`Level* level`、`int size_x,size_z`。
- 构造函数参数 `x1,y1,z1,x2,y2,z2`（y 两个参数不参与计算）：`xc1 = x1>>4`、`zc1 = z1>>4`，
  `size_x/size_z` 为区块个数；`chunks` 是二维指针数组，逐格 `chunks[xc-xc1][zc-zc1] = level->getChunk(xc,zc)`。
- 析构函数逐行 `delete[]` 再 `delete[] chunks`。
- `getTile`：y 越界先返回 0；再算 xc/zc，**有范围检查**；chunk 为 NULL 返回 0；
  否则 `chunk->getTile(x&15, y, z&15)`。
- `isEmptyTile`：`Tile::tiles[getTile(...)] == NULL`。`Region.cpp:54` 有一行被注释的旧实现，未复制。
- `getBrightness`：`level->dimension->brightnessRamp[getRawBrightness(...)]`（float 数组，读出的就是 float）。
- `getRawBrightness`：3 参版转调 4 参版 `true`；4 参版先做世界边界检查，注意 **x 用 `>=`、z 用 `>`（不对称）**；
  `propagate` 时若是 half-slab / farmland，取 y+1、x+1、x-1、z+1、z-1 五格的最大值；
  y<0 返回 0；y>=DEPTH 返回 `MAX_BRIGHTNESS - skyDarken`（夹到 ≥0）；否则直接查区块（**没有范围检查**）。
- `getData`：y 越界返回 0，否则直接查区块（没有范围检查）。
- `getMaterial`：id 0 → `Material::air`，否则 `Tile::tiles[id]->material`。
- `isSolidBlockingTile`：tile 为 NULL → false；否则 `material->isSolidBlocking() && isCubeShaped()`（短路顺序照抄）。
- `isSolidRenderTile`：tile 为 NULL → false；否则 `isSolidRender()`。
- `getBiome` / `getBiomeSource` 直接转给 `Level`。
- `Region.cpp:58-63` 的 `getTileEntity` 整段被注释，未复制。

工作表结论（TS 行号是审核前工作表的行号；W66 在字段/构造/边界处共加了 3 行注释、删了 1 行旧注释）：

| #   | C++ 函数                                                         | C++ 位置       | TS 方法               | TS 行 | 相似度 | 结论                                                                                                       |
| --- | ---------------------------------------------------------------- | -------------- | --------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------- |
| 1   | `Region(Level*, int x1, int y1, int z1, int x2, int y2, int z2)` | Region.cpp:8   | `constructor`         | 22    | 0.78   | 一致（ADAPTED(Cpp)）：区块数组压成一维；构造末缓存两个方块 id（均为性能任务 P3）                           |
| 2   | `~Region()`                                                      | Region.cpp:29  | **（无）**            | —     | —      | OMIT(Cpp)（W66）：C++ 释放二维数组，TS 由 GC 接管（R3）；本次补登记                                        |
| 3   | `getTile(int, int, int)`                                         | Region.cpp:35  | `getTile`             | 54    | 0.97   | 一致：y 检查 → xc/zc → 范围检查 → NULL 检查 → 区块内 (x&15,y,z&15)                                         |
| 4   | `isEmptyTile(int, int, int)`                                     | Region.cpp:52  | `isEmptyTile`         | 71    | 1.00   | 一致：`Tile.tiles[getTile] === null`；被注释的旧实现（cpp:54）未复制（W66 删除照抄行）                     |
| 5   | `getBrightness(int, int, int)`                                   | Region.cpp:65  | `getBrightness`       | 78    | 1.00   | 一致：`brightnessRamp[getRawBrightness]`；数组已是 Float32Array，不再加 `f()`                              |
| 6   | `getRawBrightness(int x, int y, int z)`                          | Region.cpp:69  | `getRawBrightness`    | 84    | 0.08   | 一致（R10 情形 A）：3 参重载只转调 4 参 `true`，TS 用默认参数合并；相似度低是合并导致                      |
| 7   | `getRawBrightness(int x, int y, int z, bool propagate)`          | Region.cpp:69  | `getRawBrightness`    | 84    | 0.95   | 一致（怪癖保留）：边界 x 用 `>=`、z 用 `>` 的不对称；slab/farmland 五格取最大；y 越界与 DEVTH 分支逐行对应 |
| 8   | `getData(int, int, int)`                                         | Region.cpp:107 | `getData`             | 130   | 0.96   | 一致：y 检查后直接查区块（C++ 同样不做区块范围检查）                                                       |
| 9   | `getMaterial(int, int, int)`                                     | Region.cpp:116 | `getMaterial`         | 139   | 1.00   | 一致：id 0 → `Material.air`，否则 `Tile.tiles[id].material`                                                |
| 10  | `isSolidBlockingTile(int, int, int)`                             | Region.cpp:122 | `isSolidBlockingTile` | 145   | 0.92   | 一致：NULL → false；`isSolidBlocking() && isCubeShaped()` 短路顺序照抄                                     |
| 11  | `isSolidRenderTile(int, int, int)`                               | Region.cpp:129 | `isSolidRenderTile`   | 151   | 0.91   | 一致：NULL → false；否则 `isSolidRender()`                                                                 |
| 12  | `getBiome(int, int)`                                             | Region.cpp:135 | `getBiome`            | 157   | 1.00   | 一致：直接转 `level->getBiome`                                                                             |
| 13  | `getBiomeSource()`                                               | Region.cpp:139 | `getBiomeSource`      | 161   | 1.00   | 一致：直接转 `level->getBiomeSource`                                                                       |

“C++ 有、TS 没有的方法”：只有析构函数（已登记 OMIT）。
“TS 有、C++ 没有的方法”：无。

## 修复：W66（无行为修改）

1. 析构函数原来只有一句普通注释，按 R3 / 清单第 34 条补成可统计的
   `// OMIT(Cpp): ~Region()  Region.cpp:29`（内存由 GC 接管）。
2. 把 `// 审核 P3：…` 改成 `// ADAPTED(Cpp)（性能任务 P3）：…`。P3 是提交 `069d8c6` 的**性能任务**编号
   （区块数组压平、缓存方块 id），不是审核编号；改写后既是准确出处，也能被台账统计。
3. 缓存 `slabId` / `farmlandId` 补 `ADAPTED(Cpp)（性能任务 P3）`：C++ 每次 `getRawBrightness` 都读
   `Tile::stoneSlabHalf->id` / `Tile::farmland->id`，TS 在构造时缓存。`Region` 的创建点只有
   `Level.findPathToEntity` / `findPathToTile`（`Level.ts:426`、`:451`），都在 `initTiles` 之后；
   方块 id 注册后不再变，行为等价。
4. 世界边界判断补“怪癖保留”注释：C++ 是 `x < -MAX || z < -MAX || x >= MAX || z > MAX`，
   x 与 z 的符号不对称，照抄。
5. 删除 `isEmptyTile` 里照抄的 C++ 被注释行（`return getTile(...) == 0; //@todo?`，`Region.cpp:54`）；
   `getTileEntity` 的说明改成明确的行号（`Region.cpp:58-63`）并写明“未复制”。

`getTile` 的 `chunks[...]!` 后仍有 `lc === null` 检查：`!` 只是 TS 断言，运行时检查照常生效，
与 C++ 的 NULL 分支一致，未改。压平数组在**越界**时的表现与 C++ 的未定义行为不同
（C++ 越过行尾读 UB；TS 可能读到相邻行或抛 TypeError）。合法调用路径不会越界
（`getTile` 有范围检查；`getRawBrightness` / `getData` 与 C++ 一样依赖调用方），本次未加检查，列入待用户决定。

以上都只动注释/标记，运行时代码未改，因此没有红绿对照。新增测试锁定现有行为：
`getTile` 的 y/范围/NULL 分支、一维下标的 x/z 顺序、isEmpty / material / solid 分支、
`getData` 的 y 越界、`getRawBrightness` 的边界不对称与亮度表、slab/farmland 传播、biome 转发。

ADAPTED：压平 chunk 数组、缓存方块 id（新增 2 条标记）。OMIT：析构函数（新增 1 条）。DEFERRED：无。

## Region 35 条清单核对要点

- 第 1–2 条：字段全是 `int` 或指针，没有 float 形参/字段；`getBrightness` 返回的是
  `Float32Array` 里的值（C++ 的 `float` 数组），读出来已是 float，**不能**再包 `f()`。
- 第 3–7 条：无 float 运算、无 float 常量、无 int/float 混算，不适用。
- 第 8 条：`>> 4`（有符号）、`& 15`、`size_x * size_z`（合法缓存尺寸内不溢出）逐条核对；
  没有除法；`getRawBrightness` 的世界边界比较是 int 常量比较，没有位运算差异。
- 第 9–12 条：无 `Mth` / C 库数学函数、无 long、无字符串与格式化。
- 第 13 条（非虚函数）：`Region` 只有一个纯接口基类 `LevelSource`，没有通过基类静态类型调用
  子类同名实现的问题。
- 第 14–15 条：构造函数只调 `level->getChunk`；无虚调用、无默认参数（3 参 `getRawBrightness`
  是独立重载，按 R10 情形 A 合并）。
- 第 16 条（重载）：`getRawBrightness` 按参数个数分派，与 C++ 静态重载选择一致。
- 第 17 条（遮蔽）：构造函数形参 `level` 与成员同名，C++ 用 `this->level = level`，TS 用
  `this.level = level`，一致。
- 第 18 条：无 `super::`（只有接口实现）。
- 第 19 条：初始化顺序 `level → xc1 → zc1 → xc2/zc2 → size_x → size_z → chunks → 两个 id`；
  前 7 步与 C++ 相同，最后两步是 ADAPTED(Cpp) 的缓存。
- 第 20 条（可见性）：方法 public、字段 private，与 C++ 一致；既有测试没有在类外访问这些字段，未放宽。
- 第 21–25 条：`chunks` 是 C 数组的替代（一维 `Array`），下标按 `xc*size_z+zc`，
  与二维顺序一致；无 map/set/排序/哈希容器。
- 第 26–29 条：无随机数；循环顺序 xc→zc 与 C++ 相同；`isSolidBlockingTile` 的 `&&` 短路保留；
  `getRawBrightness` 递归取五格的顺序与 C++ 书写顺序一致（各调用无副作用）；
  被注释的 `getTileEntity`（cpp:58-63）与 `isEmptyTile` 旧实现（cpp:54）均未复制。
- 第 30–33 条：无字符串、char 符号、bool 转整数、日志。
- 第 34 条：新增 `ADAPTED(Cpp)` 2 条、`OMIT(Cpp)` 1 条；DEFERRED 0。
- 第 35 条：文件头“1:1 移植”仍准确；P3 注释改成 ADAPTED 并写清出处；边界不对称与
  `getTileEntity` 行号已核对。

## 验证

一条命令（`pnpm exec vitest` + 两个 tsc 工程 + 4 个文件的 prettier）：

- `pnpm exec vitest run tests/unit/world/light-region-audit.test.ts`：**VITEST=0**，
  `Test Files 1 passed (1)`、`Tests 15 passed (15)`。
- `npx tsc -p packages/world --noEmit`：**TSC_WORLD=0**（无输出）。
- `npx tsc -p tests/tsconfig.json --noEmit`：**TSC_TESTS=0**（无输出）。
- `npx prettier --check`（LightUpdate.ts、Region.ts、测试、本记录）：**PRETTIER=0**。

台账（严格正则实测这两个文件）：新增 **4** 条——`ADAPTED(Cpp)` 3 条（LightUpdate 构造函数合并、
Region 压平数组、Region 缓存 id）、`OMIT(Cpp)` 1 条（Region 析构函数）。
`assign` 的既有 `/** ADAPTED(Cpp) */` 是块注释形式，不计入台账（本次未改）。

## 越界行为（决定：保留原版 UB，不补检查）

`Region` 把二维 `chunks` 压平成数组后，越界下标与 C++ 的未定义行为表现不同（C++ 越行读 UB；
TS 可能读到相邻行或抛错）。审核结论：**不补范围检查**。理由：C++ 在同样的输入下也是 UB，
补检查会改变原版行为；合法调用路径不越界（`getTile` 自带范围检查；`getPathFinder` 只用
区域内的 `getData`）。`getRawBrightness` 在 `z == MAX_LEVEL_SIZE` 时同样保留原版 UB，
测试刻意不覆盖该值。
