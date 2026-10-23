# Level（src/world/level/Level.h / .cpp ↔ packages/world/src/level/Level.ts）

第 2 批（world/level）。工作表 154 行全部有结论（函数行 #1–#144 逐行见下表，表外清单 2 条单列）。
C++ `.h` 349 行 + `.cpp` 2269 行，TS 审核前 1979 行、审核后 1983 行。新增编号 **W61**。

## C++ 侧要点

- `class Level : public LevelSource`；`virtual` 成员是析构函数、`tick()`、`updateSleepingPlayerList() {}`、
  `createChunkSource()`。`updateSleepingPlayerList` 是空实现，TS 同样留空。
- 构造初始化列表（按声明顺序）：`levelStorage`、`isClientSide(false)`、`isFindingSpawn(false)`、
  `noNeighborUpdate(false)`、`skyDarken(0)`、`instaTick(false)`、`random(1)`、`_isNew(false)`、
  `_chunkSource(NULL)`、`_randValue(42184323)`、`_addend(1013904223)`、`_maxRecurse(0)`、
  `_updateLights(true)`、`_pathFinder(NULL)`、`_spawnFriendlies(true)`、`_spawnEnemies(true)`、
  `_lastSavedPlayerTime(0)`、`raknetInstance(0)`、`updatingTileEntities(false)`、
  `allPlayersAreSleeping(false)`、`_nightMode(false)`。**`difficulty` 没有初始化**（由 Minecraft 设置），
  TS 取 0 并在文件头注明（未初始化内存按方案取 0）。
- 可见性：`protected` 段是 `setZombieAi`、`entityAdded`、`entityRemoved`、`tileUpdated`、
  `updateSkyDarken`、`createChunkSource`；`private` 段是 `neighborChanged`、`tickTiles`；其余为 `public`。
- 重载：`getNearestPlayer`×2、`findPath`×2、`hasChunksAt`×2、`getRawBrightness`×2（短重载转调长重载、
  不是默认参数）、`getBrightness`×2、`playSound`×2、`addParticle`×2（`data = 0`）、`explode`×2、
  `updateLight`×2、`tick`×3（世界 tick 与 `tick(Entity*)` / `tick(Entity*, bool)`）。`loadPlayer` 没有默认参数。
- 静态存储：`tick()` 里的函数内 `static int _mobSpawnTick`（所有 Level 共用）、`updateLight` 的文件静态
  `maxLoop`、`tickTiles` 的函数内静态 `pollChunkOffsets`。
- 原版注释掉的代码（不复制）：`addEntities` / `ensureAdded` / `removeAllPendingEntityRemovals` 整段、
  `awakenAllPlayers` 只有声明没有定义、`getCubes` 的实体碰撞盒段、`tickTiles` 里的 `lc->tick()` 与情境音效、
  `setSpawnSettings` 函数体两句、`tickEntities` 里的 `setZombieAi(zombies)` 调用。
- 网络语句：`tick()` 里三处 `SetTimePacket` 与实体数据同步循环、`explode` 的 `ExplodePacket`、
  `broadcastEntityEvent` 的 `EntityEventPacket`，全部 DEFERRED(Network)。
- 随机源：世界成员 `random`；`tickTiles` 另用 `_randValue = _randValue * 3 + _addend` 的 int 线性同余；
  `animateTick` 每次调用新建一个按时间播种的 `animateRandom`，循环坐标仍用成员 `random`。

## 工作表结论

> 工作表里的 TS 行号是审核前（1979 行）版本；审核后在 471/490/1273/1716 行附近各插入 1 行标记，
> 其后的行号顺延。下表以方法名为准，不再列会漂移的行号。

