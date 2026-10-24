# Material（src/world/level/material/ ↔ packages/world/src/level/material/）

第 2 批（world/level/material）。六个文件的工作表（3 + 4 + 4 + 16 + 0 + 2 行）全部有结论。
C++ `Material.h` 116 行 + `Material.cpp` 99 行 + `DecorationMaterial.h` 23 行 + `GasMaterial.h` 27 行 +
`LiquidMaterial.h` 27 行 + `WebMaterial.h` 19 行。TS 行数：`Material.ts` 148（审核前 146，+2 条 OMIT）、
`DecorationMaterial.ts` 20、`GasMaterial.ts` 21、`LiquidMaterial.ts` 21、`MaterialInclude.ts` 16、
`WebMaterial.ts` 13。新增编号 **W88–W93**；新增 2 处 `OMIT`，无运行时修改。

C++ 侧要点：

- `Material` 的四个 `bool` 成员全在 `private`：`_flammable(false)`、`_neverBuildable(false)`、
  `_isAlwaysDestroyable(true)`、`_replaceable(false)`；构造函数是 `protected`。
- 四个链式 setter（`flammable` / `neverBuildable` / `notAlwaysDestroyable` / `replaceable`）都是
  `protected`，返回 `Material*`（即 `this`）。
- 27 个静态实例在 `Material.cpp` 里先全部置 `NULL`，再由 `initMaterials()` 逐个 `new`；
  `teardownMaterials()` 逐个 `SAFEDEL`。析构函数是空函数体。
- 原版怪癖：`GasMaterial` / `LiquidMaterial` 的构造函数都会调用 `replaceable()`；
  `WebMaterial` 只把 `blocksMotion` 设为 false，`isSolid` 仍继承基类的 true。
- `Material.cpp` 直接 `#include` 全部子类再 `new`；ES 模块里这样做会形成基类/子类循环（TDZ），
  所以 TS 用 `MaterialInclude.ts` 注入构造器（`ADAPTED(ESM)`，文件头已说明）。

## 工作表结论

| #   | C++ 函数 / 成员                       | C++ 位置            | TS 方法               | TS 行 | 相似度 | 结论                                                                 |
| --- | ------------------------------------- | ------------------- | --------------------- | ----- | ------ | -------------------------------------------------------------------- |
| 1   | `Material::initMaterials()`           | Material.cpp:37     | `initMaterials`       | 50    | 0.83   | 一致（ESM 适配）：27 个实例的构造顺序与标志位逐个相同；子类构造器由 `MaterialClasses` 注入 |
| 2   | `Material::teardownMaterials()`       | Material.cpp:71     | **（无）**            | —     | —      | **OMIT**：逐个 `SAFEDEL`，JS 由 GC 接管（R3）                        |
| 3   | `Material::isLiquid()`                | Material.h:40       | `isLiquid`            | 83    | 1.00   | 一致：false                                                          |
| 4   | `Material::letsWaterThrough()`        | Material.h:44       | `letsWaterThrough`    | 91    | 1.00   | 一致：`!isLiquid() && !isSolid()`，短路顺序相同                      |
| 5   | `Material::isSolid()`                 | Material.h:45       | `isSolid`             | 87    | 1.00   | 一致：true                                                           |
| 6   | `Material::blocksLight()`             | Material.h:52       | `blocksLight`         | 95    | 1.00   | 一致：true                                                           |
| 7   | `Material::isSolidBlocking()`         | Material.h:56       | `isSolidBlocking`     | 103   | 1.00   | 一致：`_neverBuildable` 时 false，否则 `blocksMotion()`              |
| 8   | `Material::isAlwaysDestroyable()`     | Material.h:61       | `isAlwaysDestroyable` | 108   | 1.00   | 一致：返回 `_isAlwaysDestroyable`                                    |
| 9   | `Material::blocksMotion()`            | Material.h:58       | `blocksMotion`        | 99    | 1.00   | 一致：true                                                           |
| 10  | `Material::isFlammable()`             | Material.h:71       | `isFlammable`         | 114   | 1.00   | 一致：返回 `_flammable`                                              |
| 11  | `Material::isReplaceable()`           | Material.h:75       | `isReplaceable`       | 118   | 1.00   | 一致：返回 `_replaceable`                                            |
| 12  | `Material()` 初始化列表 `_replaceable(false)` | Material.h:86 | `constructor`         | 122   | 1.00   | 一致：四个初值 0/0/1/0 与 C++ 相同                                   |
| 13  | `Material::flammable()`               | Material.h:89       | `flammable`           | 129   | 1.00   | 一致：置 true 并返回 `this`，protected                               |
| 14  | `Material::neverBuildable()`          | Material.h:94       | `neverBuildable`      | 134   | 1.00   | 一致：置 true 并返回 `this`，protected                               |
| 15  | `Material::notAlwaysDestroyable()`    | Material.h:99       | `notAlwaysDestroyable`| 139   | 1.00   | 一致：置 false 并返回 `this`，protected                              |
| 16  | `Material::replaceable()`             | Material.h:104      | `replaceable`         | 144   | 1.00   | 一致：置 true 并返回 `this`，protected                               |
| —   | `virtual ~Material() {}`              | Material.h:83       | **（无）**            | —     | —      | **OMIT**：空析构函数，R3 不移植                                      |

