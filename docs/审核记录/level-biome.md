# Biome 模块（src/world/level/biome/ ↔ packages/world/src/level/biome/）

第 2 批（world/level/biome，W80–W87）。八个文件的工作表全部有结论：`Biome` 23 行、`BiomeInclude` 0 行、
`BiomeSource` 10 行、五个子群系 0 + 1 + 1 + 0 + 1 行。
C++ `Biome.h` 103 行 + `Biome.cpp` 256 行 + `BiomeInclude.h` 11 行 + `BiomeSource.h` 62 行 +
`BiomeSource.cpp` 178 行 + `FlatBiome.h` 11 行 + `ForestBiome.h` 25 行 + `RainforestBiome.h` 22 行 +
`SwampBiome.h` 11 行 + `TaigaBiome.h` 22 行。TS 行数：`Biome.ts` 319（审核前 316）、`BiomeInclude.ts` 16、
`BiomeSource.ts` 238（审核前 237，+1 条 OMIT）、`FlatBiome.ts` 8、`ForestBiome.ts` 23、
`RainforestBiome.ts` 19、`SwampBiome.ts` 8、`TaigaBiome.ts` 20。
新增编号 **W80–W87**；新增 2 处 `ADAPTED(Safety)`、1 处 `OMIT`；1 处运行时修复（W80-1）。

C++ 侧要点：

- `BiomeSource` 有两个构造函数：无参版是 `protected`（把三张噪声图与三个缓冲区置 NULL、长度置 0，
  再 `new Biome*[16*16]`），带 `Level*` 的版本是 `public`（用 `getSeed() * 9871 / 39811 / 543321`
  播种三个 `Random`，建三张 `PerlinSimplexNoise`，并分配 `temperatures` 16×16；`downfalls`、`noises`
  仍是 NULL）。析构函数逐个 `delete` 三张图与四个数组。
- 常量全是 float：`zoom = 2 * 1`、`tempScale = zoom / 80.0f`、`downfallScale = zoom / 40.0f`、
  `noiseScale = 1 / 4.0f`。
- 原版怪癖（照原样保留）：
  - `getBiomeBlock` 取三张噪声图时**宽高都传 w**（`w, w`），循环却是 `yy < w`、`xx < h`；
  - `getTemperatureBlock` / `getDownfallBlock` 的第一个指针参数**完全没用**，写的是成员数组；
  - `getDownfallBlock` 同样忽略 `h`（`w, w`）；
  - `getBiomeBlock` 的私有重载参数 `biomes__` 没有用到，写的是成员 `biomes`；
  - `ForestBiome::getTreeFeature` 在非白桦分支里仍调用一次 `nextInt(3)`，但分支体是空的；
    `RainforestBiome` 每次也先取一次 `nextInt(3)` 再返回橡树。
- `BiomeSource` 里 `getRegion` 的 `float` 形参在 `PerlinNoise.getRegion` 内部统一 `fround`
  （`getRegion3D` 开头三行），所以 `0.3333f`、`0.588f` 这类实参在 TS 里传 double 也会先收口成 float。

## 工作表结论

