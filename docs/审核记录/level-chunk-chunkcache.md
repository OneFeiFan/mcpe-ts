# ChunkCache（src/world/level/chunk/ChunkCache.h ↔ packages/world/src/level/chunk/ChunkCache.ts）

第 2 批（world/level/chunk）。工作表 14 行全部有结论。C++ `.h` 270 行 + `.cpp` 0 行（该文件没有 .cpp，
所有函数都内联在头文件里），TS 审核前 260 行、审核后 261 行。新增编号 **W55**。

C++ 侧要点：

- 纯头文件类：`ChunkCache.h` 270 行，没有对应的 `.cpp`，所有成员函数都是类内定义。
- `LevelConstants::CHUNK_CACHE_WIDTH` 在 `LevelConstants.cpp:4` 是 `16`（可被专用服务器/网络包改写的
  可变 `static int`）；TS 每次调用都读 `LevelConstants.CHUNK_CACHE_WIDTH`，与 C++ 一致。
  `x & (W - 1)` 依赖 W 是 2 的幂，两边相同。
- 私有 `static const int MAX_SAVES = 2;`（h:14）只被注释掉的 `save(bool, ProgressListener*)` 引用；
  TS 保留这个常量。
- 可见性：`fits` / `hasChunk` / `create` / `getChunk` / `getMobsAt` / `postProcess` / `tick` /
  `shouldSave` / `gatherStats` / `saveAll` 与 `xLast`、`zLast` 在 `public` 段；`load` /
  `saveEntities` / `save` 和 `emptyChunk` / `source` / `storage` / `chunks` / `level` / `last` 在
  `private` 段。TS 逐项一致。
- 初始化列表：`xLast(-999999999), zLast(-999999999), last(NULL), level, storage, source`；
  `emptyChunk` 与 `chunks` 在函数体里创建（`new EmptyLevelChunk(level_, NULL, 0, 0)`、
  `new LevelChunk*[W*W]` + `memset`）。字段之间没有依赖，实际初始化顺序不影响结果。
- 没有 float / double 字段或形参、没有整数除法、没有随机数、没有容器排序或哈希遍历。
- 被注释掉的代码（一律不复制）：h:13 注释掉的宽度常量、h:25 用 `emptyChunkBlocks` 的构造方式、
  h:69-70 / h:133-134 的 Stopwatch、h:76 的另一种 fits 条件、h:96 的 `return emptyChunk`、
  h:116-117 两条整块 updateLight、h:155-187 的 `save(bool, ProgressListener*)` 整个函数、
  h:199 的 `return "ChunkCache: 1024"`、h:224 / h:230-233 / h:238-242 / h:247-252 的 try/catch、
  h:259 的 `emptyChunkBlocks` 成员。

## 工作表结论

