# Explosion（src/world/level/Explosion.h / .cpp ↔ packages/world/src/level/Explosion.ts）

第 2 批（world/level）。工作表 3 行全部有结论。C++ `.h` 38 行 + `.cpp` 164 行，
TS 审核前 264 行、审核后 272 行。新增编号 **W64**。

C++ 侧要点：

- `Explosion.h`：`public` 段是构造函数、`explode`、`finalizeExplosion`、`float x, y, z, r`、
  `TilePosSet toBlow`、`bool fire`、`Entity* source`；`private` 段是 `Random random` 与 `Level* level`。
- `x/y/z/r` 是 float；`toBlow` 是 `std::set<TilePos>`（`TilePos::operator<` 比 hashCode）；
  `fire` 默认 `false`；成员 `random` 是默认构造（按时间播种），与 `level->random` 是两个独立的流。
- `explode()` 从 16×16×16 立方体的表面射 1352 条射线，每条先取 **1 个** `level->random.nextFloat()`；
  每步 0.3f；撞到方块衰减 `(getExplosionResistance(source) + 0.3f) * stepSize`，
  每步再固定衰减 `stepSize * 0.75f`。之后 `r += r` 用翻倍半径算 AABB、实体推力与伤害，最后 `r = org`。
- `fire` 分支用**成员** `random.nextInt(3)`，并且 `t == 0 && Tile::solid[b] && ...` 短路。
- `finalizeExplosion()` 先调 `playSound`（同一表达式里两次 `level->random.nextFloat()`），
  再遍历 `toBlow`：每 8 格（`j & 7 == 0`）取 5 个随机数（3 个位置 + 2 个速度），放 explode/smoke 粒子。
- `Explosion.cpp:119` 有一句被注释掉的 `hugeexplosion` 粒子，不参与执行，TS 未复制。
- 无继承、无重载、无默认参数、无 long、无字符串格式化、无日志。

## 工作表结论

| #   | C++ 函数                                                         | C++ 位置          | TS 方法             | TS 行 | 相似度 | 结论                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------- | ----------------- | ------------------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Explosion(Level*, Entity*, float x, float y, float z, float r)` | Explosion.cpp:8   | `constructor`       | 87    | 1.00   | **已修 W64-1**：C++ 形参是 float，TS 原先直接存 double；现在入口 `f()`。                                                                                                                                        |
| 2   | `explode()`                                                      | Explosion.cpp:19  | `explode`           | 99    | 0.82   | **已修 W64-2/3/4**：`getSeenPercent`、`getExplosionResistance` 的 double 返回值在调用点收成 float；`(int)` 改 `f2i` 并把最后的 `+1` 也按 float 舍入。其余逐步舍入、`r += r` / `r = org`、fire 分支与 C++ 一致。 |
| 3   | `finalizeExplosion()`                                            | Explosion.cpp:116 | `finalizeExplosion` | 200   | 0.82   | 一致；新增 **DEFERRED(待确认)**：`playSound` 同一表达式里两次 `nextFloat()` 的求值顺序 C++ 未指定，TS 按从左到右。粒子/音效的调用次数与顺序经测试钉住。                                                         |

C++ 有、TS 没有的方法：无。

TS 有、C++ 没有的方法：`TilePosSet.size`（行 49）、`insert`（行 53）、`entries`（行 69）。
它们是 C++ `typedef std::set<TilePos> TilePosSet` 的替身：按 hashCode 升序保存、插入等价元素（hashCode 相同）
时丢弃后来的。类注释已标 `ADAPTED(Cpp)`，不是新增行为。`entries()` 返回内部数组（调用方只读）。

## 修复

### W64-1 构造函数没有把 float 形参收成 float

C++ 的四个形参都是 `float`，进入初始化列表时已经舍入；TS 的 `number` 是 double。原先直接
`this.x = x`，传入 `0.1/0.2/0.3/3.1` 时字段保留 double。修复为 `this.x = f(x)` 等四行。
这也解释了旧单测为什么要显式传 `Math.fround(3.1)` 才能断言 `r` 的还原值。

先红后绿：

- 红：`AssertionError: expected 0.1 to be 0.10000000149011612`。
- 绿：同一测试通过。

### W64-2 `getSeenPercent` 的 double 返回值没有收成 float

C++ 是 `float sp = level->getSeenPercent(center, e->bb);`，函数返回 float；TS 的
`Level.getSeenPercent` 返回 `hits / count`（double）。原先 `pow = f((1 - dist) * sp)` 用的是 double 的 `sp`。
修复为 `const sp = f(this.level.getSeenPercent(center, e.bb));`。
（更彻底的做法是在 `Level.getSeenPercent` 返回处收口，但那属于 Level.ts 的审核范围；本文件按 C++ 签名在调用点收一次。）

