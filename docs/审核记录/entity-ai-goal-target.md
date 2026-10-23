# world/entity/ai goal 三件套（DoorInteractGoal / HurtByTargetGoal / NearestAttackableTargetGoal）

第 2 批（world/entity/ai）。3 个文件工作表共 12 行全部有结论。新增编号 W51-W53。

三个类都是 header-only（没有同名 `.cpp`），C++ 侧只有 3 个头文件；TS 审核后分别是
DoorInteractGoal.ts 78 行、HurtByTargetGoal.ts 23 行、NearestAttackableTargetGoal.ts 41 行。
本轮新增 2 处 `ADAPTED(Safety)`、1 处怪癖说明、1 处“被注释代码不复制”说明、1 处文件头更正；
无 `DEFERRED(待确认)`、无 OMIT。逐函数对照后函数体未发现行为错误。

三个 goal 的去留（测试因此直接构造）：

- DoorInteractGoal：全仓只有 `packages/world/src/index.ts` 的 re-export，没有任何生物添加；
  BreakDoorGoal 同样没有人添加（C++ 原样）。
- HurtByTargetGoal / NearestAttackableTargetGoal：Zombie 构造函数**无条件**添加这两个
  （C++ `Zombie.cpp:29-30`，TS Zombie.ts:38-39），PigZombie 继承；只是普通 Zombie 的
  `useNewAi()` 默认 false，目标选择器不会 tick。

## 1. DoorInteractGoal（W51）

### C++ 侧要点

- 可见性：`mob`、`doorX/doorY/doorZ`、`doorTile` 在 `protected`；`passed`、`doorOpenDirX/Z`
  在 `private`；`getDoorTile` 在 `private`；`canUse/canContinueToUse/start/tick` 在 `public`。
- 构造函数初始化列表只有 `mob(mob)`；其余 7 个成员 C++ 完全未初始化（读它们是未定义行为）。
  TS 按规则取 `0 / null / false`，正常流程在 `canUse`（doorX/Y/Z、doorTile）与 `start`
  （passed、doorOpenDirX/Z）里先赋值，标 `ADAPTED(Safety)`（W51-1）。
- `canUse` 顺序：`horizontalCollision` → `getNavigation()->getPath()` → `path == NULL ||
isDone() || !canOpenDoors` → 循环 `i < Min(index + 2, size)`（即从路径起点到当前节点后一个）
  → `doorY = n.y + 1` → `distanceToSqr(doorX, mob->y, doorZ) > 1.5f * 1.5f` 跳过
  → `getDoorTile` 为 NULL 跳过 → 回退 `floor(mob.x)`、`floor(mob.y + 1)`、`floor(mob.z)`。
- `start`：`passed = false`；`doorOpenDirX/Z = (doorX + 0.5f) - mob->x`（两段 float）。
- `tick`：`newDoorDirX/Z` 同上两段 float；点积 `x1*x2 + z1*z2` 逐步 float；`dot < 0` 时
  `passed = true`。
- `getDoorTile`：`level->getTile` 后只认 `Tile::door_wood->id`，直接返回 `Tile::tiles[tileId]`。

### 工作表结论

| #   | C++ 函数                           | C++ 位置              | TS 方法            | TS 行 | 相似度 | 结论                                                                                                                        |
| --- | ---------------------------------- | --------------------- | ------------------ | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | `mob(mob)`                         | DoorInteractGoal.h:17 | `constructor`      | 27    |        | 一致：构造函数只给 `mob` 赋值；其余成员 C++ 未初始化，TS 取安全默认（W51-1，`ADAPTED(Safety)`）                             |
| 2   | `canUse()`                         | DoorInteractGoal.h:20 | `canUse`           | 32    | 0.97   | 一致：三个提前返回、循环上界 `Min(index+2, size)`、严格 `> 2.25`、doorTile 空继续、回退 `floor(y+1)` 全部相同；5 条测试钉住 |
| 3   | `canContinueToUse()`               | DoorInteractGoal.h:45 | `canContinueToUse` | 54    | 0.91   | 一致：返回 `!passed`                                                                                                        |
| 4   | `start()`                          | DoorInteractGoal.h:49 | `start`            | 58    | 0.87   | 一致：`passed = false`；开门方向 `f(f(doorX + 0.5) - mob.x)`，两段 float                                                    |
| 5   | `tick()`                           | DoorInteractGoal.h:55 | `tick`             | 64    | 0.86   | 一致：newDir 两段 float；点积 `f(f(x1*x2) + f(z1*z2))` 左结合；`< 0` 置 passed                                              |
| 6   | `getDoorTile(int x, int y, int z)` | DoorInteractGoal.h:33 | `getDoorTile`      | 73    | 0.83   | 一致：只认 `Tile.door_wood.id`，返回 `Tile.tiles[id]`；`private`                                                            |

