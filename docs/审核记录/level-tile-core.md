# Tile 基类与 TileInclude（W98）

审核编号：**W98**。逐函数对照后运行时行为**全部一致**，没有运行时修改；补了 2 处 `OMIT`，
新增 15 条行为锁定测试。工作表里的 `stepSound` / `breakSound` 两条是误报（它们是 `SoundType` 的字段初始化，不是方法），
已在“补核成员”里核对。

| 文件                                         | C++ 对应                       | 审核前 → 审核后行数 |
| -------------------------------------------- | ------------------------------ | ------------------- |
| `packages/world/src/level/tile/Tile.ts`      | `Tile.h` + `Tile.cpp`          | 1513 → 1515         |
| `packages/world/src/level/tile/TileInclude.ts` | `TileInclude.h`（只有 include） | 140 → 140           |

> 表中的 TS 行号是工作表生成时的行号。W98 新增 2 行 `OMIT` 后，实例方法整体 +1，
> `teardownTiles` 之后的方法 +2。

## C++ 侧要点

- `Tile::SoundType` 是嵌套类，两个构造器：
  - `(name, volume, pitch)`：`breakSound` 和 `stepSound` 都是 `"step." + name`；
  - `(name, breakSound, volume, pitch)`：`stepSound` 仍是 `"step." + name`，`breakSound` 用传入值。
  - 四个 getter 直接返回字段；`volume` / `pitch` 是 `const float`。
- 10 个静态 `SoundType`：`SOUND_GLASS("stone", "random.glass", 1, 1)`、
  `SOUND_SAND("sand", "step.gravel", 1, 1)`（网页版构建没有 `PRE_ANDROID23` 分支）。
- 静态表初值的怪癖：`translucent[] = {true, false}` 只让 **0 号（空气）** 为 true，其余全 false；
  `solid[]` / `shouldTick[]` / `sendTileData[]` / `isEntityTile[]` 全 false；
  `lightBlock[]` / `lightEmission[]` 全 0；`tiles[]` 全 NULL。
- `Tile::initTiles()` 一共 **89 条方块赋值**（S3 27 + S11 48 + S12 13 + NetherReactor 1），
  另有 8 条特殊 `TileItem` 注册，最后是 `for (i = 0; i < 256; i++)` 的兜底 `TileItem` 与缺分类 LOGE。
- 构造函数的初始化列表：`id`、`material`、`tex`（两参数版本为 1）、`category(-1)`、`gravity(1.0f)`、
  `friction(0.6f)`、`soundType(&SOUND_NORMAL)`、`tmpBB(0,0,0,1,1,1)`、`xx0..zz1 = 0/1`。
  **`destroySpeed` 与 `explosionResistance` 没有初始化**（C++ 读它们是 UB）；按规范第 33 行取 0 并在字段旁注明。
- 构造器只检查槽位是否被占用并 `printf`，**不注册**；注册发生在 `init()`。
- `init()`：写 `tiles[id]`，用当前形状调一次 `setShape`（空操作），
  `solid[id] = isSolidRender()`，`lightBlock[id] = isSolidRender() ? 255 : 0`（**调用两次**），
  `translucent[id] = !material->blocksLight()`。
- `transformToValidBlockId`：槽位为空且 `blockId != 0` 时，按 `((x + y + z) & 1) == 1` 返回
  `info_updateGame1` / `info_updateGame2`；单参重载等价于 `(blockId, 0, 0, 0)`。
- `shouldRenderFace` 的 `xz` 是整数除法怪癖：
  `CHUNK_CACHE_WIDTH == 16 ? 256 : W * W / (W * W / 256 / 2)`，全部按 C++ 的左结合整数除法；
  六个面的“自己缩进去就可见”分支在邻居判断之前；`face == 1` 且邻居是 `topSnow` 时返回 false。
- `getAABB` 写进共享的 `tmpBB` 并返回它的地址；`addAABBs` 用 `push_back(*aabb)` **拷贝**进列表。
- `containsX` 检查的是 **y/z**（不检查 x），`containsY` 检查 x/z，`containsZ` 检查 x/y —— 原版怪癖，照抄。
- `clip` 用局部 `Vec3` 的**指针相等**决定面号（4/5/0/1/2/3），取距离最近的交点；
  没有交点返回默认 `HitResult()`（C++ 的 `f` 是未初始化内存，按规则取 0）。