`DecorationMaterial`（W88）：`isSolid` / `blocksLight` / `blocksMotion` 三个 false，与
`DecorationMaterial.h:10/14/18` 逐行一致。

`GasMaterial`（W89）：构造函数 `super(); replaceable();` 与 C++ 相同；`isSolid` / `blocksLight` /
`blocksMotion` 三个 false 一致。

`LiquidMaterial`（W90）：构造函数 `replaceable()`；`isLiquid` true、`blocksMotion` false、
`isSolid` false 一致。

`WebMaterial`（W93）：构造函数 `notAlwaysDestroyable()`；`blocksMotion` false 一致；`isSolid`
按 C++ 继续继承基类的 true（工作表只列了 `blocksMotion`，测试里也锁定了这一点）。

`MaterialInclude.ts`（W92）：工作表 0 行——参考 C++ 没有这个文件。它是 `ADAPTED(ESM)`：
把 `Material.cpp` 顶部 `#include` 全部子类并在 `initMaterials()` 里 `new` 的那一段拆成
“子类构造器注入”，避免基类/子类循环导致的 TDZ。四个子类与 C++ 的 include 列表完全相同。

C++ 有、TS 没有的方法：`teardownMaterials()`（OMIT）、空析构函数（OMIT）。
TS 里有、C++ 没有的方法：`MaterialClasses` 接口（ESM 注入用，类型层面）。

## 修复

本轮**没有运行时修改**：逐函数对照后行为全部一致，只补了两条 `OMIT` 登记。
因此没有“先红后绿”；新增的 `material-audit.test.ts` 是对 C++ 材质表的行为锁定
（27 个实例的类型、四个标志位、`isSolidBlocking`、四种材质的虚函数组合），
在审核前的实现上同样通过。

## 35 条清单核对要点

- 第 1–2 条：没有 float / int 形参，全部是 `bool` 返回值；无未初始化成员
  （构造函数初始化列表覆盖四个 bool）。
- 第 3–7 条：无浮点运算。
- 第 8 条：无除法、无数学函数。
- 第 9–12 条：无 long、无字符串格式化。
- 第 13–18 条：`virtual` 关系正确（四个子类只覆盖 C++ 里覆盖的方法）；无重载、默认参数、字段遮蔽；
  构造函数体内无虚调用（`GasMaterial` / `LiquidMaterial` / `WebMaterial` 调的是非虚 setter）。
- 第 19 条：四个 bool 的初始化顺序与 C++ 初始化列表相同（互不依赖）。
- 第 20 条：可见性与 `Material.h` 一致：构造函数与四个 setter 为 protected，其余 public。
- 第 21–25 条：无按值对象、容器、排序、哈希。
- 第 26–29 条：无随机数；`letsWaterThrough` / `isSolidBlocking` 的短路顺序与 C++ 相同。
- 第 30–33 条：无字符串、char/bool 转换与日志。
- 第 34 条：新增 2 处 `OMIT`（`teardownMaterials`、`~Material`）；`ADAPTED(ESM)` 是既有的块注释。
- 第 35 条：文件头注释与代码一致，未改。
- 未加标记的差异：C++ 的 27 个静态指针初值是 `NULL`，TS 在 `initMaterials()` 前是 `undefined`；
  两者都在初始化后才被读取，玩法路径不可观察，只在记录里说明。

## 验证

- `pnpm exec vitest run tests/unit/world/material-audit.test.ts tests/unit/world/material-import-order.test.ts`：
  7/7 通过（新增 6 条 + 既有导入顺序 1 条）。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check packages/world/src/level/material/Material.ts tests/unit/world/material-audit.test.ts`：通过。
- `pnpm ledger`：215 → 217 条（+2 `OMIT`）。
