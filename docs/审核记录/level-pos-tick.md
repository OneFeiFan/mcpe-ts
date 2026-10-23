# ChunkPos / TilePos / TickNextTickData（world/level）

第 2 批（world/level）。3 个文件工作表共 11 行全部有结论。新增编号 **W67-W69**。

- `ChunkPos`：`src/world/level/ChunkPos.h` ↔ `packages/world/src/level/ChunkPos.ts`（纯头文件，同目录没有 `.cpp`；`clean.py` 的 `.cpp` 参数报 `FileNotFoundError`，审核以 `.h` 全文为准）
- `TilePos`：`src/world/level/TilePos.h` ↔ `packages/world/src/level/TilePos.ts`（纯头文件，同上）
- `TickNextTickData`：`src/world/level/TickNextTickData.h` / `.cpp` ↔ `packages/world/src/level/TickNextTickData.ts`

工作表把构造函数初始化列表里的 `z(0)` / `z(z_)` / `z(rhs.z)` 误识别成了函数行（ChunkPos 2 行、TilePos 2 行），这些行在表里单独注明；除此之外 7 行是真实函数。TS 里对应 `operator==` / `operator<` / 拷贝构造的方法名不同，工作表没有配对，表中作为补充行列出一并给结论。

---

## ChunkPos（src/world/level/ChunkPos.h ↔ packages/world/src/level/ChunkPos.ts）

C++ 侧要点：

- `const int x, z`；默认构造 `x(0), z(0)`，二参构造 `x(x_), z(z_)`。因字段是 `const`，拷贝赋值被隐式删除，拷贝构造仍可用。
- `hashCode` 的 `0x80000000` 是 `unsigned int` 字面量，整条 `|` 链按 unsigned 算，返回时转回 `int`；TS 的 `|` 得到同一位模式的有符号 int32。
- `operator<` 只比较 `hashCode()`，哈希碰撞的两个不同坐标会被当作等价（原版怪癖，保留）。
- `distanceToSqr` 全部按 32 位 float 运算：`(float)(x * 16 + 8)`、两次减法、两次乘法、一次加法，每一步都舍入。

### 工作表结论

| #    | C++ 函数                            | C++ 位置      | TS 方法            | 结论                                                                                       |
| ---- | ----------------------------------- | ------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| 1    | `z(0)`（工作表误报）                | ChunkPos.h:14 | `constructor`      | 一致：这是默认构造的初始化器，不是函数；合并默认参数的 `constructor` 覆盖它，`x = z = 0`。 |
| 2    | `z(z_)`（工作表误报）               | ChunkPos.h:14 | `constructor`      | 一致：二参构造的初始化器；`constructor` 用 `\| 0` 对齐 C++ 的 `int` 形参（向零截断）。     |
| 3    | `hashCode(int x, int z)`            | ChunkPos.h:22 | `hashCode`（静态） | 一致：位运算链逐位相同；负数/边界 7 组硬编码值测试通过。                                   |
| 4    | `hashCode()`                        | ChunkPos.h:22 | `hashCode`         | 一致：转调静态版本。                                                                       |
| 5    | `distanceToSqr(const Entity* e)`    | ChunkPos.h:38 | `distanceToSqr`    | **已修 W67**：原实现整段用 double，改为 int→float 转换和每一步运算都过 `f()`。             |
| 补 6 | `ChunkPos()` / `ChunkPos(int, int)` | ChunkPos.h    | `constructor`      | 一致（R10）：两个构造合并为带默认参数的 `constructor`；`readonly x/z` 对应 `const int`。   |
| 补 7 | 隐式拷贝构造                        | ChunkPos.h    | `clone`            | 一致：保留拷贝构造（`clone`）；C++ 的拷贝赋值因 `const` 被删除，TS 不提供 `assign`。       |
| 补 8 | `operator==`                        | ChunkPos.h    | `equals`           | 一致（R10 改名）：逐字段比较。                                                             |
| 补 9 | `operator<`                         | ChunkPos.h    | `lessThan`         | 一致（R10 改名，怪癖保留）：只比 `hashCode()`，不比较 x/z；碰撞时两个不同坐标互不小于。    |