C++ 有、TS 没有的方法：无（构造函数初始化列表已计入第 1 行）。TS 有、C++ 没有的方法：无。

### 修复（标记/注释级）

- **W51-1 未初始化成员补 `ADAPTED(Safety)`**：C++ 只初始化 `mob`，`doorX/Y/Z`、`doorTile`、
  `passed`、`doorOpenDirX/Z` 均未初始化；TS 的默认值没有改变任何可达行为（正常流程先赋值），
  按规则 1.3 标记。改了 3 行注释，无表达式变化。
- **W51-2 文件头扫描范围更正**：原注释写“路径前两个路点或脚下”，与 C++ 不符。C++ 是
  `min(index + 2, size)` 个路点（路径起点到当前节点后一个），回退格是 `floor(mob.y + 1)`
  （脚上一格），不是“脚下”。已改为与源码一致的描述。

## 2. HurtByTargetGoal（W52）

### C++ 侧要点

- 继承 `TargetGoal`；初始化列表 `TargetGoal(mob, 16, false), alertSameType(alertSameType)`；
  构造函数体只有 `setRequiredControlFlags(TargetGoal::TargetFlag)`。
- `canUse`：`canAttack(mob->getLastHurtByMob(), true)`；`start`：`setTarget(mob->getLastHurtByMob())`。
- `TargetGoal` 里 `within` 是 `float`，构造时舍入；本 goal 固定 16，无精度问题。
- 怪癖：`HurtByTargetGoal.h:27-35` 整段“通知同类”的逻辑被注释掉，`alertSameType` 只保存、
  从不读取，也不会通知同类。TS 照抄保存并加说明（W52-1）。
- 关联怪癖（在 `Monster`，不在本文件）：`getLastHurtByMob()` 先看 `targetId == 0`，没有目标就
  返回 NULL，即使 `lastHurtByMobId` 有值；测试钉住这个行为。
- 可见性：`alertSameType` 在 `private`；构造函数、`canUse`、`start` 在 `public`。

### 工作表结论

| #   | C++ 函数                       | C++ 位置              | TS 方法       | TS 行 | 相似度 | 结论                                                                                               |
| --- | ------------------------------ | --------------------- | ------------- | ----- | ------ | -------------------------------------------------------------------------------------------------- |
| 1   | `alertSameType(alertSameType)` | HurtByTargetGoal.h:15 | `constructor` | 10    |        | 一致：`super(mob, 16, false)`、保存 `alertSameType`、`TargetFlag`；C++ 从不读它（W52-1，怪癖保留） |
| 2   | `canUse()`                     | HurtByTargetGoal.h:20 | `canUse`      | 16    | 1.00   | 一致：`canAttack(getLastHurtByMob(), true)`；`targetId == 0` 的怪癖由测试钉住                      |
| 3   | `start()`                      | HurtByTargetGoal.h:24 | `start`       | 20    | 1.00   | 一致：`setTarget(getLastHurtByMob())`                                                              |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

### 修复（标记/注释级）

- **W52-1 怪癖说明**：在 `alertSameType` 字段上方注明“C++ 的读取逻辑在 27-35 行被注释，字段
  从不使用、从不通知同类，TS 照抄保存”。只加注释，无行为变化。

