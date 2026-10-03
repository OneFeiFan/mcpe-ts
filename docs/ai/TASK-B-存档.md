# 任务单 B：存档（世界保存与读取）

目标：网页版能新建、保存、读取世界；刷新页面后世界还在；暂停界面的“Quit to title”回到起始菜单，再进入同一个世界。
原则不变：1:1 移植 C++；浏览器差异集中在一个“虚拟文件系统”层，标 ADAPTED(Web)。

**一次只做一个步骤。** 每步结束：`pnpm typecheck && pnpm test` 通过、`pnpm ledger` 条数不升、提交。步骤里写了“黄金样本”的，样本通过才算完成。

---

## B0 设计确认（不写代码，先读）

C++ 用 `FILE*`（fopen/fread/fwrite/fseek/fclose）同步读写磁盘。浏览器只有异步的 IndexedDB / OPFS。采用的方案（已定，照做）：

- **虚拟文件系统 `VirtualFS`**（新文件 `packages/platform/src/fs/VirtualFS.ts`）：内存里一张 `Map<路径, Uint8Array>`，提供**同步**接口；
  启动时（`apps/web/src/main.ts`，在 `app.init` 之前）从 IndexedDB 一次性读入全部文件；每次写入后标记脏，**防抖 200ms** 异步写回 IndexedDB；
  卸载时用 **`pagehide` / `visibilitychange`** 触发一次写回。
- C++ 的文件函数在 TS 里对应一个小的 `CFile` 类：取用方式是 `vfs.open(path, mode) -> CFile | null`（`open` 失败返回 null，好让 `if (file == NULL)` 原样对应成 `if (file === null)`），
  上面有 `read` / `write` / `seek` / `tell` / `close`，语义照 C 标准库。
- 目录：`mkdir`、`exists`、`listDir`、`remove`、`rename` 按路径前缀实现。
- 单元测试里用纯内存的 `VirtualFS`（不接 IndexedDB）。

**B0 的四处修正（B1 实测参考源码后改，前一版是错的）：**

1. **`beforeunload` 里同步写回 IndexedDB 做不到。** IndexedDB 只有异步 API（旧的同步事务模式已被浏览器移除），卸载时发起的事务不保证提交完，Safari 尤其不可靠。→ 改成防抖 200ms + `pagehide`/`visibilitychange`。
2. **文件模式不是 `"rb"/"wb"/"r+b"/"ab"`。** 实测存档代码的实际用法是 `rb`(5 次) / `wb`(2 次) / `r+b`(1 次) / **`w+b`(1 次，RegionFile.cpp:71)**；`ab` **一次都没出现**。漏掉 `w+b` 会让 B3 直接卡住。
3. **`fread`/`fwrite` 返回的是「元素个数」，不是「读取的字节数」。** C 标准库的返回值是完整元素的个数（= 实读字节数 ÷ size）。参考源码靠这个判断成败：
   `logAssert(fread(offsets, sizeof(int), SECTOR_INTS, file), SECTOR_INTS)` —— 比的是 `SECTOR_INTS`，不是 `SECTOR_INTS * 4`。按字节数实现会让 B3 的断言全错。
4. **`IndexedDbBackend` 不能放 `packages/platform/`。** 该包的 tsconfig 是 `lib: ["ESNext"]`，没有 DOM，一引用 `indexedDB` 就类型检查失败；全仓库只有 `client` 和 `apps/web` 有 DOM。→ 放 `apps/web/src/IndexedDbBackend.ts`，platform 里只留纯类型的 `VfsBackend` 接口。

**另外两条实测发现（B1 已实现并写了测试，后续步骤依赖它们）：**

- `TypedArray.prototype.set` 是逐**元素**拷贝，不是逐字节。`new Uint8Array(8).set(new Int32Array([0x04030201]))` 得到 `[1,0,0,…]`。所以 `CFile.read/write` 收 `ArrayBufferView` 并先归一成字节视图；取数组元素地址写 `new Uint8Array(arr.buffer, i * 4, 4)`（等价于 C 的 `&arr[i]`，零拷贝）。
- **目录必须单独持久化**：C++ 会建 `<世界>/players` 这种可能是空的目录，`exists` 要对它成立。只存文件的话刷新后空目录会消失。`VfsBackend` 因此有 `setDirs`。