TS 有、C++ 没有：`toString`（NEW，调试字符串，C++ 没有对应输出运算符）；`clone` / `equals` / `lessThan` 是 R10 映射（见上表补 7–9）。

### 修复

**W67 `distanceToSqr` 没有按 C++ 的 float 逐步舍入。**

C++ `ChunkPos.h:38`：

```cpp
float xPos = (float) (x * 16 + 8);
float zPos = (float) (z * 16 + 8);
float xd = xPos - e->x;
float zd = zPos - e->z;
return xd * xd + zd * zd;
```

审核前 TS 用 double 直接算，注释还声称“数值更精确、性能更好”，并提到一个并不存在的「float 位级对齐版」。后果：返回值与 C++ 的 float 结果可能差若干位，影响按距离排序/比较的分支。修复：模块级 `const f = Math.fround;`，写成 `f(this.x * 16 + 8)`、`f(xPos - e.x)`、`f(zPos - e.z)`，最后 `f(f(xd * xd) + f(zd * zd))`；同时删掉过时注释。

先红后绿：

- 红（修复前）：`pnpm exec vitest run tests/unit/world/pos-tick-audit.test.ts` → `Test Files 1 failed (1)`、`Tests 1 failed | 9 passed (10)`；`AssertionError: expected 123.24999992996453 to be 123.25`。
- 绿（修复后）：同一命令 → `Test Files 1 passed (1)`、`Tests 10 passed (10)`，退出码 0。

### ADAPTED / DEFERRED

- 无新增标记；无 DEFERRED / OMIT。
- `clone`、`toString` 是 TS 侧辅助方法，不构成行为偏离；`equals` / `lessThan` 是 R10 改名。

### 35 条清单核对要点

- 第 1–2 条：`x/z` 是 int 字段，构造时 `| 0` 对齐 `int` 形参；唯一的 float 是 `distanceToSqr` 的局部量（W67 已逐步 `f()`）。`Entity.x/z` 在 C++ 是 float，测试里按 float 值传入。
- 第 3–7 条：W67 按 C++ 的运算顺序逐步舍入：`(float)(int 表达式)` 用 `f()`，减法/乘法/加法各自一次；`xd * xd + zd * zd` 的结合顺序是 `(xd*xd) + (zd*zd)`；没有带 `f` 后缀的十进制字面量。
- 第 8 条：`divs.py` 无输出（本文件没有除法）；`hashCode` 的 `<< 16` 与 `|` 链在 int32 内，负数/边界值已测试。
- 第 9–11 条：无 `Mth` 函数、无 C 库数学函数、无 64 位整数。
- 第 12 条：没有格式化数字；`toString` 是调试字符串。
- 第 13–18 条：无继承/虚函数/遮蔽/`super`；两个构造按 R10 情形 A 合并；`equals` / `lessThan` 是 R10 改名。
- 第 19 条：成员按 `x, z` 顺序初始化，无依赖。
- 第 20 条：`const` 字段 → `readonly`；所有成员函数 public，与 C++ 一致。
- 第 21 条：值类型；`clone` 对应拷贝构造；C++ 拷贝赋值被删除，TS 不提供 `assign`。
- 第 22–25 条：本文件不使用容器；`operator<` 仅按 hashCode、碰撞即等价的原版怪癖保留。
- 第 26–29 条：无随机数。
- 第 30–32 条：`toString` 仅 ASCII；无 char/布尔转换。
- 第 33 条：无日志。
- 第 34 条：无 DEFERRED / OMIT 需要复核。
- 第 35 条：已删除“float 位级对齐版”这条过时注释（W67 的一部分）。

---

## TilePos（src/world/level/TilePos.h ↔ packages/world/src/level/TilePos.ts）

C++ 侧要点：