| #   | C++ 函数                                    | TS 方法                    | 结论                                                                                                                  |
| --- | ------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | `Level(...)`                                | `constructor`              | 一致：初始化列表逐项核对；`difficulty` 未初始化，TS 取 0 已注明                                                       |
| 2   | `~Level()`                                  | **（无）**                 | OMIT(R3)：只做 delete 与日志，JS 由 GC 接管；本轮把注释补成标准 `OMIT(Level)` 标记                                    |
| 3   | `_init(...)`                                | `_init`                    | 一致；`new PathFinder()` 已恢复（任务单 H2）；C++ 注释里的函数未复制                                                  |
| 4   | `createChunkSource()`                       | `createChunkSource`        | 一致；两侧都是 protected，`levelStorage` 为空时走 dimension 的随机生成器                                              |
| 5   | `checkAndHandleWater(...)`                  | `checkAndHandleWater`      | 一致                                                                                                                  |
| 6   | `getNearestPlayer(Entity*, float)`          | `getNearestPlayer`         | 一致；R10 合并两个重载，按第一参数类型分派                                                                            |
| 7   | `getNearestPlayer(float,float,float,float)` | `getNearestPlayer`         | 一致；`maxDist < 0` 与 `best == -1` 条件照抄，float 距离按第二档                                                      |
| 8   | `tick()`                                    | `tick`                     | 一致；函数内 static → 模块级共享；三处 SetTimePacket 与实体数据同步 DEFERRED(Network)                                 |
| 9   | `tickTiles()`                               | `tickTiles`                | 一致；offsets 模块级常量；Map(hashCode)+排序复原 set 顺序；`_randValue` 用 imul 与 `                                  | 0` 回绕；C++ 注释掉的调用未复制 |
| 10  | `tickPendingTicks(bool)`                    | `tickPendingTicks`         | 一致；上限 100、force 短路、TickDataSet 顺序见 W69                                                                    |
| 11  | `loadPlayer(Player*, bool)`                 | `loadPlayer`               | **已修 W61-2**：删掉 C++ 没有的默认参数 `= true`；行为逐句一致                                                        |
| 12  | `findPath(..., Entity* to, ...)`            | `findPathToEntity`         | 一致；R10 情形 B 改名，两段逻辑相同                                                                                   |
| 13  | `findPath(..., int xBest, ...)`             | `findPathToTile`           | 一致；R10 情形 B 改名                                                                                                 |
| 14  | `setInitialSpawn()`                         | `setInitialSpawn`          | 一致 + 新增 DEFERRED(待确认)：两个 `nextInt(32)` 的求值顺序；y=64 与越界夹取照抄                                      |
| 15  | `validateSpawn()`                           | `validateSpawn`            | 一致 + 新增 DEFERRED(待确认)：两个 `nextInt(8)` 的求值顺序；`ySpawn <= 0 → 64` 照抄                                   |
| 16  | `getTopTile(int,int)`                       | `getTopTile`               | 一致：从 127 向下找第一个非空方块                                                                                     |
| 17  | `getTopTileY(int,int)`                      | `getTopTileY`              | 一致                                                                                                                  |
| 18  | `saveLevelData()`                           | `saveLevelData`            | 一致；C++ 不判空 `levelStorage`，TS 用 `!` 保持同样的调用假设                                                         |
| 19  | `getTile(int,int,int)`                      | `getTile`                  | 一致；y 越界返回 0                                                                                                    |
| 20  | `isEmptyTile(int,int,int)`                  | `isEmptyTile`              | 一致                                                                                                                  |
| 21  | `hasChunkAt(int,int,int)`                   | `hasChunkAt`               | 一致                                                                                                                  |
| 22  | `hasChunksAt(int,int,int,int)`              | `hasChunksAt`              | 一致；R10 合并两个重载，4 参转 6 参                                                                                   |
| 23  | `hasChunksAt(int×6)`                        | `hasChunksAt`              | 一致                                                                                                                  |
| 24  | `hasChunk(int,int)`                         | `hasChunk`                 | 一致                                                                                                                  |
| 25  | `getChunkAt(int,int)`                       | `getChunkAt`               | 一致                                                                                                                  |
| 26  | `getChunk(int,int)`                         | `getChunk`                 | 一致                                                                                                                  |
| 27  | `setTileAndDataNoUpdate(...)`               | `setTileAndDataNoUpdate`   | 一致                                                                                                                  |
| 28  | `setTileNoUpdate(...)`                      | `setTileNoUpdate`          | 一致                                                                                                                  |
| 29  | `getMaterial(...)`                          | `getMaterial`              | 一致                                                                                                                  |
| 30  | `getData(...)`                              | `getData`                  | 一致                                                                                                                  |
| 31  | `setData(...)`                              | `setData`                  | 一致                                                                                                                  |
| 32  | `setDataNoUpdate(...)`                      | `setDataNoUpdate`          | 一致                                                                                                                  |
| 33  | `setTile(...)`                              | `setTile`                  | 一致                                                                                                                  |
| 34  | `setTileAndData(...)`                       | `setTileAndData`           | 一致                                                                                                                  |
| 35  | `sendTileUpdated(...)`                      | `sendTileUpdated`          | 一致；只通知 listener，C++ 此处没有网络发送                                                                           |
| 36  | `tileUpdated(...)`                          | `tileUpdated`              | 一致；两侧都是 protected                                                                                              |
| 37  | `lightColumnChanged(...)`                   | `lightColumnChanged`       | 一致：y0 > y1 时先交换，再 setTilesDirty                                                                              |
| 38  | `setTileDirty(...)`                         | `setTileDirty`             | 一致                                                                                                                  |
| 39  | `setTilesDirty(...)`                        | `setTilesDirty`            | 一致                                                                                                                  |
| 40  | `swap(...)`                                 | `swap`                     | 一致                                                                                                                  |
| 41  | `updateNeighborsAt(...)`                    | `updateNeighborsAt`        | 一致：六个方向依次通知                                                                                                |
| 42  | `neighborChanged(...)`                      | `neighborChanged`          | 一致；两侧都是 private，`noNeighborUpdate` / `isClientSide` 短路照抄                                                  |
| 43  | `canSeeSky(...)`                            | `canSeeSky`                | 一致                                                                                                                  |
| 44  | `getRawBrightness(x,y,z)`                   | `getRawBrightness`         | 一致；R10 合并重载，短版本等价于 `propagate = true`                                                                   |
| 45  | `getRawBrightness(x,y,z,bool)`              | `getRawBrightness`         | 一致；半砖/耕地的邻接最大亮度照抄                                                                                     |
| 46  | `isSkyLit(...)`                             | `isSkyLit`                 | 一致                                                                                                                  |
| 47  | `getHeightmap(...)`                         | `getHeightmap`             | 一致                                                                                                                  |
| 48  | `getBiomeSource()`                          | `getBiomeSource`           | 一致                                                                                                                  |
| 49  | `getBiome(...)`                             | `getBiome`                 | 一致；C++ 指针返回，TS 用非空断言                                                                                     |
| 50  | `updateLightIfOtherThan(...)`               | `updateLightIfOtherThan`   | 一致                                                                                                                  |
| 51  | `getBrightness(int,int,int)`（float）       | `getBrightness`            | 一致；R10 合并两个重载；亮度 ramp 查询                                                                                |
| 52  | `setBrightness(...)`                        | `setBrightness`            | 一致                                                                                                                  |
| 53  | `getBrightness(LightLayer,...)`（int）      | `getBrightness`            | 一致；`LightLayer.surrounding` 与越界返回照抄                                                                         |
| 54  | `isDay()`                                   | `isDay`                    | 一致：`skyDarken < 4`                                                                                                 |
| 55  | `clip(...)`                                 | `clip`                     | 一致；ADAPTED(Perf) 省略 Stopwatch（原有标记）；liquid/solidOnly 分支照抄                                             |
| 56  | `playSound(Entity*,...)`                    | `playSound`                | 一致；R10 合并两个重载，按第一参数类型分派                                                                            |
| 57  | `playSound(float,float,float,...)`          | `playSound`                | 一致；entity 版本减 `heightOffset` 照抄                                                                               |
| 58  | `levelEvent(...)`                           | `levelEvent`               | 一致                                                                                                                  |
| 59  | `tileEvent(...)`                            | `tileEvent`                | 一致：先触发方块事件，再通知 listener                                                                                 |
| 60  | `addParticle(string,...)`                   | `addParticle`              | 一致；R10 合并两个重载；`data = 0` 与 C++ 相同                                                                        |
| 61  | `addParticle(ParticleType::Id,...)`         | `addParticle`              | 一致                                                                                                                  |
| 62  | `addEntity(...)`                            | `addEntity`                | 一致；`forced = true` 与被注释的 `                                                                                    |                                 | hasChunk` 原样保留；玩家去重后调用 entityAdded |
| 63  | `getEntity(int)`                            | `getEntity`                | 一致：C++ std::map.find ↔ TS Map.get                                                                                  |
| 64  | `entityAdded(...)`                          | `entityAdded`              | **已修 W61-1**：改回 C++ 的 protected                                                                                 |
| 65  | `entityRemoved(...)`                        | `entityRemoved`            | **已修 W61-1**：改回 C++ 的 protected                                                                                 |
| 66  | `getMob(int)`                               | `getMob`                   | 一致                                                                                                                  |
| 67  | `removeEntity(...)`                         | `removeEntity`             | 一致；玩家的 `reallyRemoveIfPlayer` 条件照抄                                                                          |
| 68  | `tileEntityChanged(...)`                    | `tileEntityChanged`        | 一致                                                                                                                  |
| 69  | `getRandomMobSpawnAt(...)`                  | `getRandomMobSpawnAt`      | 一致；C++ 按值返回 → TS 返回副本；用 `level.random` 抽一次权重                                                        |
| 70  | `addListener(...)`                          | `addListener`              | 一致                                                                                                                  |
| 71  | `removeListener(...)`                       | `removeListener`           | **标记补登记 ADAPTED(Safety)**：C++ 找不到时 erase(end()) 是 UB；guard 行为未改，本轮只补标记与测试                   |
| 72  | `getCubes(...)`                             | `getCubes`                 | 一致；boxes 是共享数组（C++ 返回引用）；C++ 注释掉的实体碰撞盒未复制                                                  |
| 73  | `getSkyDarken(float)`                       | `getSkyDarken`             | 一致；颜色计算属 R4 第二/三档，按 JS 数值计算                                                                         |
| 74  | `getSkyColor(...)`                          | `getSkyColor`              | 一致；R4 第三档                                                                                                       |
| 75  | `getCloudColor(float)`                      | `getCloudColor`            | 一致；R4 第三档                                                                                                       |
| 76  | `getTimeOfDay(float)`                       | `getTimeOfDay`             | 一致；R4 第三档                                                                                                       |
| 77  | `getSunAngle(float)`                        | `getSunAngle`              | 一致；R4 第三档                                                                                                       |
| 78  | `getFogColor(float)`                        | `getFogColor`              | 一致；R4 第三档                                                                                                       |
| 79  | `getTopSolidBlock(...)`                     | `getTopSolidBlock`         | 一致                                                                                                                  |
| 80  | `getLightDepth(...)`                        | `getLightDepth`            | 一致                                                                                                                  |
| 81  | `getStarBrightness(float)`                  | `getStarBrightness`        | 一致；R4 第三档                                                                                                       |
| 82  | `addToTickNextTick(...)`                    | `addToTickNextTick`        | 一致；排序/去重怪癖由 TickDataSet 承担（W69）                                                                         |
| 83  | `tickEntities()`                            | `tickEntities`             | 一致；splice(i--) 对应 C++ i--；玩家延迟 16 tick 删除；方块实体清理与 pending 处理照抄；“deleting”日志见 ADAPTED(Log) |
| 84  | `setZombieAi(...)`                          | `setZombieAi`              | **已修 W61-1**：protected；用一次排序代替 nth_element，但内层循环长度 0，结果不被读取，等价（注释原有）               |
| 85  | `tick(Entity*)`                             | `tickEntity`               | R10 合并进 `tickEntity(actual = true)`；工作表的方法列误配成 tickPendingTicks，已人工纠正                             |
| 86  | `tick(Entity*, bool)`                       | `tickEntity`               | 一致：NaN 回退、跨 chunk 迁移、每 30 秒 saveLevelData 照抄                                                            |
| 87  | `isUnobstructed(...)`                       | `isUnobstructed`           | 一致                                                                                                                  |
| 88  | `containsAnyLiquid(...)`                    | `containsAnyLiquid`        | 一致                                                                                                                  |
| 89  | `containsFireTile(...)`                     | `containsFireTile`         | 一致                                                                                                                  |
| 90  | `containsMaterial(...)`                     | `containsMaterial`         | 一致                                                                                                                  |
| 91  | `containsLiquid(...)`                       | `containsLiquid`           | 一致                                                                                                                  |
| 92  | `explode(...)`（短）                        | `explode`                  | 一致；R10 合并为 `fire = false`；ExplodePacket DEFERRED(Network)                                                      |
| 93  | `explode(..., bool fire)`                   | `explode`                  | 一致；Explosion 本体另有审核（W62）                                                                                   |
| 94  | `getSeenPercent(...)`                       | `getSeenPercent`           | 一致；float 步长用 `f()` 复原 4×4×4 次采样；hits/count 的 float 除法按第二档放宽                                      |
| 95  | `isSolidBlockingTile(...)`                  | `isSolidBlockingTile`      | 一致                                                                                                                  |
| 96  | `isSolidRenderTile(...)`                    | `isSolidRenderTile`        | 一致                                                                                                                  |
| 97  | `extinguishFire(...)`                       | `extinguishFire`           | 一致                                                                                                                  |
| 98  | `gatherStats()`                             | `gatherStats`              | 一致：输出 `All: N`                                                                                                   |
| 99  | `gatherChunkSourceStats()`                  | `gatherChunkSourceStats`   | 一致                                                                                                                  |
| 100 | `getTileEntity(...)`                        | `getTileEntity`            | 一致：先查 chunk，再查 pending                                                                                        |
| 101 | `setTileEntity(...)`                        | `setTileEntity`            | 一致：更新中进 pending，否则同时进 tileEntities 与 chunk                                                              |
| 102 | `removeTileEntity(...)`                     | `removeTileEntity`         | 一致；`TileEntity::setRemoved` 非虚，写成 `TileEntity.prototype.setRemoved.call(te)`                                  |
| 103 | `getLightsToUpdate()`                       | `getLightsToUpdate`        | 一致                                                                                                                  |
| 104 | `updateLights()`                            | `updateLights`             | 一致；先 back() 再 pop 的顺序、500 次上限、`_maxRecurse >= 50` 照抄                                                   |
| 105 | `setUpdateLights(bool)`                     | `setUpdateLights`          | 一致                                                                                                                  |
| 106 | `updateLight(...)`（短）                    | `updateLight`              | R10 合并为 `join = true`；工作表的方法列误配成 updateLightIfOtherThan，已人工纠正                                     |
| 107 | `updateLight(..., bool join)`               | `updateLight`              | 一致；文件静态 maxLoop → 模块级；`== 50` 时回退到 49；中点整数除法用 `                                                | 0`；1000000 上限照抄            |
| 108 | `updateSkyBrightness()`                     | `updateSkyBrightness`      | 一致                                                                                                                  |
| 109 | `setSpawnSettings(...)`                     | `setSpawnSettings`         | 一致：C++ 函数体两句被注释掉，TS 为空实现                                                                             |
| 110 | `animateTick(...)`                          | `animateTick`              | 一致 + 新增 DEFERRED(待确认)：`xt + nextInt - nextInt` 的求值顺序；100 次 × 6 个 nextInt，animateRandom 每次新建      |
| 111 | `getEntities(...)`                          | `getEntities`              | 一致；返回共享 `_es`（C++ 返回引用）                                                                                  |
| 112 | `getAllEntities()`                          | `getAllEntities`           | 一致；C++ `const EntityList&` → TS `readonly Entity[]`                                                                |
| 113 | `prepare()`                                 | `prepare`                  | 一致                                                                                                                  |
| 114 | `mayPlace(...)`                             | `mayPlace`                 | 一致                                                                                                                  |
| 115 | `getSeaLevel()`                             | `getSeaLevel`              | 一致                                                                                                                  |
| 116 | `getDirectSignal(...)`                      | `getDirectSignal`          | 一致                                                                                                                  |
| 117 | `hasDirectSignal(...)`                      | `hasDirectSignal`          | 一致                                                                                                                  |
| 118 | `getSignal(...)`                            | `getSignal`                | 一致                                                                                                                  |
| 119 | `hasNeighborSignal(...)`                    | `hasNeighborSignal`        | 一致                                                                                                                  |
| 120 | `setTime(long)`                             | `setTime`                  | 一致；游戏内时间在 TICKS_PER_DAY 内，JS number 精确，无 64 位运算                                                     |
| 121 | `getSeed()`                                 | `getSeed`                  | 一致                                                                                                                  |
| 122 | `getTime()`                                 | `getTime`                  | 一致                                                                                                                  |
| 123 | `getSharedSpawnPos()`                       | `getSharedSpawnPos`        | 一致；按值返回新 Pos                                                                                                  |
| 124 | `setSpawnPos(Pos)`                          | `setSpawnPos`              | 一致                                                                                                                  |
| 125 | `mayInteract(...)`                          | `mayInteract`              | 一致：恒 true                                                                                                         |
| 126 | `broadcastEntityEvent(...)`                 | `broadcastEntityEvent`     | 一致；EntityEventPacket DEFERRED(Network)                                                                             |
| 127 | `getChunkSource()`                          | `getChunkSource`           | 一致                                                                                                                  |
| 128 | `getLevelStorage()`                         | `getLevelStorage`          | 一致                                                                                                                  |
| 129 | `getLevelData()`                            | `getLevelData`             | 一致；返回内部对象，对应 C++ 指针                                                                                     |
| 130 | `takePicture(...)`                          | `takePicture`              | 一致                                                                                                                  |
| 131 | `getEntitiesOfType(...)`                    | `getEntitiesOfType`        | **原版 bug 照抄**：`count = -list.size()`、返回 `size - count`；非空入参时多算初始长度                                |
| 132 | `getEntitiesOfClass(...)`                   | `getEntitiesOfClass`       | **原版 bug 照抄**：同上                                                                                               |
| 133 | `countInstanceOfType(...)`                  | `countInstanceOfType`      | 一致                                                                                                                  |
| 134 | `countInstanceOfBaseType(...)`              | `countInstanceOfBaseType`  | 一致；非法 baseType 的 LOGE 文案照抄（日志第三档）                                                                    |
| 135 | `dispatchEntityData(...)`                   | `dispatchEntityData`       | 一致；std::map::insert 不覆盖 → 先 has 再 set                                                                         |
| 136 | `saveGame()`                                | `saveGame`                 | 一致                                                                                                                  |
| 137 | `loadEntities()`                            | `loadEntities`             | 一致                                                                                                                  |
| 138 | `updateSkyDarken()`                         | `updateSkyDarken`          | 一致；protected                                                                                                       |
| 139 | `removePlayer(...)`                         | `removePlayer`             | **怪癖保留**：删后不调整下标，相邻重复引用只删一个（splice 后继续 ++i）                                               |
| 140 | `isNightMode()`                             | `isNightMode`              | 一致；返回 int 0/1                                                                                                    |
| 141 | `setNightMode(bool)`                        | `setNightMode`             | 一致                                                                                                                  |
| 142 | `inRange(...)`                              | `inRange`                  | 一致                                                                                                                  |
| 143 | `isNew()`                                   | `isNew`                    | 一致                                                                                                                  |
| 144 | `updateSleepingPlayerList()`                | `updateSleepingPlayerList` | 一致；C++ 与 TS 都是空实现                                                                                            |

