# world/entity/ai：Goal、GoalSelector、TargetGoal

第 2 批（world/entity/ai）。3 个文件工作表共 17 行全部有结论。新增编号 W40-W42。

对照：`src/world/entity/ai/goal/Goal.h` ↔ `packages/world/src/entity/ai/goal/Goal.ts`（28 行，工作表 8 行）；
`src/world/entity/ai/goal/GoalSelector.h` ↔ `packages/world/src/entity/ai/goal/GoalSelector.ts`（67 行，工作表 5 行）；
`src/world/entity/ai/goal/target/TargetGoal.h` ↔ `packages/world/src/entity/ai/goal/target/TargetGoal.ts`（46 行，工作表 4 行）。
三个 C++ 文件都只有 `.h`、没有 `.cpp`（`clean.py` 对 `.cpp` 报 FileNotFoundError 属预期），函数全部内联在头文件里。

结论：本组没有发现行为错误。W42 无代码修改；W40、W41 各补了 1 处 R3 要求的析构函数 `OMIT` 标记
（此前缺登记）。下表 TS 行号是审核前工作表生成的行号；W40/W41 各插入两行注释，其后行号 +2。

## Goal（Goal.h ↔ Goal.ts）

C++ 侧要点：

- 无 `.cpp`，类定义共 42 行。`public` 段：构造函数（初始化列表 `_requiredControlFlags(0)`）、`virtual ~Goal() {}`、
  纯虚 `canUse()`、默认实现的 `canContinueToUse()`（转调 `canUse()`）、`canInterrupt()`（返回 true）、
  空 `start()` / `stop()` / `tick()`、`setRequiredControlFlags(int)` / `getRequiredControlFlags()`。
- `private` 段：`int _requiredControlFlags`，无未初始化成员。
- TS 用 `abstract class` + `abstract canUse()`；构造函数初始化列表做成字段初始化器 `= 0`；
  其余方法逐行相同，全部保持 C++ 的 public 可见性。

工作表结论：

| #   | C++ 函数                           | C++ 位置  | TS 方法                   | TS 行 | 相似度 | 结论                                                                                      |
| --- | ---------------------------------- | --------- | ------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------- |
| 1   | `_requiredControlFlags(0)`         | Goal.h:10 | 字段初始化器              | 3     | —      | 一致：构造函数初始化列表 0 → 字段初始化器 `= 0`（不是“缺少方法”）                         |
| 2   | `canContinueToUse()`               | Goal.h:16 | `canContinueToUse`        | 7     | 1.00   | 一致：`return this.canUse()`，虚派发与 C++ 相同                                           |
| 3   | `canInterrupt()`                   | Goal.h:20 | `canInterrupt`            | 11    | 1.00   | 一致：返回 true                                                                           |
| 4   | `start()`                          | Goal.h:24 | `start`                   | 15    | 1.00   | 一致：空函数体                                                                            |
| 5   | `stop()`                           | Goal.h:27 | `stop`                    | 17    | 1.00   | 一致：空函数体                                                                            |
| 6   | `tick()`                           | Goal.h:30 | `tick`                    | 19    | 1.00   | 一致：空函数体                                                                            |
| 7   | `setRequiredControlFlags(int ...)` | Goal.h:33 | `setRequiredControlFlags` | 21    | 1.00   | 一致：int 字段赋值；所有调用方传的都是整数位标志（`Control.*`、`TargetFlag`），无浮点实参 |
| 8   | `getRequiredControlFlags()`        | Goal.h:37 | `getRequiredControlFlags` | 25    | 1.00   | 一致：返回 `_requiredControlFlags`                                                        |

C++ 有、TS 没有的方法：无（`_requiredControlFlags(0)` 是初始化列表，已由字段初始化器实现）。
TS 有、C++ 没有的方法：无。

修复：

**W40（无行为修改）**：补 `// OMIT(Goal): ~Goal() {}  Goal.h:12`。R3 规定析构函数不移植，
此前只是缺少登记；空析构函数本来就没有行为。注释类修改不适用红绿对照，
行为用例（`ai-goal-audit.test.ts` 的 W40 两条）9/9 全部通过。