## 3. NearestAttackableTargetGoal（W53）

### C++ 侧要点

- 构造签名 `NearestAttackableTargetGoal(Monster* mob, int targetType, float within,
int randomInterval, bool mustSee)`；初始化列表 `TargetGoal(mob, within, mustSee)`、
  `targetType(targetType)`、`randomInterval(randomInterval)`；构造函数体只有 `TargetFlag`。
  `within` 是 `float`，在 `TargetGoal` 构造时按 float 入口舍入。
- 成员都在 `private`：`Mob* target`（C++ 未初始化）、`int targetType`、`int randomInterval`。
- `canUse`：先 `randomInterval > 0 && mob->random.nextInt(randomInterval) != 0` 短路返回 false；
  `targetType == 1` 时才 `target = level->getNearestPlayer(mob, within)`；`else` 分支
  （`getClosestEntityOfClass`）被注释掉、不移植；最后 `canAttack(target, false)`。
- `start`：`setTarget(target)`。
- TS 把 `this.target = potentialTarget` 放在 `canAttack` 通过之后；C++ 在调用前就给成员赋值。
  `canUse` 返回 false 时 `start` 不会被调用，可观察行为相同（表中已注明）。

### 工作表结论

| #   | C++ 函数                         | C++ 位置                         | TS 方法       | TS 行 | 相似度 | 结论                                                                                                                                    |
| --- | -------------------------------- | -------------------------------- | ------------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `randomInterval(randomInterval)` | NearestAttackableTargetGoal.h:18 | `constructor` | 13    |        | 一致：`super(mob, within, mustSee)`、保存 targetType/randomInterval、`TargetFlag`；`target` 未初始化取 null（W53-1，`ADAPTED(Safety)`） |
| 2   | `canUse()`                       | NearestAttackableTargetGoal.h:23 | `canUse`      | 26    | 0.96   | 一致：`nextInt` 短路顺序、`targetType == 1` 才查玩家、`canAttack(false)`；else 分支被注释不移植（W53-2）；TS 赋值位置不同的等价性见上   |
| 3   | `start()`                        | NearestAttackableTargetGoal.h:33 | `start`       | 38    | 1.00   | 一致：`setTarget(target)`；canUse 之前调用会读安全默认 null                                                                             |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

### 修复（标记/注释级）

- **W53-1 `target` 未初始化补 `ADAPTED(Safety)`**：C++ `Mob* target;` 在 canUse 成功前读是
  未定义行为；TS 取 null。canUse 返回 true 时 start 一定能读到已赋值的 target。
- **W53-2 被注释的 else 分支说明**：注明 `//else potentialTarget = ... getClosestEntityOfClass(...)`
  被注释掉、不移植，`targetType != 1` 时 potentialTarget 保持 null。只加注释，无行为变化。

## 修复与红绿证据（统一说明）

W51/W52/W53 全部是注释或标记级修正，没有改动任何表达式，因此不存在“改前运行红、改后绿”的
运行时状态。新增的 14 条测试（DoorInteract 5、HurtBy 3、Nearest 6）在注释改动前后都通过：
它们钉住的是本来就与 C++ 一致的行为，防止以后回归；没有放宽任何既有断言，也没有生成黄金样本
（这三个 goal 没有字节或数值输出格式）。

唯一一次真实的“红”在测试文件自身（已修）：

- 红：测试初版直接读 `DoorInteractGoal` 的 private 字段 `doorOpenDirX/doorOpenDirZ`，
  `npx tsc -p tests/tsconfig.json --noEmit` 退出码 2：
  `ai-goal-target-audit.test.ts(80,19): error TS2341: Property 'doorOpenDirX' is private
and only accessible within class 'DoorInteractGoal'.`（83,19 同，`doorOpenDirZ`）。
- 修复：C++ 里这两个字段也是 `private`，不放宽可见性；删掉直接读字段的断言，改为只断言
  public/protected 可观察行为（doorX/Y/Z 是 protected；passed 通过 `canContinueToUse()`
  间接观察；穿过门用 `start/tick` 行为验证）。