| #   | C++ 函数                                                    | C++ 位置              | TS 方法               | TS 行 | 相似度 | 结论                                                                                     |
| --- | ----------------------------------------------------------- | --------------------- | --------------------- | ----- | ------ | ---------------------------------------------------------------------------------------- |
| 1   | `BiomeSource()`                                             | BiomeSource.cpp:12    | `constructor`（无参） | 53    | 0.12   | 一致：三个 `Random` 与 16×16 的 `biomes` 都建好；C++ 的 protected 与 TS 重载不能分可见性，已由文件头说明 |
| 2   | `BiomeSource(Level*)`                                       | BiomeSource.cpp:28    | `constructor`（带参） | 60    | 0.40   | 一致：三个种子用 `Math.imul(seed, k)` 取 long 乘法的低 32 位（Random 只用低 32 位）；噪声图与 16×16 温度表相同 |
| 3   | `~BiomeSource()`                                            | BiomeSource.cpp:49    | **（无）**            | —     | —      | **OMIT**：逐个 `delete`，JS 由 GC 接管（R3）                                              |
| 4   | `getBiome(const ChunkPos& chunk)`                           | BiomeSource.cpp:62    | `getBiomeChunk`       | 73    | 1.00   | 一致：`getBiome(chunk.x << 4, chunk.z << 4)`；`getBiome` 另有 ChunkPos 重载走同一路径     |
| 5   | `getBiome(int x, int z)`                                    | BiomeSource.cpp:67    | `getBiome`            | 79    | 0.54   | 一致：`getBiomeBlock(x, z, 1, 1)[0]`，null 归一为 null                                    |
| 6   | `getTemperature(int x, int z)`                              | BiomeSource.cpp:72    | `getTemperature`      | 86    | 0.93   | 一致：1×1 的原始噪声值（未做 `1-(1-t)²` 变换，原样保留）                                  |
| 7   | `getBiomeBlock(int x, int z, int w, int h)`                 | BiomeSource.cpp:78    | `getBiomeBlock`       | 100   | 0.95   | 一致：写回成员数组并返回同一个引用                                                        |
| 8   | `getBiomeBlock(Biome** biomes__, int x, int z, int w, int h)` | BiomeSource.cpp:84  | `getBiomeBlockImpl`   | 106   | 0.88   | 一致：`biomes__` 参数照原样不用；三张图都传 `w, w`；循环 `yy < w` / `xx < h`；逐步 float |
| 9   | `getTemperatureBlock(float* temperatures__, int x, int z, int w, int h)` | BiomeSource.cpp:126 | `getTemperatureBlock` | 169 | 0.88 | 一致：忽略传入缓冲区，写成员 `temperatures`；`ot != temperatures` 的 LOGI 保留为空 if      |
| 10  | `getDownfallBlock(float* downfalls__, int x, int z, int w, int h)` | BiomeSource.cpp:167 | `getDownfallBlock` | 219 | 0.92   | 一致：忽略传入缓冲区与 `h`，按 `w, w` 取图，返回成员 `downfalls`                          |

C++ 有、TS 没有的方法：析构函数（OMIT）。
TS 里有、C++ 没有的方法：无（`getBiome` 的 ChunkPos 重载对应 C++ 的同名重载；`_biomes` / `_temperatures` /
`_downfalls` 是未用形参的 TS 命名）。

`FlatBiome`（W83）：C++ 是空类（只有隐式构造/析构）。TS 只多写了一个显式 `constructor` 调 `super()`，
行为相同；没有重写任何方法。

`ForestBiome`（W84）：`nextInt(5) == 0` → `BirchFeature`；否则再取一次 `nextInt(3)`（空 if），
最后返回 `new TreeFeature(false)`。TS 逐句相同，随机数消耗顺序也相同。

`RainforestBiome`（W85）：先取一次 `nextInt(3)`（空 if），再返回 `new TreeFeature(false)`。一致。

`SwampBiome`（W86）：C++ 是空类。TS 与 FlatBiome 同样只多一个显式构造。

`TaigaBiome`（W87）：`nextInt(3) == 0` → `PineFeature`，否则 `SpruceFeature`。一致。

## 修复

本轮**没有运行时修改**：逐函数对照后行为全部一致，只补了一条 `OMIT` 登记（`~BiomeSource`）。
因此没有“先红后绿”；新增的 `biome-source-audit.test.ts`（10 条）是对 C++ 行为的行为锁定：

