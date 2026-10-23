# world/entity/ai：MeleeAttackGoal、RandomStrollGoal、BreakDoorGoal

第 2 批（world/entity/ai）。3 个文件工作表共 15 行全部有结论。新增编号 W48-W50。

对照：`src/world/entity/ai/goal/MeleeAttackGoal.h` ↔ `packages/world/src/entity/ai/goal/MeleeAttackGoal.ts`（86 行，工作表 6 行）；
`src/world/entity/ai/goal/RandomStrollGoal.h` ↔ `packages/world/src/entity/ai/goal/RandomStrollGoal.ts`（44 行，工作表 4 行）；
`src/world/entity/ai/goal/BreakDoorGoal.h` ↔ `packages/world/src/entity/ai/goal/BreakDoorGoal.ts`（48 行，工作表 5 行）。
三个 C++ 文件都只有 `.h`、没有 `.cpp`（`clean.py` 对 `.cpp` 报 FileNotFoundError 属预期），函数全部内联在头文件里。

结论：本组没有发现行为错误。W48–W50 都只补了标记或注释，没有改运行逻辑。
下表 TS 行号是审核后（当前文件）工作表生成的行号。

## MeleeAttackGoal（MeleeAttackGoal.h ↔ MeleeAttackGoal.ts）

C++ 侧要点：

- 无 `.cpp`。构造函数 `(Monster* mob, float speed, bool trackTarget, int attackType = 0)`，
  初始化列表 `mob, level(mob->level), speed, trackTarget, attackTime(0), attackType, path(NULL)`；
  成员声明顺序是 `level, mob, target, attackTime, speed, path, attackType, trackTarget`，其中 `target` 不在初始化列表里。
- 析构函数（h:28-33）在 `path` 非空时 `LOGI` 并 `delete path`。
- `canUse()`：目标为空 → false；`attackType != 0 && !mob->isPlayer()` → false（C++ 判断的是自己是不是玩家，不是目标的类型）；
  记下目标、释放旧路径、`createPath(target)`，按是否为空返回。
- `canContinueToUse()`：同样的目标与 attackType 判定；`!trackTarget` 时返回 `!isDone()`，否则 true。
- `start()`：`moveTo(path, speed, false)`；`stop()`：目标置空并停导航。
- `tick()`：`trackTarget || sensing->canSee(target)` 时 `moveTo(target, speed)`；
  `attackTime = Mth::Max(attackTime - 1, 0)`；`meleeRadiusSqr = (bbWidth * 2) * (bbWidth * 2)`（float 乘法）；
  距离超过半径或冷却未到就返回，否则冷却置 20 并 `doHurtTarget`。
- 被注释掉的 `setLookAt`、`LOGI`、旧式 attackType 判断均未复制。

工作表结论：

| #   | C++ 函数             | C++ 位置             | TS 方法            | TS 行 | 相似度 | 结论                                                                                                                        |
| --- | -------------------- | -------------------- | ------------------ | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | `path(NULL)`         | MeleeAttackGoal.h:24 | **（无）**         | —     | —      | 一致：初始化列表项 → 字段初始化器 `path: Path \| null = null`（TS 行 25）；不是缺少方法                                     |
| 2   | `canUse()`           | MeleeAttackGoal.h:36 | `canUse`           | 44    | 0.76   | 一致：判定顺序、attackType 怪癖相同；旧 path 的 LOGI/delete 由 GC 接管（W48 注释），随后 `createPathToMob`；返回 `!== null` |
| 3   | `canContinueToUse()` | MeleeAttackGoal.h:49 | `canContinueToUse` | 54    | 0.91   | 一致：同样先取目标并做 attackType 判定；`!trackTarget` 时返回 `!isDone()`，否则 true                                        |
| 4   | `start()`            | MeleeAttackGoal.h:58 | `start`            | 63    | 0.81   | 一致：`moveTo(path, speed, false)` ↔ `moveToPath(path, speed, false)`（R10 重载命名）；`speed` 构造入口已 `f()`             |
| 5   | `stop()`             | MeleeAttackGoal.h:62 | `stop`             | 67    | 0.86   | 一致：`target = NULL` ↔ `target = null`；`getNavigation()->stop()` ↔ `nav().stop()`                                         |
| 6   | `tick()`             | MeleeAttackGoal.h:67 | `tick`             | 72    | 0.93   | 一致：`\|\|` 短路、`Mth::Max` ↔ `Mth.Max`、`(bbWidth*2)^2` 逐步 `f()`、20 刻冷却与 `>` 比较均相同                           |

