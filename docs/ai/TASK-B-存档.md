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
| **B5b-1** | `LevelConverters`（两个转换函数）+ 区块 `save`/`load`（LevelChunk 序列化：方块、数据、光照数组）+ **黄金样本 G14-5**                                                                          | 完成（`f5d1ed0`） |
| **B5b-2** | `tick`、`savePendingUnsavedChunks`（未保存区块列表的时间戳用 `getTimeMs`）、`saveGame`、`saveAll`；顺手把 `createChunkStorage` 返回 `this` 时缺的 ChunkStorage 那一半补上                     | 完成（`2977749`） |
| **B5c-1** | `saveEntities`（实体文件写入）+ 补上 tick / saveGame / createChunkStorage 三处 `DEFERRED(Entity)` + **黄金样本 G14-6**（entities.dat 的字节）                                                 | 完成（`a49af5a`） |
| **B5c-2** | `EntityFactory`（新文件：`CreateEntity` + `loadEntity`，`MobFactory::CreateMob` 标 OMIT）+ `loadEntities` + G14-6 补上"读回来"那半                                                            | 完成              |

**B5c-2 的三条实测发现：**

1. **`CreateEntity` 那张 switch 只有掉落物是真的。** TS 里 `FallingTile` / `TripodCamera` 只是
   FORWARD-DECL（空接口），`PrimedTnt` / `Arrow` / `ThrownEgg` / `Snowball` / `Painting` 连文件都没有。
   所以六个 case 原地留 `DEFERRED(Entity)`，`id < 64` 那条（生物）整条走不了 —— `MobFactory::CreateMob`
   标 `OMIT(Entity)`。台账 236 → 244。
2. **`loadEntities` 不检查 `NbtIo::read` 的返回值**，而**同一个文件里的 `readLevelData` 和 `loadPlayer`
   都写了 `if (tag)`** —— 参考源码自己的不一致。照抄（标签读不出来时 C++ 段错误、TS 抛 TypeError）。
3. **`getChunkAt` 从不会返回 NULL**（ChunkCache 会当场把区块生成出来），所以 "Couldn't find chunk"
   那条错误分支是死代码。照抄。

**harness 里踩的两个坑（都不是实现问题）：**

1. **`harness_chunk` 那个两参 `LevelChunk(Level*, x, z)` 不分配方块数组**，任何 `getTile` 都是空指针
   取值。harness_chunk 里没暴露是因为它从没读过区块里的方块；这里 `loadEntities` 会走
   `addTileEntity → setTileEntity → SignTileEntity::setLevelAndPos → Level::getTile`，第一次跑就段错误。
   （定位用的是 ASan，`tools/golden` 里没装 gdb：把 harness 单独用 `-fsanitize=address -g` 重编、
   跟 `$LVL/*.o` 和 `ent.stubs.oo` 一起链接。）
2. **方块实体得自己埋，而且不能走 `chunk->setTile`**。`setTile` 末尾会调 `Tile::tiles[t]->onPlace(...)`，
   而 `SignTile::onPlace` 正是创建方块实体挂上去的地方 —— 走它的话等 `loadEntities` 跑到时那个坐标
   已经有方块实体了，"Adding TileEntity" 那条正常分支永远走不到（实测两次都走 "Already have"）。
   改成往方块数组里直接写值，绕开 onPlace —— 这也正是"区块刚从磁盘读出来"的样子。

**B5c 开工前实测，任务单原文有两处错（已改）：**

1. **`entities.dat` 不是 RegionFile。** 原文写"实体文件，RegionFile 的第二个实例" —— 但 `entitiesFile`
   这个 `RegionFile*` 字段在 C++ 里**声明了却从没被用过**（全文件只有两处：`ExternalFileLevelStorage.h:90`
   的声明、`.cpp:86` 的 `entitiesFile(NULL)`）。`saveEntities`/`loadEntities` 走的是裸 `fopen`：

   ```
   "ENT\0"   4 字节
   int32     version    ← 写死 1；读出来只用于打日志
   int32     numBytes   ← 后面 NBT 的字节数
   byte[]    NbtIo::write 的产物（Entities / TileEntities 两个 ListTag）
   ```

2. **`ChunkVersion_Entity = 2` 是死的。** 原文说它"到 B5c 的 loadEntities 才用到" —— 实际它只出现在
   一行**被注释掉的**代码里（`.cpp:469` 的 `//if (loadedStorageVersion >= ChunkVersion_Entity) {`）。
   照原样留一条注释，不建常量。

