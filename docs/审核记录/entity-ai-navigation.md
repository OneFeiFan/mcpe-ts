# PathNavigation（src/world/entity/ai/PathNavigation.h（无 .cpp） ↔ packages/world/src/entity/ai/PathNavigation.ts）

第 2 批（world/entity/ai）。工作表 21 行全部有结论。C++ `.h` 346 行 + `.cpp` 0 行（参考源码只有头文件），
TS 审核前 326 行、审核后 316 行。新增编号 **W39**。

C++ 侧要点：

- 全部成员函数都内联在 `PathNavigation.h` 里，没有 `PathNavigation.cpp`。
- 可见性：`public` 是构造函数、`setSpeed`、两个 `createPath`、三个 `moveTo`、`getPath`、`tick`、`isDone`、`stop`；
  `private` 是 `deletePathIfNeeded`、`updatePath`、`getTempMobPos`、`getSurfaceY`、`canUpdatePath`、`isInLiquid`、
  `trimPathFromSun`、`canMoveDirectly`、`canWalkOn`、`canWalkAbove`，以及数据成员 `mob/level/path/deletePath/refPath/
speed/maxDist/_tick/lastStuckCheck/lastStuckCheckPos`；末尾 `public` 数据 `avoidWater/avoidSun/canOpenDoors`。
- 构造函数初始化列表：`mob/level/maxDist/_tick/avoidSun/avoidWater/canOpenDoors/lastStuckCheckPos/speed/lastStuckCheck/
path/deletePath`。按声明顺序实际初始化时 `maxDist` 在 `speed` 之后，但各项互不依赖；`Ref<Path>* refPath` 没有初始化、
  全文零使用。析构函数只调用 `deletePathIfNeeded()`。
- `deletePath` 只决定析构/`stop` 时是否真的 `delete path`；`deletePathIfNeeded` 无论是否删除都会 `path = NULL`，
  并打一条 `LOGI("nav-deleting %p (%d)\n", path, path->id)`（`%p` 是指针）。
- 没有继承、`virtual`、默认参数；R10 只涉及 `createPath` 与 `moveTo` 的重载。
- 被注释掉的 C++ 没有复制：`createPath` 两处 `//LOGI("can update? ...")`、`moveTo(Mob*)` 的
  `//if (!newPath->isEmpty()) ...`、`moveTo(Path*)` 的 `//if (newPath.isEmpty()) { path.destroy(); return false; }`、
  `tick` 里的 LOGI、`stop` 里旧的 `path->destroy()` 块、`deletePathIfNeeded` 的 `//return;` 与 `//deletePath = false;`、
  `canWalkAbove` 的 `//if (!Tile::tiles[tile]->isPathfindable(...))`。
- `/*if (!newPath->sameAs(path))*/ { ... }` 的块本身没有注释掉（只有条件被注释），所以整块**总是执行**；TS 直接内联。
- 原样保留的怪癖：`trimPathFromSun` 在第 0 个路点就见天时 `setSize(i - 1)` 会设成 -1；`canMoveDirectly` 在
  `dirX`/`dirZ` 为 0 时除出 ±Infinity（IEEE float）；`moveTo(Path*)` 取了 `last()` 却只放进空的 `if (last) {}`；
  先安装新 path 再判 `getSize() == 0`（返回 false 时 path 已经换上）。

## 工作表结论

工作表把构造函数初始化列表里的 `deletePath(false)` 认成了一行“函数”（没有单列构造函数），位置列有几处指向调用点；
下表按原始 `.h` 校正了 C++ 定义行，TS 行是本次审核后的行号。