## B1 VirtualFS 与 CFile（ADAPTED(Web)，非移植）—— 已完成

- 新增：`packages/platform/src/fs/VirtualFS.ts`、`CFile.ts`；`apps/web/src/IndexedDbBackend.ts`（只浏览器用）。
- 单元测试 `tests/unit/platform/vfs.test.ts`（27 条）：读写、追加、`fseek` 越过末尾再写（中间补 0，与 C 一致）、`r+b` 覆盖写、`w+b` 截断、目录列举、重命名（含目录子树）、`fread` 返回元素个数。
- 单元测试 `tests/unit/web/indexeddb-backend.test.ts`（7 条，用 fake-indexeddb）：往返、删除、重命名不留旧 key、空目录活过刷新。
- 验收：`apps/web/src/main.ts` 在 `app.init` 之前 `await vfs.load(new IndexedDbBackend())`，开 200ms 防抖写回、接 `pagehide`/`visibilitychange`，并挂 `window.__vfs`。
- 浏览器场景 `tools/verify/scenarios/default.mjs` 里加了一条真浏览器上的 IndexedDB 写→落盘→读回往返断言（fake-indexeddb 只能证明逻辑，证明不了真 IDB）。

## B2 RakNet::BitStream 的最小子集（ADAPTED(Network)）

- C++ 的存档代码只用到：`BitStream(data, size, copy)`、`Write(...)`、`Read(...)`、`GetData()`、`GetNumberOfBytesUsed()`、`ResetReadPointer()`。
  先用 `python tools/porting/clean.py` 读 `RegionFile.cpp`、`ExternalFileLevelStorage.cpp`，列出每个 `Write/Read` 的参数类型（字节、int、带长度的缓冲区）。
- 新增 `packages/util/src/BitStream.ts`，只实现这些重载（按 RakNet 的字节序：**确认后**写在文件头；拿不准就用黄金样本 B3 来判定）。
- 验收：单元测试覆盖用到的每个重载。

## B3 RegionFile（移植 `world/level/storage/RegionFile.h/.cpp`，216 行）—— 已完成

按 CLAUDE.md「碰 5 个以上文件就拆细」拆成两步执行（原本要动 6 个文件）：

**B3a 移植本体**（提交 `eb176ee`）

- `packages/world/src/level/storage/RegionFile.ts`：`FILE*` → `CFile`；`BitStream` 用 B2 的；
  `int* offsets`/`emptyChunk` → `Int32Array`（能零拷贝直接喂给 `CFile.read/write`）。
- 顺带加了模块级注入点 `setVfs/getVfs`（`packages/platform/src/fs/VirtualFS.ts`）—— 对应 C++ 里
  fopen 是全局函数。B5/B6 都从这里取实例，做法照 `MouseHandler.platformHooks`。
- 修正任务单原文一处：**`sectorFree` 全程只用了 `find` 和 `operator[]`，从没被遍历**，
  所以「注意遍历顺序要按键排序」这条在这份代码里用不上。

**B3b 黄金样本 G14-1**（提交见下）

- `tools/golden/harness_regionfile.cpp` + `tools/golden/stub/{raknet/BitStream.h,platform/log.h}`。
  做法照 build.sh 里 BiomeSource 那一段：**只换这两个头文件，RegionFile.h/.cpp 照用参考源码**。
  替身只提供 RegionFile 真正用到的成员（构造/GetData/GetNumberOfBytesUsed），理由写在替身文件头。
- 场景：新建文件 + 追加扇区、等长原地覆写、变长后重新分配扇区、**复用被释放的扇区**。
- 验收：G14-1 通过 ✅。夹具 `fixtures/golden/regionfile.json`（24576 字节文件 + 4 次读回）。