- 四个常量的 float 位模式；`getBiomeChunk` 与 `getBiome(x<<4, z<<4)`、`getBiomeBlock(...,1,1)[0]` 同源；
- `getTemperatureBlock` / `getDownfallBlock` 忽略传入缓冲区、返回成员数组的怪癖；
- `getDownfallBlock` 的 `w, w`（忽略 `h`）；
- 缓冲区不缩容：构造时 `temperatures` 256，`downfalls` 由首次 4×4 的 `getRegion` 分配为 16；
- 五个子群系的随机数消耗顺序（`[5]` / `[5,3]` / `[3]` / `[3]` / `[10]`）与返回的地物类型；
- `FlatBiome` / `SwampBiome` 的 prototype 上只有 `constructor`，没有重写。

数值链本身另有既有的 `tests/golden/biomesource.golden.test.ts`（两个种子的 16×16 温度/降水逐位比对、
原始温度、温度块、降水块）作为判据。

## 35 条清单核对要点

- 第 1–2 条：温度/降水/噪声全部按 float 逐步计算；`getRegion` 的 float 形参在 `PerlinNoise` 内部收口；
  `seed` 是 long，`Math.imul` 取低 32 位与 `Random` 的 `mt[0] = seed >>> 0` 对齐。
- 第 3–7 条：`noise * 1.1f + 0.5f`、`(t * 0.15f + 0.7f) * split1 + noise * split2`、
  `1 - (1-t)²` 全部按 C++ 左结合逐步 `f()`；比较与截断用 float 值。
- 第 8 条：无整数除法；`getRegion` 内部由 `PerlinNoise` 负责。
- 第 9–12 条：`ChunkPos` 的 `<< 4` 与 C++ int 移位一致；无字符串格式化。
- 第 13–18 条：虚函数关系正确（`getBiome` / `getBiomeBlock` / `getTemperature*` / `getDownfallBlock`）；
  R10 把私有重载拆成 `getBiomeBlockImpl`；`biomes__` 等未用参数按 C++ 保留。
- 第 19 条：字段初始化顺序与 C++ 初始化列表一致；`temperatures` 在无参构造里保持 NULL。
- 第 20 条：C++ 无参构造是 protected，TS 两个重载不能分可见性——文件头已说明，调用方都走带参版本。
- 第 21–25 条：返回成员数组引用（对应 C++ 返回成员指针）；无容器/排序/哈希。
- 第 26–29 条：三个 `Random` 的种子与消耗顺序一致；空 if 也消耗随机数（已锁定）。
- 第 30–33 条：无字符串；`LOGI("tmp ptr changed\n")` 保留为注释。
- 第 34 条：新增 1 处 `OMIT`（`~BiomeSource`）。
- 第 35 条：文件头关于缓冲区与 `w, w` 怪癖的说明与代码一致，未改。

## 验证

