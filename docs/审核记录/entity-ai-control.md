# AI 控制 / 感知 / 随机取点（src/world/entity/ai ↔ packages/world/src/entity/ai）

第 2 批（world/entity/ai）。5 个文件工作表共 16 行全部有结论。新增编号 W43-W47。

范围：

- `src/world/entity/ai/control/MoveControl.h / .cpp` ↔ `packages/world/src/entity/ai/control/MoveControl.ts`（W43）
- `src/world/entity/ai/control/JumpControl.h` ↔ `packages/world/src/entity/ai/control/JumpControl.ts`（W44）
- `src/world/entity/ai/control/Control.h` ↔ `packages/world/src/entity/ai/control/Control.ts`（W45）
- `src/world/entity/ai/Sensing.h` ↔ `packages/world/src/entity/ai/Sensing.ts`（W46）
- `src/world/entity/ai/util/RandomPos.h` ↔ `packages/world/src/entity/ai/util/RandomPos.ts`（W47）

参考侧只有 `Control.h`（没有 `Control.cpp`）、`JumpControl.h`、`Sensing.h`、`RandomPos.h`（后三个的实现全在头文件里）。
`MoveControl.cpp` 是唯一有独立 `.cpp` 的文件。

## MoveControl（W43）

**C++ 侧要点：**

- 字段：`Mob* mob`、`float wantedX/wantedY/wantedZ`、`float speed`、`bool _hasWanted`。
  构造函数初始化列表只有 `mob`、`wantedX/Y/Z`、`_hasWanted` —— `speed` 在 C++ 里**未初始化**
  （`getSpeed` 在 `setWantedPosition` 之前读它是 UB）。
- 可见性：`MAX_TURN` 在 `private`（class 默认段），`MIN_SPEED`、`MIN_SPEED_SQR` 在 `public`；
  `rotlerp` 与全部字段在 `private`。
- `MIN_SPEED = 0.0005f`；`MIN_SPEED_SQR = MIN_SPEED * MIN_SPEED`（float 乘法）。
- `tick()`：`mob->setYya(0)` → 没有目标直接返回 → `_hasWanted = false`；
  `int yFloor = Mth::floor(mob->bb.y0 + 0.5f)`；`xd/zd/yd`、`dd = xd*xd + yd*yd + zd*zd` 全 float；
  `dd < MIN_SPEED_SQR` 返回；`float yRotD = (float)(std::atan2(zd, xd) * 180 / Mth::PI) - 90`；
  `mob->yRot = rotlerp(mob->yRot, yRotD, MAX_TURN)`；`mob->setSpeed(speed)`；
  `yd > 0 && xd*xd + zd*zd < 1` 时 `mob->getJumpControl()->jump()`。
- `rotlerp`：`diff = b - a`，`while (diff < -180) diff += 360`、`while (diff >= 180) diff -= 360`，
  再钳到 `[-max, max]`，返回 `a + diff`，每一步都是 float。
- 无随机数、容器、虚函数、字符串。`Control` 基类没有虚函数，`MoveControl::tick` 由 `Mob` 通过
  `MoveControl*` 静态类型调用，不涉及动态分派差异。

**工作表结论：**

| #   | C++ 函数                                                    | C++ 位置           | TS 方法             | TS 行 | 相似度 | 结论                                                                                                                                                         |
| --- | ----------------------------------------------------------- | ------------------ | ------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `MoveControl(Mob* mob)`                                     | MoveControl.cpp:10 | `constructor`       | 26    | 1.00   | 一致：`mob`、`wantedX/Y/Z = mob.x/y/z`（float→float 拷贝）、`_hasWanted = false`；`speed` 未初始化，TS 取 0 并注释（同 EntityPos/HitResult 约定）            |
| 2   | `hasWanted()`                                               | MoveControl.cpp:19 | `hasWanted`         | 35    | 1.00   | 一致                                                                                                                                                         |
| 3   | `getSpeed()`                                                | MoveControl.cpp:23 | `getSpeed`          | 39    | 1.00   | 一致                                                                                                                                                         |
| 4   | `setWantedPosition(float x, float y, float z, float speed)` | MoveControl.cpp:27 | `setWantedPosition` | 43    | 0.85   | 一致：四个 float 形参入口都 `f()`，`_hasWanted = true`                                                                                                       |
| 5   | `tick()`                                                    | MoveControl.cpp:36 | `tick`              | 51    | 0.87   | **已修 W43**：`yRotD` 改为逐步 `f()`；`setYya(0)`、`_hasWanted` 次序、`yFloor`、`xd/zd/yd`、`dd` 左结合、最小速度守卫、`rotlerp`、`setSpeed`、跳跃条件均一致 |
| 6   | `rotlerp(float a, float b, float max)`                      | MoveControl.cpp:57 | `rotlerp`           | 69    | 0.90   | 一致：`diff = f(b - a)`；±360 归一、±max 钳制、`f(a + diff)`                                                                                                 |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无（`rotlerp` 的 private 可见性与 C++ 相同）。

