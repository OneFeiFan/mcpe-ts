# 任务单 B：存档（世界保存与读取）

目标：网页版能新建、保存、读取世界；刷新页面后世界还在；暂停界面的“Quit to title”回到起始菜单，再进入同一个世界。
原则不变：1:1 移植 C++；浏览器差异集中在一个“虚拟文件系统”层，标 ADAPTED(Web)。

**一次只做一个步骤。** 每步结束：`pnpm typecheck && pnpm test` 通过、`pnpm ledger` 条数不升、提交。步骤里写了“黄金样本”的，样本通过才算完成。

---

## B0 设计确认（不写代码，先读）

C++ 用 `FILE*`（fopen/fread/fwrite/fseek/fclose）同步读写磁盘。浏览器只有异步的 IndexedDB / OPFS。采用的方案（已定，照做）：

- **虚拟文件系统 `VirtualFS`**（新文件 `packages/platform/src/fs/VirtualFS.ts`）：内存里一张 `Map<路径, Uint8Array>`，提供**同步**接口；
  启动时（`apps/web/src/main.ts`，在 `app.init` 之前）从 IndexedDB 一次性读入全部文件；每次写入后标记脏，**防抖 1 秒**异步写回 IndexedDB；
  `beforeunload` 时再同步触发一次写回。
- C++ 的文件函数在 TS 里对应 `VirtualFS` 上一个小的 `CFile` 类：`fopen(path, mode)`、`fread`、`fwrite`、`fseek`、`ftell`、`fclose`，语义照 C 标准库（"rb"/"wb"/"r+b"/"ab"，读到末尾返回实际字节数）。
- 目录：`mkdir`、`exists`、`listDir`、`remove`、`rename` 按路径前缀实现。
- 单元测试里用纯内存的 `VirtualFS`（不接 IndexedDB）。

## B1 VirtualFS 与 CFile（ADAPTED(Web)，非移植）
- 新增：`packages/platform/src/fs/VirtualFS.ts`、`CFile.ts`、`IndexedDbBackend.ts`（只在浏览器里用）。
- 单元测试 `tests/unit/platform/vfs.test.ts`：读写、追加、`fseek` 越过末尾再写（中间补 0，与 C 一致）、`r+b` 覆盖写、目录列举、重命名。
- 验收：测试通过；`apps/web/src/main.ts` 启动时加载 IndexedDB（先只加载，不接到游戏）。

## B2 RakNet::BitStream 的最小子集（ADAPTED(Network)）
- C++ 的存档代码只用到：`BitStream(data, size, copy)`、`Write(...)`、`Read(...)`、`GetData()`、`GetNumberOfBytesUsed()`、`ResetReadPointer()`。
  先用 `python tools/porting/clean.py` 读 `RegionFile.cpp`、`ExternalFileLevelStorage.cpp`，列出每个 `Write/Read` 的参数类型（字节、int、带长度的缓冲区）。
- 新增 `packages/util/src/BitStream.ts`，只实现这些重载（按 RakNet 的字节序：**确认后**写在文件头；拿不准就用黄金样本 B3 来判定）。
- 验收：单元测试覆盖用到的每个重载。

## B3 RegionFile（移植 `world/level/storage/RegionFile.h/.cpp`，216 行）
- 用 `/port-unit world/level/storage/RegionFile`。`FILE*` 换成 `CFile`；`std::map<int,bool> sectorFree` 用 `Map` 并注意遍历顺序要按键排序。
- **黄金样本 G14-1**：harness 用参考 C++ 的 RegionFile 往一个临时文件写入若干固定内容的区块（含覆盖写、变大后换扇区的情况），把文件全部字节以十六进制输出；
  TS 在 VirtualFS 上做同样操作，逐字节比较。
- 验收：G14-1 通过。

## B4 LevelData 的读写
- 先查 `packages/world/src/level/storage/LevelData.ts` 已有哪些函数（`getTagData`/`setTagData`、`createTag` 等），补齐 C++ 里还没移植的；
  再移植 `ExternalFileLevelStorage` 里的静态函数 `readLevelData`、`writeLevelData`、`readPlayerData`（level.dat 的文件头 + NBT）。
- **黄金样本 G14-2**：固定 LevelData（种子、出生点、时间、游戏模式、世界名）写出的 level.dat 字节一致，读回来字段一致。

## B5 ExternalFileLevelStorage（702 行，分三步）
- B5a：构造函数、`prepareLevel`、`saveLevelData`、`savePlayer`/`loadPlayer`。
- B5b：区块 `load`/`save`（LevelChunk 的序列化：方块、数据、光照数组）、`saveAll`、`saveGame`、`tick` 与 `savePendingUnsavedChunks`（未保存区块列表的时间戳用 `getTimeMs`）。
  **黄金样本 G14-3**：一个固定内容的区块经 C++ `save` 写出的字节与 TS 一致；TS 读回后方块、数据、光照与原样一致。
- B5c：`loadEntities`/`saveEntities`（实体文件，用 RegionFile 的第二个实例）。只保存已移植的实体（掉落物）；其余实体类型的创建在 EntityFactory 里标 DEFERRED。
- 验收：三个样本通过；浏览器场景 “放一个方块 → 调用 `app.level.saveGame()` → 新建 Level 读同一个世界 → 方块还在”。

## B6 ExternalFileLevelStorageSource + FolderMethods（193 + 77 行）
- 世界列表（`getLevelList`，读每个世界的 level.dat 生成 LevelSummary，按 lastPlayed 排序）、`selectLevel`、`deleteLevel`、`renameLevel`、`isNewLevelIdAcceptable`。
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