- `int x, y, z` 全 public；三参构造、拷贝构造、`operator=`、`operator==`、`operator<`、`hashCode()` 都定义在头文件内。
- `hashCode()` 是 `x * 8976890 + y * 981131 + z`，按 32 位 int 回绕；`operator<` 只比 hashCode，因此哈希碰撞时不同坐标等价（原版怪癖）。
- `operator=` 返回 `TilePos&`，可链式赋值。

### 工作表结论

| #    | C++ 函数                  | C++ 位置     | TS 方法                      | 结论                                                                                                |
| ---- | ------------------------- | ------------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 1    | `z(z_)`（工作表误报）     | TilePos.h:14 | `constructor`                | 一致：这是三参构造的初始化器，不是函数；三参 `constructor` 覆盖它。                                 |
| 2    | `z(rhs.z)`（工作表误报）  | TilePos.h:14 | `constructor`                | 一致：这是拷贝构造的初始化器，不是函数；TS 的 `TilePos(rhs)` 重载逐字段复制。                       |
| 3    | `hashCode()`              | TilePos.h:25 | `hashCode`                   | 一致：`Math.imul` + `                                                                               | 0` 复现 int32 回绕；含溢出值的硬编码测试通过。 |
| 补 4 | `TilePos(int, int, int)`  | TilePos.h    | `constructor`                | 一致：字段按 `x, y, z` 顺序赋值；所有调用点传的都是整数表达式。                                     |
| 补 5 | `TilePos(const TilePos&)` | TilePos.h    | `constructor(rhs)` / `clone` | 一致：逐字段快照；`clone` 是显式拷贝入口。                                                          |
| 补 6 | `operator=`               | TilePos.h    | `assign`                     | 一致（R10）：复制三个字段并返回 `this`，可链式。                                                    |
| 补 7 | `operator==`              | TilePos.h    | `equals`                     | 一致（R10）：逐字段比较。                                                                           |
| 补 8 | `operator<`               | TilePos.h    | `lessThan`                   | 一致（R10，怪癖保留）：只比 `hashCode()`；碰撞时互不小于，已用 `(1,0,-8976890)` 与 `(0,0,0)` 测试。 |

TS 有、C++ 没有：`toString`（NEW，调试字符串）；`clone` / `assign` / `equals` / `lessThan` 是 R10 映射（见补 5–8）。

### 修复

无。逐函数对照未发现行为差异；`hashCode` 的 int 回绕、`operator=` 的返回引用、`operator<` 的哈希碰撞怪癖都与 C++ 相同。

### ADAPTED / DEFERRED

- 无新增标记；无 DEFERRED / OMIT。
- `toString` 是 TS 侧调试辅助；其余 TS 方法都是 R10 改名或显式拷贝入口。

### 35 条清单核对要点

- 第 1–2 条：全部是 int 字段/形参，没有 float；已核对全部 `new TilePos(...)` 调用点（`Explosion.ts`、`LevelChunk.ts`、`TileEntity.ts`、测试），传入的都是整数表达式（坐标、`& 15` 结果、`Math.floor` 结果等）。
- 第 3–7 条：没有 float 运算、float 常量或 int/float 混算。
- 第 8 条：`divs.py` 无输出（没有除法）；`hashCode` 用 `Math.imul` 做 32 位乘法、加法后 `| 0`；用 `(123456789, -987654321, 555)` 等溢出输入验证。
- 第 9–11 条：无数学函数、无 64 位整数。
- 第 12 条：没有格式化数字；`toString` 只是调试字符串。
- 第 13–18 条：无继承/虚函数；构造函数的两个重载按实参类型（number / TilePos）分派，对应 C++ 的两个构造；`assign` / `equals` / `lessThan` 是 R10 改名；无遮蔽、无 `super`。
- 第 19 条：字段按 `x, y, z` 顺序初始化，无依赖。
- 第 20 条：C++ 三个字段与所有成员函数都是 public，TS 一致。
- 第 21 条：值类型；拷贝构造 + `clone` + `assign(this)` 都提供，类内部不共享引用。
- 第 22–25 条：本文件不使用容器；`operator<` 只比 hashCode，哈希碰撞导致的“等价”是原版怪癖，已测试并保留。
- 第 26–29 条：无随机数。
- 第 30–32 条：`toString` 仅 ASCII；无 char/布尔转换。
- 第 33 条：无日志。
- 第 34 条：无 DEFERRED / OMIT 需要复核。
- 第 35 条：注释与实现一致（int 回绕、按 hashCode 比较的说明都正确）。

