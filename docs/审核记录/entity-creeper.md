# world/entity/monster/Creeper.ts 审核记录（W32）

`src/world/entity/monster/Creeper.h / .cpp` ↔ `packages/world/src/entity/monster/Creeper.ts`（12 个函数，117 行）。
第 2 批；工作表由 `tools/audit/worksheet.py` 生成，逐行结论如下。

## 工作表结论

| #   | C++ 函数                                      | C++ 位置        | TS 方法              | TS 行 | 相似度 | 结论         |
| --- | --------------------------------------------- | --------------- | -------------------- | ----- | ------ | ------------ |
| 1   | `Creeper(Level* level)`                       | Creeper.cpp:7   | `constructor`        | 22    | 0.57   | 一致         |
| 2   | `getMaxHealth()`                              | Creeper.cpp:19  | `getMaxHealth`       | 32    | 1.00   | 一致         |
| 3   | `tick()`                                      | Creeper.cpp:23  | `tick`               | 36    | 0.97   | 一致         |
| 4   | `getSwelling(float a)`                        | Creeper.cpp:47  | `getSwelling`        | 59    | 0.88   | **已修 W32** |
| 5   | `getEntityTypeId()`                           | Creeper.cpp:51  | `getEntityTypeId`    | 63    | 1.00   | 一致         |
| 6   | `getDeathLoot()`                              | Creeper.cpp:55  | `getDeathLoot`       | 67    | 1.00   | 一致         |
| 7   | `checkCantSeeTarget(Entity* target, float d)` | Creeper.cpp:59  | `checkCantSeeTarget` | 71    | 1.00   | 一致         |
| 8   | `getHurtSound()`                              | Creeper.cpp:70  | `getHurtSound`       | 82    | 1.00   | 一致         |
| 9   | `getDeathSound()`                             | Creeper.cpp:74  | `getDeathSound`      | 86    | 1.00   | 一致         |
| 10  | `checkHurtTarget(Entity* target, float d)`    | Creeper.cpp:78  | `checkHurtTarget`    | 90    | 0.98   | **已修 W32** |
| 11  | `getSwellDir()`                               | Creeper.cpp:99  | `getSwellDir`        | 109   | 0.91   | 一致         |
| 12  | `setSwellDir(int dir)`                        | Creeper.cpp:103 | `setSwellDir`        | 113   | 0.69   | 一致         |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复

**W32-1 `getSwelling(float a)` 入口未舍入形参。**
C++ 形参是 `float a`；TS 以前直接拿 double 的 `a` 参与 `f((swell - oldSwell) * a)`。
调用方 `CreeperRenderer.scale / getOverlayColor` 的 `a`（渲染插值）来自普通 number，不能保证已是 float。
后果：乘积累积前就不同，膨胀比例、闪白档位会与原版有偏差（实测 `swell=7, a=0.1+0.2`
原版得 `0.07500000298023224`，修复前 TS 得 `0.07499999552965164`）。
修复：函数开头 `a = f(a);`。测试：`tests/unit/world/creeper-audit.test.ts` 第 2 条。

**W32-2 `checkHurtTarget(Entity*, float d)` 入口未舍入形参。**
C++ 形参是 `float d`，TS 以前直接比较 `d < 3` / `d < 7`。
后果：边界附近 double 与 float 的判定不同——`d = 6.999999999999999` 舍入成 float 是 `7.0f`，
原版条件为假（缩回），修复前 TS 判定 `d < 7` 为真（继续膨胀）。
修复：函数开头 `d = f(d);`。当前引擎内唯一调用方 `PathfinderMob` 传的
`distanceTo()` 已经返回 `f(...)`，所以本次修复不改变现有玩法路径，但按清单第 2 条把契约补正。
测试：`tests/unit/world/creeper-audit.test.ts` 第 1 条。

**W32-3（注释）文件头与代码不符。**
原注释称单机（服务端）时“swell 只在 checkHurtTarget / checkCantSeeTarget 里变”，
漏掉了 `tick()` 服务端分支在 `attackTargetId == 0` 时对 swell 的递减。已改正注释，无代码行为变化。

## 35 条清单核对要点

- 第 1 条：`swell / oldSwell / swellDir` 为 int，取值被夹在 0..30，加减不会溢出，无需 `|0`；无 float 字段。
- 第 2 条：`getSwelling(a)`、`checkHurtTarget(…, d)` 见 W32；`checkCantSeeTarget` 的 `d` 在 C++ 和 TS 都未使用，舍入不可观测，保留 `_d`。
- 第 3–5 条：`getSwelling` 按 C++ 结合顺序 `f(f(old + f((swell-old)*a)) / (MAX-2))`，每步已舍入（W32 补上 `a` 的入口舍入）。
- 第 6 条：`2.4f → f(2.4)`、`0.5f → f(0.5)`；音量 1 是整数字面量转 float，精确可表示。
- 第 7–12 条：无 int/float 赋值截断、无乘除溢出、无数学函数、无 64 位、无字符串格式化。
- 第 13–20 条：可见性与 C++ 一致（`getSwelling`/`tick`/`getMaxHealth` public，`getDeathLoot`/两个 check/两个音效 protected，两个 swellDir private）；`super::tick()` 对应 `super.tick()`（直接基类 Monster）；成员声明顺序 `swell, oldSwell, swellDir` 与 C++ 一致；构造函数字段初始化器与 C++ 初始化列表同值，构造函数体里重复赋同值，无行为差异。
- 第 21–29 条：无按值对象、容器、排序、哈希、随机数、求值顺序问题。
- 第 30–34 条：`DATA_SWELL_DIR = 16`、`TYPE_BYTE` 的 `wrap` 等价于 C++ `(TypeChar)`（-1 保持 -1）；无日志、无 DEFERRED / OMIT。
- 第 35 条：文件头已按 W32-3 改正。文件末尾 `void Creeper.prototype;` 是不含 C++ 对应行的无害 TS 语句（同仓库另有一处同样写法），无行为影响，未动。

## 验证

- 先红后绿：修复前 `npx vitest run tests/unit/world/creeper-audit.test.ts` 2 条全失败
  （`expected 0.0714285746216774 to be +0`、`expected 0.07499999552965164 to be 0.07500000298023224`）；
  修复后 2 条通过。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx prettier --check packages/world/src/entity/monster/Creeper.ts tests/unit/world/creeper-audit.test.ts`：通过。
- `pnpm ledger`：共 170 条，与修改前无变化（未新增/删除 DEFERRED、OMIT）。
- 按本次任务约束未新增黄金样本；float 入口舍入由单元测试按 C++ 运算顺序逐位锁定。

待确认项：无。
