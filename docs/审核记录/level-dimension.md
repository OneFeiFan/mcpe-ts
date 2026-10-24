# Dimension（src/world/level/dimension/Dimension.h / .cpp ↔ packages/world/src/level/dimension/Dimension.ts）

第 2 批（world/level/dimension）。工作表 14（Dimension）+ 0（FlatDimension）+ 2（NormalDayCycleDimension）行全部有结论。
C++ `Dimension.h` 67 行 + `Dimension.cpp` 161 行 + `NormalDayCycleDimension.h` 54 行；TS 审核前
`Dimension.ts` 191 行、审核后 205 行（W79 补正 +1 行注释），`FlatDimension.ts` 11 行，
`NormalDayCycleDimension.ts` 3 行（转出口）。
新增编号 **W77–W79**；新增 1 处 `ADAPTED(Safety)`、1 处 `ADAPTED(Cpp)`、1 处 `OMIT`。

C++ 侧要点：

- `Dimension` 字段：`Level* level`（**不在**构造函数初始化列表里）、`biomeSource(NULL)`、
  `foggy/ultraWarm/hasCeiling(false)`、`float brightnessRamp[16]`（**未初始化**）、`id(0)`、
  `int FogType`（**未初始化**，运行时由 `Minecraft.cpp:1481` 赋值）、`long fogColor(0x80daff)`、
  `float sunriseCol[4]`（**未初始化**）。
- 构造函数只做初始化列表；析构函数只有 `delete biomeSource;`。
- `virtual`：`init(Level*)`、`init()`、`createRandomLevelSource`、`isValidSpawn`、
  `isNaturalDimension`、`getTimeOfDay`、`getSunriseColor`、`getFogColor`、`mayRespawn`、
  `updateLightRamp`。`init(Level*)` 是 public、`init()` 是 protected，C++ 的重载在 TS 里按
  R10 拆成 `init` / `initDimension`（文件头已说明）。
- 原版怪癖：`FogType` 未初始化；`getSunriseColor` 返回成员数组 `sunriseCol` 的指针（复用同一块内存）；
  基类 `getFogColor` 用查表的 `Mth::cos`，而 `NormalDayCycleDimension` 的两个方法用的是**未加 `std::` 的 `cos`**：
  `<cmath>` 只把 float 重载放进 `std::`，全局命名空间里只有 `<math.h>` 的 `::cos(double)`。所以实参先按 float
  算好，再提升为 double，乘加都在 double 里完成，最后赋回 float —— s4 黄金样本的 52 组 timeOfDay 逐位证明了这一点。
- `NormalDayCycleDimension.h` 的两个方法全是内联；`FlatDimension` 在参考 C++ 里**不存在**（TS 的 NEW）。

## 工作表结论

| #   | C++ 函数                                  | C++ 位置              | TS 方法                  | TS 行 | 相似度 | 结论                                                                                                       |
| --- | ----------------------------------------- | --------------------- | ------------------------ | ----- | ------ | ---------------------------------------------------------------------------------------------------------- |
| 1   | `Dimension()`                             | Dimension.cpp:13      | `constructor`（隐式）    | —     | —      | 一致：六个初值用字段初始化器表达；`level` 与 C++ 一样在 `init()` 前不读                                    |
| 2   | `~Dimension()`                            | Dimension.cpp:23      | **（无）**               | —     | —      | **OMIT**：只 `delete biomeSource`，JS 由 GC 接管（R3）                                                     |
| 3   | `init(Level*)`                            | Dimension.cpp:28      | `init`                   | 45    | 1.00   | 一致：`level = level; initDimension(); updateLightRamp()`                                                  |
| 4   | `init()`                                  | Dimension.cpp:33      | `initDimension`          | 52    | 1.00   | 一致：R10 改名（C++ 的 protected 无参重载），`new BiomeSource(level)`                                      |
| 5   | `isValidSpawn(int x, int z)`              | Dimension.cpp:41      | `isValidSpawn`           | 65    | 1.00   | 一致：先排除 `invisible_bedrock`，再要求 `isSolidRender()`；短路顺序相同                                   |
| 6   | `getTimeOfDay(long time, float a)`        | Dimension.cpp:53      | `getTimeOfDay`           | 76    | 1.00   | 一致：恒返回 1（两个形参未使用）                                                                           |
| 7   | `createRandomLevelSource()`               | Dimension.cpp:57      | `createRandomLevelSource`| 56    | 1.00   | 一致：四个实参顺序与 C++ 相同                                                                              |
| 8   | `updateLightRamp()`                       | Dimension.cpp:67      | `updateLightRamp`        | 80    | 1.00   | 一致：`v`、除法、乘法、加法全部逐步 `f()`；16 项全部填满                                                   |
| 9   | `getSunriseColor(float td, float a)`      | Dimension.cpp:77      | `getSunriseColor`        | 92    | 0.97   | **已修 W77-1**：float 形参入口、`tt`、`aa`、`mix`、四个分量全部按 C++ 逐步舍入                            |
| 10  | `getFogColor(float td, float a)`          | Dimension.cpp:95      | `getFogColor`            | 110   | 0.45   | **已修 W77-2**：入口舍入 + 亮度与三个颜色分量逐步舍入；拆出的 `selectFogColor`/`fogVec` 见 ADAPTED(Cpp)     |
| 11  | `mayRespawn()`                            | Dimension.cpp:124     | `mayRespawn`             | 118   | 1.00   | 一致：true                                                                                                 |
| 12  | `getNew(int id)`                          | Dimension.cpp:129     | `getNew`                 | 122   | 1.00   | 一致：0 → Dimension，10 → NormalDayCycleDimension，其余 null                                               |
| 13  | `getDimension()`                          | Dimension.cpp:136     | `getDimension`           | 128   | 1.00   | 一致：0/10 都是 `"Overworld"`，其余 `"Unknown"`                                                            |
| 14  | `isNaturalDimension()`                    | Dimension.h:26        | `isNaturalDimension`     | 72    | 1.00   | 一致：false                                                                                                |