| #   | C++ 函数                                                  | C++ 位置 | TS 方法           | TS 行 | 相似度 | 结论                                                                                                                                           |
| --- | --------------------------------------------------------- | -------- | ----------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `deletePath(false)`（构造初始化列表）                     | .h:32    | `constructor`     | 39    | —      | ADAPTED(Cpp)：`deletePath` 是所有权标志，JS 无 `delete`，不移植；构造函数其余初值与顺序见第 19 条                                              |
| 2   | `setSpeed(float speed)`                                   | .h:39    | `setSpeed`        | 45    | 0.86   | 一致：`this->speed = speed`，TS `f(speed)`                                                                                                     |
| 3   | `createPath(float x, float y, float z)`                   | .h:43    | `createPathToPos` | 49    | 0.92   | **已修 W39**：`(int) y` 前没把 double 实参舍入成 float（见下）；x/z 由 `Mth.floor` 内部 `f()`                                                  |
| 4   | `moveTo(float x, float y, float z, float speed)`          | .h:52    | `moveToPos`       | 66    | 0.88   | 一致：先 `createPath` 再 `moveTo(newPath, speed, true)`；speed 在 `moveToPath` 里 `f()`                                                        |
| 5   | `createPath(Mob* target)`                                 | .h:57    | `createPathToMob` | 71    | 0.92   | 一致：`canUpdatePath` 不满足返回 NULL；否则 `new Path` + `findPathToEntity`                                                                    |
| 6   | `moveTo(Mob* target, float speed)`                        | .h:66    | `moveToMob`       | 85    | 0.89   | 一致：`newPath` 非空才 `moveTo(newPath, speed, true)`，否则 false                                                                              |
| 7   | `moveTo(Path* newPath, float speed, bool navIsPathOwner)` | .h:73    | `moveToPath`      | 91    | 0.86   | ADAPTED(Cpp)：`deletePathIfNeeded`/`deletePath` 所有权语义移除；空的 `last()` 检查、先装 path 再判 size、`avoidSun` 截短都保留                 |
| 8   | `Path* getPath()`                                         | .h:107   | `getPath`         | 109   | 1.00   | 一致：返回 path（可为 NULL）                                                                                                                   |
| 9   | `tick()`                                                  | .h:111   | `tick`            | 113   | 0.95   | 一致：`++_tick` → 两次 `isDone` → `canUpdatePath` 时 `updatePath` → `currentPos` 交给 `setWantedPosition`；C++ 也直接解引用 `getMoveControl()` |
| 10  | `isDone()`                                                | .h:130   | `isDone`          | 127   | 0.96   | 一致：`!path \|\| path->isDone()`                                                                                                              |
| 11  | `stop()`                                                  | .h:134   | `stop`            | 131   | 0.55   | ADAPTED(Cpp)：`deletePathIfNeeded` 内联为 `path = null`（C++ 也是无条件置空）                                                                  |
| 12  | `deletePathIfNeeded()`                                    | .h:143   | （无，内联）      | —     | —      | ADAPTED(Cpp)：只保留 `path = NULL`；`delete` 与 `%p` 指针日志不移植（日志先例见 `NinecraftApp.ts:88`）                                         |
| 13  | `updatePath()`                                            | .h:153   | `updatePath`      | 135   | 0.90   | 一致：同高度段、路点半径、直线可达回退、每 100 刻卡住检查；int 转换改 `f2i`（W39）                                                             |
| 14  | `getTempMobPos()`                                         | .h:196   | `getTempMobPos`   | 170   | 1.00   | 一致：`Vec3(mob->x, (float)getSurfaceY(), mob->z)`                                                                                             |
| 15  | `getSurfaceY()`                                           | .h:200   | `getSurfaceY`     | 174   | 0.98   | 一致：非水时 `f2i(bb.y0 + 0.5)`（float+double）；水中向上找，超过 16 步返回 `f2i(bb.y0)`                                                       |
| 16  | `canUpdatePath()`                                         | .h:214   | `canUpdatePath`   | 188   | 1.00   | 一致：`onGround \|\| isInLiquid()`                                                                                                             |
| 17  | `isInLiquid()`                                            | .h:218   | `isInLiquid`      | 192   | 1.00   | 一致：`isInWater() \|\| isInLava()`                                                                                                            |
| 18  | `trimPathFromSun()`                                       | .h:222   | `trimPathFromSun` | 196   | 0.96   | 怪癖保留：第 0 个路点就见天时 `setSize(-1)`；文件头已注明                                                                                      |
| 19  | `canMoveDirectly(...)`                                    | .h:237   | `canMoveDirectly` | 209   | 0.91   | 一致：`0.00001f`、`distSqr`、`invSqrt`、`maxX/maxZ` 的逐步 float 与结合顺序；int 转换改 `f2i`（W39）                                           |
| 20  | `canWalkOn(...)`                                          | .h:289   | `canWalkOn`       | 261   | 0.94   | 一致：`sx / 2` 是 C++ int 除法（`Math.trunc`）；`xx + 0.5f - startPos.x` 按 float；水/岩浆判断相同                                             |
| 21  | `canWalkAbove(...)`                                       | .h:312   | `canWalkAbove`    | 291   | 0.95   | 一致：三层循环、`xx + 0.5f` 的 float、`blocksMotion()` 阻挡判断；被注释的 `isPathfindable` 未复制                                              |

