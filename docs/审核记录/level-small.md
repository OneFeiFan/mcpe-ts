# world/level 小文件组（LevelSettings、LevelListener、LevelSource、LevelConstants、LightLayer、FoliageColor、GrassColor）

第 2 批（world/level）。7 个文件工作表共 33 行全部有结论。新增编号 W70-W76。

LevelSource 的 9 个纯虚函数与 LevelConstants 的 8 个静态常量没有出现在工作表里，另行逐项核对。新增 2 处 `OMIT`（LevelListener、LevelSource 的空虚析构函数原先漏登记）与 1 处 `ADAPTED(Cpp)`（LevelListener.addParticle 的联合签名）；没有发现行为差异，因此没有“已修”编号项，也没有运行时的先红后绿（W71 的 ADAPTED 有类型级红绿，见下）。

这 7 个文件都没有随机数、容器、整数除法或字符串格式化。FoliageColor / GrassColor 只影响颜色，按 R4 属“自由处理”档，不做 float 逐位舍入（两个文件头已注明“自由档”）。没有新增黄金样本。

## LevelSettings（src/world/level/LevelSettings.h ↔ packages/world/src/level/LevelSettings.ts）

C++ 侧要点：

- 只有 `.h`（参考树里没有 `LevelSettings.cpp`）。
- `namespace GameType` 四个常量：`Undefined = -1`、`Survival = 0`、`Creative = 1`、`Default = Creative`（即 `1`）。
- 构造函数 `LevelSettings(long seed, int gameType, bool allowCheats = false)`；字段 `private const long seed / const int gameType / const bool allowCheats`。
- 3 个 getter、`static LevelSettings None()`、`static int validateGameType(int)`、`static std::string gameTypeToString(int)`。
- 第 39–42 行是注释（“Those two should actually not be here”），不是代码，不复制。

工作表结论：

| #   | C++ 函数                         | C++ 位置           | TS 方法            | TS 行 | 结论                                                                                         |
| --- | -------------------------------- | ------------------ | ------------------ | ----- | -------------------------------------------------------------------------------------------- |
| 1   | `allowCheats(allowCheats)`       | LevelSettings.h:20 | （无独立方法）     | 10–14 | 工作表误配：这是构造函数初始化列表的第 3 项，不是独立函数；构造函数本身一致（见第 2 条说明） |
| 2   | `None()`                         | LevelSettings.h:23 | `None`             | 16    | 一致：`new LevelSettings(-1, -1, false)` 与 C++ 逐参数相同                                   |
| 3   | `getSeed()`                      | LevelSettings.h:27 | `getSeed`          | 20    | 一致：`long` → `number`（仓库统一约定，见下面“long”说明）                                    |
| 4   | `getGameType()`                  | LevelSettings.h:31 | `getGameType`      | 24    | 一致：字段 private readonly，getter public                                                   |
| 5   | `getAllowCheats()`               | LevelSettings.h:35 | `getAllowCheats`   | 28    | 一致                                                                                         |
| 6   | `validateGameType(int gameType)` | LevelSettings.h:43 | `validateGameType` | 32    | 一致：`case 1 / case 0` 原样返回实参，其余返回 `Default(1)`                                  |
| 7   | `gameTypeToString(int gameType)` | LevelSettings.h:52 | `gameTypeToString` | 41    | 一致：判断顺序 Survival → Creative → `"Undefined"`                                           |

构造函数的补充说明（工作表第 1 行）：C++ 初始化列表是 `seed(seed), gameType(gameType), allowCheats(allowCheats)`，与成员声明顺序一致；TS 构造函数参数属性 `private readonly seed / gameType / allowCheats = false` 同序，`allowCheats` 的默认值也一致。

`long` 说明：C++ `long seed` 是 64 位，TS 用 `number`。这是仓库统一约定（`LevelData.ts` 的 `private seed = 0; // long` 同样处理）；种子的实际来源是 32 位 `Random` 或用户输入整数，现有调用与黄金样本都在安全整数范围内，`getSeed` 只是存取，不做 64 位运算，因此没有可达的行为差异。不新增标记。

35 条清单核对：