C++ 有、TS 没有的方法：构造函数（用字段初始化器表达）、析构函数（OMIT）。

TS 里有、C++ 没有的方法：`selectFogColor` / `fogVec`（`ADAPTED(Cpp)`，把 `Dimension.cpp` 与
`NormalDayCycleDimension.h` 里逐字重复的雾色计算合并成两个 helper，行为逐步一致）；
`createDefaultDimension`（C++ 的 `DimensionFactory::createDefaultDimension`，同一函数）。

**FlatDimension（W78）**：工作表 0 行——参考 C++ 没有这个类。它是 NEW（决策 D4），只重写
`createRandomLevelSource()` 返回 `FlatChunkSource`，其余全部沿用 `Dimension`（`getTimeOfDay` 恒 1、
`isNaturalDimension` 为 false）。测试覆盖了这三点。

**NormalDayCycleDimension（W79）**：工作表两行在 `NormalDayCycleDimension.ts` 里“找不到”，因为类定义
按 `ADAPTED(ESM)` 放在 `Dimension.ts`（`Dimension.getNew` 要 `new` 它，拆文件会形成模块循环），
`NormalDayCycleDimension.ts` 只做转出口。两个方法都**已修**：W79-1（`getFogColor`）、W79-2（`getTimeOfDay`）。

## 修复

**W77-1 `getSunriseColor` 的 float 形参入口与运算没有逐步舍入（清单第 2、3–7 条）。**
C++ 形参是 `float td`，入口先转 float；`span`、`tt`、`mid ± span`、`aa`、`mix`、`sunriseCol[0..2]`
每一步都是 float 运算。TS 原来整段用 double，只在写进 `Float32Array` 时舍入一次。
修复：`td = f(td)`，并把 `Mth.cos` 的实参、`aa`、`mix`、四个分量全部改成 C++ 的左结合逐步 `f()`。

**W77-2 `getFogColor` 同样没有逐步舍入（清单第 2、3–7 条）。**
`br = Mth::cos(td * PI * 2) * 2 + 0.5f`、`r/g/b = ((fogColor >> 16) & 0xff) / 255.0f`、
`r *= br * 0.94f + 0.06f` 全是 float。修复：入口 `td = f(td)`；`br` 按三步舍入；
`fogVec` 里除法结果与 `br * 0.94f + 0.06f` 都先舍入再相乘，乘积再舍入。
基类继续用查表的 `Mth.cos`（与 C++ 一致）。

**W79-1 `NormalDayCycleDimension.getFogColor` 用 double `Math.cos` 且没有逐步舍入（清单第 2、3–7、9 条）。**
C++ 的 `cos` 是全局命名空间的 `::cos(double)`（`<cmath>` 只把 float 重载放进 `std::`），不是 `Mth::cos`
查表，也不是 `cosf`。修复：入口 `td = f(td)`；`Math.cos` 的实参按 `f(f(td * PI) * 2)` 算成 float；
cos 的 double 结果直接参与 `* 2 + 0.5f`，只在赋回 `br` 时 `f()` 一次；颜色分量走修好的 `fogVec`。
**补正**：上一版误判成 `cosf`、把每一步都收口成 float，s4 黄金样本的 timeOfDay 因此失败；
本版按 `::cos(double)` 修正，黄金样本 52/52 通过。

**W79-2 `NormalDayCycleDimension.getTimeOfDay` 入口未舍入、`cos` 之后未逐步舍入（清单第 2、3–7、9 条）。**
修复：`a = f(a)`；`td = 1 - (cos(td * PI) + 1) * 0.5f` 改成
`f(1 - (Math.cos(f(td * Mth.PI)) + 1) * f(0.5))` —— `::cos(double)` 的结果与 `+ 1`、`* 0.5f`
都在 double 里算，只在赋回 `td` 时舍入一次；其余步骤原本已逐步舍入。

先红后绿（`git stash push -- packages/world/src/level/dimension/Dimension.ts`，保留新测试）：