C++ 有、TS 没有的方法：`path(NULL)` 是初始化列表（已由字段初始化器实现）；析构函数已登记 `OMIT`（W48）。
TS 有、C++ 没有的方法：`nav()`（TS 行 40）是私有辅助方法，只为把反复出现的 `mob->getNavigation()` 收成一处，不是新行为。

修复：

**W48（无行为修改）**：补三处登记/说明，均不改变运行逻辑：

1. 析构函数 `~MeleeAttackGoal()`（h:28-33）按 R3 补 `// OMIT(MeleeAttackGoal): ...`，JS 由 GC 接管。
2. `target` 在 C++ 没有初始化（h:86），TS 已有 `= null`，补注释说明这是安全默认值，不是原版行为。
3. `canUse()` 里 C++ 先 `LOGI` 并 `delete` 旧 path（h:41-44），TS 交给 GC；补注释说明差异。

注释类修改不适用红绿对照；行为钉死用例见统一验证，11/11 通过。

ADAPTED / DEFERRED：无新增。`tick()` 的 `(this.mob.sensing as Sensing)` 只是类型断言：
C++ 是裸指针，`PathfinderMob` 构造时一定创建 `Sensing`，运行期非空（与 `TargetGoal` 的审核结论一致）；
`this.target!` 依赖“`canUse` 成功后才 `start`/`tick`”这一 GoalSelector 不变量，C++ 同样假定非空。

35 条清单核对要点：

- 第 1–7 条：`speed` 是唯一 float 形参，构造入口 `f(speed)`；`attackTime`、`attackType` 是 int；
  `bbWidth` 是 float，`(bbWidth * 2)` 两个因子各自 `f()`，乘完再 `f()`；`attackTime = 20` 是 int。
- 第 8–12 条：用 `Mth.Max` 而不是 `Math.max`；没有整数除法、移位、64 位整数、数学函数或格式化。
- 第 13–20 条：`canUse` 在 C++ 是虚重写（TS 继承抽象方法）、其余方法用 `override`；默认参数 `attackType = 0` 与 C++ 一致；
  `moveTo` 系列按 R10 改成 `moveToPath` / `moveToMob`；无字段遮蔽、无 `super` 调用；
  初始化列表顺序与声明顺序不同，但各项互不依赖，实际初始化顺序不影响结果；成员全 private，与 C++ 一致；
  构造函数只调用非虚的 `setRequiredControlFlags`。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：本文件没有随机数；`trackTarget || sensing.canSee(target)` 的短路顺序与 C++ 相同；
  被注释的 `setLookAt`、`LOGI`、旧 attackType 判断没有复制。
- 第 30–35 条：无字符串、char、布尔转整数、日志；本文件唯一新增标记是 OMIT；
  文件头对 attackType 怪癖、trackTarget、Path 内存管理的说明与代码一致，W48 另补了 target 未初始化说明。

## RandomStrollGoal（RandomStrollGoal.h ↔ RandomStrollGoal.ts）

C++ 侧要点：

- 无 `.cpp`。构造函数 `(PathfinderMob* mob, float speed)`，初始化列表只有 `mob(mob), speed(speed)`；
  成员声明 `mob, wantedX, wantedY, wantedZ, speed`，其中三个 `float wanted*` 没有初始化。
- `canUse()`：`getNoActionTime() >= TicksPerSecond * 5` → false；`random.nextInt(120) != 0` → false；
  `Vec3 pos;` 后调用 `RandomPos::getPos(pos, mob, 10, 7)`，失败返回 false；
  成功则把 `pos.x/y/z` 写入 `wantedX/Y/Z`，返回 true。
- `canContinueToUse()`：`!getNavigation()->isDone()`。
- `start()`：`moveTo(wantedX, wantedY, wantedZ, speed)`。
- 无被注释掉的代码。

工作表结论：