表外清单：

- `~Level()`（Level.h / Level.cpp:61）：OMIT(R3)。函数体只做 `delete` 与 `LOGI`，JS 由 GC 接管；
  本轮把原有的“析构函数不移植”注释改成标准 `// OMIT(Level): ~Level()  Level.cpp:61` 格式，便于台账统计。
- `_pendingTickCountForTest()`（Level.ts 末尾）：ADAPTED(Test)，只给测试读取计划刻队列长度；C++ 没有这个方法。

## 修复

**W61-1 `entityAdded` / `entityRemoved` / `setZombieAi` 的可见性（清单第 20 条）。**
C++ `Level.h:277-290` 的 protected 段里依次是 `setZombieAi`、`entityAdded`、`entityRemoved`（同时还有
`tileUpdated`、`updateSkyDarken`、`createChunkSource`）；TS 原来把前三个写成了 public。运行行为不变，
但类型契约必须与 C++ 一致。审核前用 `rg` 检查过：仓库里没有类外通过 `Level` 类型直接调用这三个方法的
代码（`s12-phaseA` 等测试是通过 `LevelListener` 子类覆写，不受影响）。修复：改为 `protected`。

**W61-2 `loadPlayer` 多出默认参数（清单第 16 条）。**
C++ `Level.h:81` 是 `void loadPlayer(Player* player, bool doAddPlayer);`，没有默认值；TS 原来写成
`doAddPlayer = true`。虽然现有调用方都传了两个参数，但默认参数会掩盖“C++ 必须显式传”的契约。
修复：改成必填的 `doAddPlayer: boolean`。