- 第 1–2 条：`seed` 为 C++ `long`（TS `number`，见上）；`gameType` int、`allowCheats` bool；无 float 形参。
- 第 3–7 条：无浮点运算、float 常量、复合赋值、int/float 混算。
- 第 8 条：无除法、取模、移位；`validateGameType` 只做整数相等比较。
- 第 9–12 条：无数学函数、NaN/±0、long 运算、printf/字符串数字格式；`gameTypeToString` 只返回固定字符串。
- 第 13–18 条：无继承、虚函数、重载、遮蔽、`super::`；两个静态方法不是虚的；`None()` 直接构造同类对象。
- 第 19 条：构造顺序 seed → gameType → allowCheats，与 C++ 成员声明顺序一致。
- 第 20 条：C++ 字段 private const → TS `private readonly`；getter 与静态方法 public，未收窄。
- 第 21–25 条：无按值结构、容器、排序、哈希容器。
- 第 26–29 条：无随机数、无副作用求值顺序、无空 `if`/被注释调用（第 39–42 行只是注释）。
- 第 30–33 条：无字节字符串操作、char 转换、日志；bool 只作为返回值。
- 第 34 条：无既有标记，本文件无新增。
- 第 35 条：文件头与代码一致；没有过时注释。

测试：`level-small-audit.test.ts` 的 W70 共 5 条（GameType 四值、构造/getter/default、None、validateGameType、gameTypeToString）。

## LevelListener（src/world/level/LevelListener.h ↔ packages/world/src/level/LevelListener.ts）

C++ 侧要点：

- 16 个 `virtual` 方法，全部有空实现；`virtual ~LevelListener() {}` 是空虚析构。
- `tileBrightnessChanged` 的函数体是 `tileChanged(x, y, z);`，C++ 里这是虚调用（通过 `this` 派发）。
- `addParticle` 有两个重载：`const std::string&` 与 `ParticleType::Id`。
- `levelEvent(Player* source, ...)` 的指针可为空：`DoorTile.cpp:180`、`TrapDoorTile.cpp:115`、`ServerLevel.ts` 都传 `null`。
- 其余指针形参（`TripodCamera*`、`Entity*`、`TileEntity*`）在现有调用点都传有效对象。

工作表结论：

| #   | C++ 函数                                                                    | C++ 位置           | TS 方法                 | TS 行 | 结论                                                                                                             |
| --- | --------------------------------------------------------------------------- | ------------------ | ----------------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `setTilesDirty(int x0, int y0, int z0, int x1, int y1, int z1)`             | LevelListener.h:19 | `setTilesDirty`         | 10    | 一致：空实现                                                                                                     |
| 2   | `tileChanged(int x, int y, int z)`                                          | LevelListener.h:20 | `tileChanged`           | 12    | 一致：空实现                                                                                                     |
| 3   | `tileBrightnessChanged(int x, int y, int z)`                                | LevelListener.h:22 | `tileBrightnessChanged` | 14    | 一致：`this.tileChanged` 保持动态派发；测试用子类重写钉住                                                        |
| 4   | `skyColorChanged()`                                                         | LevelListener.h:23 | `skyColorChanged`       | 18    | 一致：空实现                                                                                                     |
| 5   | `allChanged()`                                                              | LevelListener.h:24 | `allChanged`            | 20    | 一致：空实现                                                                                                     |
| 6   | `takePicture(TripodCamera* cam, Entity* entity)`                            | LevelListener.h:26 | `takePicture`           | 22    | 一致：非空指针类型；`Level.takePicture` 与 `TripodCamera.tick` 都传有效对象（`LevelRenderer` 的同名实现已 OMIT） |
| 7   | `addParticle(const std::string& name, float x, …, int data)`                | LevelListener.h:28 | `addParticle`（string） | 24    | 一致：空实现；float 形参属 R4 自由档（粒子）                                                                     |
| 8   | `addParticle(ParticleType::Id name, float x, …, int data)`                  | LevelListener.h:29 | `addParticle`（Id）     | 34    | 一致：空实现；枚举类型沿用 `ParticleType.Id`                                                                     |
| 9   | `playSound(const std::string& name, float x, …, float volume, float pitch)` | LevelListener.h:31 | `playSound`             | 67    | 一致：空实现；声音属 R4 自由档                                                                                   |
| 10  | `playMusic(const std::string& name, float x, …, float songOffset)`          | LevelListener.h:32 | `playMusic`             | 69    | 一致：空实现；声音属 R4 自由档                                                                                   |
| 11  | `playStreamingMusic(const std::string& name, int x, int y, int z)`          | LevelListener.h:33 | `playStreamingMusic`    | 71    | 一致：空实现                                                                                                     |
| 12  | `entityAdded(Entity* entity)`                                               | LevelListener.h:35 | `entityAdded`           | 73    | 一致：空实现；调用点都传有效实体                                                                                 |
| 13  | `entityRemoved(Entity* entity)`                                             | LevelListener.h:36 | `entityRemoved`         | 75    | 一致：空实现                                                                                                     |
| 14  | `levelEvent(Player* source, int type, int x, int y, int z, int data)`       | LevelListener.h:38 | `levelEvent`            | 77    | 一致：C++ 指针可空，TS 写 `Player \| null`；调用方确实传 null                                                    |
| 15  | `tileEvent(int x, int y, int z, int b0, int b1)`                            | LevelListener.h:39 | `tileEvent`             | 86    | 一致：空实现                                                                                                     |
| 16  | `tileEntityChanged(int x, int y, int z, TileEntity* te)`                    | LevelListener.h:40 | `tileEntityChanged`     | 88    | 一致：空实现；`TileEntity.setChanged` 传 `this`，不会为空                                                        |
| —   | `~LevelListener()`                                                          | LevelListener.h:17 | **（无）**              | —     | OMIT：空虚析构函数，R3 不移植；本次补 `// OMIT(LevelListener)`                                                   |