| #   | C++ 函数             | C++ 位置              | TS 方法            | TS 行 | 相似度 | 结论                                                                                                                                |
| --- | -------------------- | --------------------- | ------------------ | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `speed(speed)`       | RandomStrollGoal.h:20 | **（无）**         | —     | —      | 一致：初始化列表项 → 字段 `speed`（TS 行 16）+ 构造函数 `this.speed = f(speed)`（TS 行 21）；不是缺少方法                           |
| 2   | `canUse()`           | RandomStrollGoal.h:26 | `canUse`           | 25    | 0.91   | 一致：先判 noActionTime、再 `nextInt(120)`、再 `RandomPos.getPos`；输出参数改成返回值（RandomPos.ts 已标 ADAPTED），成功才写 wanted |
| 3   | `canContinueToUse()` | RandomStrollGoal.h:39 | `canContinueToUse` | 37    | 0.96   | 一致：`!isDone()`，无额外分支                                                                                                       |
| 4   | `start()`            | RandomStrollGoal.h:44 | `start`            | 41    | 0.95   | 一致：`moveTo(x, y, z, speed)` ↔ `moveToPos(x, y, z, speed)`（R10 重载命名）；`speed` 已在构造入口 `f()`                            |

C++ 有、TS 没有的方法：`speed(speed)` 是初始化列表项，已由字段加构造函数赋值实现。
TS 有、C++ 没有的方法：无。

修复：

**W49（无行为修改）**：补两处注释，均不改变运行逻辑：

1. C++ 的三个 `float wantedX, wantedY, wantedZ` 没有初始化（h:50），TS 已有 `= 0`；
   补注释说明这是安全默认值，正常流程中 `canUse` 成功后才读取。
2. `RandomPos::getPos` 在 C++ 用引用参数输出，TS 改成返回 `Vec3 | null`；补注释说明。
   `RandomPos.ts` 文件头已经标了 `ADAPTED(Cpp)`，本文件只是调用方，不重复标记。

注释类修改不适用红绿对照；行为钉死用例见统一验证，11/11 通过。

ADAPTED / DEFERRED：无新增（引用输出参数的适配已在 `RandomPos.ts` 登记）。

35 条清单核对要点：

- 第 1–7 条：`speed` 是 float 形参，构造入口 `f(speed)`；`wantedX/Y/Z` 是 float，
  写入的是 `Vec3` 组件（`Vec3` 构造函数入口已 `f()`，此处是 float 到 float 的拷贝，不需要再舍入）；
  `TicksPerSecond * 5` 是整数 100。
- 第 8–12 条：`nextInt(120)` 是整数；没有整数除法、移位、64 位整数、数学函数或格式化。
- 第 13–20 条：`canUse` / `canContinueToUse` / `start` 都是 C++ 虚重写，TS 用 `override`（`canUse` 继承抽象方法）；
  `moveTo(float, float, float, float)` 按 R10 改成 `moveToPos`；无默认参数、重载、字段遮蔽、`super` 调用；
  成员初始化顺序互不依赖；C++ 成员全 private，TS 也全 private；构造函数只调用非虚的 `setRequiredControlFlags`。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：随机顺序与 C++ 相同——`noActionTime >= 100` 时直接返回，不消耗随机数；
  通过后再 `nextInt(120)`，等于 0 才调用 `RandomPos.getPos`；没有带随机数的被注释代码。
- 第 30–35 条：无字符串、char、布尔转整数、日志；本文件没有 DEFERRED / OMIT；
  文件头“noActionTime < 5 秒、每刻 1/120”与实现一致，W49 另补了未初始化字段与输出参数说明。

## BreakDoorGoal（BreakDoorGoal.h ↔ BreakDoorGoal.ts）

C++ 侧要点：

- 无 `.cpp`。继承 `DoorInteractGoal`，`typedef DoorInteractGoal super`；构造函数 `(Monster* mob)` 只初始化 `super(mob)`。
- `canUse()`：`super::canUse()` 失败 → false；否则 `!doorTile->isOpen(mob->level, doorX, doorY, doorZ)`
  （`isOpen` 是静态方法，C++ 通过对象指针调用）。
- `start()`：`super::start()`；`breakTime = TicksPerSecond * 12`（240）。
- `canContinueToUse()`：`float d = mob->distanceToSqr((float)doorX, (float)doorY, (float)doorZ);`
  返回 `breakTime >= 0 && !isOpen(...) && d < 2 * 2`。
- `tick()`：`super::tick()`；`random.nextInt(20) == 0` 的分支是空的（音效调用被注释），但随机数照常消耗；
  `if (--breakTime == 0)` 时无条件 `setTile(..., 0)`——外层的 `difficulty == HARD` 判断与音效/粒子调用都被注释掉了。
- `private int breakTime` 没有初始化。
- 被注释掉的 levelEvent、`LOGI`、difficulty 判断均未复制。

工作表结论：