先红后绿（W61-1 + W61-2 一起，由 `tests/unit/world/level-audit.test.ts` 的编译期断言锁定）：

- 红：临时把三个方法改回 public、给 `loadPlayer` 加回 `= true`，执行
  `npx tsc -p tests/tsconfig.json --noEmit`：退出码 2，正好 4 条
  `TS2578: Unused '@ts-expect-error' directive.`（测试第 44/46/48/57 行）。
- 绿：恢复后同一命令退出码 0。
- 运行时看不到可见性差异，所以这一项由 tsc 锁定；测试里的 `@ts-expect-error` 是“错误必须出现”的断言。

**W61-3 `removeListener` 的 UB 保护补标记（清单第 34 条；无行为变化）。**
C++ 在找不到监听器时对 `end()` 调用 `erase`，是未定义行为（libstdc++ 实测会误删最后一个元素）。
TS 原本已有 `if (it >= 0)` 守卫，但注释没有标准标记。本轮补 `ADAPTED(Safety)`，并新增测试锁住
“找不到时是空操作”。

先红后绿（证明测试确实能抓住丢守卫）：

- 红：临时删掉 `if (it >= 0)`、改成无条件 `splice`，
  `pnpm exec vitest run tests/unit/world/level-audit.test.ts` → 退出码 1，
  `1 failed | 8 passed`，失败项是“removeListener 找不到监听器时是空操作（ADAPTED(Safety)）”。