**为什么拆成 B5c-1 / B5c-2**（CLAUDE.md：超 300 行或碰 5 个以上文件就拆）：原文一步要碰 6 个文件、
约 420 行。`saveEntities` 不依赖 `EntityFactory`（只有 `loadEntities` 依赖），所以按"存 / 读"拆，
每步的夹具只记这一步真正移植的那半。用户已确认（2026-10-03）。

样本编号说明：G14-3 已被 B4d 的 `player.dat` 用掉，区块样本是 **G14-5**，实体文件是 **G14-6**。
B5b-2 那半（tick / savePendingUnsavedChunks / saveGame / saveAll 要真 Level + 区块缓存）不再加样本，用单元测试盖。

- 验收：四个样本通过；浏览器场景 "放一个方块 → 调用 `app.level.saveGame()` → 新建 Level 读同一个世界 → 方块还在"。

## B6 ExternalFileLevelStorageSource（193 行）—— 已完成

- 世界列表（`getLevelList`，读每个世界的 level.dat 生成 LevelSummary）、`selectLevel`、
  `deleteLevel`、`renameLevel`、`isNewLevelIdAcceptable`。
- `FolderMethods` 已在 B5a-1 做完，本步不再包含。
- 路径：网页版的根目录固定为 `/games/com.mojang/minecraftWorlds/`（照 C++ 的 externalPath 结构，ADAPTED(Web)）。
- **新建了两个文件**：`LevelStorageSource.ts`（基类 + `LevelSummary` + `TempLevelId`，
  顺带把 `levelSummaryLess`（C++ 的 `operator<`，其实是倒序）也移进来）与
  `ExternalFileLevelStorageSource.ts`。

### B6 记录

**开工前发现 B1 已经替这一步铺好了路**：`VirtualFS.deleteDirectory` 在 B1 就按 C++
`platform/file.h` 的语义造好了，注释里还点名了 `ExternalFileLevelStorageSource::deleteLevel`。
所以这一步没动 FolderMethods。

**三处原样保留的怪癖（都写了测试钉住）：**

1. **`renameLevel` 里那个 `if` 是个空块**：
   ```cpp
   bool couldRename = false;
   if (hasTempDirectory() && isTempFile) {
   }
     couldRename = couldRename || rename(_renFULLPATH(old), _renFULLPATH(new)) == 0;
   ```
   花括号里什么都没有 —— 改名在**外面**、无条件执行。而 `_renFULLPATH` 这个宏
   `#define _renFULLPATH(s) ((basePath + "/" + s).c_str())` **只拼 basePath**，根本不看
   tmpBasePath。所以临时世界（`_LastJoinedServer`）的改名也发生在 basePath 里，
   `isTempFile` 算出来除了喂这个空条件没人用。
2. **`readLevelData` 读坏了也算成功**，于是"目录在、level.dat 是坏的"照样会往世界列表里塞
   一条**字段全默认**（名字空、lastPlayed 0）的摘要。世界列表里因此可能出现空白条目。
3. **`deleteLevel` 的兜底分支不是死代码**：`DeleteDirectory` 不是真递归（它把每一项交给
   `remove`，而 `remove` 删不掉非空子目录 —— 这条 B1 就照抄了），所以世界目录里只要有
   `region/` 这种带文件的子目录，整目录删就失败，转到"逐个删 chunks.dat / player.dat /
   level.dat"—— 而那三个 remove **不会碰子目录**，留下一个残缺目录。

**两处 ADAPTED(Web) 偏离（台账 244 → 246）：**

1. `getLevelList` 失败时 C++ 会打 `_errno()`，VirtualFS 没有错误码可取（B5a-1 已标 `OMIT(Web)`）。
2. C++ 的 `readdir` 会把 `.` 和 `..` 也交给循环（它们同样是 `DT_DIR`），由**操作系统**把
   `<basePath>/./level.dat` 解析回 `<basePath>/level.dat`。VirtualFS 的路径规范化明确不解析
   `.` / `..`，那两次探测在这里必然打不开、什么也不会加 —— **结果一样，机制不同**，所以不试。

**测试里又踩了一次同一个坑**：`makeWorld` 忘了设 `storageVersion`（默认 0，而 `readLevelData`
只认 `==1` 与 `>=2`，版本 0 静默什么都不读），症状是"世界列表里名字是空的"。B5a-2 记过这条，
这次又中招 —— 已经写进测试助手的注释里。

**没写黄金样本**：这一步的产物是"哪些世界被列出来、删/改名之后文件系统长什么样"，
不是字节格式；字节那一层（level.dat）已由 G14-2 / G14-4 逐字节盖住。用单元测试盖（20 条）。

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