- `spawnResources` 的随机数顺序：`getResourceCount` 一次 → 每个掉落：`nextFloat()`（与 odds 比，
  **严格大于才跳过**）→ `getResource`（可能再消耗）→ 三个位置 `nextFloat()` → `throwTime = 10`。
  `getResource` 返回 `<= 0` 时直接 continue，**不消耗**三个位置随机数。
- `popResource` 在客户端或创造模式直接返回；`spawnResources` 只在客户端返回。
- `setDestroyTime` 会把 `explosionResistance` 抬到 `destroySpeed * 5`；`setExplodeable` 是 `* 3`；
  `setLightEmission` 是 `(int)(MAX_BRIGHTNESS * f)`，`MAX_BRIGHTNESS = 15`。
- `teardownTiles` 逐个 `delete` 并置 NULL。
- `TileInclude.h` 只有 `#include`，没有任何函数；TS 侧按 ES 模块改成注入（ADAPTED）。

## 工作表结论

| #   | C++ 函数 / 位置                        | TS 方法 / 行                   | 结论                                                        |
| --- | -------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| 1   | `initTiles`（Tile.cpp:161）            | `initTiles` 395                | 一致：89 条注册、8 条特殊物品、兜底循环逐行相同               |
| 2   | `teardownTiles`（304）                 | `teardownTiles` 989            | 一致：置 NULL；`delete` 见 OMIT                              |
| 3   | `transformToValidBlockId(int)`（312）  | `transformToValidBlockId` 993  | 一致：R10 用默认参数合并两个重载                             |
| 4   | `transformToValidBlockId(int,x,y,z)`   | `transformToValidBlockId` 993  | 一致：奇偶与 `& 1` 的写法相同                                |
| 5   | `Tile(int, const Material*)`（323）    | `constructor` 1021             | 一致：R10 合并；未初始化字段取 0 已注明                       |
| 6   | `Tile(int, int, const Material*)`      | `constructor` 1021             | 一致：tex 走三参数分支                                       |
| 7   | `setLightEmission(float)`（363）       | `setLightEmission` 1456        | 一致：`(15 * f) \| 0` 与 `(int)` 同义                         |
| 8   | `isFaceVisible`（369）                 | `isFaceVisible` 1060           | 一致：六个方向的加减与 C++ 相同                              |
| 9   | `init`（382）                          | `init` 1482                    | 一致：三张表 + 两次 `isSolidRender()`                        |
| 10  | `getDestroyProgress`（392）            | `getDestroyProgress` 1222      | 一致：三个分支与除法顺序相同（第三档数值放宽）                |
| 11  | `clip`（399）                          | `clip` 1274                    | 一致：指针相等定面号、最近交点、默认 HitResult                |
| 12  | `spawnResources(..., odds)`（456）     | `spawnResources` 1232          | 一致：随机数顺序、`>` 比较、`<= 0` 跳过                       |
| 13  | `spawnResources(..., data)`（456）     | `spawnResources` 1232          | 一致：R10 用默认参数 `odds = 1` 合并                          |
| 14  | `popResource`（479）                   | `popResource` 1255             | 一致：客户端/创造模式早退、三次位置随机数                     |
| 15  | `destroy`（493）                       | `destroy` 1206                 | 一致：空实现                                                  |
| 16  | `isCubeShaped`（497）                  | `isCubeShaped` 1033            | 一致：true                                                    |
| 17  | `getRenderShape`（502）                | `getRenderShape` 1037          | 一致：`SHAPE_BLOCK`                                           |
| 18  | `getBrightness`（507）                 | `getBrightness` 1056           | 一致：转调 `level.getBrightness`                              |
| 19  | `shouldRenderFace`（512）              | `shouldRenderFace` 1084        | 一致：`xz` 整数除法怪癖与 topSnow 特判都保留                  |
| 20  | `getTexture(level,...)`（539）         | `getTextureAt` 1126            | 一致：R10 拆成实现方法，分派方法保留                          |
| 21  | `getTexture(face, data)`（539）        | `getTextureForData` 1121       | 一致：转调 `getTextureForFace`                                |
| 22  | `getTexture(face)`（539）              | `getTextureForFace` 1116       | 一致：返回 `tex`                                              |
| 23  | `addAABBs`（554）                      | `addAABBs` 1141                | 一致：`push_back(*aabb)` 的拷贝语义                           |
| 24  | `getAABB`（562）                       | `getAABB` 1130                 | 一致：返回共享 `tmpBB`                                        |
| 25  | `isSolidRender`（573）                 | `isSolidRender` 1157           | 一致：true                                                    |
| 26  | `mayPick(data, liquid)`（578）         | `mayPickWithData` 1174         | 一致：R10 拆出，转调 `mayPickBasic`                           |
| 27  | `mayPick()`（578）                     | `mayPickBasic` 1169            | 一致：true                                                    |
| 28  | `getTickDelay`（588）                  | `getTickDelay` 1198            | 一致：10                                                      |
| 29  | `getResourceCount`（593）              | `getResourceCount` 1218        | 一致：1                                                       |
| 30  | `getResource`（598）                   | `getResource` 1214             | 一致：返回 `id`                                               |
| 31  | `getExplosionResistance`（603）        | `getExplosionResistance` 1270  | 一致：`/ 5.0`                                                 |
| 32  | `getRenderLayer`（608）                | `getRenderLayer` 1327          | 一致：`RENDERLAYER_OPAQUE`                                    |
| 33  | `use`（613）                           | `use` 1331                     | 一致：false                                                   |
| 34  | `spawnBurnResources`（618）            | `spawnBurnResources` 1266      | 一致：false                                                   |
| 35  | `getColor`（623）                      | `getColor` 1376                | 一致：`0xffffff`                                              |
| 36  | `getSignal(level,x,y,z)`（628）        | `getSignalAt` 1394             | 一致：R10 拆出（工作表两行都指到了 1399，已补核）             |
| 37  | `getSignal(level,x,y,z,dir)`（628）    | `getSignalInDirection` 1399    | 一致：false                                                   |
| 38  | `isSignalSource`（638）                | `isSignalSource` 1380          | 一致：false                                                   |
| 39  | `getDirectSignal`（643）               | `getDirectSignal` 1409         | 一致：false                                                   |
| 40  | `playerDestroy`（648）                 | `playerDestroy` 1415           | 一致：转调 `spawnResources(..., data)`                        |
| 41  | `canSurvive`（654）                    | `canSurvive` 1426              | 一致：true                                                    |
| 42  | `setDescriptionId`（659）              | `setDescriptionId` 1438        | 一致：加 `tile.` 前缀                                         |
| 43  | `getName`（665）                       | `getName` 1430                 | 一致：`I18n.get(id + ".name")`                                |
| 44  | `getDescriptionId`（670）              | `getDescriptionId` 1434        | 一致                                                          |
| 45  | `setSoundType`（675）                  | `setSoundType` 1446            | 一致：protected，返回 this                                    |
| 46  | `setLightBlock`（681）                 | `setLightBlock` 1451           | 一致：写静态表                                                |
| 47  | `setExplodeable`（687）                | `setExplodeable` 1461          | 一致：`* 3`                                                   |
| 48  | `setDestroyTime`（693）                | `setDestroyTime` 1466          | 一致：抬爆炸抗性到 `destroySpeed * 5`                         |
| 49  | `setTicking`（700）                    | `setTicking` 1472              | 一致：写 `shouldTick`                                         |
| 50  | `getSpawnResourcesAuxValue`（705）     | `getSpawnResourcesAuxValue` 1477 | 一致：0                                                      |
| 51  | `containsX`（710）                     | `containsX` 1496               | 一致：怪癖保留（检查 y/z）                                    |
| 52  | `containsY`（715）                     | `containsY` 1500               | 一致：检查 x/z                                                |
| 53  | `containsZ`（720）                     | `containsZ` 1504               | 一致：检查 x/y                                                |
| 54  | `getTileAABB`（726）                   | `getTileAABB` 1146             | 一致：返回新 AABB                                             |
| 55  | `setShape`（731）                      | `setShape` 1041                | 一致                                                          |
| 56  | `mayPlace(..., face)`（741）           | `mayPlaceOnFace` 1194          | 一致：R10 拆出，转调 `mayPlaceAt`                             |
| 57  | `mayPlace(level,x,y,z)`（741）         | `mayPlaceAt` 1188              | 一致：空气或可替换材质                                        |
| 58  | `setCategory`（750）                   | `setCategory` 1491             | 一致：private，返回 this                                      |
| 59  | `stepSound("step." + name)`（h:43）    | **（无）**                     | 误报：这是 `SoundType` 构造器里的字段初始化，不是方法         |
| 60  | `breakSound(breakSound)`（h:42）       | **（无）**                     | 误报：同上                                                    |
| 61  | `getVolume`（h:52）                    | `getVolume` 122                | 一致                                                          |
| 62  | `getPitch`（h:56）                     | `getPitch` 126                 | 一致                                                          |
| 63  | `getBreakSound`（h:60）                | `getBreakSound` 130            | 一致                                                          |
| 64  | `getStepSound`（h:64）                 | `getStepSound` 134             | 一致                                                          |
| 65  | `updateShape`（h:251）                 | `updateShape` 1050             | 一致：空实现                                                  |
| 66  | `updateDefaultShape`（h:252）          | `updateDefaultShape` 1052      | 一致：空实现                                                  |
| 67  | `addLights`（h:254）                   | `addLights` 1054               | 一致：空实现                                                  |
| 68  | `tick`（h:279）                        | `tick` 1202                    | 一致：空实现                                                  |
| 69  | `animateTick`（h:280）                 | `animateTick` 1204             | 一致：空实现                                                  |
| 70  | `neighborChanged`（h:284）             | `neighborChanged` 1208         | 一致：空实现                                                  |
| 71  | `onPlace`（h:286）                     | `onPlace` 1210                 | 一致：空实现                                                  |
| 72  | `onRemove`（h:287）                    | `onRemove` 1212                | 一致：空实现                                                  |
| 73  | `wasExploded`（h:303）                 | `wasExploded` 1325             | 一致：空实现                                                  |
| 74  | `stepOn`（h:309）                      | `stepOn` 1335                  | 一致：空实现                                                  |
| 75  | `fallOn`（h:311）                      | `fallOn` 1337                  | 一致：空实现                                                  |
| 76  | `getPlacedOnFaceDataValue`（h:313）    | `getPlacedOnFaceDataValue` 1346 | 一致：原样返回 `itemValue`                                   |
| 77  | `setPlacedBy`（h:314）                 | `setPlacedBy` 1360             | 一致：空实现                                                  |
| 78  | `prepareRender`（h:316）               | `prepareRender` 1362           | 一致：空实现                                                  |
| 79  | `attack`（h:318）                      | `attack` 1364                  | 一致：空实现                                                  |
| 80  | `handleEntityInside`（h:320）          | `handleEntityInside` 1367      | 一致：空实现（`Vec3&` 用可变对象表达）                        |
| 81  | `entityInside`（h:329）                | `entityInside` 1413            | 一致：空实现                                                  |
| 82  | `triggerEvent`（h:340）                | `triggerEvent` 1443            | 一致：空实现                                                  |