| #   | C++ 函数             | C++ 位置           | TS 方法            | TS 行 | 相似度 | 结论                                                                                                                                 |
| --- | -------------------- | ------------------ | ------------------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `super(mob)`         | BreakDoorGoal.h:19 | **（无）**         | —     | —      | 一致：基类初始化列表项 → 构造函数 `super(mob)`（TS 行 16）；不是缺少方法                                                             |
| 2   | `canUse()`           | BreakDoorGoal.h:22 | `canUse`           | 19    | 0.93   | 一致：先 `super.canUse()`；`doorTile->isOpen` 是静态方法，TS 直接 `DoorTile.isOpen`，行为相同（W50 注释）                            |
| 3   | `start()`            | BreakDoorGoal.h:27 | `start`            | 25    | 1.00   | 一致：`super.start()` 后 `breakTime = TicksPerSecond * 12`                                                                           |
| 4   | `canContinueToUse()` | BreakDoorGoal.h:32 | `canContinueToUse` | 30    | 0.95   | 一致：`distanceToSqr` 的 `(float)` 形参转换由 Entity 入口 `f()` 完成；`breakTime >= 0`、门未开、`d < 2 * 2` 的顺序相同               |
| 5   | `tick()`             | BreakDoorGoal.h:37 | `tick`             | 39    | 0.98   | 一致：先 `super.tick()`；每刻消耗一次 `nextInt(20)`（空分支仍消耗）；`--breakTime === 0` 时无条件 `setTile(..., 0)`；`>= 0` 怪癖保留 |

C++ 有、TS 没有的方法：`super(mob)` 是基类初始化，已在构造函数中实现。
TS 有、C++ 没有的方法：无。

修复：

**W50（无行为修改）**：补三处说明/修正，均不改变运行逻辑：

1. C++ 的 `private int breakTime` 没有初始化（h:54），TS 已有 `= 0`；补注释说明这是安全默认值。
2. C++ 通过 `doorTile->isOpen(...)` 调用静态方法，TS 直接调用 `DoorTile.isOpen(...)`；补注释说明行为相同。
3. 修正文件头：原文说播破门声音的几句“被删掉了”，实际 C++ 里是**被注释掉**；
   并补充“拆门外层的 difficulty 判断也被注释掉、拆门无条件执行”。

注释类修改不适用红绿对照；行为钉死用例见统一验证，11/11 通过。

ADAPTED / DEFERRED：无新增。通过对象指针调用静态方法是 C++ 语法怪癖，TS 的静态调用行为完全相同，不需要 ADAPTED 标记。

35 条清单核对要点：

- 第 1–7 条：`breakTime` 是 int；`TicksPerSecond * 12` 是整数 240；`d` 是 float；
  C++ 的 `(float)doorX` 等三个转换由 `Entity.distanceToSqr` 入口的 `f()` 实现；`d < 2 * 2` 的 4 是整数。
- 第 8–12 条：`--breakTime` 是整数自减；没有整数除法、移位、64 位整数、数学函数或格式化。
- 第 13–20 条：四个方法都是 C++ 虚重写，TS 用 `override`；`super.canUse` / `super.start` / `super.tick` 保留；
  无默认参数、重载、字段遮蔽；成员初始化只有 `super(mob)`，顺序无依赖；方法 public、`breakTime` private，与 C++ 一致；
  构造函数没有虚调用。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：`nextInt(20)` 每刻都调用，分支为空也照常消耗；`breakTime >= 0` 的怪癖保留（0 时仍可继续，下一 tick 到 -1 才结束）；
  `&&` 顺序为 `breakTime` → `isOpen` → `d < 4`，且 `d` 在布尔表达式之前无条件计算，与 C++ 相同；
  被注释的 levelEvent、`LOGI`、difficulty 判断没有复制。
- 第 30–35 条：无字符串、char、布尔转整数、日志；本文件没有 DEFERRED / OMIT；
  文件头经 W50 修正后与 C++ 的被注释代码一致。

## 统一验证

- `pnpm exec vitest run tests/unit/world/ai-goal-combat-audit.test.ts`：退出码 0，1 个测试文件、11 条用例全部通过。
- `npx tsc -p packages/world --noEmit`：退出码 0。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0。
- `npx prettier --check`（3 个 TS 文件 + 本测试 + 本记录）：退出码 0。

新增标记：`OMIT` 1 处（`MeleeAttackGoal.h:28-33` 的析构函数），`DEFERRED` 0 处，`ADAPTED` 0 处，`FORWARD-DECL` 0 处。
本组没有行为修复，红绿对照不适用；11 条测试用例钉住审核确认的行为，改动后全部通过。