**移植时原样保留了 5 处 C++ 怪癖**（都在代码注释里标了，不要"顺手修好"）：
`open()` 不清 `sectorFree`；`readChunk` 里 `if (length <= 0) { }` 是个漏了 return 的空块；
`sectorsNeeded = size / SECTOR_BYTES + 1` 的整数除法；上限判断写 `> 256` 但字段只有 8 位；
`write()` 不补齐到扇区边界（扇区尾部留残留字节，逐字节比对依赖它）。

## B4 LevelData 的读写 —— 拆成四步执行

**开工前实测发现，这一步比原描述大得多：**

1. **`StorageVersion = 3`，不是 1** —— 所以 `writeLevelData` 默认走 NBT 分支
   （`createTag()` + `NbtIo::write`），**B2 那套 `v1_write`/`v1_read` 在默认值下根本不会被用到**。
   （好消息：`NbtIo` 在 TS 里已经移植好了。）
2. **TS 的 `LevelData` 有 11 处 `OMIT(NBT)` 要补**：`createTag`×2、`getTagData`、`setTagData`、
   `setPlayerTag`、`getLoadedPlayerTag`、`setLoadedPlayerTag`、`LevelData(CompoundTag*)`、
   `v1_write`、`v1_read`、`setLoadedPlayerTo`。
3. **`RakDataInput`/`RakDataOutput` 适配层 TS 里没有**（`src/util/RakDataIO.h`），要先做。
4. **`readPlayerData` 是裸结构体转储**（`fread(&dest.playerData, 1, sizeof(dest.playerData), fp)`），
   字节布局取决于 C++ 字段顺序 + **编译器对齐填充**，是「照抄 ABI」而不是「照抄逻辑」。

按 CLAUDE.md 的拆分规则（超 5 个文件 / 300 行就先拆），分成四步，风险从低到高：

| 步骤    | 内容                                                                    | 风险                                                  |
| ------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| **B4a** | `packages/util/src/RakDataIO.ts`：`RakDataInput`/`RakDataOutput` + 单测 | 低                                                    |
| **B4b** | `LevelData` 补齐 11 处 OMIT（含 `v1_write`/`v1_read`）                  | 低                                                    |
| **B4c** | `readLevelData`/`writeLevelData` + **黄金样本 G14-2**（level.dat 字节） | 中（判定 B2 里 `long` 宽度的判断）                    |
| **B4d** | `readPlayerData`（裸结构体转储）                                        | **高**：先写 harness 量出 `sizeof` 与各字段偏移再动手 |

## B4 原描述（保留备查）

- 先查 `packages/world/src/level/storage/LevelData.ts` 已有哪些函数（`getTagData`/`setTagData`、`createTag` 等），补齐 C++ 里还没移植的；
  再移植 `ExternalFileLevelStorage` 里的静态函数 `readLevelData`、`writeLevelData`、`readPlayerData`（level.dat 的文件头 + NBT）。
- **黄金样本 G14-2**：固定 LevelData（种子、出生点、时间、游戏模式、世界名）写出的 level.dat 字节一致，读回来字段一致。

## B5 ExternalFileLevelStorage（702 行原始 / 485 行网页版，分四步）

**开工前实测发现三件事，改动了原拆分：**

1. **`FolderMethods` 被提前到 B5a-1。** 原计划它在 B6，但 B5a 一开头就要用：
   构造函数要 `createFolderIfNotExists` 建世界目录和 `players/` 子目录，`saveLevelData` 要
   `exists`/`remove`/`rename`。而且 B4c 已经因为同样原因把 `getRemainingFileSize` **临时**塞进了
   `ExternalFileLevelStorage`（注释写着"B6 时再挪过去"）—— 再拖下去这处临时代码会有三份。
2. **`savePlayer`/`loadPlayer` 能真移植，不用标 DEFERRED。** 它们调 `player.saveWithoutId(tag)` 与
   `player.load(tag)`；`Player` **不覆盖**这两个，只覆盖 `readAdditionalSaveData`/`addAdditonalSaveData`
   —— 这四个在 TS 里都已经有且都没有 DEFERRED。
3. **它们用的是 `std::ofstream`/`ifstream`，不是 `FILE*`**（B1 造的 `CFile` 只对应 `FILE*`），
   需要单独一层 ADAPTED(Web) 映射。

