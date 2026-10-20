# Pig（src/world/entity/animal/Pig.h / .cpp ↔ packages/world/src/entity/animal/Pig.ts）

第 2 批（world/entity/animal）。工作表 11 行全部有结论。C++ `.h` 48 行 + `.cpp` 70 行，
TS 审核前 64 行、审核后 64 行。新增编号 **W30**。

C++ 侧要点：

- `Pig.h` 的 `public` 段：构造函数、`getEntityTypeId`、`interact`、`getMaxHealth`、
  `hasSaddle`、`setSaddle`。`protected` 段：三个声音函数、`getDeathLoot`、
  `getBreedOffspring`。`static const int DATA_SADDLE_ID = 16` 在默认的 `private` 段。
- `DATA_SADDLE_ID` **只声明、从未使用**：构造函数没有 `define(DATA_SADDLE_ID, ...)`，
  也没有 data watcher，因此 `hasSaddle()` 恒为 false、`setSaddle()` 是空函数。
  `addAdditonalSaveData` / `readAdditionalSaveData` 整块被注释掉（Pig.h:20-28），照抄保留。
- 构造函数 `super(level)` 后只有渲染器、贴图、`setSize(0.9f, 0.9f)`；无成员初始化列表。
- `getDeathLoot` 返回 `Item::porkChop_cooked->id` / `porkChop_raw->id`。注意 Item 的 id 是
  **`256 + 构造参数`**（`Item.h:213`），而 `Item.cpp:237/238` 传的是 `63` / `64`
  —— 实际 id 是 **319 / 320**，不是 63 / 64。
- 无未初始化成员；无重载、无默认参数、无字段遮蔽；`getBreedOffspring` 全参考源码零调用方。

## 工作表结论

| #   | C++ 函数                            | C++ 位置   | TS 方法             | TS 行 | 相似度 | 结论                                                                                               |
| --- | ----------------------------------- | ---------- | ------------------- | ----- | ------ | -------------------------------------------------------------------------------------------------- |
| 1   | `Pig(Level* level)`                 | Pig.cpp:4  | `constructor`       | 17    | 0.76   | 一致：`super(level)`；`ER_PIG_RENDERER`；`mob/pig.png`；`setSize(0.9f, 0.9f)` 已 `f()`；无字段初值 |
| 2   | `getEntityTypeId()`                 | Pig.cpp:14 | `getEntityTypeId`   | 24    | 1.00   | 一致：`MobTypes.Pig`                                                                               |
| 3   | `interact(Player* player)`          | Pig.cpp:19 | `interact`          | 28    | 1.00   | 一致：恒返回 false，形参未使用                                                                     |
| 4   | `hasSaddle()`                       | Pig.cpp:24 | `hasSaddle`         | 32    | 1.00   | 一致：恒返回 false（C++ 从未 `define` 鞍的数据槽）                                                 |
| 5   | `setSaddle(bool value)`             | Pig.cpp:30 | `setSaddle`         | 36    | 1.00   | 一致：空函数体                                                                                     |
| 6   | `getAmbientSound()`                 | Pig.cpp:39 | `getAmbientSound`   | 38    | 1.00   | 一致：`mob.pig`，`protected`                                                                       |
| 7   | `getHurtSound()`                    | Pig.cpp:44 | `getHurtSound`      | 42    | 1.00   | 一致：`mob.pig`，`protected`                                                                       |
| 8   | `getDeathSound()`                   | Pig.cpp:49 | `getDeathSound`     | 46    | 1.00   | 一致：`mob.pigdeath`，`protected`                                                                  |
| 9   | `getDeathLoot()`                    | Pig.cpp:54 | `getDeathLoot`      | 50    | 1.00   | 一致：着火 `porkChop_cooked.id`（320），否则 `porkChop_raw.id`（319）；`protected`                 |
| 10  | `getBreedOffspring(Animal* target)` | Pig.cpp:62 | `getBreedOffspring` | 56    | 1.00   | **已修 W30**：C++ 在 `protected` 段，TS 原为 public，已改 `protected`；行为一致，`new Pig(level)`  |
| 11  | `getMaxHealth()`                    | Pig.cpp:67 | `getMaxHealth`      | 60    | 1.00   | 一致：10                                                                                           |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复