ADAPTED / DEFERRED：无新增。

35 条清单核对要点：

- 第 1–12 条：没有 float / double 字段或运算，没有整数除法、乘法、移位、取整；
  `_requiredControlFlags` 是 int，只能由 `setRequiredControlFlags(int)` 写入，实参均为整数位标志；
  无数学函数、无 64 位整数、无格式化。
- 第 13–20 条：C++ 的 `canContinueToUse` / `canInterrupt` / `start` / `stop` / `tick` 都是 `virtual`，
  TS 同名方法天然虚派发；`canUse` 纯虚 → `abstract`；`set/getRequiredControlFlags` 在 C++ 非 virtual、TS 也非抽象；
  无重载、无默认参数、无遮蔽、无 `super` 调用；`private _requiredControlFlags` 与 C++ private 一致。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：无随机数、无被注释掉的调用。
- 第 30–35 条：无字符串、char、布尔转换、日志；本文件唯一标记是新增的 OMIT；文件头“1:1 移植自 Goal.h”准确。

## GoalSelector（GoalSelector.h ↔ GoalSelector.ts）

C++ 侧要点：

- 无 `.cpp`。私有嵌套类 `InternalGoal`：构造函数 `(short prio, Goal* goal)`，初始化列表
  `prio(prio), goal(goal), isUsing(false)`；成员 `Goal* goal; short prio; bool isUsing;`（public）。
- `public`：析构函数（循环 `delete goals[i].goal`）、`addGoal(int prio, Goal* goal)`
  （`goals.push_back(InternalGoal(prio, goal))`，int → short 在形参处截断）、`tick()`。
- `tick()` 的 `toStart` 是 `std::vector<InternalGoal>`，`push_back(ig)` 放的是**按值副本**；
  扫描阶段对正在运行、但不能用（`!canUseInSystem`）或不能继续（`!canContinueToUse`）的 goal 调 `stop()` 并清 `isUsing`；
  能用的 goal 先压入副本、再把原件的 `isUsing` 置 true；扫描完才按插入顺序统一 `start()`；最后对所有 `isUsing` 的 goal `tick()`。
- `private canUseInSystem(InternalGoal&)`：先跳过 `(goal 指针, prio)` 都相同的记录；
  `goal.prio >= ig.prio` 时，若 `ig` 在运行且控制位冲突（`!canCoExist`）返回 false；
  否则（`goal.prio < ig.prio`）若 `ig` 在运行且 `!ig.goal->canInterrupt()` 返回 false。
- `private canCoExist`：`(a.flags & b.flags) == 0`。`private std::vector<InternalGoal> goals`。
- 被注释掉的 `usingGoals`、debug `printf` 均未复制。

工作表结论：

| #   | C++ 函数                                   | C++ 位置          | TS 方法          | TS 行 | 相似度 | 结论                                                                                                                                                                              |
| --- | ------------------------------------------ | ----------------- | ---------------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `isUsing(false)`                           | GoalSelector.h:17 | 字段初始化器     | 10    | —      | 一致：成员初始化 → `isUsing = false`（不是“缺少方法”）                                                                                                                            |
| 2   | `addGoal(int prio, Goal* goal)`            | GoalSelector.h:31 | `addGoal`        | 22    | 0.93   | 一致：`push_back` ↔ `push(new InternalGoal(prio, goal))`；int → short 截断在 `InternalGoal` 构造函数里用 `(prio << 16) >> 16` 实现，与 GCC 的窄化行为一致                         |
| 3   | `tick()`                                   | GoalSelector.h:35 | `tick`           | 26    | 0.63   | 一致：`toStart` 保持按值副本语义（`new InternalGoal` 后拷 `isUsing`）；先扫描/标记、后统一 `start`、再 `tick`；`stop` 让出的控制位同一刻可被后面的 goal 接手；`\|\|` 短路顺序相同 |
| 4   | `canUseInSystem(InternalGoal& goal)`       | GoalSelector.h:81 | `canUseInSystem` | 54    | 0.81   | 一致：同 `(goal, prio)` 值自跳过；`>=` 分支查控制位、`<` 分支查 `canInterrupt`，两个分支的判断顺序与 C++ 相同                                                                     |
| 5   | `canCoExist(InternalGoal&, InternalGoal&)` | GoalSelector.h:96 | `canCoExist`     | 64    | 1.00   | 一致：`(a & b) === 0`，整数位与                                                                                                                                                   |