**修复（W43）：`yRotD` 没有按 C++ 逐步舍入（清单第 3、4、6、9 条）。**

C++ 原句：`float yRotD = (float) (std::atan2(zd, xd) * 180 / Mth::PI) - 90;`

- `zd`、`xd` 是 float；C++17（黄金样本 harness 用的是 `-std=c++17`）的 `std::atan2(float, float)`
  是 **float 重载**（等价 `atan2f`），返回 float；
- 随后 `* 180`（int 180 转 float）→ float、`/ Mth::PI`（float 常量）→ float、`- 90` → float，
  每一步各自舍入一次；`(float)` 强转是空操作。

旧 TS：`f(f((Math.atan2(zd, xd) * 180) / Mth.PI) - 90)` —— atan2 的结果、`×180`、`÷π`
全留在 double 里，只在小括号后和减 90 后各舍入一次，中间 `×180` 少了一次 float 舍入；
`Math.atan2` 也没有先按 float 舍入。函数头注释写的“std::atan2 是 double”与 C++17 的 float 重载不符。

修复：

```ts
const yRotD = f(f(f(Mth.atan2(zd, xd) * 180) / Mth.PI) - 90);
```

`Mth.atan2` 的实现是 `f(Math.atan2(f(dy), f(dx)))`（`packages/util/src/Mth.ts:104`），
即“先按 float 取 atan2”；随后三步各 `f()`。同项目先例：`Arrow.ts`（W22）对 `std::atan2` 也是
用 `Mth.atan2`；`PathfinderMob.ts:162/179` 对 `Mth::atan2 * 180 / Mth::PI` 就是逐级 `f()`。
文件头注释同步改正。

先红后绿（保留新测试，`MoveControl.ts` 退回修复前）：

- 红：`pnpm exec vitest run tests/unit/world/ai-control-audit.test.ts` 退出码 1，
  `Tests 1 failed | 7 passed (8)`；失败信息
  `expected -18.412063598632812 to be -18.41205596923828`（测试输入
  `xd = 0.5`、`zd = f(1.502) = 1.5019999742507935`，`mob.yRot` 初值 0，`|yRotD| < 30`，
  rotlerp 不再改动结果）。
- 绿：同一测试退出码 0，`Tests 8 passed (8)`。

**ADAPTED / DEFERRED：**

- `speed` 在 C++ 未初始化，TS 取 0：沿用现有注释（“C++ 未初始化……这里取 0”），与
  `EntityPos`、`HitResult` 的既有约定一致；未新增台账标记。
- 无新增 DEFERRED / OMIT / ADAPTED 标记。

**35 条清单核对要点：**

- 第 1–2 条：`wantedX/Y/Z`、`speed` 都是 float 字段；`setWantedPosition` 四个形参入口 `f()`；
  构造函数从 `mob.x/y/z` 复制 —— 这些字段按项目约定始终持有 float 值（`Entity.moveTo` 等赋值都过
  `f()`），是 float→float 拷贝，不再二次舍入。
- 第 3–7 条：`yFloor = Mth.floor(f(bb.y0 + f(0.5)))`、`xd/yd/zd`、`dd = ((xd² + yd²) + zd²)`、
  `rotlerp` 的 `diff`/±360/±max、跳跃条件 `(xd² + zd²)` 全部左结合逐步 `f()`；`yRotD` 见 W43。