先红后绿：

- 红：`AssertionError: 修复前这里等于 rawXd: expected 0.000002339782440685667 to be 0.0000023397822133119917`。
- 绿：同一测试通过（断言 `e.xd` 等于按 `f(seen)` 算出的值）。

### W64-3 `getExplosionResistance` 的 double 返回值没有收成 float

C++ 的 `Tile::getExplosionResistance` 返回 float；TS 的 `Tile.getExplosionResistance` 返回
`this.explosionResistance / 5.0`（double）。原先能量衰减直接用 double 参与 `f(resistance + 0.3f)`。
修复为 `f(f(Tile.tiles[t]!.getExplosionResistance(this.source)) + f(0.3))`，再乘 `stepSize`。
（同样，Tile.ts 的返回类型不在本次范围内，调用点收口即等价。）

先红后绿：

- 红：`AssertionError: 修复前这里等于 oldRemaining > 0: expected true to be false`。
  测试选了一块抗性，使“先收 float”与“不收”算出的剩余能量一个 `> 0`、一个 `<= 0`，
  于是 (8,108,8) 是否进 `toBlow` 不同。
- 绿：同一测试通过，`toBlow` 与 C++ 的 float 语义一致。

### W64-4 `(int)` 用了 `Math.trunc`

C++ `(int)((pow * pow + pow) / 2 * 8 * r + 1)` 在 x86 上走 `cvttss2si`：NaN 或越界得 INT_MIN。
原先用 `Math.trunc`，NaN 仍是 NaN；而且最后的 `+1` 没有按 float 舍入。
修复为 `f2i(f(f(f(f(f(f(pow * pow) + pow) / 2) * 8) * this.r) + 1))`。

先红后绿：

- 红：`AssertionError: 修复前 Math.trunc(NaN) 还是 NaN: expected true to be false`。
- 绿：同一测试通过，伤害为 `-2147483648`。

## 注释修正（无行为变化）

- 文件头行数从“202 行 + 头 23 行”改为“164 行 + 头 38 行”（`wc -l` 实测）。
- 文件头补充“float 边界”一节：构造形参、`getSeenPercent` / `getExplosionResistance` 返回值、
  `(int)` 用 `f2i`。
- `finalizeExplosion` 的 `playSound` 原句从“C++ 原句”改为 `DEFERRED(待确认)`，并注明 C++ 未规定
  同一表达式内两个 `nextFloat()` 的先后顺序；TS 按从左到右（与 Chicken / PigZombie / Sheep / Skeleton 的先例一致）。
- 第一次红跑另有一条测试自身的笔误（粒子的 z 坐标误用了 108.5，应为 8.5），与实现无关；修正后复跑，
  红跑的四条目标失败仍按上面的信息出现。

## ADAPTED / DEFERRED

- `ADAPTED(Cpp)`（原有，类注释，不计入台账）：`TilePosSet` 替代 `std::set<TilePos>`。
  `operator<` 比 hashCode，所以遍历是 hashCode 升序；hashCode 相同的不同坐标被当成等价元素丢弃；
  `entries()` 直接返回内部数组。`fromBlowArray` 在 C++ 是 `std::vector` 拷贝，TS 用内部数组别名；
  `finalizeExplosion` 遍历期间不修改 `toBlow`，行为等价。
- `DEFERRED(待确认)`（新增 1 条，计入台账）：`playSound` 里两个 `nextFloat()` 的求值顺序。
- 无 `OMIT` / `FORWARD-DECL`。`ExplodePacket` 的 `DEFERRED(Network)` 在 `Level::explode`（Level.ts），
  不在本文件。
- 粒子：C++ 的 `PARTICLETYPE(x)` 宏实际传的是字符串 `"x"`（见 EntityTypes.ts 注释）；TS 项目统一传
  数字 `ParticleType.x`，由 LevelRenderer 的 `PARTICLE_NAME_BY_ID` 归一。这是项目既有约定，行为等价。

## 35 条清单核对要点

- 第 1–2 条：float 字段 `x/y/z/r` 的所有赋值都带 `f()`（构造函数见 W64-1，`r += r` / `r = org` 原本就对）；
  `fire` 是 bool，`source` 是 `Entity | null`，`toBlow` 是 `TilePosSet`，`random` 是 `Random`，`level` 是引用。
  C++ 的 float 形参只有构造函数的四个，已修。
