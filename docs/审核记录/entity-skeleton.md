# Skeleton（src/world/entity/monster/Skeleton.h / .cpp ↔ packages/world/src/entity/monster/Skeleton.ts）

第 2 批（world/entity/monster）。工作表 12 行全部有结论。C++ `.h` 43 行 + `.cpp` 107 行，
TS 审核前 141 行、审核后 145 行。新增编号 **W38**；新增 1 处 `DEFERRED(待确认)`。

C++ 侧要点：

- 自有成员：`ItemInstance bow`（按值，初始化 `bow(Item::bow, 1)`）、`int fireCheckTick(0)`，
  都在 `private` 段；无未初始化成员。
- 可见性（`Skeleton.h`）：`public` 段 = 构造函数、`getMaxHealth`、`aiStep`、`getDeathLoot`、
  `getCarriedItem`、`virtual getEntityTypeId`；`protected` 段 = 三个声音函数、
  `checkHurtTarget(Entity*, float d)`、`dropDeathLoot`、`virtual getUseDuration`。
- `getUseDuration` **只在 Skeleton 里声明**，基类没有同名虚函数（它与 `Item::getUseDuration`
  是不同类的同名方法），所以 C++ 的 `virtual` 只是允许派生类再覆盖。
- 构造函数体只有渲染器与贴图；`bow` 用 `ItemInstance(const Item*, int)` 构造，count = 1。
- `aiStep` 的怪癖：`(++fireCheckTick & 1)` 隔刻检查；阳光燃烧粒子每刻 5 个，每个粒子的
  `xa/ya/za` 各用两个 `nextFloat()`，坐标再各用一个。
- `checkHurtTarget`：`d < 10` 时每 3 秒（60 tick）射一支箭；`yRot = (float)(atan2(zd,xd) * RADDEG) - 90`。
- `dropDeathLoot`：先 `nextInt(3)` 个箭，再 `nextInt(3)` 个骨头。

## 工作表结论

| #   | C++ 函数                            | C++ 位置         | TS 方法           | TS 行 | 相似度 | 结论                                                                                                                                         |
| --- | ----------------------------------- | ---------------- | ----------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Skeleton(Level* level)`            | Skeleton.cpp:4   | `constructor`     | 23    | 0.48   | 一致：`bow(Item::bow, 1)` → `new ItemInstance(Item.bow, 1)`；`fireCheckTick = 0`；渲染器与贴图一致                                           |
| 2   | `getMaxHealth()`                    | Skeleton.cpp:13  | `getMaxHealth`    | 31    | 1.00   | 一致：10                                                                                                                                     |
| 3   | `aiStep()`                          | Skeleton.cpp:17  | `aiStep`          | 35    | 0.83   | **已修 W38-2**：粒子坐标改为按 C++ 左结合逐步舍入；其余条件、随机数顺序一致；多个 `nextFloat()` 求值顺序见 DEFERRED(待确认)                  |
| 4   | `getDeathLoot()`                    | Skeleton.cpp:38  | `getDeathLoot`    | 79    | 1.00   | 一致：`Item.arrow.id`，`protected`                                                                                                           |
| 5   | `getCarriedItem()`                  | Skeleton.cpp:42  | `getCarriedItem`  | 83    | 0.91   | 一致：C++ 返回 `&bow`，TS 返回同一 `ItemInstance` 引用（共享语义相同），`public`                                                             |
| 6   | `getEntityTypeId()`                 | Skeleton.cpp:46  | `getEntityTypeId` | 87    | 1.00   | 一致：`MobTypes.Skeleton`                                                                                                                    |
| 7   | `getAmbientSound()`                 | Skeleton.cpp:50  | `getAmbientSound` | 91    | 1.00   | 一致：`mob.skeleton`，`protected`                                                                                                            |
| 8   | `getHurtSound()`                    | Skeleton.cpp:54  | `getHurtSound`    | 95    | 1.00   | 一致：`mob.skeletonhurt`，`protected`                                                                                                        |
| 9   | `getDeathSound()`                   | Skeleton.cpp:58  | `getDeathSound`   | 99    | 1.00   | 一致：`mob.skeletonhurt`（受伤与死亡同音），`protected`                                                                                      |
| 10  | `checkHurtTarget(Entity*, float d)` | Skeleton.cpp:62  | `checkHurtTarget` | 103   | 0.89   | **已修 W38-1、W38-4**：float 形参入口补 `d = f(d)`；朝向改用 `Mth.atan2`（float atan2f）；箭的构造、`yd`/`yo` 逐步舍入、音效、`shoot` 均一致 |
| 11  | `dropDeathLoot()`                   | Skeleton.cpp:87  | `dropDeathLoot`   | 126   | 1.00   | 一致：两次 `nextInt(3)`，先箭后骨头，各 1 个，`protected`                                                                                    |
| 12  | `getUseDuration()`                  | Skeleton.cpp:100 | `getUseDuration`  | 138   | 1.00   | **已修 W38-3**：C++ 在 `protected` 段，TS 原为 public，已收回；返回 `attackTime`                                                             |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复

**W38-1 `checkHurtTarget` 的 float 形参入口未舍入（清单第 2 条）。**
C++ 签名 `void checkHurtTarget(Entity* target, float d)`，实参在入口先转成 float，再参与
`d < 10`。TS 原来直接拿 double 比较。引擎内调用方 `PathfinderMob` 传的本就是 float，
玩法路径不变，属函数契约修正（同 W32 Creeper、W33 Monster、W36 Spider）。
修复：函数体第一行 `d = f(d);`。

**W38-2 着火粒子坐标没有按 C++ 逐步舍入（清单第 3–7 条）。**
C++ 原句：`x + random.nextFloat() * bbWidth * 2 - bbWidth`，左结合且每步 float：
`f(f(x + f(f(nextFloat() * bbWidth) * 2)) - bbWidth)`。TS 原写法把 `nextFloat()*bbWidth*2`
整段按 double 算完再舍入一次，外层的 `+ x`、`- bbWidth` 也留在 double。
修复：三个坐标全部改成逐级 `f()`（y 为 `f(y + f(nextFloat() * bbHeight))`）。

**W38-3 `getUseDuration` 可见性与 C++ 不一致（清单第 20 条）。**
C++ `Skeleton.h:37` 在 `protected` 段；TS 原为 public。全参考源码与 TS 均无外部调用点。
修复：改为 `protected getUseDuration()`。

先红后绿（把 `Skeleton.ts` 用 `git stash` 退回 HEAD、保留新测试）：

- 运行时红：`pnpm exec vitest run tests/unit/world/skeleton-audit.test.ts` 退出码 1，
  2 failed | 1 passed —— W38-1 报 `expected 1 to be +0`（旧实现多射了一支箭）；
  W38-2 报 `expected [0.1832815706729889, …] to deeply equal [0.1832815408706665, …]`。
- 类型红：同一状态下 `npx tsc -p tests/tsconfig.json --noEmit` 退出码 2，
  `skeleton-audit.test.ts(88,11): error TS2322: Type 'false' is not assignable to type 'true'`
  （`'getUseDuration' extends keyof Skeleton` 为真）。
- 绿：`git stash pop` 恢复修复后，vitest 3/3 通过、tsc 0 错误。

**W38-4 朝向用的是 double `Math.atan2`，与 C++17 的 float 重载不一致（清单第 9 条）。**
C++ `(float)(std::atan2(zd, xd) * Mth::RADDEG) - 90` 里 `std::atan2(float, float)` 在 C++17 解析到
float 重载（atan2f），乘 float 的 `RADDEG` 后逐步舍入。TS 原写 `Math.atan2`（double），只在乘完后
舍入一次；与 W22 Arrow 的先例（`f(Mth.atan2(...) * Mth.RADDEG)`）不一致。
修复：改为 `f(f(Mth.atan2(zd, xd) * Mth.RADDEG) - 90)`，并改正文件头“std::atan2 是 double”的错误说明。

先红后绿（把 `Skeleton.ts` stash 回上一提交、保留新测试）：

- 红：`pnpm exec vitest run tests/unit/world/skeleton-audit.test.ts` 退出码 1，
  `expected -221.67776489257812 to be -221.6777801513672`（方向 `xd=-8.878729820251465`、`zd=-9.973052978515625`）。
- 绿：恢复后 4/4 通过。

## DEFERRED(待确认)：多个 `nextFloat()` 的求值顺序

`aiStep` 里每个粒子的 `xa/ya/za` 各含两个 `nextFloat()`，`addParticle` 的三个坐标又各含一个；
C++ 未指定这些调用之间的求值顺序（GCC 常从右往左）。按项目先例（Entity/Mob/ItemEntity/
Player/Chicken W28）取从左到右，在循环上方标 `// DEFERRED(待确认)`。不生成新黄金样本。