| 步骤      | 内容                                                                                                                                                                                          | 状态              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **B5a-1** | `FolderMethods`（7 个函数，其中 3 个 POSIX 裸原语标 `OMIT(Web)`）+ `getRemainingFileSize` 归位 + 补上 `LevelData.createTagForPlayers` 里那处 `DEFERRED(Player)`                               | 完成（`e627cc5`） |
| **B5a-2** | 构造函数、析构、`prepareLevel`、`saveLevelData`（成员 + 静态）、`savePlayer`/`loadPlayer`（各两个重载）+ **黄金样本 G14-4**（跑一遍完整 `saveLevelData`，记录目录里最终留下的文件与各自字节） | 完成（`0b96738`） |
| **B5b**   | 区块 `load`/`save`（LevelChunk 序列化：方块、数据、光照数组）、`saveAll`、`saveGame`、`tick` 与 `savePendingUnsavedChunks`（未保存区块列表的时间戳用 `getTimeMs`）。**黄金样本 G14-5**        | 待办              |
| **B5c**   | `loadEntities`/`saveEntities`（实体文件，RegionFile 的第二个实例）。只保存已移植的实体（掉落物）；其余实体类型的创建在 EntityFactory 里标 DEFERRED                                            | 待办              |

样本编号说明：G14-3 已被 B4d 的 `player.dat` 用掉，所以 B5b 的区块样本是 **G14-5**。

- 验收：四个样本通过；浏览器场景 "放一个方块 → 调用 `app.level.saveGame()` → 新建 Level 读同一个世界 → 方块还在"。

## B6 ExternalFileLevelStorageSource（193 行）

- 世界列表（`getLevelList`，读每个世界的 level.dat 生成 LevelSummary，按 lastPlayed 排序）、`selectLevel`、`deleteLevel`、`renameLevel`、`isNewLevelIdAcceptable`。
- `FolderMethods` 已在 B5a-1 做完，本步不再包含。
- 路径：网页版的根目录固定为 `/games/com.mojang/minecraftWorlds/`（照 C++ 的 externalPath 结构，ADAPTED(Web)）。

## B7 接进 Minecraft

- `Minecraft.selectLevel`、`leaveGame`、`getLevelSource`、`setScreen` 里的 `level->saveGame()`；`NinecraftApp` 用 `ExternalFileLevelStorageSource`。
- C++ 的 `selectLevel` 创建的是 `ServerLevel`。先查 TS 里有没有；没有就移植（它主要是网络相关，网络部分 DEFERRED）。
- demo 入口：保留 `startDemoWorld` 作为“没有任何存档时自动新建一个平坦世界”的 ADAPTED(Demo)，有存档时直接进入最近的世界。

## B8 界面：起始菜单、选择世界、新建世界（触屏风格，菜单风格 0）

- 读 `ScreenChooser.cpp`：菜单风格 0 用 `touch/TouchStartMenuScreen`、`touch/TouchSelectWorldScreen`。依赖可能包括 `RolledSelectionListH`、`SimpleChooseLevelScreen`、`ProgressScreen`、`TextBox`。逐个列出，按依赖顺序一个一个移植（每个都是单独的步骤）。
- 暂停界面的 “Quit to title” 去掉 DEFERRED，接 `leaveGame()`。
- 需要的新纹理全部加进 `apps/web/src/assets.ts`。
- 浏览器场景 `tools/verify/scenarios/storage.mjs`：新建世界 → 放方块 → 回到标题 → 重新进入 → 方块还在；**刷新页面**后再进入，方块还在。

## B9 选项文件（OptionsFile）

- `Options.ts` 里 4 处 `DEFERRED(Storage)`：选项读写 `options.txt`，走 VirtualFS。

---

### 每一步提交前的自检

- [ ] PITFALLS.md 逐条过了一遍（特别是 A 节数值、D 节容器顺序、E 节同步/异步）
- [ ] `divs.py`、`shadow.py` 跑过
- [ ] 新增的 DEFERRED 都写了系统名和 C++ 原句
- [ ] `pnpm typecheck`、`pnpm test` 通过；需要的黄金样本通过
- [ ] 有画面的：跑了场景，打开截图看过