- 第 3–7 条：逐条核对了 ray 方向（`xx / 15.0f * 2 - 1` 的左结合）、`sqrt` 结果收 float、`xd / d`、
  `remainingPower` 初值、能量衰减（W64-3）、固定衰减、AABB 边界（`x - r - 1` 分两步）、
  `dist`、`invSqrt` 的内积、`pow`（W64-2）、伤害（W64-4）、推力的 `+=`、粒子的位置/方向/速度。
  带 `f` 后缀的常量全部 `f()`；`1.0f / Mth::sqrt(...)` 在 TS 里写成 `f(1.0 / ...)`，
  除法先按 double 算再收 float，与直接 float 除法等价（double 舍入对除法是无害的）。
  int 常量 `2/8/1` 都是精确值。
- 第 8 条：`divs.py` 只列出浮点除法；唯一的整数除法相关写法是 `TilePosSet` 二分里的 `(lo + hi) >> 1`
  （移位，不是 `/`）。没有 int/int；`j & 7`、`j++`、`size - 1` 与 C++ 一致。
  `TilePos.hashCode` 的 `Math.imul` 在 TilePos.ts，本文件未改。
- 第 9–12 条：射线距离用 `Math.sqrt`（C 库 double）+ `f()`，与 C++ 的 `sqrt(float)` 存回 float 一致；
  `Mth.sqrt` / `Mth.invSqrt` / `Mth.floor` 直接用。无 long、无字符串格式化。
- 第 13–18 条：`Explosion` 没有基类，不存在非虚函数分派、构造期虚调用、默认参数、重载、遮蔽或 `super::`。
  `Level.playSound` 的 6 参重载、`getEntities` / `getSeenPercent` 的单版本调用都按 C++ 的静态类型解析。
- 第 19 条：C++ 实际初始化顺序按声明（`x,y,z,r,toBlow,fire,source,random,level`）；TS 的字段初始化器
  先建 `toBlow` / `random`，构造函数体再赋 `level/source/x..r/fire`。成员之间没有依赖，行为等价。
- 第 20 条：可见性与 C++ 一致：`x/y/z/r/toBlow/fire/source`、构造函数、`explode`、`finalizeExplosion` 都是 public；
  `random` / `level` 是 private。没有 W27 那种子类收窄问题。
- 第 21–25 条：`Vec3`、`AABB`、`TilePos` 都是按值构造/插入；`std::set` 的等价与遍历顺序见 ADAPTED；
  没有 vector erase、`std::sort`、哈希容器。
- 第 26–29 条：两个随机源没有混用（射线/声音/粒子用 `level.random`，fire 用成员 `random`）。
  射线每条 1 次（1352 条），测试钉住；finalize 是 `2 + 5 × 粒子槽`，测试钉住（位置 3 次、速度 2 次，
  不是“每个方向 2 个”）。`&&` 的短路顺序与 C++ 相同。`playSound` 的减法顺序有影响，已标 DEFERRED；
  速度的 `nextFloat() * nextFloat()` 虽然顺序未指定，但乘法可交换、两次调用都会发生，结果相同，无需标记。
  被注释掉的 `hugeexplosion` 没有随机调用，未复制。
- 第 30–33 条：字符串只有 ASCII 的 `"random.explode"`；粒子 id 的字符串/数字差异见上；
  `j`、`t`、`b` 的 bool/int 转换与 C++ 相同；本文件没有 LOGI/printf。
- 第 34 条：本文件原有 0 条计数标记（只有类注释里的 `ADAPTED(Cpp)`，台账正则不计数）；本次新增 1 条
  `DEFERRED(待确认)`。`TilePosSet` 的 ADAPTED 仍成立；没有可删的 OMIT。
- 第 35 条：文件头行数、float 边界、playSound 的 DEFERRED 已修正；其余说法（1352 条射线、
  两个随机源、`r += r` / `r = org`）核对无误。

## 验证

- 红：`pnpm exec vitest run tests/unit/world/explosion-audit.test.ts`，退出码 1，5 条失败
  （其中 4 条是 W64-1..4 的目标失败，1 条是测试自身笔误，已修正）。
- 绿：`pnpm exec vitest run tests/unit/world/explosion-audit.test.ts tests/unit/world/explosion.test.ts tests/golden/explosion.golden.test.ts`，
  退出码 0，`Test Files 3 passed (3)`，`Tests 25 passed (25)`。既有黄金样本未改、未重新生成。
- `npx tsc -p packages/world --noEmit`：退出码 0。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0。
- `npx prettier --check packages/world/src/level/Explosion.ts tests/unit/world/explosion-audit.test.ts`：通过。
- `python tools/porting/divs.py packages/world/src/level/Explosion.ts`：只列出浮点除法，无 int/int。
- `python tools/porting/shadow.py packages/world/src/level/Explosion.ts <成员表>`：无输出，退出码 0。
- `pnpm ledger`：共 206 条；Explosion.ts 由 0 条计数标记变为 1 条（新增的 DEFERRED）。总数包含并行审核的
  其它文件改动，不能把 206 的增量全部算在本文件上。
- 未提交（按本次任务要求）。