| #   | C++ 函数                                       | C++ 位置 | TS 方法        | TS 行 | 相似度 | 结论                                                                                                                               |
| --- | ---------------------------------------------- | -------- | -------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `source(source_)`                              | h:22     | `constructor`  | 26    | —      | 一致：初始化列表项，TS 第 34 行 `this.source = source_`；字段之间无依赖                                                            |
| 2   | `fits(int x, int z)`                           | h:47     | `fits`         | 49    | 0.73   | 一致：四项边界与短路顺序相同；C++ 在 public 段                                                                                     |
| 3   | `hasChunk(int x, int z)`                       | h:51     | `hasChunk`     | 54    | 0.81   | 一致 + 怪癖保留：范围外恒 `true`；槽里是 `emptyChunk` 时不再比对 `isAt`；先查 `last` 缓存                                          |
| 4   | `create(int x, int z)`                         | h:64     | `create`       | 69    | 1.00   | 一致：直接转 `getChunk`                                                                                                            |
| 5   | `getChunk(int x, int z)`                       | h:68     | `getChunk`     | 73    | 0.93   | 一致 + 怪癖保留：缓存检查在 `fits` 之前；邻块条件里重复的 `hasChunk(...)` 原样保留；`source->getChunk` 返回 null 时同 C++ 一样崩溃 |
| 6   | `getMobsAt(const MobCategory&, int, int, int)` | h:139    | `getMobsAt`    | 185   | 1.00   | 一致：纯转发；source 为空时 C++ 解引用空指针、TS 用 `!` 后同样抛错                                                                 |
| 7   | `postProcess(ChunkSource*, int x, int z)`      | h:143    | `postProcess`  | 190   | 0.95   | 一致 + 怪癖保留：`clearUpdateMap()` 在 `source != NULL` 分支内；范围外直接返回                                                     |
| 8   | `tick()`                                       | h:189    | `tick`         | 205   | 0.95   | 一致：先 `storage->tick()` 再 `source->tick()`，后者结果作为返回值                                                                 |
| 9   | `shouldSave()`                                 | h:194    | `shouldSave`   | 210   | 1.00   | 一致：恒 `true`                                                                                                                    |
| 10  | `gatherStats()`                                | h:198    | `gatherStats`  | 214   | 0.41   | 一致：`"ChunkCache: " + 256`，与 `stringstream` 输出同串                                                                           |
| 11  | `saveAll(bool onlyUnsaved)`                    | h:205    | `saveAll`      | 220   | 0.79   | 一致：z 外 x 内；局部变量 `chunks` 遮蔽成员，TS 改名 `chunkList` 并注释；`!onlyUnsaved \|\|` 短路保持                              |
| 12  | `load(int x, int z)`                           | h:218    | `load`         | 238   | 0.89   | 一致：先查 storage 为 null、再查边界；越界返回 `emptyChunk` 且不读 storage；命中时设 `lastSaveTime`                                |
| 13  | `saveEntities(LevelChunk*)`                    | h:236    | `saveEntities` | 251   | 1.00   | 一致：storage 为 null 直接返回，否则转发                                                                                           |
| 14  | `save(LevelChunk*)`                            | h:245    | `save`         | 256   | 1.00   | 一致：先 storage 为 null，再写 `lastSaveTime`，再 `storage->save`                                                                  |

C++ 有、TS 没有的方法：无（`source(source_)` 对应构造函数）。TS 有、C++ 没有的方法：无。
构造函数逐行核对一致；析构函数见 W55a。

## 修复（W55，文档/台账，无行为变化）

**W55a 补 `~ChunkCache` 的 OMIT 标记（清单第 34 条 / R3）。**
C++ h:33-45 的析构函数会 `delete source`、`delete emptyChunk`，并对每个 `chunks[i]` 先
`deleteBlockData()` 再 `delete`；TS 原先只有两行说明文字，没有台账标记。改为
`// OMIT(ChunkCache): ~ChunkCache()  src/world/level/chunk/ChunkCache.h:33 —— …（R3）`。

**W55b 修正两处与代码不符的注释（清单第 35 条）。**

- 原析构说明写着“请显式调用 storage 的关闭方法”，但 `ChunkStorage.ts:8-25` 只有
  `load / save / saveEntities / saveAll / tick / flush`，没有“关闭方法”，属于不存在的 API。
- 原 `// C++ 里 save 被注释掉` 容易被读成私有的 `save(LevelChunk*)` 未生效；实际被注释的是
  h:155-187 的 `bool save(bool force, ProgressListener*)`，私有 `save` 在 `getChunk` 里仍然调用。
  改为写明签名、行号与“被注释的代码不复制”。

红绿证据（这是台账/注释修正，没有可执行的运行时红绿）：

- 红：`git show HEAD:packages/world/src/level/chunk/ChunkCache.ts` 里
  `OMIT|DEFERRED|ADAPTED|FORWARD-DECL` 标记数为 **0**；旧注释提到的“storage 的关闭方法”在
  `ChunkStorage` 中不存在。
- 绿：工作区里 `rg -n "OMIT\(ChunkCache\)"` 命中 **1**；`node tools/ledger.mjs` 本文件计 1 条
  `OMIT(ChunkCache)`。全仓台账 184 → 187 条，另外 2 条来自同一工作区并行审核的
  `PathNavigation.ts`（新增 `ADAPTED(Cpp)` + `OMIT(Cpp)`），不属于本文件。