W71 修复/登记：

1. **OMIT 析构函数**：补 `// OMIT(LevelListener): virtual ~LevelListener() {}  LevelListener.h:17`。只是登记，不改行为，没有先红后绿。
2. **ADAPTED(Cpp) 联合签名**：TS 在第 46 行多了一个 `addParticle(name: string | ParticleType.Id, …)` 重载。C++ 只有两个重载，但 `Level.addParticle` 的形参就是 `string | ParticleType.Id`，它原样转发给监听器（`Level.ts:983`）；没有这个联合签名，TS 的重载解析无法接受联合实参。
   - 类型级红绿：临时删掉这个联合签名后 `npx tsc -p packages/world --noEmit` 退出码 **2**，报 `packages/world/src/level/Level.ts(983,39): error TS2769: No overload matches this call`（string 重载拒绝 number，Id 重载拒绝 string）；从备份恢复后退出码 **0**，`diff` 为空。

35 条清单核对：

- 第 1–2 条：形参是 int / float / 指针；float 只出现在 addParticle / playSound / playMusic，属 R4 自由档（粒子/声音），且基类实现为空，C++ 的形参舍入在调用点发生，不需要在空体里补 `f()`。
- 第 3–7 条：函数体内没有浮点运算、常量、复合赋值或 int/float 混算。
- 第 8 条：无除法、取模、移位。
- 第 9–12 条：无数学函数、NaN、long、字符串格式化；`std::string` 只作为形参类型。
- 第 13–18 条：16 个虚函数 → 普通方法；`tileBrightnessChanged` 的 `this.tileChanged` 与 C++ 的虚调用一致；没有 `super::`、默认参数或遮蔽。
- 第 19–20 条：类没有成员，构造函数隐式；全部方法 public，与 C++ 的 `public:` 一致。
- 第 21–25 条：无按值结构、容器、排序、哈希；监听器列表的遍历顺序在 `Level` 里保持 vector 顺序（不在本文件）。
- 第 26–29 条：无随机数、无短路求值影响；C++ 没有空 `if` 或被注释掉的调用。
- 第 30–33 条：本文件不对字符串做字节操作；无 char / bool↔int 转换；无日志。
- 第 34 条：新增 1 处 OMIT、1 处 ADAPTED(Cpp)；无 DEFERRED。
- 第 35 条：文件头补了“析构按 R3 不移植、联合签名是 TS 适配”的说明，与代码一致。

测试：`level-small-audit.test.ts` 的 W71 共 4 条（默认空操作、tileBrightnessChanged 动态派发、addParticle 三种调用、levelEvent 传 null）。

## LevelSource（src/world/level/LevelSource.h ↔ packages/world/src/level/LevelSource.ts）

C++ 侧要点：