- 第一轮（W77 + W79 初版）：`pnpm exec vitest run tests/unit/world/dimension-audit.test.ts` 退出码 1，4 failed | 1 passed：
  - W77-1：`expected [ 0.8473395109176636, …(3) ] to deeply equal [ 0.8473395109176636, …(3) ]`（第 2、4 个分量不同）；
  - W77-2：`expected [ 0.3951924741268158, …(2) ] to deeply equal [ 0.3951924741268158, …(2) ]`（y、z 不同）；
  - W79-1：`expected 0.10623575001955032 to be 0.10623598098754883`；
  - W79-2：`expected 0.7714978456497192 to be 0.7714977860450745`。
- 补正（本提交）：把 Dimension.ts 退回上一版（cosf 写法），跑
  `pnpm exec vitest run tests/unit/world/dimension-audit.test.ts tests/golden/s4.golden.test.ts`
  退出码 1，3 failed | 8 passed：
  - s4 黄金样本：`expected [ 0, 1048576000, 1061738250 ] to be undefined`（52 组里第一组不一致）；
  - W79-1：`expected 0.5010095238685608 to be 0.5010095834732056`；
  - W79-2：`expected 0.7845426201820374 to be 0.7845426797866821`。
- 绿：`git stash pop` 后 dimension 5/5、s4 黄金样本 6/6 通过。

## ADAPTED / OMIT

- **`OMIT(Dimension)`**：`~Dimension() { delete biomeSource; }  Dimension.cpp:23`，JS 由 GC 接管（R3）。
- **`ADAPTED(Safety)`**：C++ `Dimension.h:54` 的 `FogType` 未初始化（运行时由 `Minecraft.cpp:1481`
  赋值）；TS 取 0（默认 PE 雾色），避免读未定义值。
- **`ADAPTED(Cpp)`**：`selectFogColor` / `fogVec` 是把两份逐字重复的雾色计算合并出来的 helper，
  行为与原句逐步一致。
- **`ADAPTED(ESM)`**：`NormalDayCycleDimension` 的类定义放在 `Dimension.ts`（避免模块循环），
  `NormalDayCycleDimension.ts` 只做转出口。
- 未加标记的差异：`brightnessRamp` / `sunriseCol` 在 C++ 里是未初始化数组，TS 的 `Float32Array`
  零初始化；两者都在 `init()` / `getSunriseColor()` 里先写后读，玩法路径不可观察，故只在记录里说明。

## 35 条清单核对要点

- 第 1–2 条：`td` / `a` 是 float（W77-1、W77-2、W79-1、W79-2 入口均舍入）；`time` 是 long，
  TS 用 number；`fogColor` 是 long，但取值都 < 2^31，位运算语义相同。
- 第 3–7 条：`updateLightRamp` 原本已逐步 `f()`；`getSunriseColor` / `getFogColor` /
  `NormalDayCycleDimension` 两方法见 W77/W79。`cos` 的实参也按 C++ 的左结合先算成 float 再传。
- 第 8 条：`Mth.cos` / `Mth.sin` 是查表版（与 C++ 同名）；`Math.cos` 用于 `::cos(double)` 的地方，
  实参先 `f()`、结果按 C++ 的 double 表达式算完再赋回 float（W79 补正）；`i / 16` 在 C++ 里是
  `i / (float)16`，TS 已 `f()`。
- 第 9–12 条：W79 的 `cos` 与 C++ 的 `::cos(double)` 同语义（不是 `cosf`，已由 s4 黄金样本证明）；
  无 long 运算、无字符串格式化。
- 第 13–18 条：override 关系正确（`getTimeOfDay` / `getFogColor`）；`init` / `initDimension` 是
  R10 改名；无重载、默认参数、字段遮蔽；构造函数体内无虚调用。
- 第 19 条：字段初始化顺序无歧义；`FogType` 的未初始化差异见 ADAPTED(Safety)。
- 第 20 条：可见性与 `Dimension.h` 一致（`updateLightRamp` / `initDimension` 为 protected，
  `selectFogColor` / `fogVec` 是 TS 内部 helper）。
- 第 21–25 条：`getSunriseColor` 返回成员数组引用（对应 C++ 返回成员指针）；无容器/排序/哈希。
- 第 26–29 条：无随机数；`isValidSpawn` 与雾色分支的短路顺序与 C++ 相同。
- 第 30–33 条：字符串 `"Overworld"` / `"Unknown"` 一致；无 char/bool 转换与日志。
- 第 34 条：新增 1 处 `OMIT`、1 处 `ADAPTED(Safety)`、1 处 `ADAPTED(Cpp)`（另有一处既有的
  `ADAPTED(ESM)` 块注释）。
- 第 35 条：文件头关于“C 库 cos vs Mth::cos”的说明已保留并补上 float 收口说明。

## 验证

- `pnpm exec vitest run tests/unit/world/dimension-audit.test.ts tests/golden/s4.golden.test.ts`：
  dimension 5/5、s4 黄金样本 6/6 通过（红态见上）。
- `pnpm exec vitest run tests/unit/world/dimension.test.ts`：既有 5 条全部通过。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check`（`Dimension.ts`、`dimension-audit.test.ts`）：通过。
- `pnpm ledger`：212 → 215 条（+1 `OMIT`、+1 `ADAPTED(Safety)`、+1 `ADAPTED(Cpp)`）；W79 补正没有新增标记。
