# Chicken（src/world/entity/animal/Chicken.h / .cpp ↔ packages/world/src/entity/animal/Chicken.ts）

第 2 批（world/entity/animal）。工作表 12 行全部有结论。C++ `.h` 49 行 + `.cpp` 113 行，
TS 审核前 143 行、审核后 150 行。新增编号 **W28**；新增 1 处 `DEFERRED(待确认)`、
1 处 `ADAPTED(Cpp)`。

C++ 侧要点：

- `Chicken.h` 的 `public` 段：构造函数、`getEntityTypeId`、`getMaxHealth`、`aiStep`、
  `addAdditonalSaveData`、`readAdditionalSaveData`，以及全部字段
  `sheared` / `flap` / `flapSpeed` / `oFlapSpeed` / `oFlap` / `flapping` / `eggTime`。
  `protected` 段：`causeFallDamage`、四个声音/掉落函数、`getBreedOffspring`。
- 构造函数初始化列表 7 个字段全给了常量：`sheared(false)`、`flap(0)`、`oFlap(0)`、
  `flapSpeed(0)`、`oFlapSpeed(0)`、`flapping(1)`、`eggTime(0)`。C++ 按**声明顺序**
  （`flap`、`flapSpeed`、`oFlapSpeed`、`oFlap`）初始化，TS 按初始化列表顺序赋值；
  全部是相互独立的常量，没有可观测差异。
- `eggTime = random.nextInt(TicksPerSecond * 60 * 5) + TicksPerSecond * 60 * 5`
  = `nextInt(6000) + 6000`，取值 `[6000, 12000)`（5~10 分钟）。
- 无未初始化成员；无重载、无默认参数、无字段遮蔽。
- `sheared` 在参考源码里**只初始化、从不读取**（`Sheep.cpp:36` 的注释说的是 Sheep 自己的
  “sheared and color share a char”，不是这个字段）；照抄保留。
- `getBreedOffspring` 全参考源码**零调用方**：只有 Chicken / Cow / Pig 三处定义与声明，
  Sheep 的那份在 `Sheep.h:80` 被注释掉，没有任何调用点。

## 工作表结论

| #   | C++ 函数                               | C++ 位置        | TS 方法                  | TS 行 | 相似度 | 结论                                                                                                          |
| --- | -------------------------------------- | --------------- | ------------------------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | `Chicken(Level* level)`                | Chicken.cpp:5   | `constructor`            | 41    | 0.67   | 一致：7 个字段初值与初始化列表相同；`setSize(0.3f, 0.7f)` 已 `f()`；`eggTime` 公式相同                        |
| 2   | `getEntityTypeId()`                    | Chicken.cpp:22  | `getEntityTypeId`        | 60    | 1.00   | 一致：`MobTypes.Chicken`                                                                                      |
| 3   | `getMaxHealth()`                       | Chicken.cpp:28  | `getMaxHealth`           | 65    | 1.00   | 一致：4                                                                                                       |
| 4   | `aiStep()`                             | Chicken.cpp:33  | `aiStep`                 | 70    | 0.88   | 一致：逐步 `f()`；`--eggTime` 前置自减；`!isBaby()` + `!isClientSide` 两层判断；音高见 W28 / DEFERRED(待确认) |
| 5   | `addAdditonalSaveData(CompoundTag*)`   | Chicken.cpp:63  | `addAdditonalSaveData`   | 103   | 1.00   | 一致：只转调 `super`；保留 C++ 的拼写 `Additonal`                                                             |
| 6   | `readAdditionalSaveData(CompoundTag*)` | Chicken.cpp:68  | `readAdditionalSaveData` | 108   | 1.00   | 一致：只转调 `super`                                                                                          |
| 7   | `causeFallDamage(float distance)`      | Chicken.cpp:73  | `causeFallDamage`        | 113   | 1.00   | 一致：空函数体（鸡摔不死），`protected`；形参 `distance` 未使用                                               |
| 8   | `getAmbientSound()`                    | Chicken.cpp:77  | `getAmbientSound`        | 116   | 1.00   | 一致：`mob.chicken`，`protected`                                                                              |
| 9   | `getHurtSound()`                       | Chicken.cpp:82  | `getHurtSound`           | 121   | 1.00   | 一致：`mob.chickenhurt`，`protected`                                                                          |
| 10  | `getDeathSound()`                      | Chicken.cpp:87  | `getDeathSound`          | 126   | 1.00   | 一致：`mob.chickenhurt`（原版受伤与死亡同音），`protected`                                                    |
| 11  | `dropDeathLoot()`                      | Chicken.cpp:97  | `dropDeathLoot`          | 131   | 1.00   | 一致：先 `nextInt(3)` 掉 0~2 根羽毛，再按 `isOnFire()` 掉熟/生鸡肉，各 1 个                                   |
| 12  | `getBreedOffspring(Animal* target)`    | Chicken.cpp:110 | `getBreedOffspring`      | 147   | 1.00   | **ADAPTED(Cpp)**：C++ 在 `protected` 段，TS 保持 `public`（理由见下）；行为一致，`new Chicken(level)`         |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复 / 核对