## 补核成员（工作表没有单独列出的）

| C++ 成员 / 语句                     | TS 位置                          | 结论                                                       |
| ----------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `class Tile::SoundType` 与两个构造器 | `SoundType` 101–120              | 一致：两个构造器的 breakSound / stepSound 规则相同           |
| `virtual ~Tile() {}`（Tile.h:214）  | 无                               | **OMIT（W98）**：空析构，delete 由 GC 接管                   |
| 静态数组初值（translucent 等）      | 256–267                          | 一致：`translucent[0] = true` 的怪癖保留                     |
| 10 个 `static const SoundType`      | 222–231                          | 一致：名字、音量、音高、breakSound 全部相同                  |
| `TILE_DESCRIPTION_PREFIX`           | 219                              | 一致：`"tile."`                                              |
| `RENDERLAYER_OPAQUE/ALPHATEST/BLEND`| 390–392                          | 一致：0/1/2，protected                                       |
| 118 个 `static Tile*`               | 271–388                          | ADAPTED(哨兵)：C++ NULL → `unregistered()`，访问即报错；文件头已注明 |
| 构造器 `printf("Slot %d is already occupied...")` | 1030                 | ADAPTED(日志)：改成 `LOGW` + 构造器名（日志属第三档）         |
| `teardownTiles` 里的 `delete`       | 989                              | **OMIT（W98）**：delete 由 GC 接管                            |
| `TileInclude.h`（只有 include）     | `TileInclude.ts` 全文            | ADAPTED(ESM)：集中 import + 注入 `TILE_CLASSES`（文件头已注明） |