- 行为未变：本次只改注释与标记，函数体一字未动；新增的 7 条测试全部通过。

## ADAPTED / DEFERRED

本文件没有 ADAPTED / DEFERRED 标记。`source!`、`chunks[slot]!` 等非空断言不改变运行时行为：
C++ 在这些位置解引用空指针会崩溃，TS 抛 TypeError，属于不复刻未定义行为（第 3 条）。

## 35 条清单核对要点

- 第 1–2 条：本文件没有 float / double 字段与形参；坐标、槽位、`lastSaveTime` 全是整数。
- 第 3–7 条：没有浮点运算；`xs = x & (W - 1)` 与 `zs * W` 都在 `fits` 保证的 0..15 范围内，
  不会溢出；`x * 16 + cx` 最大 255，整数精确。
- 第 8 条：没有整数除法（`divs.py` 无输出）；`&` 依赖 W=16 是 2 的幂，与 C++ 相同。
- 第 9–12 条：没有数学函数、long / long long、浮点格式化；`gatherStats` 只拼整数，十进制表示一致。
- 第 13–18 条：C++ 侧 `ChunkSource` 的虚函数在 TS 都用 `override`；`fits` 非虚且基类没有同名函数；
  `load` / `save` / `saveEntities` 在 C++ 是 private 非虚函数，TS 也是 private，没有子类遮蔽。
  无重载、默认参数、`super::` 调用或字段遮蔽（`saveAll` 的局部 `chunks` 改名见第 11 行）。
- 第 19 条：初始化列表的值与顺序一致；`emptyChunk` / `chunks` 在函数体按 C++ 顺序创建，
  字段间无依赖。
- 第 20 条：public / private 逐项与 C++ 相同（见“C++ 侧要点”）；`xLast`、`zLast` 保持 public。
- 第 21–25 条：没有按值对象、map/set、vector erase、排序或哈希容器；`saveAll` 的
  `push_back` 顺序由 z 外 x 内的双重循环决定，TS 的 `Array.push` 顺序相同。
- 第 26–29 条：本文件不使用随机数。`!onlyUnsaved || chunk.shouldSave(false)` 的短路与 C++
  相同（`onlyUnsaved == false` 时一次都不调用 `shouldSave`）；`getChunk` / `postProcess` 的
  `&&` 条件按 C++ 书写顺序求值；被注释的代码里没有随机数调用。
- 第 30–33 条：字符串都是 ASCII；`gatherStats` 与 `LOGI("Chunks allocated.")` 文字一致；
  无 char / bool 数值转换（只有 bool 返回值）。
- 第 34 条：新增唯一一条 `OMIT(ChunkCache)`（析构）；其余被注释代码不是可执行语句，不标 OMIT。
- 第 35 条：文件头写明“1:1 移植自 .h”（正确，没有 .cpp）；按 W55b 修正了两处注释。

## 验证

- `pnpm exec vitest run tests/unit/world/chunkcache-audit.test.ts`：1 个文件、7/7 通过。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 2；3 条错误全部来自同一工作区并行审核的文件
  （`ai-goal-target-audit.test.ts` 的 `DoorInteractGoal.doorOpenDirX/Z` 可见性、`levelchunk-audit.test.ts`
  的静态断言），错误清单里没有 `chunkcache-audit.test.ts` 或本文件的条目。
- `npx prettier --check packages/world/src/level/chunk/ChunkCache.ts tests/unit/world/chunkcache-audit.test.ts docs/审核记录/level-chunk-chunkcache.md`：通过。
- `node tools/ledger.mjs`：本文件 `OMIT(ChunkCache)` 0 → 1；全仓 184 → 187（另 2 条属并行审核）。
- `python tools/porting/divs.py`：无除法；`python tools/porting/shadow.py`：无输出（退出码 0）。