- 纯虚接口：9 个 `virtual ... = 0`，加上 `virtual ~LevelSource() {}`。
- 第 22 行是注释掉的 `//virtual TileEntity* getTileEntity(int x, int y, int z) = 0;`，不复制。
- `getMaterial` 返回 `const Material*`；`Level::getMaterial`（Level.cpp:592）对 tile 0 返回 `Material::air`，其余返回 `Tile::tiles[t]->material`，不会为空。TS 的 `Level` / `Region` 实现同样对 tile 0 返回 `Material.air`。
- `getBrightness` 返回 float；接口层只能是 `number`，具体 float 语义由实现方（Level / Region）负责。

工作表 0 行（工具没有列出纯虚声明）；人工核对 9 个方法 + 析构：

| #   | C++ 函数                                                         | C++ 位置         | TS 方法               | TS 行 | 结论                                                                 |
| --- | ---------------------------------------------------------------- | ---------------- | --------------------- | ----- | -------------------------------------------------------------------- |
| 1   | `virtual int getTile(int x, int y, int z) = 0`                   | LevelSource.h:19 | `getTile`             | 8     | 一致                                                                 |
| 2   | `virtual bool isEmptyTile(int x, int y, int z) = 0`              | LevelSource.h:20 | `isEmptyTile`         | 9     | 一致                                                                 |
| 3   | `virtual float getBrightness(int x, int y, int z) = 0`           | LevelSource.h:24 | `getBrightness`       | 10    | 一致（接口层）：float → number；实现方的 float 舍入在其自身文件审核  |
| 4   | `virtual int getData(int x, int y, int z) = 0`                   | LevelSource.h:26 | `getData`             | 11    | 一致                                                                 |
| 5   | `virtual const Material* getMaterial(int xx, int i, int zz) = 0` | LevelSource.h:28 | `getMaterial`         | 12    | 一致：C++ 不会返回空指针，TS 用非空 `Material`；形参名不同不影响签名 |
| 6   | `virtual bool isSolidRenderTile(int x, int i, int z) = 0`        | LevelSource.h:30 | `isSolidRenderTile`   | 13    | 一致                                                                 |
| 7   | `virtual bool isSolidBlockingTile(int x, int i, int z) = 0`      | LevelSource.h:31 | `isSolidBlockingTile` | 14    | 一致                                                                 |
| 8   | `virtual BiomeSource* getBiomeSource() = 0`                      | LevelSource.h:33 | `getBiomeSource`      | 15    | 一致：实现返回有效对象（Level.dimension.biomeSource / Region 转发）  |
| 9   | `virtual Biome* getBiome(int x, int z) = 0`                      | LevelSource.h:34 | `getBiome`            | 16    | 一致：`Level.getBiome` 用 `!` 断言 biomeSource 已初始化              |
| —   | `virtual ~LevelSource() {}`                                      | LevelSource.h:17 | **（无）**            | —     | OMIT：空虚析构函数，R3 不移植；本次补 `// OMIT(LevelSource)`         |

W72 修复/登记：补 `// OMIT(LevelSource): virtual ~LevelSource() {}  LevelSource.h:17`。只是登记，不改行为，没有先红后绿。

35 条清单核对：

- 第 1–2 条：9 个签名逐项核对；`getBrightness` 的 float 在接口层写成 number；`getMaterial` 的 `const Material*` 因实现不会为空而写成 `Material`；其余 int/bool 指针语义对应。
- 第 3–8 条：接口没有函数体，无运算、除法、移位。
- 第 9–12 条：无数学函数、NaN/±0、long、字符串格式化。
- 第 13–18 条：纯虚函数 → `interface` 成员（PITFALLS 12/15）；接口没有默认实现；析构 OMIT。
- 第 19–20 条：接口没有成员与构造函数；成员在 C++ `public:` 段，TS 接口天然 public。
- 第 21–25 条：无按值结构、容器、排序、哈希。
- 第 26–29 条：无随机数；第 22 行注释掉的 `getTileEntity` 没有复制。
- 第 30–33 条：无字符串操作、char/bool 转换、日志。
- 第 34 条：新增 1 处 OMIT；无 DEFERRED、无失效标记。
- 第 35 条：文件头注明“析构函数按 R3 不移植”，与代码一致。

测试：`level-small-audit.test.ts` 的 W72 用 `Record<keyof LevelSource, true>` 做类型级穷举，运行时断言 9 个方法名与 C++ 一一对应。