## 修复

**没有运行时修复。** 逐函数对照后没有发现行为差异，因此没有“先红后绿”的修复证据；
新增的 15 条测试是行为锁定（注册表、亮度截断、共享 tmpBB、clip 面号、随机数顺序、R10 分派等），
用来防止以后的“顺手优化”改坏这些细节。

## OMIT

- `OMIT(Tile): virtual ~Tile() {}`：空析构，delete 由 GC 接管（R3）。
- `OMIT(Tile): delete Tile::tiles[i];`：delete 由 GC 接管（R3），置 NULL 的语句已移植。

## 35 条清单核对要点

- 第 1–2 条（float 三档）：方块逻辑属于 R4 第三档“结构一致，数值放宽”，文件头已注明；
  没有需要逐位舍入的字段。`setLightEmission` 的 `(int)` 用 `| 0` 表达，`15 * 15/16 = 14.0625 → 14` 等已用测试锁定。
- 第 3–7 条（截断 / bool / 枚举）：没有 `(char)` / `(short)`；`(int)` 只有 `setLightEmission` 一处；
  bool 表全部是 `boolean[]`；`Facing` 的 0–5 与 C++ 相同。
- 第 8 条（整数除法）：`shouldRenderFace` 的 `xz` 表达式按 C++ 左结合逐步整数除，`| 0` 的位置与括号一致。
- 第 9–12 条（long / 字符串）：`descriptionId` 是字符串拼接；LOGE 文本一致（日志第三档）。
- 第 13–18 条（虚函数 / 重载 / 默认参数）：四组重载按 R10 拆成“分派方法 + 实现方法”，
  子类重写实现方法即可；`transformToValidBlockId` 与 `spawnResources` 用默认参数合并。
  已用 `TexTile` 子类测试验证 `getTexture` 的三个重载分派正确。