C++ 有、TS 没有的方法：无（`isUsing(false)` 是成员初始化，已由字段初始化器实现）。
TS 有、C++ 没有的方法：无。

怪癖保留（均有代码/测试依据）：

1. `toStart` 里存的是副本，`isUsing` 设在原件上；`start()` 调用的是副本里的 goal 指针，顺序 = 登记顺序。
2. 自跳过条件是 `(goal 指针, prio)` 的**值比较**：同一个 goal 以同一优先级登记两次时，两条记录互相跳过，
   同一刻会 `start()` 两次、以后每刻 `tick()` 两次（`ai-goal-audit.test.ts` 的 W41 用例钉住）。
3. 正在运行但 `canUseInSystem` 失败的 goal 被 `stop` 后，同一轮循环里还会再算一次 `canUseInSystem`（C++ 第 43、50 行两次调用）；
   TS 保留，无外部可观察差异。

修复：

**W41（无行为修改）**：补 `// OMIT(GoalSelector): ~GoalSelector()  GoalSelector.h:25`。R3 规定析构函数不移植，
JS 由 GC 接管；此前只是缺少登记。注释类修改不适用红绿对照，行为用例 9/9 通过。

ADAPTED / DEFERRED：无新增。`InternalGoal` 在 C++ 是私有嵌套类，TS 写成模块级**非导出**类，
只能在本文件内使用，可见性与行为都不变（R11 的顶层化写法针对对外暴露的嵌套类型），故未标 ADAPTED。

35 条清单核对要点：

- 第 1–12 条：`prio` 是 short：`addGoal` 的 int 实参在 `InternalGoal` 构造函数里按 16 位截断（测试用 0x10001 → 1 验证）；
  没有 float、整数除法、乘法、移位以外的数值处理；`canCoExist` 的 `&` 按 32 位整数语义；
  无数学函数、无 64 位值、无格式化。
- 第 13–20 条：`GoalSelector` 的方法在 C++ 都非 virtual，TS 也没有继承；`InternalGoal` 无多态；
  无重载 / 默认参数 / 字段遮蔽；无 `super`；成员构造顺序无依赖（`goal`、`prio`、`isUsing` 都只做赋值）；
  可见性：`addGoal` / `tick` public，`canUseInSystem` / `canCoExist` / `goals` private，`InternalGoal` 私有嵌套 → 模块内可见，逐项一致。
- 第 21–25 条：`std::vector` 的追加顺序 = TS 数组 `push` 顺序；tick 期间不增删 `goals`，遍历安全；无 `erase`、排序、map。
- 第 26–29 条：无随机数；两处 `\|\|` 的短路顺序与 C++ 相同（`canUseInSystem` 失败时不再问 goal）；
  被注释掉的 debug 代码里没有随机数调用，未复制。
- 第 30–35 条：无字符串、char、布尔转换、日志；本文件唯一新增标记是 OMIT；
  文件头关于“副本 / isUsing 设在原件 / 优先级是 short”的三条说明与实现一致。

## TargetGoal（TargetGoal.h ↔ TargetGoal.ts）

C++ 侧要点：

- 无 `.cpp`。`public`：`static const int TargetFlag = 1`；构造函数 `(Monster* mob, float within, bool mustSee)`，
  初始化列表 `mob(mob), within(within), mustSee(mustSee)`；`canContinueToUse()`（虚重写）、`stop()`。
- `canContinueToUse` 顺序：目标为空 → `!isAlive()` → `distanceToSqr(target) > within * within`（float 乘 float）→
  `mustSee && !sensing->canSee(target)`。
- `protected`：`canAttack(Mob* target, bool allowInvulnerable)`（空 / 自身 / 死亡 / y 轴不重叠 /
  玩家无敌且 `!allowInvulnerable` / mustSee），成员 `Monster* mob; float within; bool mustSee`。
