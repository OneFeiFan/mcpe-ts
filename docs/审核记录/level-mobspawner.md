# MobSpawner（src/world/level/MobSpawner.h / .cpp ↔ packages/world/src/level/MobSpawner.ts）与 MobSpawnerHooks（NEW）

第 2 批（world/level）。2 个文件工作表共 7 行全部有结论。新增编号 W62-W63。

## 一、MobSpawner.ts（W62，7 函数；审核前 306 行 → 审核后 311 行）

C++ 侧要点：

- `MobSpawner.h`：7 个 `public static` 函数；`bedEnemies` 在 `protected` 段（`MobSpawner.h:20`，这一版没有任何代码读它）；`MIN_SPAWN_DISTANCE = 24`、`chunksToPoll` 在 `private` 段。
- `tick`：两个开关都关时返回 0。友好生物把 16×16 个区块全部入表；怪物按 `_pid` 轮换玩家，取该玩家周围 ±8 区块并裁到 0..15。区块表是 `std::map<ChunkPos, bool>`，按 `ChunkPos::operator<`（只比 `hashCode()`）排序、去重，`insert` 不覆盖已有键。
- `tick`：每个类别先看开关与 `countInstanceOfBaseType` 上限；每个区块随机取点，检查生成材质后分 3 轮、每轮最多 4 次随机游走（`ss = 6`，y 用 `nextInt(1) - nextInt(1)`），再查离最近玩家 ≥24 格、离共享出生点的距离平方 ≥24²。
- `tick` 的怪物同类上限：`typeMax = (int)(1.5f * randomWeight * maxInstancesPerLevel) / defaultTotalEnemyWeight` —— 先 float 乘、再截断为 int、最后整数除法；`maxCreatureCount = minCount + level->random.nextInt(1 + maxCount - minCount)`。
- `tick` 的 `goto chunkLoop`：一群满员时跳回区块循环之前，整张表从头再轮一遍，不是继续下一个区块；`count += clusterSize` 在每次成功加入后累加（同一群会被重复累加，C++ 原样如此）。
- `tick` 里的 `static Stopwatch` 只计时、结果从未读取；加入失败时 C++ `delete mob`。
- `postProcessSpawnMobs`：生成区块时由 `RandomLevelSource.cpp:507-508` 在 `spawnMobs && !level->isClientSide` 时调用，实参 `xo + 8, zo + 8, 16, 16, &random`。按 `biome.getMobs(creature)` 与 `creatureProbability` 循环；物种用 `WeighedRandom.getRandomItem(level->random, mobs)`（注意是 `level->random`，不是形参 `random`）；每只最多 4 次尝试，尝试失败或成功后都继续漂移 x/z；越界重置时 z 的上界也用 `cellWidth`（C++ 原句如此，`cellHeight` 只用于初始 z）。
- `finalizeMobSettings`：羊用 `level->random` 选毛色，再 `makeBabyMob(mob, 0.5f)`；C++ 里另有一段被注释掉的 Java 蜘蛛骑士 / 羊毛色代码（含 `nextInt(100)`），不参与编译、不消耗随机数。
- `makeBabyMob`：`static Random babyRandom(98495119L)`；仅当 `BaseCreature` 时消耗一次 `nextFloat()`，`< probability` 则 `setAge(-20 * 60 * TicksPerSecond)`。
- `Biome::MobSpawnerData` 的默认构造只把 `randomWeight` 置 -128，`mobClassId` / `minCount` / `maxCount` 未初始化；`isValid()` 只看 `randomWeight`。
- 数值：`Mth::floor` 是向负无穷取整（有限值等价 `Math.floor`）；坐标 / 速度在 C++ 里是 float，`(int)` 是向零截断。

## 工作表结论

工作表 7 行（TS 行号是审核开始时快照，修复后已变化）：