- `pnpm exec vitest run tests/unit/world/biome-source-audit.test.ts`：10/10 通过。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check packages/world/src/level/biome/BiomeSource.ts tests/unit/world/biome-source-audit.test.ts`：通过。
- `pnpm ledger`：217 → 218 条（+1 `OMIT`）。

## Biome 核心（W80）与 BiomeInclude（W81）

### C++ 侧要点

- `Biome` 的构造函数是 `protected`；初始化列表只有 `topMaterial`（`Tile::grass->id`）、
  `material`（`Tile::dirt->id`）、`leafColor(0x4EE031)`。构造函数体按顺序填 4 个友军、4 个敌人，
  再重算 `defaultTotalEnemyWeight`（30）与 `defaultTotalFriendlyWeight`（40）。
- `color`、`temperature`、`downfall` **没有初始化**；其中 `temperature` / `downfall` 在参考 C++ 里
  从未被赋值，`getTemperature` / `getDownfall` 读到的是未定义值。
- `map` 是 `private static Biome* map[64*64]`，静态存储期零初始化（全 NULL），由 `recalc()` 填满。
- `MobSpawnerData` 有两个构造函数：无参版 `{}` 不给三个 int 赋值（未定义值），
  `randomWeight` 由 `WeighedRandomItem()` 设为 -128；四参版逐个赋值。
- 原版怪癖：`setSnowCovered()` 是空操作；`desert` 的 `clearMobs(true, true, false)` 清掉友军与水生物、
  **保留敌人**；`iceDesert` 的 `clearMobs(true, false, false)` 只清友军；`getTreeFeature` 的
  `nextInt(10)` 分支体是空的（BasicTree 被注释掉），但随机数照样消耗。
- `recalc()` 末尾把 `desert` / `iceDesert` 的 `topMaterial` 与 `material` 都改成 `(char) Tile::sand->id`。
- `BiomeInclude.h` 只有 include（参考 C++ 里没有可移植的代码）；`Biome.cpp` 直接 include 全部子类再 `new`。

### 工作表结论（Biome，23 行）

| #   | C++ 函数 / 成员                | C++ 位置          | TS 方法 / 字段        | TS 行 | 相似度 | 结论                                                                                     |
| --- | ------------------------------ | ----------------- | --------------------- | ----- | ------ | ---------------------------------------------------------------------------------------- |
| 1   | `Biome()`                      | Biome.cpp:34      | `constructor`         | 98    | 0.69   | 一致：三项初始化 + 怪物表 + 两个总权重；未初始化字段见 ADAPTED(Safety)                    |
| 2   | `setName`                      | Biome.cpp:68      | `setName`             | 115   | 1.00   | 一致：赋值并返回 `this`，protected                                                       |
| 3   | `setLeafColor`                 | Biome.cpp:74      | `setLeafColor`        | 120   | 1.00   | 一致                                                                                     |
| 4   | `setColor`                     | Biome.cpp:80      | `setColor`            | 125   | 1.00   | 一致                                                                                     |
| 5   | `setSnowCovered`               | Biome.cpp:86      | `setSnowCovered`      | 130   | 1.00   | 一致：空操作，返回 `this`（原版怪癖保留）                                                |
| 6   | `clearMobs`                    | Biome.cpp:91      | `clearMobs`           | 134   | 0.74   | 一致：默认参数 true/true/true；原地清空，数组引用不变                                    |
| 7   | `recalc`                       | Biome.cpp:101     | `recalc`              | 141   | 0.86   | 一致：64×64、`a/63`/`b/63` 逐步 `f()`；沙漠/冰原换 sand；`(char)` 用 24 位移位            |
| 8   | `initBiomes`                   | Biome.cpp:114     | `initBiomes`          | 152   | 0.84   | 一致：11 个群系的顺序、颜色、名字、叶色、`clearMobs` 组合逐个相同                        |
| 9   | `teardownBiomes`               | Biome.cpp:130     | `teardownBiomes`      | 189   | 0.07   | 一致（ESM）：C++ `delete` + 置 NULL，TS 复位成 `unregistered` 哨兵                       |
| 10  | `getTreeFeature`               | Biome.cpp:144     | `getTreeFeature`      | 207   | 1.00   | 一致：`nextInt(10)` 空分支照旧消耗随机数                                                  |
| 11  | `getGrassFeature`              | Biome.cpp:151     | `getGrassFeature`     | 215   | 1.00   | 一致：`Tile.tallgrass.id` + `TallGrass.TALL_GRASS`                                       |
| 12  | `getBiome`                     | Biome.cpp:158     | `getBiome`            | 219   | 0.82   | 一致：形参入口 `f()`，`f2i` 截断，`a + b*64`                                              |
| 13  | `_getBiome`                    | Biome.cpp:168     | `_getBiome`           | 225   | 0.90   | 一致：`downfall *= temperature`；10 个 float 常量比较，分支顺序相同                      |
| 14  | `adjustScale`                  | Biome.cpp:202     | `adjustScale`         | 259   | 1.00   | **已修 W80-1**：形参入口 `f()`（原来原样返回 double）                                     |
| 15  | `adjustDepth`                  | Biome.cpp:207     | `adjustDepth`         | 264   | 1.00   | **已修 W80-1**：同上                                                                     |
| 16  | `getSkyColor`                  | Biome.cpp:212     | `getSkyColor`         | 269   | 0.76   | 一致：`temp/3`、clamp、hue/sat 全部逐步 `f()`，`Color.getHSBColor` 内部再收口             |
| 17  | `getDownfall`                  | Biome.cpp:221     | `getDownfall`         | 288   | 1.00   | 一致：返回字段；C++ 从未赋值，见 ADAPTED(Safety)                                          |
| 18  | `getTemperature`               | Biome.cpp:227     | `getTemperature`      | 292   | 1.00   | 一致：同上                                                                               |
| 19  | `getGrassColor`                | Biome.cpp:233     | `getGrassColor`       | 282   | 1.00   | 一致：`Mth.clamp(..., 0, 1)` + `GrassColor.get`                                           |
| 20  | `getMobs`                      | Biome.cpp:241     | `getMobs`             | 296   | 0.92   | 一致：对象身份比较；未知类别 `LOGE` + `_emptyMobList`                                     |
| 21  | `getCreatureProbability`       | Biome.cpp:254     | `getCreatureProbability` | 304 | 0.83   | 一致：`f(0.08)`                                                                          |
| 22  | `MobSpawnerData()`             | Biome.h:37        | `constructor`（无参重载） | 36 | —      | 一致：TS 合并成一个构造；三个 int 取 0 见 ADAPTED(Safety)，`randomWeight` 为 -128        |
| 23  | `maxCount`（字段）             | Biome.h:44        | `maxCount`            | 33    | —      | 一致：工作表把字段当成了函数；TS 有同名字段                                              |

TS 里有、C++ 没有的方法：`_mapForTest`（`ADAPTED(Test)`，只给黄金样本读 private 的 `map`）。

### BiomeInclude（W81）

工作表 0 行：参考 C++ 的 `BiomeInclude.h` 只有 include，没有可移植的代码。TS 是 `ADAPTED(ESM)`：
`Biome.cpp` 直接 include 全部子类再在 `initBiomes()` 里 `new`，ES 模块里这样做会形成基类/子类循环（TDZ），
所以由 `BiomeInclude.ts` 集中 import 子类并通过 `BiomeClasses` 注入（与 `TileInclude`、`MaterialInclude`
同一模式）。五个子类与 C++ 的 include 列表完全相同，调用顺序照 `NinecraftApp::init`：`initTiles` 之后。

### 修复

**W80-1 `adjustScale` / `adjustDepth` 没有对 float 形参做入口舍入（清单第 2 条）。**
C++ 两个方法的形参都是 `float`，即使函数体原样返回，调用方传入的 double 也会先被舍入成 float；
TS 原来直接返回 double。修复：`scale = f(scale)` / `depth = f(depth)`。
当前 TS 里还没有调用方（C++ 也只有声明/定义），所以这是为后续世界生成准备的严格对齐。

先红后绿（`git stash push -- packages/world/src/level/biome/Biome.ts`，保留新测试）：

- 红：`pnpm exec vitest run tests/unit/world/biome-audit.test.ts` 退出码 1，1 failed | 7 passed：
  `AssertionError: expected 0.1 to be 0.10000000149011612`（W80-1）。
- 绿：`git stash pop` 后 8/8 通过；`tests/golden/s4.golden.test.ts` 6/6 通过（Biome 的 64×64 选择表）。

另外做了两处文档修正（无运行时影响）：

- 删掉文件头里过时的 `【DEFERRED】recalc ... sand 未注册`：`Tile.sand` 已注册，`recalc` 的两行早就在执行；
- 删掉“getTreeFeature / getGrassFeature 在后续步骤移植”的过时说明（两者已实现）。

### ADAPTED / OMIT

- **`ADAPTED(Safety)`**：`Biome` 的 `color` / `temperature` / `downfall` 在 C++ 里未初始化
  （`temperature` / `downfall` 从未被赋值，读到的是未定义值）；TS 取 0。
- **`ADAPTED(Safety)`**：`MobSpawnerData()` 无参构造在 C++ 里不给三个 int 赋值；TS 取 0
  （`randomWeight` 仍按基类默认值 -128）。
- **`ADAPTED(Test)`**：`_mapForTest()` 只给黄金样本读取 private 的 `map`。
- **`ADAPTED(ESM)`**：`BiomeInclude.ts` 的子类注入（见上）。
- **`OMIT(Biome)`**：`virtual ~Biome() {}` 是空析构函数，R3 不移植（基类析构为空，TS 由 GC 接管；
  工作表第 22/23 行是字段误报，不涉及）。
- 未加标记的差异：`Biome.map` 在 C++ 里是零初始化的静态数组（全 NULL），TS 是稀疏 `new Array(64*64)`；
  两者都在 `initBiomes()` 的 `recalc()` 之后才被读取，玩法路径不可观察。

### 35 条清单核对要点

- 第 1–2 条：`adjustScale` / `adjustDepth` 见 W80-1；`getBiome` / `_getBiome` / `getSkyColor` 的
  float 形参入口均已 `f()`；无未初始化读取（见 ADAPTED(Safety)）。
- 第 3–7 条：`recalc` 的 `a/63`、`_getBiome` 的 `downfall *= temperature`、`getSkyColor` 的
  `224/360`、`temp*0.05`、`temp*0.1` 全部逐步 `f()`；比较用 float 常量（0.10f、0.20f、0.95f…）。
- 第 8 条：无整数除法；`a / 63` 在 C++ 里是 int/float，TS 已 `f()`。
- 第 9–12 条：`(char) Tile::sand->id` 用 `(x << 24) >> 24`；无 long、无字符串格式化。
- 第 13–18 条：虚函数关系正确（`getTreeFeature` / `getGrassFeature` / `adjustScale` / `adjustDepth` /
  `getSkyColor` / `getGrassColor` / `getDownfall` / `getTemperature` / `getMobs` /
  `getCreatureProbability`）；无重载（`MobSpawnerData` 的两个构造合并为可选参数）、无默认参数差异
  （`clearMobs` 三个 true）、无字段遮蔽；构造函数体内无虚调用。
- 第 19 条：构造函数初始化顺序无依赖；`color` / `temperature` / `downfall` 见 ADAPTED(Safety)。
- 第 20 条：可见性与 `Biome.h` 一致：构造函数与五个 setter / `clearMobs` / 三个怪物表 /
  `_emptyMobList` 为 protected，其余 public；`map` 为 private（`_mapForTest` 例外）。
- 第 21–25 条：`getMobs` 返回成员数组引用（对应 C++ 的 `MobList&`）；`clearMobs` 原地清空；
  无排序/哈希。
- 第 26–29 条：`getTreeFeature` 的空分支照旧消耗 `nextInt(10)`；`getMobs` 的分支顺序与 C++ 相同。
- 第 30–33 条：`setName` 的字符串、`LOGE('Unknown MobCategory!')` 一致；无 char/bool 转换。
- 第 34 条：新增 2 处 `ADAPTED(Safety)`；`ADAPTED(Test)` / `ADAPTED(ESM)` 是既有标记。
- 第 35 条：文件头已删除两处过时说明（sand 的 DEFERRED、地物“后续移植”）。

### 验证

- `pnpm exec vitest run tests/unit/world/biome-audit.test.ts`：8/8 通过（红态见上）。
- `pnpm exec vitest run tests/golden/s4.golden.test.ts`：6/6 通过。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check packages/world/src/level/biome/Biome.ts tests/unit/world/biome-audit.test.ts`：通过。
- `pnpm ledger`：218 → 220 条（+2 `ADAPTED(Safety)`）。
