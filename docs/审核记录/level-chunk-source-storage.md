# ChunkSource / ChunkStorage / MemoryChunkStorage（src/world/level/chunk/ChunkSource.h、src/world/level/chunk/storage/ChunkStorage.h、src/world/level/chunk/storage/MemoryChunkStorage.h ↔ packages/world/src/level/chunk/ChunkSource.ts、packages/world/src/level/chunk/storage/ChunkStorage.ts、packages/world/src/level/chunk/storage/MemoryChunkStorage.ts）

第 2 批（world/level/chunk）。3 个文件工作表共 8 行全部有结论（另加 2 个析构函数，共 10 项）。新增编号 **W58–W60**。
新增 2 处 `OMIT`（两个空虚析构函数原先漏登记）与 1 处 `ADAPTED(Cpp)`（`saveEntities` 的空指针形参）；没有发现行为差异，因此没有“已修”编号项，也没有运行时的先红后绿。

三个类都只有 `.h`（参考树里没有对应的 `.cpp`），代码量都很小；没有 float、整数除法、随机数、容器、字符串格式化，也不需要黄金样本。

## ChunkSource（src/world/level/chunk/ChunkSource.h ↔ packages/world/src/level/chunk/ChunkSource.ts）

C++ 侧要点：

- `ChunkSource.h` 只有 `public:` 一段。成员 `bool isChunkCache` 由构造函数初始化列表设为 `false`。
- 6 个纯虚函数 `hasChunk` / `getChunk` / `create` / `postProcess` / `tick` / `shouldSave`，加上 `getMobsAt`、`gatherStats` 共 8 个纯虚声明；`saveAll(bool onlyUnsaved)` 有空的默认实现；析构函数 `virtual ~ChunkSource(){}` 为空。
- 第 31 行是注释掉的 `//virtual bool save(bool force, ProgressListener* progressListener) = 0;`，第 9 行的 `ProgressListener` 前向声明只为它服务；两者都不移植（被注释代码不复制）。
- 没有构造函数体、没有虚调用、没有初始化顺序依赖。

工作表结论：

| #   | C++ 函数                                        | C++ 位置            | TS 方法                                          | TS 行 | 相似度 | 结论                                                                                      |
| --- | ----------------------------------------------- | ------------------- | ------------------------------------------------ | ----- | ------ | ----------------------------------------------------------------------------------------- |
| 1   | `ChunkSource()`（初始化 `isChunkCache(false)`） | ChunkSource.h:17-19 | 隐式 `constructor` + 字段 `isChunkCache = false` | 8     | —      | 一致：构造函数只做这一项初始化；TS 字段初始化器在 `super()` 后执行，语义相同；字段 public |
| 2   | `saveAll(bool onlyUnsaved)`                     | ChunkSource.h:36    | `saveAll`                                        | 19    | 1.00   | 一致：函数体为空，形参未使用；TS 用 `_onlyUnsaved` 保留签名                               |
| 3   | `~ChunkSource()`                                | ChunkSource.h:21    | **（无）**                                       | —     | —      | OMIT：空虚析构函数，R3 不移植；审核前漏登记，本次补 `// OMIT(ChunkSource)`                |

工作表把 `isChunkCache(false)` 单独列成一行，它实际是构造函数的成员初始化列表，不是独立函数；对应 TS 的字段初始化器（第 1 行已合并说明）。

工作表未单列的 8 个纯虚函数：TS 全部写成 `abstract` 声明，形参与返回类型逐项核对一致（`LevelChunk*` → `LevelChunk`，`std::string` → `string`，`Biome::MobList` → `Biome.MobList`）。C++ 第 31 行注释掉的 `save` 没有被复制；测试用 `Object.getOwnPropertyNames(ChunkSource.prototype)` 钉住原型上只有 `constructor` 和 `saveAll`。

## ChunkStorage（src/world/level/chunk/storage/ChunkStorage.h ↔ packages/world/src/level/chunk/storage/ChunkStorage.ts）

C++ 侧要点：