| #   | C++ 函数               | C++ 位置           | TS 方法                | 结论                                                                                                                                                                                                                                                                      |
| --- | ---------------------- | ------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tick`                 | MobSpawner.cpp:28  | `tick`                 | 一致（怪癖保留）：pid 轮换、17×17 裁边、Map 按 hashCode 去重排序、`goto chunkLoop` 用带标签 continue、`count += clusterSize`、y 两次 `nextInt(1)`、typeMax 的 float 乘→截断→整数除全部相同。Stopwatch 标 ADAPTED(Perf)、delete 标 OMIT；漂移求值顺序标 DEFERRED(待确认)。 |
| 2   | `postProcessSpawnMobs` | MobSpawner.cpp:175 | `postProcessSpawnMobs` | 一致（怪癖保留）：概率循环、`WeighedRandom` 用 `level.random`、成功后仍漂移、z 上界用 `cellWidth`、越界重置循环均相同；两处漂移的求值顺序标 DEFERRED(待确认)。                                                                                                            |
| 3   | `getRandomPosWithin`   | MobSpawner.cpp:227 | `getRandomPosWithin`   | 一致：随机数顺序 x → y → z，y 上界 `LEVEL_HEIGHT = 128`；返回值元组对应 C++ 按值返回的 `TilePos`。新增测试钉住顺序。                                                                                                                                                      |
| 4   | `isSpawnPositionOk`    | MobSpawner.cpp:236 | `isSpawnPositionOk`    | 一致：水材质分支（`isLiquid && !solid(y+1)`）与陆地分支（`solid(y-1) && !solid(y) && !liquid && !solid(y+1)`）的条件与顺序相同。                                                                                                                                          |
| 5   | `finalizeMobSettings`  | MobSpawner.cpp:245 | `finalizeMobSettings`  | 一致：羊 `setColor(getSheepColor(level.random))`、`makeBabyMob(mob, 0.5f)`；被注释的 Java 代码未复制，`nextInt(100)` 不消耗随机数（补了说明注释）。                                                                                                                       |
| 6   | `addMob`               | MobSpawner.cpp:264 | `addMob`               | 一致：`moveTo` → `force` 或 `canSpawn` → `addEntity` + `finalizeMobSettings` → true，否则 false。                                                                                                                                                                         |
| 7   | `makeBabyMob`          | MobSpawner.cpp:278 | `makeBabyMob`          | **已修 W62a**：`probability` 按 C++ float 形参先 `f()` 舍入；静态 `Random(98495119)`、仅 `BaseCreature` 消耗 `nextFloat()`、`setAge(-20*60*TicksPerSecond)` 相同。                                                                                                        |

## 修复

### W62a makeBabyMob 的 probability 按 float 舍入（行为修复）

- 红：`VITEST_RED=1`，`Tests 2 failed | 3 passed (5)`。makeBabyMob 用例报 `expected true to be false` —— `nextFloat()` 返回 0.5，未舍入的 `0.5000000001` 使 `0.5 < 0.5000000001` 为真，误判成幼崽。
- 修：形参入口 `const probabilityF = f(probability);`，比较改用 `probabilityF`（C++ 形参是 `float`，调用方 `0.5f` 与测试传入的 double 都要先舍入）。
- 绿：最终 `Tests 5 passed (5)`。

### W62b bedEnemies 收回 protected（可见性修复）

- 红：`TSC_RED=2` 之一为 `tests/unit/world/mobspawner-audit.test.ts(49): error TS2322: Type 'true' is not assignable to type 'false'` —— 当时 `bedEnemies` 是 public，`keyof typeof MobSpawner` 能列出它，编译期断言不成立。
- 修：`public static` → `protected static readonly`。C++ `MobSpawner.h:20` 就是 protected，且全仓没有类外读取（清单第 20 条）。
- 绿：`tsc -p tests/tsconfig.json --noEmit` 退出码 0。

### W62c 文件头更正（注释）

原文件头称 `postProcessSpawnMobs` “没人调用”，与现状不符：`RandomLevelSource.postProcess` 已经经 Hook 转调（`RandomLevelSource.cpp:507-508`）。同时写明 `chunksToPoll` 从 C++ 的 static 成员改为 tick 内局部 Map（每次 clear 后重建，行为等价）。

### W62d MobSpawnerData 默认构造说明（注释）

TS 的 `MobSpawnerData` 三个 int 字段取 0（`Biome.ts` 的 ADAPTED(Safety)）；本函数在 `isValid()` 通过前不读这三个字段，行为不受影响。补说明，避免后来人误以为 C++ 也初始化了。

### W62e 台账标记补齐（标记）

- `static Stopwatch` → `// ADAPTED(Perf): ...`（只计时，结果从未读取，同 `Level.cpp:808`）。
- `delete mob` → `// OMIT(MobSpawner): ...`（JS 由 GC 接管，R3）。
- 3 处 `nextInt() - nextInt()`（tick 漂移、postProcess 漂移、postProcess 越界重置）→ `// DEFERRED(待确认): <C++ 原句>`，先按从左到右（同 Sheep / Chicken 先例）。