- 绿：重跑 `npx tsc -p tests/tsconfig.json --noEmit` 退出码 0，0 错误。

## ADAPTED / DEFERRED / OMIT

| 文件                           | 标记              | 位置                 | 理由                                                   |
| ------------------------------ | ----------------- | -------------------- | ------------------------------------------------------ |
| DoorInteractGoal.ts            | `ADAPTED(Safety)` | 字段声明前           | C++ 只初始化 mob，7 个成员未初始化；TS 取 0/null/false |
| NearestAttackableTargetGoal.ts | `ADAPTED(Safety)` | `target` 字段声明前  | C++ `Mob* target` 未初始化；TS 取 null                 |
| DoorInteractGoal.ts            | 注释              | 文件头               | 更正扫描范围描述（W51-2）                              |
| HurtByTargetGoal.ts            | 注释              | `alertSameType` 上方 | 怪癖保留：读取逻辑被注释，字段从不使用（W52-1）        |
| NearestAttackableTargetGoal.ts | 注释              | `canUse` 内          | 被注释的 else 分支不移植（W53-2）                      |

`DEFERRED(待确认)`：无。`OMIT`：无。新增标记合计 2 处 `ADAPTED(Safety)`。

## 35 条清单核对要点

- 第 1-2 条：字段类型（int/float/bool/指针）与 C++ 一致；float 形参只有 Nearest 的 `within`
  （float，经 `TargetGoal` 构造期 fround）；DoorInteract 坐标全 int；HurtBy 无 float。
- 第 3-7 条：DoorInteract 的 `(doorX + 0.5f) - mob->x` 两段 fround；`1.5f * 1.5f` 写成
  `f(1.5 * 1.5)`（= 2.25）；点积按左结合 `f(f(x1*x2) + f(z1*z2))`；无其它 float 运算。
- 第 8 条：`Mth.Min`、`Mth.floor` 与 C++ 同名；无整数除法；`n.y + 1`、`i++` 为 int。
- 第 9-12 条：无 atan2/sqrt、无字符串格式化、无 long。
- 第 13-18 条：override 关系正确（`canUse/canContinueToUse/start/tick`；HurtBy/Nearest 覆盖
  TargetGoal 的 `canUse`）；无重载、默认参数、字段遮蔽；构造函数内只调用非虚的
  `setRequiredControlFlags`。
- 第 19 条：初始化顺序——TS 字段初始化在 `super()` 之后、构造函数体之前；成员之间无依赖。
- 第 20 条：可见性与 C++ 一致：DoorInteract 的 protected mob/doorX/Y/Z/doorTile、private
  passed/doorOpenDirX/Z/getDoorTile；HurtBy 的 private alertSameType；Nearest 的 private
  target/targetType/randomInterval。测试只用 protected/公开成员，未放宽 private。
- 第 21-25 条：无按值对象、容器、排序、哈希。
- 第 26-29 条：随机数只有 Nearest 的一次 `nextInt(randomInterval)`，受 `randomInterval > 0`
  短路且在最前；无其它随机调用；被注释代码未复制（HurtBy 27-35、Nearest 的 else）。
- 第 30-33 条：字符串均为 ASCII；无 char/bool 转换、无日志。
- 第 34 条：新增 2 处 `ADAPTED(Safety)`、0 处 `DEFERRED(待确认)`、无 OMIT。
- 第 35 条：文件头——DoorInteract 已更正；HurtBy/Nearest 的头注释与代码一致。

## 验证

- `pnpm exec vitest run tests/unit/world/ai-goal-target-audit.test.ts`：退出码 0，
  1 个文件、14/14 通过。
- `npx tsc -p packages/world --noEmit`：退出码 0，0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0，0 错误（测试初版的 TS2341 红态见上）。
- `npx prettier --check`（3 个 TS + 测试 + 本记录）：退出码 0，5 个文件通过。
- 未生成黄金样本：这三个 goal 没有字节或数值输出格式。