- 绿：恢复守卫后 → 退出码 0，`9 passed`。

**标记与注释修正（均无行为变化）。**

- `tickEntities` 的 `LOGI("deleting: %p\n", pr.e)` 在网页版没有可打印的指针，改为 `LOGI('deleting: player')`
  并补 `ADAPTED(Log)`。
- `setInitialSpawn`、`validateSpawn`、`animateTick` 三处 `nextInt() ± nextInt()` 的求值顺序 C++ 未规定，
  按项目先例取从左到右，三处各补 `DEFERRED(待确认)`（详见“未决问题”）。
- 文件头的 `【OMIT】` 还写着“32 个函数”，实际已全部移植，改为“只 OMIT 析构函数”。
- `boxes` 的注释“只被已 OMIT 的 getCubes 使用”过时，改为“C++ getCubes 返回的共享 AABB 列表”。
- `setInitialSpawn` 的旧注释说“这里按从左到右”，但没有标准标记，改为指向循环上方的 `DEFERRED(待确认)`。
- 析构函数的注释补成标准 `OMIT(Level)` 格式（见上）。

## ADAPTED / DEFERRED

本轮新增：

| 标记                | 位置                                              | 说明                                                              |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| ADAPTED(Safety)     | `removeListener`                                  | C++ 找不到时 erase(end()) 是 UB；TS 找不到时什么都不做            |
| ADAPTED(Log)        | `tickEntities` 的删除日志                         | C++ 打印指针 `%p`，网页版打 `player`（日志第三档）                |
| DEFERRED(待确认) ×3 | `setInitialSpawn`、`validateSpawn`、`animateTick` | 两个 `nextInt()` 相减的求值顺序未确认，暂按从左到右；见“未决问题” |
| OMIT(Level)         | `~Level()`                                        | R3：只做 delete 与日志；补标准标记格式                            |