## LevelConstants（src/world/level/LevelConstants.h / .cpp ↔ packages/world/src/level/LevelConstants.ts）

C++ 侧要点：

- 8 个 `static int`（可变，不是 const）：`CHUNK_CACHE_WIDTH`、`LEVEL_WIDTH`、`LEVEL_DEPTH`、`LEVEL_HEIGHT`、`CHUNK_WIDTH`、`CHUNK_DEPTH`、`CHUNK_COLUMNS`、`CHUNK_BLOCK_COUNT`。
- `.cpp` 的初值：`LEVEL_HEIGHT = 128`、`CHUNK_CACHE_WIDTH = 16`、`CHUNK_WIDTH = 16`、`CHUNK_DEPTH = 16`、`LEVEL_WIDTH = 16 * 16 = 256`、`LEVEL_DEPTH = 16 * 16 = 256`、`CHUNK_COLUMNS = 16 * 16 = 256`、`CHUNK_BLOCK_COUNT = 256 * 128 = 32768`。
- `CHUNK_CACHE_WIDTH` 是可被专用服务器/网络包改写的静态量；TS 的调用方每次都读字段（见 `ChunkCache` 审核记录），没有被常量折叠。

工作表 0 行（没有函数）；人工核对 8 个常量：

| #   | C++ 常量                                           | C++ 位置              | TS 常量             | TS 行 | 结论                     |
| --- | -------------------------------------------------- | --------------------- | ------------------- | ----- | ------------------------ |
| 1   | `CHUNK_CACHE_WIDTH = 16`                           | LevelConstants.cpp:4  | `CHUNK_CACHE_WIDTH` | 3     | 一致，public static 可写 |
| 2   | `CHUNK_WIDTH = 16`                                 | LevelConstants.cpp:5  | `CHUNK_WIDTH`       | 4     | 一致                     |
| 3   | `CHUNK_DEPTH = 16`                                 | LevelConstants.cpp:6  | `CHUNK_DEPTH`       | 5     | 一致                     |
| 4   | `LEVEL_WIDTH = CHUNK_CACHE_WIDTH * CHUNK_WIDTH`    | LevelConstants.cpp:7  | `LEVEL_WIDTH`       | 6     | 一致，256                |
| 5   | `LEVEL_DEPTH = CHUNK_CACHE_WIDTH * CHUNK_DEPTH`    | LevelConstants.cpp:8  | `LEVEL_DEPTH`       | 7     | 一致，256                |
| 6   | `LEVEL_HEIGHT = 128`                               | LevelConstants.cpp:3  | `LEVEL_HEIGHT`      | 8     | 一致                     |
| 7   | `CHUNK_COLUMNS = CHUNK_WIDTH * CHUNK_DEPTH`        | LevelConstants.cpp:9  | `CHUNK_COLUMNS`     | 9     | 一致，256                |
| 8   | `CHUNK_BLOCK_COUNT = CHUNK_COLUMNS * LEVEL_HEIGHT` | LevelConstants.cpp:10 | `CHUNK_BLOCK_COUNT` | 10–11 | 一致，32768              |

TS 的字段声明顺序与 `.cpp` 的定义顺序不同（TS 先写 `CHUNK_*`，把 `LEVEL_HEIGHT` 放在 `LEVEL_DEPTH` 之后），但每个派生字段引用的字段都已经在它之前初始化，且静态初始化没有副作用，所以结果相同。C++ 的 `int` 乘法在这里都是 16×16、256×128，远小于 2³¹，不需要 `Math.imul`/`| 0`。

35 条清单核对：

- 第 1–2 条：8 个字段都是 C++ int → TS number；没有 float 形参。
- 第 3–7 条：只有整数乘法，无浮点常量/复合赋值/混算。
- 第 8 条：无除法、取模、移位；乘法结果在 int 范围内。
- 第 9–12 条：无数学函数、NaN、long、字符串格式化。
- 第 13–20 条：无继承、虚函数、重载、构造；public static 与 C++ `public:` 一致；初始化顺序说明见上。
- 第 21–25 条：无按值结构、容器、排序、哈希。
- 第 26–29 条：无随机数、无被注释调用。
- 第 30–33 条：无字符串、char/bool 转换、日志。
- 第 34 条：无既有标记，无新增。
- 第 35 条：文件头与代码一致；派生关系由测试逐条钉住。