- 第 8 条：没有整数除法；`yFloor` 是 `Mth.floor` 返回的 int，参与 float 减法时 C++ 先转 float（值域小，精确）。
- 第 9–10 条：`Mth.atan2`（float 重载）、`Mth.PI`（float 常量）；不用 `Math.min/max/abs`。
- 第 11–12 条：无 `long`、无字符串格式化。
- 第 13–18 条：`Control` 无虚函数；无重载、默认参数、字段遮蔽、`super::` 调用。
  `mob.getJumpControl() as JumpControl`：C++ 直接解引用 `getJumpControl()` 的返回值，
  TS 方法签名是 `JumpControl | null`，断言后同样是“null 就崩”，行为一致。
- 第 19 条：成员声明顺序 `mob → wantedX → wantedY → wantedZ → speed → _hasWanted`，构造赋值顺序一致。
- 第 20 条：`MAX_TURN` private，`MIN_SPEED` / `MIN_SPEED_SQR` public，`rotlerp` private，与 `.h` 相同。
- 第 21–25 条：无按值结构、容器、排序、哈希。
- 第 26–29 条：无随机数。
- 第 30–33 条：无字符串、char、bool→int、日志。
- 第 34 条：无 DEFERRED/OMIT；`speed` 的安全取值沿用既有注释约定。
- 第 35 条：文件头“std::atan2 是 double”已改正为 C++17 float 重载 + 逐步 `f()`。

## JumpControl（W44）

**C++ 侧要点：**

- 全部内联在 `JumpControl.h`：构造 `mob(mob), _jump(false)`；`jump()` 只置 `_jump = true`；
  `tick()` 先 `mob->setJumping(_jump)` 再把 `_jump = false`。
- 字段 `Mob* mob`、`bool _jump` 在 private；方法 public。无虚函数、无随机数、无数值运算。

**工作表结论：**

| #   | C++ 函数       | C++ 位置         | TS 方法    | TS 行 | 相似度 | 结论                                                                                         |
| --- | -------------- | ---------------- | ---------- | ----- | ------ | -------------------------------------------------------------------------------------------- |
| 1   | `_jump(false)` | JumpControl.h:14 | **（无）** |       |        | 一致：这是构造函数的初始化列表项（工作表把它识别成了“函数”）；TS 构造里 `this._jump = false` |
| 2   | `jump()`       | JumpControl.h:18 | `jump`     | 15    | 1.00   | 一致：只把 `_jump` 置 true，不直接改 mob                                                     |
| 3   | `tick()`       | JumpControl.h:22 | `tick`     | 19    | 1.00   | 一致：先 `setJumping(this._jump)`，再清零，次序与 C++ 相同                                   |

C++ 有、TS 没有的方法：无（第 1 行是初始化列表，不是方法）。TS 有、C++ 没有的方法：无。

**修复：** 无。

**ADAPTED / DEFERRED：** 无。

**35 条清单核对要点：**

- 第 1–2 条：只有 `mob` 指针与 `bool _jump`，没有 float 字段/形参，不涉及舍入。
- 第 3–12 条：无算术语义、无整数除法、无数学函数、无 long/字符串。
- 第 13–18 条：`Control` 无虚函数；`jump`/`tick` 无重载、无默认参数、无遮蔽、无 `super::`。
- 第 19 条：成员声明顺序 `mob → _jump`，构造赋值顺序相同；`_jump` 的字段初始化器与构造赋值都是 false。
- 第 20 条：方法 public、字段 private，与 `.h` 一致。
- 第 21–25 条：无按值结构、容器、排序、哈希。
- 第 26–29 条：无随机数。
- 第 30–33 条：无字符串、char、日志。
- 第 34–35 条：无标记；注释与代码一致。

## Control（W45）

**C++ 侧要点：**

- `Control.h` 只有三个 `static const int`：`MoveControlFlag = 1`、`LookControlFlag = 2`、
  `JumpControlFlag = 4`，全在 public 段。**没有 `Control.cpp`**，没有成员函数、没有字段。
- 这些位被 goal 用来声明“需要哪些控制位”（例如 `RandomStrollGoal` 用 `MoveControlFlag`）。

**工作表结论：**

工作表 0 行（C++ 没有成员函数；`worksheet.py` 只列函数，所以没有可填的行）。
三个常量逐一核对：`1 / 2 / 4` 与 TS 完全相同，可见性同为 public。

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

**修复：** 无。

**ADAPTED / DEFERRED：** 无。