原有、仍然成立：

- `DEFERRED(Network)` 共 6 条语句：`tick()` 的三处 `SetTimePacket`、`tick()` 末尾的实体数据同步循环、
  `explode` 的 `ExplodePacket`、`broadcastEntityEvent` 的 `EntityEventPacket`。
- `ADAPTED(ESM)`：`Level.mobSpawnerTick` 由 MobSpawner 模块注入，避免加载循环。
- `ADAPTED(Perf)`：`clip` 省略只用于性能统计的 Stopwatch。
- `ADAPTED(Test)`：`_pendingTickCountForTest`。

## 原版 bug / 怪癖（照抄，未修）

- `getEntitiesOfType` / `getEntitiesOfClass`：`count = -list.size()`，返回 `list.size() - count`。
  入参列表非空时返回“初始长度 + 新增数”，不是新增数；照抄。
- `removePlayer`：`splice(i, 1)` 后继续 `++i`，相邻的重复引用只删一个；对应 C++ `erase` 后不调整迭代器。
- `tickTiles` 的 `_chunksToPoll` 是 `std::set<ChunkPos>`，`operator<` 只比 `hashCode`；TS 用
  `Map<hashCode, ChunkPos>` + 排序复原遍历顺序。0..15 的区块哈希唯一，不会碰撞。