**W28 下蛋音高表达式的 float 结合顺序（清单第 3–7 条；已核对，测试锁定，无代码改动）。**
C++：`(random.nextFloat() - random.nextFloat()) * 0.2f + 1.0f`。按 float 语义应逐步舍入：
先算差并舍入，再乘 `0.2f` 并舍入，最后加 `1.0f` 并舍入。TS 现有写法
`f(f(f(a - b) * f(0.2)) + f(1.0))` 正是这个顺序，与 C++ 一致，**不需要改实现**；
`chicken-audit.test.ts` 选了一对能让“差先舍入”和“差按 double 直接乘”结果不同的值
（`a = f(0.032417189329862595)`、`b = f(0.22629961371421814)`）把它钉住。

**DEFERRED(待确认)：两个 `nextFloat()` 的求值顺序。**
C++ 同一表达式里两个 `nextFloat()` 的调用顺序未指定（GCC 常从右往左），TS 只能选一种。
按仓库既有先例（Entity / Mob / ItemEntity / Player）选**从左到右**，并在调用处留
`DEFERRED(待确认)` 与 C++ 原句，等将来有黄金样本时再确认。本次不生成新黄金样本。

**ADAPTED(Cpp)：`getBreedOffspring` 保持 `public`。**
C++ `Chicken.h` 把它写在 `protected` 段。既有测试 `tests/unit/world/chicken.test.ts:343`
在类外直接调用 `c.getBreedOffspring(c)`，收窄成 `protected` 会让该测试无法编译
（用 tsc 实测 TS2445），又不能改既有断言，故保持 `public` 并留 `ADAPTED(Cpp)` 说明。

## 注释修正（无行为变化，清单第 35 条）

- 文件头“三处照抄”改为“四处照抄”，补上 `sheared` 只写不读这一条。
- “`flap`/`flapSpeed`/`flapping` 那四个字段”修正为：`flap`/`flapSpeed`/`oFlap`/`oFlapSpeed`
  四个是插值量，`flapping` 是翅膀相位累加量。
- “这只鸡现在是 TS 里第一只画面上看得见的生物”改为“G9 时它是……（后续又有别的生物接入）”。

## 35 条清单核对要点

- 第 1–2 条：`sheared` 是 bool；`flap` / `flapSpeed` / `oFlapSpeed` / `oFlap` / `flapping`
  是 float；`eggTime` 是 int；`causeFallDamage` 的形参是 float（未使用）。
- 第 3–7 条：`flapSpeed += (onGround ? -1 : 4) * 0.3f` 写成
  `f(flapSpeed + f(int * f(0.3)))`，整型到 float 精确；`flapping *= 0.9f`、`yd *= 0.6f`
  均为“乘完再 `f()`”；`flap += flapping * 2` 的 `* 2` 精确。结合顺序与 C++ 左结合相同。
- 第 8 条：本文件不用 `Mth`；`--eggTime` 是 int，无整数除法。
- 第 9–12 条：无数学函数、无 long、无字符串格式化。
- 第 13–18 条：`getEntityTypeId` / `getMaxHealth` / `aiStep` / 两个 SaveData 是 `override`；
  `causeFallDamage` / 三个声音 / `dropDeathLoot` 是 `protected override`；
  `getBreedOffspring` 不在任何基类里（零调用方），没有 `override`。无重载、默认参数、字段遮蔽。
- 第 19 条：7 个字段的声明与初始化顺序见上，无歧义。
- 第 20 条：字段与方法的可见性均与 `Chicken.h` 相同；唯一例外是 `getBreedOffspring`（ADAPTED）。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：`nextInt(3)` → `nextInt(6000)` → 两个 `nextFloat()` 的调用顺序与 C++ 语句顺序一致；
  `!level.isClientSide && --eggTime <= 0` 的 `&&` 短路与 C++ 相同（客户端不递减 eggTime）。
  两个 `nextFloat()` 之间的事件顺序见 DEFERRED(待确认)。
- 第 30–33 条：字符串均为 ASCII 字面量；`sheared` 无转换与日志。
- 第 34 条：新增 1 处 `DEFERRED(待确认)`、1 处 `ADAPTED(Cpp)`；无 `OMIT`。
- 第 35 条：文件头已按上述修正。

## 验证

- `npx vitest run tests/unit/world/chicken-audit.test.ts`：4/4 通过（W28 的三条 float/顺序断言 +
  空中 flap 顺序）。
- `npx vitest run tests/unit/world/chicken.test.ts`：既有测试全部通过（未改断言）。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误（含 `getBreedOffspring` 的 ADAPTED 说明：
  收窄成 `protected` 会报 TS2445，已实测）。
- `npx prettier --check packages/world/src/entity/animal/Chicken.ts tests/unit/world/chicken-audit.test.ts`：通过。
- `pnpm ledger`：比审核前多 2 条（`DEFERRED(待确认)` 1 条 + `ADAPTED(Cpp)` 1 条）。