**35 条清单核对要点：**

- 第 1–35 条：本文件没有成员函数、字段或容器，只有三个 `static const int` 常量。
  第 1 条（int 常量）、第 20 条（public 可见性）已核对；其余数值/结构/随机数/字符串条款不适用。

## Sensing（W46）

**C++ 侧要点：**

- `typedef std::set<Entity*> EntitySet`；字段 `Mob* mob`、`EntitySet seen`、`EntitySet unseen`（private）。
- `tick()`：先 `seen.clear()` 再 `unseen.clear()`。
- `canSee(Entity* target)`：先查 `seen`（命中 true）、再查 `unseen`（命中 false）；
  都没命中才调 `mob->canSee(target)`，并按结果插入 `seen` / `unseen`。
  `std::set<Entity*>` 只做 find/insert/clear，**不遍历**，所以指针身份语义与 TS `Set<Entity>` 等价。

**工作表结论：**

| #   | C++ 函数                 | C++ 位置     | TS 方法    | TS 行 | 相似度 | 结论                                                                                         |
| --- | ------------------------ | ------------ | ---------- | ----- | ------ | -------------------------------------------------------------------------------------------- |
| 1   | `mob(mob)`               | Sensing.h:12 | **（无）** |       |        | 一致：构造函数的初始化列表项（工作表误识别为函数）；TS 构造里 `this.mob = mob`               |
| 2   | `tick()`                 | Sensing.h:15 | `tick`     | 14    | 1.00   | 一致：先清 `seen` 再清 `unseen`                                                              |
| 3   | `canSee(Entity* target)` | Sensing.h:20 | `canSee`   | 19    | 0.69   | 一致：seen→true、unseen→false、未命中才问 `mob.canSee`，并按结果写入对应集合（身份语义相同） |

C++ 有、TS 没有的方法：无（第 1 行是初始化列表）。TS 有、C++ 没有的方法：无。

**修复：** 无。

**ADAPTED / DEFERRED：** 无。

**35 条清单核对要点：**

- 第 1–2 条：只有 `mob` 指针；无 float 字段/形参。
- 第 3–12 条：无算术、整数除法、数学函数、long/字符串。
- 第 13–18 条：`canSee` 非虚（`Control`/`Sensing` 都没有虚函数）；无重载、默认参数、遮蔽、`super::`。
- 第 19 条：声明顺序 `mob → seen → unseen`；两个集合默认构造为空，TS 的字段初始化器等价。
- 第 20 条：构造与 `tick`/`canSee` public，字段 private，与 `.h` 一致。
- 第 21–25 条：`std::set<Entity*>` 只做 find/insert/clear、不遍历；TS `Set` 用对象身份，
  与 C++ 的指针身份一一对应，无遍历顺序问题。
- 第 26–33 条：无随机数、字符串、char、日志。
- 第 34–35 条：无标记；注释与代码一致。

## RandomPos（W47）

**C++ 侧要点：**

- 全部内联在 `RandomPos.h`。三个 public static 入口都把 `Vec3& outPos` 作为输出参数：
  - `getPos(outPos, mob, xzDist, yDist)` 直接转调 `generateRandomPos(..., NULL)`；
  - `getPosTowards`：`tempDir = towardsPos - mob`，作为 `dir`；
  - `getPosAvoid`：`tempDir = mob - avoidPos`，作为 `dir`。
- private `generateRandomPos`：取 `mob->random`；`best = -99999`；循环 10 次，每轮严格按
  `nextInt(2*xzDist)`（x）→ `nextInt(2*yDist)`（y）→ `nextInt(2*xzDist)`（z）抽三个数；
  `dir != NULL && xt * dir->x + zt * dir->z < 0` 时 **continue**（随机数已经抽完）；
  然后 `xt/yt/zt += Mth::floor(mob->x/y/z)`，`float value = getWalkTargetValue(...)`，
  `value > best` 时记录；最后把 best 点写成 `Vec3` 返回 true，否则返回 false（不写 outPos）。
- 除点积与 `Vec3` 的构造/`subSelf` 外没有其他数值运算；随机源是 `mob->random`，不是 `Mth::random`。

**工作表结论：**