- `updateLights`：先 `back()` 拷贝再 `pop_back()`；`updateLight` 的 `maxLoop == 50` 时减回 49 并返回。
- `tickEntity`：每 30 秒对所有实体都执行一次 `saveLevelData`（C++ 原样）。
- `animateTick`：每次调用都新建按时间播种的 `animateRandom`；100 次循环里每轮取 6 个世界随机数。
- `addEntity`：`forced = true`，C++ 的 `|| hasChunk(xc, zc)` 在注释里。
- `setSpawnSettings`：C++ 函数体两句被注释，实际是空函数。
- `getSeenPercent`：采样次数由 float 步长决定；R4 第二档按 JS 数值计算，不逐位对齐。
- `countInstanceOfBaseType` 的非法 baseType 返回 -1 并打日志。

## 35 条清单核对要点

- 第 1–7 条（float）：本文件没有第一档（逐位）的 float 需求。`skyDarken` 是 int；光照与天空/雾/云颜色
  属 R4 第二/三档，按 JS 数值计算，未逐位包 `f()`；`getSeenPercent` 的循环步长显式用 `f()` 保证采样
  次数与 C++ 一致（4×4×4）。`clip` 的 float 形参由几何类内部处理（见 AABB 审核 W5）。
- 第 8 条（整数）：`tickTiles` 的 `_randValue * 3 + _addend` 用 `Math.imul` + `|0` 模拟 int 回绕；
  `updateLight` 的中点 `(x1+x0)/2`、`setInitialSpawn` 的中心坐标用 `|0` 截断；`Mth.floor` 用于浮点取整。
- 第 9–10 条（数学/NaN）：坐标与区块除法统一走 `Mth.floor`；颜色计算里的 `Mth.sin`/`Mth.cos`（若用到）
  保持查表版本；没有把 `Mth.Min/Max/abs` 换成 `Math.*`，`tickEntity` 的 NaN 检查保留 `x !== x`。
- 第 11 条（long）：`getTime/setTime` 的世界时间在 `TICKS_PER_DAY = 19200` 内，JS number 精确；
  没有依赖 64 位溢出的运算。
- 第 12 条（格式）：`gatherStats` 是 `'All: ' + n`，与 stringstream 输出一致；其余日志属第三档。
- 第 13–18 条（结构）：`TileEntity::setRemoved` 非虚，已用 `prototype.call`；`tick(Entity*)` 是 R10 合并，
  不是虚调用；`Level` 在 TS 里 implements `LevelSource`（没有继承），所以没有 `super` 调用；构造函数里
  不调用会被子类覆写的方法（`createChunkSource` 在 `_init` 里调用，C++/TS 都按本类解析）。重载清单与分派
  见“C++ 侧要点”；`getNearestPlayer`/`playSound`/`getBrightness`/`addParticle` 按参数类型或个数分派，
  `hasChunksAt`/`getRawBrightness`/`explode`/`updateLight`/`tick` 用默认参数合并，均确认短版本只是用常量
  转调长版本。没有字段遮蔽。
- 第 19 条（初始化顺序）：TS 字段初始化器 + 构造函数体按 C++ 声明顺序核对；`random = new Random(1)`、
  `_randValue = 42184323` 等在字段声明处初始化，避免构造期依赖子类。
- 第 20 条（可见性）：W61-1 修掉三个 public；`tileUpdated`/`updateSkyDarken`/`createChunkSource` 均 protected，
  `neighborChanged`/`tickTiles` 均 private；其余 public 与 C++ 一致。
- 第 21 条（按值）：`getSharedSpawnPos` 返回新 `Pos`；`getRandomMobSpawnAt` 返回新的 `MobSpawnerData`；
  `getSkyColor`/`getFogColor`/`getCloudColor` 返回 `Vec3` 副本；`getCubes`/`getEntities` 返回共享数组
  （对应 C++ 引用）；`getAllEntities` 用 `readonly` 表达 const 引用。
- 第 22 条（map/set）：`entityIdLookup` 是 Map（C++ std::map），只做键查找；`dispatchEntityData` 用
  “先 has 再 set”复现 `insert` 不覆盖；`_chunksToPoll` 的遍历顺序见怪癖；`TickDataSet` 见 W69。