- 第 19 条（初始化顺序）：静态表在类定义时初始化；构造器字段初始化顺序无依赖；
  `destroySpeed` / `explosionResistance` 在 C++ 未初始化，按规范取 0 并注明。
- 第 20 条（可见性）：`setSoundType` 等 protected、`init` / `setCategory` / `containsX/Y/Z` private、
  `tmpBB` protected、`descriptionId` private，与 C++ 一致。
- 第 21–25 条（拷贝 / 别名 / 边界）：`getAABB` 返回共享 `tmpBB`；`addAABBs` 压入拷贝；
  `clip` 的指针相等与 `containsX/Y/Z` 的怪癖都保留；`shouldRenderFace` 的六个边界值已测试。
- 第 26–29 条（随机数 / 边界）：`spawnResources` 的 odds → 掉落 → 三个位置顺序已用替身随机数锁定；
  `getResource <= 0` 不消耗位置随机数；`popResource` 在创造模式早退。
- 第 30–33 条（字符 / 日志 / bool）：`printf` 改成 `LOGW`（第三档）；LOGE 的 `%d/%s` 改成模板字符串。
- 第 34 条（标记）：新增 2 处 `OMIT`，没有新增 `ADAPTED`；原有的哨兵与 ESM 注入说明保留。
- 第 35 条（文件头）：把“89 条中注册 88 条、NetherReactor 标 DEFERRED”改成“89 条全部注册”，与实现一致。

## 验证

- `pnpm exec vitest run tests/unit/world/tile-core-audit.test.ts`：**15/15 通过**。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check Tile.ts TileInclude.ts tile-core-audit.test.ts`：通过。
- `node tools/ledger.mjs`：**226 → 228** 条（+2 `OMIT`）。
- 行数：`Tile.ts` 1515，`TileInclude.ts` 140。