**W30 `getBreedOffspring` 可见性与 C++ 不一致（清单第 20 条）。**
C++ `Pig.h:45` 把它写在 `protected` 段；TS 原来是 public。全参考源码零调用方，
没有任何理由放宽。修复：改为 `protected getBreedOffspring(...)`，并把注释改成 C++ 位置。

先红后绿（类型层面，运行时看不到可见性）：

- 红：改回 `public` 后 `npx tsc -p tests/tsconfig.json --noEmit` 失败，
  `tests/unit/world/pig-audit.test.ts:152` 报 TS2322：
  `Type 'false' is not assignable to type 'true'`（`'getBreedOffspring' extends keyof Pig` 为真）。
- 绿：改成 `protected` 后同一命令 0 错误；`keyof Pig` 不再包含它。
- `tests/unit/world/pig-audit.test.ts` 用 `TestPig` 子类暴露 protected 方法，
  运行时断言 `getBreedOffspring` 返回新的 `Pig` 且 `level` 相同。

## 审核测试自身的一处修正（不是实现问题）

`pig-audit.test.ts` 初稿把猪肉 id 写成 `63` / `64`，实测得到 `319`。核对 C++ 后确认
`Item.h:213` 的构造函数是 `id(256 + id)`，`Item.cpp:237/238` 传 `63` / `64`，
所以正确值是 `256 + 63 = 319`、`256 + 64 = 320`。断言已改成 `256 + 63` / `256 + 64`
并附实测的 319 / 320；实现没有改动。

## 35 条清单核对要点

- 第 1–2 条：`DATA_SADDLE_ID` 是 `static const int`（TS `private static readonly`，未使用）；
  `getDeathLoot` 返回 int；`setSaddle` 形参 bool；`interact` 形参是对象引用。
- 第 3–7 条：唯一浮点是 `setSize(0.9f, 0.9f)`，TS 对两个实参都 `f()`；无其他运算。
- 第 8 条：不使用 `Mth`；无整数除法。
- 第 9–12 条：无数学函数、无 long、无字符串格式化。
- 第 13–18 条：`getEntityTypeId` / `getMaxHealth` / `interact` 是 `override`；
  三个声音 / `getDeathLoot` 是 `protected override`；`getBreedOffspring` 不在基类里。
  无重载、默认参数、字段遮蔽；构造函数体内无虚调用。
- 第 19 条：唯一成员是静态常量，无初始化顺序问题。
- 第 20 条：可见性见 W30；其余均与 `Pig.h` 一致（`hasSaddle` / `setSaddle` / `interact` /
  `getMaxHealth` / `getEntityTypeId` 在 C++ 是 public）。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：本文件不使用随机数；`getDeathLoot` 的 `isOnFire()` 分支顺序与 C++ 相同；
  无 `&&` / `||` 短路问题。
- 第 30–33 条：字符串均为 ASCII 字面量；无 char / bool 转换与日志。
- 第 34 条：本次无新增 `DEFERRED` / `OMIT` / `ADAPTED` 标记；C++ 被注释掉的鞍同步代码
  本来就没有移植，文件头已说明。
- 第 35 条：文件头注释与 C++ 一致（`DATA_SADDLE_ID` 只声明；`hasSaddle` 恒 false 等）。

## 验证

- `npx vitest run tests/unit/world/pig-audit.test.ts`：8/8 通过。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误（W30 红绿对照见上）。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx prettier --check packages/world/src/entity/animal/Pig.ts tests/unit/world/pig-audit.test.ts`：通过。
- `pnpm ledger`：本次没有新增标记，Pig.ts 的台账条数不变。