- 头文件注明 `/*was-interface*/`，类里所有函数都有默认实现；析构函数 `virtual ~ChunkStorage() {}` 为空。
- `load` 默认返回 `NULL`；`save` / `saveEntities` / `tick` / `flush` 空函数体；`saveAll(Level*, std::vector<LevelChunk*>&)` 用 `unsigned int i` 按顺序对每个元素调用虚函数 `save`。
- 第 9-11 行有 `@todo` 注释（说 load/save 抛异常、需要替换），只是说明，不复制。
- `ExternalFileLevelStorage` 同时实现 `ChunkStorage`；在 C++ 里 `saveEntities` 的形参是 `LevelChunk*`，它的 `tick/saveGame` 会传 `NULL`。

工作表结论：

| #   | C++ 函数                                                       | C++ 位置             | TS 方法        | TS 行 | 相似度 | 结论                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------- | -------------------- | -------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `load(Level* level, int x, int z)`                             | ChunkStorage.h:17-19 | `load`         | 8     | 1.00   | 一致：默认返回 `NULL` → `null`，返回类型 `LevelChunk \| null`                                                                                                                                                                |
| 2   | `save(Level* level, LevelChunk* levelChunk)`                   | ChunkStorage.h:20    | `save`         | 12    | 1.00   | 一致：空函数体                                                                                                                                                                                                               |
| 3   | `saveEntities(Level* level, LevelChunk* levelChunk)`           | ChunkStorage.h:21    | `saveEntities` | 16    | 1.00   | ADAPTED(Cpp)：C++ 形参是指针，`ExternalFileLevelStorage` 传 NULL；TS 写 `LevelChunk \| null`。函数体为空，运行时行为相同                                                                                                     |
| 4   | `saveAll(Level* level, std::vector<LevelChunk*>& levelChunks)` | ChunkStorage.h:22-24 | `saveAll`      | 18    | 0.93   | 一致：按 vector 顺序逐个调用虚函数 `save`；TS 的 `this.save` 同样是动态派发；`unsigned int i` → `number`，数组长度不可能超过 2³²-1，回绕差异不可达；`levelChunks[i]!` 是 `noUncheckedIndexedAccess` 下的下标断言，不改变行为 |
| 5   | `tick()`                                                       | ChunkStorage.h:26    | `tick`         | 22    | 1.00   | 一致：空函数体                                                                                                                                                                                                               |
| 6   | `flush()`                                                      | ChunkStorage.h:27    | `flush`        | 24    | 1.00   | 一致：空函数体                                                                                                                                                                                                               |
| 7   | `~ChunkStorage()`                                              | ChunkStorage.h:16    | **（无）**     | —     | —      | OMIT：空虚析构函数，R3 不移植；审核前漏登记，本次补 `// OMIT(ChunkStorage)`                                                                                                                                                  |

`saveAll` 的 `std::vector<LevelChunk*>&` 是非 const 引用，但函数体只读；TS 的数组按引用传递，语义相同，不需要额外复制。

## MemoryChunkStorage（src/world/level/chunk/storage/MemoryChunkStorage.h ↔ packages/world/src/level/chunk/storage/MemoryChunkStorage.ts）

- C++ 全文只有 `class MemoryChunkStorage: public ChunkStorage {};`，类体为空，没有自己的成员、函数或析构函数声明。
- TS 为 `export class MemoryChunkStorage extends ChunkStorage {}`，同样为空；6 个默认实现全部继承。
- 工作表 0 行（没有可列的函数）；C++ 有、TS 没有的方法：无；TS 有、C++ 没有的方法：无。结论：一致。
- 测试钉住 `Object.getOwnPropertyNames(MemoryChunkStorage.prototype)` 只有 `constructor`，并验证 `load` 返回 `null`、四个空操作、`saveAll` 仍派发到子类重写的 `save`。

## 标记与修复

本轮没有发现行为差异，因此没有“已修（W编号）”项，也没有运行时的先红后绿。三处改动都是登记/类型说明：