## 保留的 C++ 怪癖

- 一群满员时 `goto chunkLoop` 回到区块循环之前，整张表重轮；`count += clusterSize` 会重复累加同一群。
- y 的 `nextInt(1) - nextInt(1)` 恒为 0，但两次随机数照旧消耗。
- postProcess 的 z 上界用 `cellWidth`（不是 `cellHeight`）。
- postProcess 每轮尝试成功后仍执行一次 x/z 漂移。
- postProcess 物种抽取用 `level.random`，不用形参 `random`。
- 被注释掉的 Java 蜘蛛骑士 / 羊毛色块不复制；其中的 `nextInt(100)` 不消耗随机数。
- 越界重置的 `while` 没有尝试次数上限（C++ 原样）。

## ADAPTED / OMIT / DEFERRED（本文件）

| 位置                      | 标记                            | 说明                                                  |
| ------------------------- | ------------------------------- | ----------------------------------------------------- |
| tick 漂移 x/z             | DEFERRED(待确认) ×1（覆盖两式） | 两个 `nextInt` 是二元运算符操作数，C++ 求值顺序未指定 |
| postProcess 漂移 x/z      | DEFERRED(待确认) ×1（覆盖两式） | 同上                                                  |
| postProcess 越界重置      | DEFERRED(待确认) ×1（覆盖两式） | 同上                                                  |
| tick 的 Stopwatch         | ADAPTED(Perf)                   | 只计时，结果从未读取                                  |
| tick 的 delete mob        | OMIT(MobSpawner)                | GC 接管                                               |
| 文件末尾 tick 注入        | ADAPTED(ESM)（原有）            | `Level.mobSpawnerTick` 注入槽                         |
| 文件末尾 postProcess 注入 | ADAPTED(ESM)（原有）            | `MobSpawnerHooks` 注入槽                              |

本组新增 5 条计数标记：3 条 DEFERRED(待确认) + 1 条 ADAPTED(Perf) + 1 条 OMIT(MobSpawner)。文件内 2 条 ADAPTED(ESM) 为原有。

## 35 条清单要点（MobSpawner）

- 数值分档：float 字面量 / 形参 / 逐步运算用 `f()`；`(int)` 用 `Math.trunc`；整数除法用 `Math.trunc(a / b)`；`Mth::floor` 用 `Math.floor`。`typeMax` 的三段顺序、`xx/yy/zz` 的逐步舍入、`sd` 的加法顺序均逐项核对。
- 随机数：来源（`level.random` / 形参 `random` / static `babyRandom`）、次数（含 `nextInt(1)` 与失败分支）、顺序（getRandomPosWithin 已用测试钉住）逐项核对；被注释代码不消耗随机数。
- 控制流：`goto` 标签、`break` / `continue` 的目标、3 轮 × 4 次游走、越界 while、`count` 累加位置逐项核对。
- 容器：`std::map` 的排序键与去重语义、`insert` 不覆盖。
- 可见性：`bedEnemies` protected（W62b）；其余 public static 与 C++ 一致。
- 初始化：static 局部变量（`_pid`、`babyRandom`）→ 模块级 `statics`，懒初始化与种子一致；`MobSpawnerData` 未初始化字段已说明。
- 被注释代码：tick 的 `//return 0;`、postProcess 的 `//return;`、Java 蜘蛛骑士块、`//LOGI` 均未复制。
- 语言：无 C++ 语法、无 `any` / `@ts-ignore`、无 `declare` 代替 import；方法名无 `$1`。
- 类型接缝：注入槽类型为真实签名（W63），无 `as unknown as`。
- 测试：新增 5 条，未改既有断言，无 `.skip` / `.only`。
- 台账：新增标记全部符合严格正则（行首 `//` + 系统名括号）。

## 二、MobSpawnerHooks.ts（W63，NEW；审核前 18 行 → 审核后 23 行）

### 替代的 C++ 行为与理由

C++ 的 `RandomLevelSource::postProcess` 直接调用 `MobSpawner::postProcessSpawnMobs`（`RandomLevelSource.cpp:507-508`）。TS 里 `RandomLevelSource` 不能值导入 `MobSpawner`：会经 `MobFactory` → 各种生物类形成加载循环（PITFALLS 第 31 条）。因此用一个运行时叶子模块 `MobSpawnerHooks` 存放注入槽，由 `MobSpawner` 模块加载时把函数填进去；`packages/world/src/index.ts:221` 导出 `./level/MobSpawner.js`，保证应用加载时槽会被填上。