- 被注释掉的 `//if (target instanceof Creeper || target instanceof Ghast) return false;` 未复制。

工作表结论：

| #   | C++ 函数                | C++ 位置        | TS 方法            | TS 行 | 相似度 | 结论                                                                                                                                             |
| --- | ----------------------- | --------------- | ------------------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `mustSee(mustSee)`      | TargetGoal.h:21 | 构造函数赋值       | 19    | —      | 一致：`mob` / `within` / `mustSee` 三个初始化列表项都在构造函数里赋值；`within` 形参是 float，入口 `f(within)`（不是“缺少方法”）                 |
| 2   | `canContinueToUse()`    | TargetGoal.h:24 | `canContinueToUse` | 22    | 0.94   | 一致：判据顺序与 C++ 相同；`within` 已是 float，`within * within` 过 `f()`；`distanceToSqr` 返回 float，比较两侧都是 float                       |
| 3   | `stop()`                | TargetGoal.h:33 | `stop`             | 31    | 1.00   | 一致：`setTarget(null)`                                                                                                                          |
| 4   | `canAttack(Mob*, bool)` | TargetGoal.h:38 | `canAttack`        | 35    | 0.95   | 一致：null / 自身 / 死亡 / `bb.y1 <= y0 \|\| bb.y0 >= y1` / 玩家无敌 / mustSee 的判断顺序与 C++ 相同；`isPlayer()` 后读 `abilities.invulnerable` |

C++ 有、TS 没有的方法：无（`mustSee(mustSee)` 是初始化列表，已在构造函数里实现）。
TS 有、C++ 没有的方法：无。`TargetGoal` 在 C++ 因继承纯虚 `canUse` 仍是抽象类，TS 用 `abstract class` 对应。

修复：**W42 无代码修改，无红绿对照。**

ADAPTED / DEFERRED：无新增。TS 里 `Mob.sensing` 的类型是 `Sensing | null`（C++ 是裸指针），
同一个 `Monster` 的 `PathfinderMob` 构造函数一定会创建 `Sensing`，运行期非空；
`(this.mob.sensing as Sensing)` 只是类型断言，不改变行为，也不到需要 `DEFERRED` 的程度。

35 条清单核对要点：

- 第 1–7 条：`within` 是唯一的 float 形参，构造函数入口 `f(within)`；`within * within` 是 float × float → `f()`；
  `TargetFlag` 是 int 常量；无其他算术、无整数除法、无取整。
- 第 8–12 条：无 int 乘法 / 移位、无 64 位整数、无数学函数、无格式化。
- 第 13–20 条：`canContinueToUse` / `stop` 在 C++ 是虚重写，TS 写了 `override`；`canAttack` 在 C++ 非 virtual、protected，TS 同样 protected；
  无重载、无默认参数、无遮蔽；无 `super` 调用；成员 `mob` / `within` / `mustSee` 在 C++ protected，TS 也 protected；
  `TargetFlag` 在 C++ public，TS `static readonly` public；无构造函数内虚调用。
- 第 21–25 条：只读 `target.bb` 的两个 float 字段，没有按值拷贝；无容器、排序、哈希容器。
- 第 26–29 条：无随机数；`&&` / `\|\|` 的短路顺序与 C++ 相同（例如 `mustSee` 为假时不碰 `sensing`）；没有带随机数的被注释代码。
- 第 30–35 条：无字符串、char、布尔转整数、日志；本文件没有 DEFERRED / OMIT；文件头说明与代码一致；
  C++ 的 Creeper / Ghast 注释整行未复制。

## 统一验证

- `pnpm exec vitest run tests/unit/world/ai-goal-audit.test.ts`：1 个测试文件、9 条用例全部通过。
- `npx tsc -p packages/world --noEmit`：退出码 0。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0。
- `npx prettier --check`（3 个 TS 文件 + 本测试 + 本记录）：退出码 0。

新增标记：`OMIT` 2 处（Goal.h:12、GoalSelector.h:25），`DEFERRED` 0 处，`ADAPTED` 0 处。
本组没有行为修复，红绿对照不适用；测试为审核行为的钉死用例，改动前后均全绿。