测试：`level-small-audit.test.ts` 的 W73 共 2 条（8 个绝对值和 4 个乘法关系）。

## LightLayer（src/world/level/LightLayer.h / .cpp ↔ packages/world/src/level/LightLayer.ts）

C++ 侧要点：

- `static const LightLayer Sky` 与 `static const LightLayer Block`，定义在 `.cpp`：`Sky(15)`、`Block(0)`。
- `const int surrounding` 是 public；构造函数 private。
- 调用方按对象身份比较（C++ 比较地址）：`Level.ts:758/760/762`、`LightUpdate.ts:115/117`、`LevelChunk.ts:383/384` 都用 `=== LightLayer.Sky/Block`。

工作表结论：

| #   | C++ 函数                    | C++ 位置           | TS 方法                  | TS 行 | 结论                                                                                                         |
| --- | --------------------------- | ------------------ | ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `surrounding(surrounding_)` | LightLayer.h:15–17 | （私有构造函数参数属性） | 6     | 工作表误配：这是私有构造函数的初始化列表，不是独立函数；`private constructor(readonly surrounding)` 一一对应 |

工作表漏列的静态实例（人工核对）：

| C++ 常量               | C++ 位置         | TS 常量                     | TS 行 | 结论                              |
| ---------------------- | ---------------- | --------------------------- | ----- | --------------------------------- |
| `LightLayer::Sky(15)`  | LightLayer.cpp:3 | `Sky = new LightLayer(15)`  | 3     | 一致，`static readonly`；身份稳定 |
| `LightLayer::Block(0)` | LightLayer.cpp:4 | `Block = new LightLayer(0)` | 4     | 一致，`static readonly`；身份稳定 |

35 条清单核对：

- 第 1–2 条：`surrounding` 是 const int → readonly number；`Sky`/`Block` 是 static const 对象 → static readonly 实例。
- 第 3–8 条：无运算、除法、移位。
- 第 9–12 条：无数学函数、NaN、long、字符串格式化。
- 第 13–20 条：私有构造函数保留；两个实例按 `.cpp` 顺序创建；`surrounding` public，构造函数 private，与 C++ 一致；没有子类或虚函数。
- 第 21–25 条：按身份使用两个静态实例，不复制、不比较内容；无容器。
- 第 26–29 条：无随机数、无被注释调用。
- 第 30–33 条：无字符串、char/bool 转换、日志。
- 第 34 条：无既有标记，无新增。
- 第 35 条：文件头说明“只有 Sky/Block 两个实例、按身份比较”，与代码一致。

测试：`level-small-audit.test.ts` 的 W74 共 1 条（surrounding 15/0、身份不同且稳定）。

## FoliageColor（src/world/level/FoliageColor.h / .cpp ↔ packages/world/src/level/FoliageColor.ts）

C++ 侧要点：

- `static bool useTint = true`（`.cpp:4`）；`setUseTint(bool)` 直接赋值；`init(int* p)` 把 `pixels` 指到传入数组；`private static int* pixels = nullptr`（`.cpp:13`）。
- `get(float temp, float rain)`：`rain *= temp; int x = (int)((1 - temp) * 255); int y = (int)((1 - rain) * 255); return pixels[y << 8 | x];`
- 三个颜色常量：`getEvergreenColor() = 0x619961`、`getBirchColor() = 0x80a755`、`getDefaultColor() = 0x48b518`。
- 头文件第 19–28 行是被注释掉的旧 `init(int[])` 与 `get` 实现，不复制；实际使用的是第 31 行 `init(int*)` 与第 35 行 `get` 声明。

工作表结论：