---

## TickNextTickData（src/world/level/TickNextTickData.h / .cpp ↔ packages/world/src/level/TickNextTickData.ts）

C++ 侧要点：

- `static long C`、`long c` 都是 private；`c(++C)` 是全局创建序号。`x, y, z, tileId, delay` 是 public，其中 `delay` 在构造函数里不初始化，只有 `tileId > 0` 时 `Level::addToNextTick` 才调用 `setDelay`。
- `operator<` 依次比较 `delay`、`c`；`operator==` 只比较坐标与 `tileId`。
- `hashCode` 是 `(((x * 128 * 1024) + (z * 128) + y) * 256) + tileId`，按 int 回绕。
- `std::set<TickNextTickData>`（`Level.h` 的 `TickDataSet`）按 `operator<` 排序；因为 `c` 每个对象都不同，同一坐标的重复计划不会被去重（原版行为，液体/火依赖它）。

### 工作表结论

| #    | C++ 函数                               | C++ 位置                | TS 方法                           | 结论                                                                                                                                  |
| ---- | -------------------------------------- | ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `TickNextTickData(int, int, int, int)` | TickNextTickData.cpp:5  | `constructor`                     | 一致：四个字段赋值、`c = ++C`。C++ 按声明顺序先初始化 `c` 再初始化 `x/y/z/tileId`（初始化列表顺序不算），两者无依赖，可观察行为相同。 |
| 2    | `hashCode()`                           | TickNextTickData.cpp:14 | `hashCode`                        | 一致：`Math.imul` + `                                                                                                                 | 0`复现`((x*128*1024 + z*128 + y)*256 + tileId)` 的 int32 回绕；用 BigInt 期望值测试。 |
| 3    | `setDelay(long l)`                     | TickNextTickData.cpp:18 | `setDelay`                        | 一致：赋值 `delay` 并返回 `this`（C++ 返回指针）。                                                                                    |
| 补 4 | `operator==`                           | TickNextTickData.cpp    | `equals`                          | 一致（R10）：只比较 `x/y/z/tileId`，与 `delay/c` 无关。                                                                               |
| 补 5 | `operator<`                            | TickNextTickData.cpp    | `lessThan`                        | 一致（R10）：先 `delay` 后 `c`，四个 `if` 的返回顺序照抄；`a.lessThan(a)` 为 false。                                                  |
| 补 6 | `static long C` / `long c`（字段）     | TickNextTickData.h      | private static / private readonly | 一致：`long` 用 JS number 表示；`c` 只增且远小于 2^53，整数比较精确；可见性与 C++ 相同（private）。                                   |

TS 有、C++ 没有：`equivalent` / `serial`（NEW，供 `TickDataSet` 判断 `operator<` 等价与取序号）；`TickDataSet` 及其 `size/has/insert/begin/erase/clear/siftDown`（ADAPTED(Cpp)，替代 `std::set`，见下）。

### 修复

无行为修复。逐函数对照未发现差异；`hashCode`、`operator<`、`setDelay`、`equals` 都与 C++ 相同，`TickDataSet` 的 `begin/insert/erase` 在 `Level` 的实际用法下与 `std::set` 等价（见第 21–24 条）。

### ADAPTED / DEFERRED