C++ 有、TS 没有的成员：`deletePath`（所有权标志）、`refPath`（未初始化、零使用）、析构函数——见 ADAPTED/OMIT 一节。
TS 有、C++ 没有的方法：无。

## 修复

**W39 `createPathToPos` 的 `y` 形参没有先舍入成 float（清单第 2、7 条）。**

C++ `Path* createPath(float x, float y, float z)` 的三个形参都是 `float`：实参在进入函数前先舍入成 32 位，
再执行 `(int) y`；`Mth::floor(x)` / `Mth::floor(z)` 内部本来就会先转 float。旧 TS 写 `Math.trunc(y)`，直接对 double
截断。`y = 1.99999999` 时：C++ 先得到 `2.0f`，`(int)` 得 **2**；旧 TS 直接 `Math.trunc(1.99999999)` 得 **1**。
后果是 `Level.findPathToTile` 的目标 y 可能比 C++ 低一格，边缘位置会生成不同的路径。

修复：改为 `f2i(f(y))`；同时按清单第 7 条把本文件其余 **float/double → int** 的 `Math.trunc` 统一成 `f2i`
（`updatePath` 的 `(int)mobPos.y`、`(int)ceil(bbWidth)`、`(int)bbHeight + 1`，`getSurfaceY` 的 `(int)(bb.y0 + 0.5)` /
`(int)bb.y0`，`trimPathFromSun` 的 `(int)(bb.y0 + 0.5)`，`canMoveDirectly` 的 `(int)startPos.y`）。
正常范围内逐位不变；NaN/越界从 NaN / 原值变成 `INT_MIN`，与 x86 的 `cvttss2si` 一致（`f2i` 的既有语义）。
整数除法 `sx / 2`、`sz / 2` 保持 `Math.trunc`。

先红后绿：

- 红：先写 `tests/unit/world/pathnavigation-audit.test.ts`（3 条），未改实现时运行
  `pnpm exec vitest run tests/unit/world/pathnavigation-audit.test.ts` → **2 failed | 1 passed**，
  失败信息为 `yBest: expected 1 to be 2` 与 `yBest: expected NaN to be -2147483648`。
- 绿：改实现后同命令 → **3 passed (3)**。
- 第 3 条测试同时钉住 x/z 仍按 `Mth.floor`、y 按向零截断（`1.9, -1.5, -1.9` → `1, -1, -2`）。

## ADAPTED / OMIT / DEFERRED

- 新增 `ADAPTED(Cpp)` 1 处（`PathNavigation.ts:12`）：C++ 的路径所有权（`deletePath` / `deletePathIfNeeded` /
  析构里的 `delete`）在 JS 里没有意义，放弃路径只把 `path` 置空；`refPath` 声明了但从未使用，不移植；
  `deletePathIfNeeded` 里用 `%p` 打指针的 LOGI 无法在网页版复现，按 `NinecraftApp.ts:88` 的先例不移植。
- 新增 `OMIT(Cpp)` 1 处（`PathNavigation.ts:26`）：`~PathNavigation()`（`PathNavigation.h:35`，只调用
  `deletePathIfNeeded`）按 R3 不移植，JS 由 GC 回收。
- `DEFERRED`：0 处；本文件没有拿不准、需要保留 C++ 原句的地方。
- 原有标记：无（审核前本文件没有 DEFERRED / OMIT / ADAPTED 标记）。

## 35 条清单核对要点

- 第 1 条：`speed` / `maxDist` 是 C++ float，TS 每次赋值都 `f()`（构造、`setSpeed`、`moveToPath`）；`_tick` /
  `lastStuckCheck` 是 int；`lastStuckCheckPos` 是 Vec3（三个 float）；`path` 是指针 → `Path | null`；
  `deletePath` / `refPath` 见 ADAPTED。
- 第 2 条：构造 `maxDist`、`setSpeed`、`moveToPath` 的 `speed` 都先 `f()`；`createPathToPos` 的 `y` 原来漏了，
  W39 已修；`x`/`z` 由 `Mth.floor` 内部 `f()`；`moveToPos` / `moveToMob` 只转发；`canWalkOn` / `canWalkAbove`
  的 `goalDir` 只从 `canMoveDirectly` 接收已经 `f()` 的 `dirX` / `dirZ`；`canMoveDirectly` 的 Vec3 分量已是 float。