| #   | C++ 函数                      | C++ 位置           | TS 方法             | TS 行 | 结论                                                                                                                                                                                                                                                                   |
| --- | ----------------------------- | ------------------ | ------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `get(float temp, float rain)` | FoliageColor.cpp:6 | `get`               | 15    | 一致：R4 自由档（只影响颜色）。公式逐行相同；调用方把 temp/rain 限制在 [0,1]（`Biome.getGrassColor` 用 `Mth.clamp`，GrassTile/LeafTile/TallGrass 取 biome 的 temperature/downfall），x/y ∈ [0,255]，`\| 0` 与 C++ `(int)` 在这些输入上相同；越界/NaN 是 C++ UB，不复刻 |
| 2   | `setUseTint(bool value)`      | FoliageColor.h:11  | `setUseTint`        | 7     | 一致：直接写静态字段                                                                                                                                                                                                                                                   |
| 3   | `init(int* p)`                | FoliageColor.h:31  | `init`              | 11    | 一致：`int*` → `Int32Array`；`Textures.loadTexturePixels` 返回的正是 `Int32Array`，ARGB 按有符号 32 位保存                                                                                                                                                             |
| 4   | `getEvergreenColor()`         | FoliageColor.h:37  | `getEvergreenColor` | 22    | 一致：`0x619961`                                                                                                                                                                                                                                                       |
| 5   | `getBirchColor()`             | FoliageColor.h:41  | `getBirchColor`     | 26    | 一致：`0x80a755`                                                                                                                                                                                                                                                       |
| 6   | `getDefaultColor()`           | FoliageColor.h:45  | `getDefaultColor`   | 30    | 一致：`0x48b518`                                                                                                                                                                                                                                                       |

工作表没有单列静态字段（人工核对）：`useTint = true`（`.h:9` / `.cpp:4` ↔ TS 第 4 行）、`pixels = nullptr`（`.h:51` / `.cpp:13` ↔ TS 第 5 行 `Int32Array | null = null`）。

`get` 的自由档说明：C++ 的 `rain *= temp` 与 `(1 - temp) * 255` 是 float 运算；R4 把渲染/颜色列入“自由处理”，文件头也注明了“自由档”，所以 TS 用 double 计算、不逐步 `f()`。颜色索引只用于取像素，不影响世界状态、存档或随机序列。测试用 0.5/1/0 这些二进制精确值，不依赖 double/float 的舍入边界。

35 条清单核对：

- 第 1–2 条：`temp`/`rain` 是 C++ float，按 R4 自由档不在入口 `f()`；`useTint` bool、`pixels` int* → `Int32Array | null`。
- 第 3–7 条：函数体内有 float 运算（`rain *= temp`、`(1 - temp) * 255`），按自由档用 double；没有 float 常量、复合赋值或 int/float 混算的逐位要求。
- 第 8 条：`y << 8 | x` 与 C++ 相同；`(int)` 用 `| 0`，在 x/y ∈ [0,255] 与 `f2i` 相同；无除法。
- 第 9–12 条：无数学函数、可达的 NaN 路径、long、字符串格式化。
- 第 13–20 条：纯静态类；`pixels` private，`useTint` public；静态初值与 `.cpp` 一致（`useTint=true`、`pixels=nullptr`），`init` 由 `Minecraft.initApp` 调用。
- 第 21–25 条：`int*` → `Int32Array`（保持有符号 ARGB，测试用 `-1` 钉住）；无容器、排序、哈希。
- 第 26–29 条：无随机数；头文件中被注释掉的旧 `init/get` 没有复制。
- 第 30–33 条：无字符串操作、char 转换、日志；`useTint` 是 bool 字段，无 bool↔int 混算。
- 第 34 条：无既有标记，无新增。
- 第 35 条：文件头“自由档”与 R4 一致；颜色常量与取值公式由测试钉住。

测试：`level-small-audit.test.ts` 的 W75 共 3 条（三个颜色常量、useTint 开关、get 的索引与符号）。

## GrassColor（src/world/level/GrassColor.h / .cpp ↔ packages/world/src/level/GrassColor.ts）

C++ 侧要点：

- 与 FoliageColor 相同的 `useTint = true`、`setUseTint`、`init(int*)`、`get(float, float)` 与 `private static int* pixels = nullptr`；没有额外的颜色常量。
- 头文件第 19–28 行同样是被注释掉的旧 `init(int[])` / `get`，不复制。

工作表结论：

| #   | C++ 函数                      | C++ 位置         | TS 方法      | TS 行 | 结论                                                                                                                                                                                                                                     |
| --- | ----------------------------- | ---------------- | ------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `get(float temp, float rain)` | GrassColor.cpp:6 | `get`        | 15    | 一致：R4 自由档（只影响颜色）。公式逐行相同；调用方把 temp/rain 限制在 [0,1]（`Biome.getGrassColor` 用 `Mth.clamp`，GrassTile/TallGrass 取 biome 值），x/y ∈ [0,255]，`\| 0` 与 C++ `(int)` 在这些输入上相同；越界/NaN 是 C++ UB，不复刻 |
| 2   | `setUseTint(bool value)`      | GrassColor.h:11  | `setUseTint` | 7     | 一致：直接写静态字段                                                                                                                                                                                                                     |
| 3   | `init(int* p)`                | GrassColor.h:31  | `init`       | 11    | 一致：`int*` → `Int32Array`，与 `Textures.loadTexturePixels` 的返回类型一致                                                                                                                                                              |

