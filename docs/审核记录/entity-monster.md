# Monster（src/world/entity/monster/Monster.h / .cpp ↔ packages/world/src/entity/monster/Monster.ts）

第 2 批（world/entity/monster）。工作表 17 行全部有结论。C++ `.h` 57 行 + `.cpp` 144 行，
TS 审核前 130 行、审核后 133 行。新增编号 **W33**。

C++ 侧要点：

- `Monster` 继承 `PathfinderMob`，`typedef PathfinderMob super`。自有成员三个 int：
  `attackDamage(2)`、`targetId(0)`、`lastHurtByMobId(0)`，全在 `protected` 段；无未初始化成员。
- 构造函数只设这三个初值与 `entityRendererId = ER_HUMANOID_RENDERER`。
- `public` 段：构造函数、`aiStep`、`tick`、`hurt`、`canSpawn`、`getCreatureBaseType`、
  `doHurtTarget`、`setTarget` / `getTarget`、`getLastHurtByMob` / `setLastHurtByMob`、
  `virtual getAttackDamage`。`protected` 段：`findAttackTarget`、`isDarkEnoughToSpawn`、
  `checkHurtTarget`、`getWalkTargetValue`、`virtual getAttackTime`。
- 原版怪癖：`getLastHurtByMob()` 判断的是 **`targetId == 0`**，不是 `lastHurtByMobId`；
  照抄保留。
- `hurt` 里写的是基类的 `attackTargetId`（不是 `targetId`）；TS 同样落到 `Mob` 的继承字段。
- C++ 类本身没有纯虚函数（`Mob.h` / `PathfinderMob.h` 里没有 `= 0`），但参考源码**零
  `new Monster(`**；TS 声明成 `abstract class` 只是类型层面的限制，没有调用点受影响。

## 工作表结论