- 第 3–5 条：`dirX = f(stopPos.x - startPos.x)`、`distSqr = f(f(dirX * dirX) + f(dirZ * dirZ))`、
  `dirX = f(dirX * nf)`、`deltaX = f(1 / Mth.abs(dirX))`、`maxX = f(gridPosX * 1 - startPos.x)`，随后的
  `+=` / `/=` 各 `f()` 一次；结合顺序与 C++ 的 `(a + b) + c`、`(a * b) * c` 一致。
- 第 6 条：`0.00001f` → `f(0.00001)`；`1.5 * 1.5` 在 C++ 是 double 常量（2.25 精确），TS 没有包 `f()`；
  `0.5f` 精确，`f(xx + 0.5)` 只是把 `int + float` 的加法舍入。
- 第 7 条：所有 `(int)` 转换改用 `f2i`（含 NaN/越界 → `INT_MIN`）；float 与 int 混算按 double 算完再 `f()`
  （int 在 double 里精确，二次舍入无害）。
- 第 8 条：`sx / 2`、`sz / 2` 是 C++ 整数除法，TS `Math.trunc`；`_tick - lastStuckCheck > 100`、
  `++steps > 16`、坐标循环都是整数运算。
- 第 9 条：`Mth.floor` / `Mth.invSqrt` / `Mth.abs`（不是 `Math.abs`）；`ceil` 是 C 库 double 版本 →
  `Math.ceil` 后 `f2i`。
- 第 10 条：`Mth.abs` 保持 C++ 的比较写法；Vec3 构造与 `Path.getPos` 已按 C++ 处理 ±0；
  `f2i(NaN) = INT_MIN` 有测试钉住。
- 第 11–12 条：无 `long` / `long long`，无字符串格式化。
- 第 13–15 条：类没有继承、`virtual`、默认参数，因此没有非虚调用、构造期虚调用、默认参数分派问题。
- 第 16 条：重载按 R10——`createPath(float,float,float)` → `createPathToPos`、`createPath(Mob*)` →
  `createPathToMob`；`moveTo` 三个重载 → `moveToPos` / `moveToMob` / `moveToPath`；实参静态类型
  （Vec3 / Path / Mob）能区分，没有合并歧义。
- 第 17–18 条：无字段/方法遮蔽，无 `super::`。
- 第 19 条：C++ 初始化列表顺序与声明顺序不同（`maxDist` 在列表里靠前、声明在 `speed` 后），但各项互不依赖；
  `refPath` 未初始化且从未使用 → 不移植；TS 字段初始化器 + 构造体赋值与 C++ 等价。
- 第 20 条：可见性与 C++ 一致（public 方法/数据、private 方法与数据见上）；既有测试只走 public 入口
  （`getNavigation()` / `createPathToPos`），不需要放宽任何成员。
- 第 21 条：`getTempMobPos` / `currentPos` / `getPos` 返回新的 Vec3；`Path*` 在 TS 里是共享引用（与 C++ 指针
  语义一致）；`lastStuckCheckPos` 原地改分量（与 C++ 成员一致）。
- 第 22–25 条：无容器、排序、哈希容器。
- 第 26–29 条：本文件不取随机数；没有多个实参调用随机数的求值顺序问题；被注释掉的 C++ 里也没有随机数调用。
- 第 30–33 条：无字符串/char/bool 转换；唯一日志是 `deletePathIfNeeded` 里的
  `LOGI("nav-deleting %p (%d)\n", path, path->id)`，`%p` 打指针、网页版无法复现，计入 ADAPTED 不移植。
- 第 34 条：无 DEFERRED；新增 `ADAPTED(Cpp)` 1 条、`OMIT(Cpp)` 1 条，均写明 C++ 原句与行号；文件头原有说明已核对。
- 第 35 条：注释与代码一致——`trimPathFromSun` 的 `setSize(-1)`、`refPath` 未使用、除零 ±Infinity、
  `last()` 空 `if`、`moveToPath` 先装 path 再判 size 均已核对；R10 名字与实际重载一致。

## 验证

- `pnpm exec vitest run tests/unit/world/pathnavigation-audit.test.ts`：3/3 通过（1 个文件）。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check packages/world/src/entity/ai/PathNavigation.ts tests/unit/world/pathnavigation-audit.test.ts
docs/审核记录/entity-ai-navigation.md`：通过。
- 台账：本文件原有 0 条标记；本次新增 `ADAPTED(Cpp)` 1 条、`OMIT(Cpp)` 1 条，`DEFERRED` 0 条。