1. **W58 `ChunkSource`**：补 `// OMIT(ChunkSource): ~ChunkSource() {}  ChunkSource.h:21`。空虚析构函数按 R3 不移植，原先漏登记。
2. **W59 `ChunkStorage`**：补 `// OMIT(ChunkStorage): virtual ~ChunkStorage() {}  ChunkStorage.h:16`，理由同上。
3. **W59 `ChunkStorage::saveEntities`**：原注释已说明“参数是指针、调用方传 NULL”，但没有台账标记；本次改成 `// ADAPTED(Cpp)` 并写清 C++ 形参与 TS 的 `LevelChunk | null` 对应关系。

两个文件的头注释都补了“部分语句省略，见文件内的 OMIT 标记”。

### ADAPTED(Cpp) 的类型级红绿

`saveEntities` 的 `| null` 不是装饰：把形参临时收窄回 `LevelChunk` 后，`npx tsc -p tests/tsconfig.json --noEmit` 退出码 **2**，测试文件里三处 `saveEntities(..., null)` 报
`error TS2345: Argument of type 'null' is not assignable to parameter of type 'LevelChunk'`；恢复 `LevelChunk | null` 后退出码 **0**。这同时说明 C++ 的 `LevelChunk*` 空指针实参在 TS 里必须由可空类型表达。

## 35 条清单核对要点

- **第 1–2 条**：没有 float/int/short/char/unsigned 字段（只有 `isChunkCache: boolean`）；形参全是 `int` / 指针 / 引用，没有 float 形参。
- **第 3–7 条**：没有浮点运算、复合赋值、常量、int/float 混算；不需要 `f()`。
- **第 8 条**：没有除法、取模、移位；`saveAll` 只有 `i++` 与 `< length`，与 C++ 的 `unsigned int i` 在可达范围内一致。
- **第 9–12 条**：没有数学函数、NaN/±0、long、printf/字符串数字格式。
- **第 13–18 条**：8 个纯虚函数 → `abstract`；`saveAll` 里的 `this.save` 是虚调用，与 C++ 相同；没有构造函数里的虚调用、默认参数、重载、字段/函数遮蔽、`super::` 调用。
- **第 19 条**：`ChunkSource` 只有 `isChunkCache` 一个成员，字段初始化器与 C++ 构造初始化列表等价，无依赖。
- **第 20 条**：三个类在 C++ 里都是 `public`；TS 未收窄。`saveEntities` 的可空形参见 ADAPTED(Cpp)。
- **第 21–25 条**：没有按值结构、map/set、erase、排序、哈希容器；`saveAll` 的数组遍历顺序与 vector 相同。
- **第 26–29 条**：没有随机数；注释掉的 `save` 声明里也没有随机数；没有空的 `if` 分支。
- **第 30–33 条**：没有非 ASCII 字符串操作、char 转换、bool↔int 转换或日志。
- **第 34 条**：逐条确认原有标记；本组新增 2 处 OMIT、1 处 ADAPTED(Cpp)，没有 DEFERRED(待确认) 或 OMIT 失效项。C++ 注释掉的 `save` 没有复制。
- **第 35 条**：文件头与代码一致（`was-interface`、默认实现、省略说明）；`ExternalFileLevelStorage` 的 NULL 调用与可空形参对应说明已在代码旁更新。

## 验证

- `pnpm exec vitest run tests/unit/world/chunk-source-storage-audit.test.ts`：退出码 0，`Test Files 1 passed`，`Tests 8 passed`（W58 3 条、W59 3 条、W60 2 条）。
- `npx tsc -p packages/world --noEmit`：退出码 0。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0（临时收窄形参的红测见上，退出码 2）。
- `npx prettier --check` 五个文件：退出码 0。
- 台账：本组新增 `OMIT(ChunkSource)` 1、`OMIT(ChunkStorage)` 1、`ADAPTED(Cpp)` 1（`pnpm ledger Cpp` 中本组条目见 `ChunkStorage.ts:14`）；没有改动其它文件。