## 35 条清单核对要点

- 第 1–2 条：`bow` 是 `ItemInstance`（按值对象）；`fireCheckTick` 是 int；
  `checkHurtTarget` 的 `d` 是 float（W38-1）；无其他 float 形参。
- 第 3–7 条：`br > 0.5f`、`nextFloat() * 3.5f`、`(br - 0.4f)` 均逐项 `f()`；
  `xa/ya/za` 的 `2.0f * nextFloat() - 1.0f`、两个差相乘、`* 0.02f` 每步舍入；
  粒子坐标见 W38-2；`yd`、`yo`、`yd + yo`、`1 / (nextFloat()*0.4f + 0.8f)`、`1.60f` 均一致。
- 第 8 条：`Mth.floor(x/y/z)`、`Mth.sqrt`、`Mth.RADDEG` 与 C++ 同名；无整数除法
  （`1 / (...)` 的分母是 float，C++ 里 `1` 提升为 float）。
- 第 9–12 条：`std::atan2` → `Mth.atan2`（float atan2f，W38-4），乘积与减 90 逐步 `f()`；
  无 long、无字符串格式化。
- 第 13–18 条：`getMaxHealth` / `aiStep` / `getEntityTypeId` 等 override 关系正确；
  `getUseDuration` 在基类没有对应声明，故不加 `override`；无重载、默认参数、字段遮蔽；
  构造函数体内无虚调用。
- 第 19 条：两个字段的初始化顺序无歧义（互不依赖）。
- 第 20 条：可见性除 W38-3 外均与 `Skeleton.h` 相同。
- 第 21–25 条：`ItemInstance` 按 C++ 按值语义返回引用；无容器/排序/哈希。
- 第 26–29 条：随机数顺序：`aiStep` 的 `nextFloat` 见 DEFERRED；`dropDeathLoot` 两次
  `nextInt(3)` 顺序一致；`checkHurtTarget` 只在 `attackTime == 0` 时抽一次 `nextFloat`；
  短路顺序与 C++ 相同。
- 第 30–33 条：字符串均为 ASCII；无 char/bool 转换与日志。
- 第 34 条：新增 1 处 `DEFERRED(待确认)`，无 OMIT/ADAPTED。
- 第 35 条：文件头注释与代码一致，未改。

## 验证

- `pnpm exec vitest run tests/unit/world/skeleton-audit.test.ts`：退出码 0，4/4 通过。
- `npx tsc -p packages/world --noEmit`：退出码 0，0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0，0 错误（红态见上）。
- `npx prettier --check`（三个文件）：通过。
- `pnpm ledger`：177 条（比上一提交多 1 条 `DEFERRED(待确认)`）。