| #   | C++ 函数                                                          | C++ 位置       | TS 方法             | TS 行 | 相似度 | 结论                                                                                           |
| --- | ----------------------------------------------------------------- | -------------- | ------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------- |
| 1   | `getPos(Vec3& outPos, PathfinderMob* mob, int xzDist, int yDist)` | RandomPos.h:12 | `getPos`            | 11    | 0.87   | 一致：转调 `generateRandomPos(..., null)`；引用输出改为返回值（ADAPTED(Cpp)，文件头已注明）    |
| 2   | `getPosTowards(..., Vec3* towardsPos)`                            | RandomPos.h:16 | `getPosTowards`     | 15    | 0.92   | 一致：`new Vec3(towardsPos)` 后 `subSelf(mob)`，作为 dir                                       |
| 3   | `getPosAvoid(..., Vec3* avoidPos)`                                | RandomPos.h:22 | `getPosAvoid`       | 26    | 0.92   | 一致：`new Vec3(mob)` 后 `subSelf(avoidPos)`，方向与 towards 相反                              |
| 4   | `generateRandomPos(..., Vec3* dir)`                               | RandomPos.h:13 | `generateRandomPos` | 37    | 0.94   | 一致：10 轮、x/y/z 随机数顺序、dir 点积短路、floor 累加、`value > best`、Vec3 输出；见下方核对 |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

**修复：** 无。逐条核对后未发现行为差异。

**ADAPTED / DEFERRED：**

- ADAPTED(Cpp)：C++ 用 `Vec3& outPos` 输出、返回 bool；TS 改为返回 `Vec3 | null`
  （null 对应 C++ 的 false）。文件头原有说明，本次确认仍成立。
- 无 DEFERRED / OMIT。

**35 条清单要点：**

- 第 1–2 条：`xzDist/yDist` 是 int 形参（调用方 `RandomStrollGoal` 传 10/7）；`getWalkTargetValue`
  返回 float；TS 没有对 int 形参做 `|0`，调用点都传整数，无差异。
- 第 3–7 条：点积 `xt * dir.x + zt * dir.z` 按 C++ 左结合写成
  `f(f(xt * dir.x) + f(zt * dir.z))`；`Vec3` 构造与 `subSelf` 内部已逐步 `f()`（已有实现）；
  `best = -99999` 在 float 里精确。
- 第 8 条：无整数除法；`2 * xzDist` 是 int 运算（值域小，不溢出）；`Mth.floor` 用于取整坐标。
- 第 9–12 条：无数学函数、long、字符串。
- 第 13–18 条：全 static 函数，无虚函数、重载、默认参数、遮蔽。
- 第 19–20 条：无成员；`getPos`/`getPosTowards`/`getPosAvoid` public、`generateRandomPos` private，与 `.h` 一致。
- 第 21 条：`Vec3& outPos` → 返回值（ADAPTED(Cpp)）；`tempDir` 按值新建，符合 C++ 的按值局部变量。
- 第 22–25 条：无容器、排序、哈希。
- 第 26–29 条：随机源是 `mob->random`；每轮顺序 x→y→z；短路保留：`dir` 为 null 时不读 dir，
  点积 < 0 时 continue（三个随机数已在前面按序抽完，测试钉住“跳过前已抽完”）。
- 第 30–33 条：无字符串、char、日志。
- 第 34–35 条：文件头的 ADAPTED(Cpp) 仍成立；无 DEFERRED/OMIT；注释与代码一致。

## 验证

最终统一验证（命令一次跑完，退出码如下）：

- `pnpm exec vitest run tests/unit/world/ai-control-audit.test.ts`：`VITEST=0`，
  `Test Files 1 passed (1)`、`Tests 8 passed (8)`（红态见 W43）。
- `npx tsc -p packages/world --noEmit`：`TSC_WORLD=0`（0 错误）。
- `npx tsc -p tests/tsconfig.json --noEmit`：`TSC_TESTS=2`，3 条错误**全部**在
  `tests/unit/world/chunk-source-storage-audit.test.ts`（94/110/125 行，`null` 传给 `LevelChunk` 形参）。
  该文件是工作区里另一批未提交的改动（`git status` 中为 `??`，本次审核未改动/未产生）；
  本批新增的 `ai-control-audit.test.ts` 没有任何类型错误。
- `npx prettier --check`（5 个 TS 文件 + 测试 + 本记录）：`PRETTIER=0`，全部通过。