- 已有 `ADAPTED(Cpp)`（文件头）：`std::set<TickNextTickData>` 用“按 `operator<` 排序的小顶堆 + 序号 Map”实现；`Level` 只用到 `size/begin/erase(begin)/find/insert`，`begin()` 顺序与 `std::set` 相同。
- `delay` 未初始化 → 取 0：文件头「delay 的初值」已说明；C++ 对未初始化值的比较是未定义行为，按审核方案取安全默认值。
- 空集合的 `begin()` 返回 `null`（C++ 解引用空 `set::end()` 是未定义行为）：方法注释已说明。
- 无新增标记；无 DEFERRED / OMIT。

### 35 条清单核对要点

- 第 1–2 条：`x/y/z/tileId` 是 int；`delay/c` 是 `long`，用 JS number 表示，整数在 2^53 内精确（计划刻时间不会接近该量级），记录在此备查；构造函数形参对应 C++ 的 int。
- 第 3–7 条：没有 float 字段或 float 运算，不需要 `f()`。
- 第 8 条：`divs.py` 无输出（没有除法）；`hashCode` 用 `Math.imul` 做 32 位乘法、加法后 `| 0`；结合顺序 `((x*128*1024) + z*128) + y` 与 C++ 相同（模 2^32 乘法可结合，`Math.imul(x, 128*1024)` 与 `Math.imul(Math.imul(x,128),1024)` 位相同）。
- 第 9–11 条：无数学函数；`long` 见第 1–2 条。
- 第 12 条：没有格式化数字。
- 第 13–18 条：无继承/虚函数；`equals` / `lessThan` 是 R10 改名；没有重载；`C` / `c` 的 private 可见性与 C++ 一致。
- 第 19 条：C++ 成员声明顺序是 `c` 在 `x/y/z/tileId/delay` 之前，TS 在构造末尾才 `++C`；`++C` 不依赖其他字段，其他字段赋值也没有副作用，行为相同。
- 第 20 条：`C` / `c` private，其余字段 public，与 C++ 头文件一致；`TickDataSet` 的 `heap` / `bySerial` 是其实现私有。
- 第 21 条：C++ `std::set` 按值存元素，TS 堆里存对象引用；`Level` 的用法是 insert 后只通过 `begin()` 读取、随后 `erase(begin())`，从不在插入后修改对象，所以可观察行为相同（文件头已标 ADAPTED(Cpp)）。
- 第 22–25 条：`std::set` 的排序/查找/`begin` 由堆 + 序号 Map 复现：`has` 用 `!(a<b) && !(b<a)` 判等价，`insert` 对等价元素不做事，`begin` 取最小；`c` 唯一使顺序成为全序，不存在相等元素次序问题。
- 第 26–29 条：无随机数；`hashCode` 的运算顺序与 C++ 书写顺序一致。
- 第 30–32 条：无字符串、char、布尔转换。
- 第 33 条：无日志。
- 第 34 条：文件头的 ADAPTED(Cpp) 仍成立；无 DEFERRED / OMIT。
- 第 35 条：文件头关于“先 find 再 insert 仍会重复插入”的说明与 `Level.cpp:1346-1352` 一致；`delay` 只在 `tileId > 0` 时设置的说明与 `Level.cpp:1347-1349` 一致；`tickPendingTicks` 的 `begin/erase(begin)` 用法与 `Level.cpp:342-361` 一致。

---

## 统一验证

- `pnpm exec vitest run tests/unit/world/pos-tick-audit.test.ts`：`Test Files 1 passed (1)`、`Tests 10 passed (10)`，退出码 0（W67 红绿见上）。
- `npx tsc -p packages/world --noEmit`：0 错误，退出码 0。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误，退出码 0。
- `npx prettier --check`（ChunkPos.ts、TilePos.ts、TickNextTickData.ts、pos-tick-audit.test.ts、本记录）：通过。
- `python tools/porting/divs.py`（三个 TS 文件）：均无输出，表示没有整数除法需要判断。
- TS 行数：ChunkPos 审核前 93 → 审核后 92；TilePos 79（未变）；TickNextTickData 146（未变）。