| #   | C++ 函数                                   | C++ 位置        | TS 方法               | TS 行 | 相似度 | 结论                                                                                                                               |
| --- | ------------------------------------------ | --------------- | --------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Monster(Level* level)`                    | Monster.cpp:9   | `constructor`         | 23    | 0.39   | 一致：三个 int 初值 2/0/0，渲染器 `ER_HUMANOID_RENDERER`；TS 字段声明处也写了同样的初值，构造器再赋一次，值相同                    |
| 2   | `aiStep()`                                 | Monster.cpp:19  | `aiStep`              | 31    | 0.97   | 一致：先 `updateAttackAnim()`，`getBrightness(1) > 0.5f` 时 `noActionTime += 2`，最后 `super.aiStep()`                             |
| 3   | `tick()`                                   | Monster.cpp:30  | `tick`                | 40    | 0.98   | 一致：`super.tick()` 后仅服务端、`Difficulty::PEACEFUL` 时 `remove()`                                                              |
| 4   | `hurt(Entity* sourceEntity, int dmg)`      | Monster.cpp:36  | `hurt`                | 45    | 0.97   | 一致：`super.hurt` 为真时，`sourceEntity !== this` 才清 `attackTargetId` 并记录伤害来源；`isMob()` 才写 `lastHurtByMobId`          |
| 5   | `canSpawn()`                               | Monster.cpp:52  | `canSpawn`            | 59    | 1.00   | 一致：`isDarkEnoughToSpawn() && super.canSpawn()`，短路顺序相同                                                                    |
| 6   | `findAttackTarget()`                       | Monster.cpp:57  | `findAttackTarget`    | 95    | 0.94   | 一致：`getNearestPlayer(this, 16)` 且 `canSee(player)` 才返回，否则 `NULL` / `null`；`protected`                                   |
| 7   | `isDarkEnoughToSpawn()`                    | Monster.cpp:66  | `isDarkEnoughToSpawn` | 101   | 1.00   | 一致：`Mth.floor` 三个坐标；天空亮度 `> random.nextInt(32)` 返回 false，原始亮度 `<= random.nextInt(8)`；两次随机数顺序与 C++ 相同 |
| 8   | `doHurtTarget(Entity* target)`             | Monster.cpp:88  | `doHurtTarget`        | 67    | 1.00   | 一致：`swing()`；伤害取 `attackDamage`；`target.hurt(this, dmg)`                                                                   |
| 9   | `checkHurtTarget(Entity*, float distance)` | Monster.cpp:104 | `checkHurtTarget`     | 111   | 0.92   | **已修 W33**：形参是 float，入口补 `distance = f(distance)`；四个条件与攻击流程一致                                                |
| 10  | `getWalkTargetValue(int x, int y, int z)`  | Monster.cpp:111 | `getWalkTargetValue`  | 126   | 0.89   | 一致：`0.5f - getBrightness(x,y,z)`，结果 `f()`；可见性见下（ADAPTED）                                                             |
| 11  | `getCreatureBaseType()`                    | Monster.cpp:116 | `getCreatureBaseType` | 63    | 1.00   | 一致：`MobTypes::BaseEnemy` / `MobTypes.BaseEnemy`                                                                                 |
| 12  | `getTarget()`                              | Monster.cpp:120 | `getTarget`           | 77    | 1.00   | 一致：`targetId == 0` 返回 NULL，否则 `level.getMob(targetId)`                                                                     |
| 13  | `setTarget(Mob* mob)`                      | Monster.cpp:125 | `setTarget`           | 73    | 0.91   | 一致：`mob ? mob->entityId : 0`                                                                                                    |
| 14  | `getLastHurtByMob()`                       | Monster.cpp:129 | `getLastHurtByMob`    | 82    | 1.00   | 一致（原版怪癖保留）：判断 `targetId == 0`，取的是 `lastHurtByMobId`                                                               |
| 15  | `setLastHurtByMob(Mob* mob)`               | Monster.cpp:134 | `setLastHurtByMob`    | 87    | 0.91   | 一致：`mob ? mob->entityId : 0`                                                                                                    |
| 16  | `getAttackDamage(Entity* target)`          | Monster.cpp:138 | `getAttackDamage`     | 91    | 1.00   | 一致：返回 `attackDamage`（形参未使用）                                                                                            |
| 17  | `getAttackTime()`                          | Monster.cpp:142 | `getAttackTime`       | 130   | 1.00   | 一致：返回 20，`protected`                                                                                                         |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复

**W33 `checkHurtTarget(Entity*, float distance)` 入口未舍入形参（清单第 2、3–7 条）。**
C++ 形参声明是 `float distance`，实参在函数入口先转成 float，再参与
`distance < 2.0f` 的比较。TS 原来直接拿 double 比较。引擎内唯一调用方
`PathfinderMob` 传的 `distanceTo()` 已经返回 float，所以实际玩法路径不变；
但按审核清单第 2 条的函数契约，入口必须舍入（同批 Creeper 的 W32 是同一个问题）。
修复：函数体第一行加 `distance = f(distance);`。

先红后绿：

- 红：撤掉该行，`npx vitest run tests/unit/world/monster-audit.test.ts` 失败——
  传入 `d = 1.9999999999999998`（double 略小于 2，`f(d)` 正好是 2），
  未舍入时判为“在攻击距离内”，目标掉血；C++ 语义是不攻击。
- 绿：恢复该行后 1/1 通过（攻击者 `attackTime` 仍为 0，目标生命不变）。

## ADAPTED（类型层面，无行为变化）

- **`getWalkTargetValue` 保持 `public`。** C++ `Monster.h` 把它写在 `protected` 段
  （派生类可以收窄基类 public 的 virtual）；TypeScript 不允许覆盖时收窄可见性，
  基类 `PathfinderMob` 是 public，故保持 public 并留 `ADAPTED(Cpp)`，与 `Animal` 同一处理。
- **`abstract class Monster`。** C++ 类技术上可实例化（没有继承到纯虚函数），但参考源码
  零 `new Monster(`；TS 用 `abstract` 防止直接实例化，无行为差异。

## 35 条清单核对要点

- 第 1–2 条：`attackDamage` / `targetId` / `lastHurtByMobId` / `attackTargetId` 都是 int；
  `hurt` 的 `dmg` 是 int；`checkHurtTarget` 的 `distance` 是 float（W33）；
  `getWalkTargetValue` 返回 float。
- 第 3–7 条：`getBrightness(1) > 0.5f` 用 `f(0.5)`；`getWalkTargetValue` 写成
  `f(f(0.5) - getBrightness(...))`，与 C++ 的 float 减法一致；`distance < f(2.0)`。
  其余无浮点运算。
- 第 8 条：`Mth.floor(x)` / `Mth.floor(bb.y0)` / `Mth.floor(z)` 与 C++ `Mth::floor(float)` 一致；
  `nextInt(32)` / `nextInt(8)` 是整数。
- 第 9–12 条：无数学函数、无 long、无字符串格式化。
- 第 13–18 条：虚函数重写关系与 C++ 一致（`aiStep` / `tick` / `hurt` / `canSpawn` /
  `findAttackTarget` / `checkHurtTarget` / `getWalkTargetValue` / `getCreatureBaseType`）；
  `getAttackDamage` / `getAttackTime` 在 C++ 是 `virtual`，TS 里是普通方法（TS 方法默认可覆盖）。
  无重载、默认参数、字段遮蔽。
- 第 19 条：三个字段的声明/初始化顺序无歧义（初值全是常量）。
- 第 20 条：可见性除 `getWalkTargetValue`（ADAPTED）外均与 `Monster.h` 相同。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：`isDarkEnoughToSpawn` 两次 `random.nextInt` 的调用顺序与 C++ 语句顺序一致
  （天空亮度判断先、`nextInt(32)` 后，再 `nextInt(8)`）；`canSpawn` 的 `&&` 短路顺序相同。
  `hurt` 里 `sourceEntity !== this` 的指针比较语义与 C++ 相同。
- 第 30–33 条：无字符串字面量、无 char / bool 转换与日志。
- 第 34 条：本次新增 1 处 `ADAPTED(Cpp)`（`getWalkTargetValue`）；文件无 `DEFERRED` / `OMIT`。
- 第 35 条：文件头注释与实际一致，未改。

## 验证

- `npx vitest run tests/unit/world/monster-audit.test.ts`：1/1 通过（红绿对照见上）。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check packages/world/src/entity/monster/Monster.ts tests/unit/world/monster-audit.test.ts`：通过。
- `pnpm ledger`：本次只新增 1 处 `ADAPTED(Cpp)`，台账 +1；`distance = f(distance)` 不是标记。