### 工作表结论

本文件没有 C++ 对应，工作表 0 行；按“替代的 C++ 行为”逐项核对：

| 检查项   | 结论                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 调用条件 | `RandomLevelSource.ts` 与 `RandomLevelSource.cpp:507` 的 `spawnMobs && !level.isClientSide` 一致（不在本组可改范围，只核对）。 |
| 实参     | `xo + 8, zo + 8, 16, 16, random` 与 C++ 一致。                                                                                 |
| 注入时机 | `MobSpawner.ts` 模块末尾赋值；`@mcpe/world` 的 index 导出该模块，加载顺序有保证。                                              |
| 类型     | 槽参数已是真实类型（`Level` / `Biome` / `Random`），不是 `never`。                                                             |

### 修复 W63 注入槽改用真实类型、直接赋函数引用（行为 + 类型修复）

- 红：`Tests 2 failed | 3 passed (5)` 中的另一条——`expected [Function] to be [Function postProcessSpawnMobs]`：旧接缝在槽里放的是匿名包装函数，不是 `postProcessSpawnMobs` 本身。`TSC_RED=2` 的另一条为测试里的参数类型断言 `TS2322: Type 'true' is not assignable to type 'false'`：槽参数是 `never`，`Level` 不满足。
- 修：`MobSpawnerHooks.ts` 用 `import type` 引入 `Random` / `Biome` / `Level`，声明真实签名的 `postProcessSpawnMobs` 槽（编译后仍是叶子模块，不产生值导入）；`MobSpawner.ts` 改为直接赋 `MobSpawner.postProcessSpawnMobs`，删除 `as unknown as`。
- 绿：`Tests 5 passed (5)`，两个 tsc 退出码均为 0。

### ADAPTED / DEFERRED（本文件）

- 文件头块注释登记 ADAPTED(ESM)（注入槽理由）。块注释不是行首 `//` 计数标记，台账不计，符合现有约定。
- 无 DEFERRED / OMIT。

### 35 条清单要点（MobSpawnerHooks）

- ESM 循环依赖：只用 `import type`，运行时无值导入；注入由模块副作用完成。
- 接缝完整性：条件、实参、调用位置与 C++ 一致；槽的唯一写入点是 `MobSpawner.ts` 模块末尾。
- 类型安全：槽类型是真实函数签名；删除旧包装与 `as unknown as` 后，调用方仍有一处 cast（见“未决问题”）。
- 命名 / 语法：文件名与导出名符合 R10 / ESM 约定；无 C++ 语法、无 `any`。
- 测试：新增 2 条 W63 用例（函数身份 + 参数类型），均已先红后绿。

## 三、统一验证

```bash
( pnpm exec vitest run tests/unit/world/mobspawner-audit.test.ts > /tmp/ms-test.log 2>&1; echo "VITEST=$?"; grep -E "Test Files|Tests " /tmp/ms-test.log; npx tsc -p packages/world --noEmit 2>/tmp/ms-tscw.log; echo "TSC_WORLD=$?"; npx tsc -p tests/tsconfig.json --noEmit 2>/tmp/ms-tsct.log; echo "TSC_TESTS=$?"; npx prettier --check packages/world/src/level/MobSpawner.ts packages/world/src/level/MobSpawnerHooks.ts tests/unit/world/mobspawner-audit.test.ts docs/审核记录/level-mobspawner.md >/tmp/ms-pretty.log 2>&1; echo "PRETTIER=$?" )
```

结果：

```text
VITEST=0
Test Files  1 passed (1)
Tests  5 passed (5)
TSC_WORLD=0
TSC_TESTS=0
PRETTIER=0
```

## 未决问题

- 3 处 `nextInt() - nextInt()` 的求值顺序按项目先例先取从左到右；C++ 未指定，需等能区分顺序的黄金样本或用户确认。
- `RandomLevelSource.ts:563` 调用注入槽时仍有一处 `as unknown as`（不在本组可改范围）；槽本身已是真实类型，后续可去掉。
- `Biome.ts` 的 `MobSpawnerData` 未初始化字段取 0 并标 ADAPTED(Safety)，标记不在本组可改范围；已核对对本文件无行为影响。
