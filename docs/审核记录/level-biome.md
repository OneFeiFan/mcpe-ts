# BiomeSource 与五个子群系（src/world/level/biome/ ↔ packages/world/src/level/biome/）

第 2 批（world/level/biome，W82–W87）。六个文件的工作表（10 + 0 + 1 + 1 + 0 + 1 行）全部有结论。
C++ `BiomeSource.h` 62 行 + `BiomeSource.cpp` 178 行 + `FlatBiome.h` 11 行 + `ForestBiome.h` 25 行 +
`RainforestBiome.h` 22 行 + `SwampBiome.h` 11 行 + `TaigaBiome.h` 22 行。TS 行数：`BiomeSource.ts` 238
（审核前 237，+1 条 OMIT）、`FlatBiome.ts` 8、`ForestBiome.ts` 23、`RainforestBiome.ts` 19、
`SwampBiome.ts` 8、`TaigaBiome.ts` 20。新增编号 **W82–W87**；新增 1 处 `OMIT`，无运行时修改。

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