- 第 23 条（vector erase）：`tickEntities` 的 `splice(i--, 1)` 与 C++ 一致；`removePlayer` 的“不调整下标”
  怪癖照抄；`_pendingPlayerRemovals` 从后往前删与 C++ 相同。
- 第 24 条（排序）：`setZombieAi` 用稳定排序代替 `nth_element`，但 `NumSmartZombiesPerPlayer = 0`，
  内层循环不执行，结果不被读取；`_chunksToPoll` 的键排序是数值升序，对应 `std::set` 的 `operator<`。
- 第 25 条（哈希容器）：本文件没有依赖哈希容器遍历顺序的代码。
- 第 26–27 条（随机源/顺序）：世界成员 `random` 与 `animateRandom` 严格分开；`tickTiles` 的 LCG 用
  `_randValue`，不碰 `random`；`getRandomMobSpawnAt` 每调用一次抽一次权重；`tick()` 里
  `_spawnEnemies && difficulty > PEACEFUL` 的短路与 C++ 相同。
- 第 28 条（未指定求值顺序）：三处 `nextInt() - nextInt()` 无法从 C++ 标准确定顺序，已标
  `DEFERRED(待确认)`，按项目先例从左到右；需要黄金样本确认（见“未决问题”）。
- 第 29 条（被注释的调用）：C++ 注释掉的 `setZombieAi`、`lc->tick()`、`setSpawnSettings` 两句、`addEntities`
  等都没有复制；这些被注释的代码里没有会改变随机序列的调用。
- 第 30–32 条（字符串/char/bool）：字符串都是 ASCII；`broadcastEntityEvent` 的 `char eventId` 在 TS 是
  number，因发包 DEFERRED，符号位不影响结果；`isNightMode` 返回 0/1，`_nightMode` 是 boolean，
  `if` 判断按非零处理。
- 第 33 条（日志）：`LOGI`/`LOGE` 文案逐条核对；`%p` 那条按 ADAPTED(Log) 处理；“REmoved tile-entity”
  等日志属第三档，不参与黄金样本。
- 第 34 条（标记）：DEFERRED(Network) 6 条语句逐条确认仍成立；本轮新增 3 条 DEFERRED(待确认)、
  2 条 ADAPTED、1 条 OMIT；已移植的 PathFinder/MobSpawner 不再有对应 DEFERRED。
- 第 35 条（注释）：修正了文件头“32 个 OMIT 函数”、`boxes` 的过时说明、`setInitialSpawn` 的旧注释；
  其余注释与代码一致。

## 未决问题

- `setInitialSpawn`、`validateSpawn`、`animateTick` 里的 `a + random.nextInt(n) - random.nextInt(n)`
  在 C++ 中两个操作数的求值顺序未指定。GCC 实际顺序需要黄金样本确认；本轮按项目先例（Entity/Mob/
  ItemEntity/Player/Chicken/Skeleton/PigZombie）取从左到右，并在三处标 `DEFERRED(待确认)`。
  确认后应删掉这三个标记，必要时对调取数顺序。
- `getSeenPercent` 的 `hits / count` 在 C++ 是 int / float（float 除法），TS 是 double 除法；
  属 R4 第二档（AI 视线判定），未逐位对齐。若以后发现 AI 行为在边界上有差异，优先查这里。

## 验证

- `tests/unit/world/level-audit.test.ts`：9 个测试全部通过。覆盖：
  1. `entityAdded`/`entityRemoved`/`setZombieAi` 的 protected（`@ts-expect-error` 编译期）；
  2. `loadPlayer` 必填两参（`@ts-expect-error`）；
  3. `isNightMode` 返回 0/1；
  4. `removeListener` 找不到时是空操作（ADAPTED(Safety)）；
  5. `removeListener` 命中时只删第一个；
  6. `removePlayer` 相邻重复只删一个；
  7. `getEntitiesOfType`/`getEntitiesOfClass` 的计数缺陷；
  8. `setInitialSpawn` 从左到右取四个随机数（spy `isValidSpawn` 先 false 后 true）；
  9. `getSeenPercent` 单位包围盒采样 64 次。
- `pnpm exec vitest run tests/unit/world/level-audit.test.ts`：`9 passed (9)`，退出码 0。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误，退出码 0（W61-1/W61-2 的红绿对照见“修复”）。
- `npx tsc -p packages/world --noEmit`：0 错误，退出码 0。
- `npx prettier --check packages/world/src/level/Level.ts tests/unit/world/level-audit.test.ts docs/审核记录/level.md`：
  `All matched files use Prettier code style!`，退出码 0。
- `pnpm ledger`：Level.ts 新增 3 条 DEFERRED(待确认)、2 条 ADAPTED、1 条 OMIT（相对审核前）。