工作表没有单列静态字段（人工核对）：`useTint = true`（`.h:9` / `.cpp:4` ↔ TS 第 4 行）、`pixels = nullptr`（`.h:39` / `.cpp:13` ↔ TS 第 5 行 `Int32Array | null = null`）。

35 条清单核对：

- 第 1–2 条：`temp`/`rain` 是 C++ float，按 R4 自由档不在入口 `f()`；`useTint` bool、`pixels` int* → `Int32Array | null`。
- 第 3–7 条：有 float 运算，按自由档用 double；无逐位要求。
- 第 8 条：`y << 8 | x` 与 C++ 相同；`(int)` 用 `| 0`，在可达范围内与 `f2i` 相同；无除法。
- 第 9–12 条：无数学函数、可达的 NaN 路径、long、字符串格式化。
- 第 13–20 条：纯静态类；`pixels` private，`useTint` public；静态初值一致。
- 第 21–25 条：`int*` → `Int32Array`（保持有符号 ARGB，测试用 `-1` 钉住）；无容器。
- 第 26–29 条：无随机数；头文件中被注释掉的旧代码没有复制。
- 第 30–33 条：无字符串、char/bool 转换、日志。
- 第 34 条：无既有标记，无新增。
- 第 35 条：文件头“自由档”与 R4 一致；公式由测试钉住。

测试：`level-small-audit.test.ts` 的 W76 共 2 条（useTint 开关、get 的索引与符号）。

## 标记与修复汇总

| 编号 | 文件           | 类型           | 内容                                                                  |
| ---- | -------------- | -------------- | --------------------------------------------------------------------- |
| W70  | LevelSettings  | 审核通过       | 无代码改动；GameType/构造/静态方法全部一致                            |
| W71  | LevelListener  | OMIT + ADAPTED | 补析构函数 OMIT；补 addParticle 联合签名的 ADAPTED(Cpp)（类型级红绿） |
| W72  | LevelSource    | OMIT           | 补析构函数 OMIT                                                       |
| W73  | LevelConstants | 审核通过       | 无代码改动；8 个常量逐值一致                                          |
| W74  | LightLayer     | 审核通过       | 无代码改动；Sky/Block 的 15/0 与身份一致                              |
| W75  | FoliageColor   | 审核通过       | 无代码改动；三个颜色常量与公式一致（R4 自由档）                       |
| W76  | GrassColor     | 审核通过       | 无代码改动；公式一致（R4 自由档）                                     |

新增标记共 **3 条**：`OMIT(LevelListener)`、`ADAPTED(Cpp)`（LevelListener.ts:44）、`OMIT(LevelSource)`。没有 `DEFERRED(待确认)`、没有新增 `OMIT` 失效项。

## 验证

- `pnpm exec vitest run tests/unit/world/level-small-audit.test.ts`：退出码 **0**，`Test Files 1 passed (1)`，`Tests 18 passed (18)`。
- `npx tsc -p packages/world --noEmit`：退出码 **0**。
- `npx tsc -p tests/tsconfig.json --noEmit`：最终退出码 **0**，0 个错误。（首轮曾在 `tests/unit/world/mobspawner-audit.test.ts(49,11)` 与 `(73,11)` 看到 2 个错误，那是并行批次 W62/W63 的进行中文件；本组没有修改它，最终复核时该批次已修好。）
- `npx prettier --check` 7 个 TS 文件 + `tests/unit/world/level-small-audit.test.ts` + 本记录：退出码 **0**。
- W71 的 ADAPTED 类型级红绿：删掉联合签名 → `tsc -p packages/world` 退出码 **2**（`Level.ts(983,39) TS2769`）；恢复 → 退出码 **0**。
- 台账：本组 7 个文件新增 3 条严格正则标记（2 OMIT + 1 ADAPTED），与上表一致。
