# Task Plan：MCPE-TS（MCPE 0.6.1 → TypeScript 浏览器版）—— 当前状态（2026-10-07）

## 当前阶段

**单机部分已基本移植完。** 原版单机能玩到的内容在 TS 版里都有了；剩下的主要是联机，以及少数在 C++ 里本来就不生效的代码。

| 方面 | 状态 | 验证 |
| --- | --- | --- |
| 世界生成（地形、洞穴、峡谷、生物群系） | 完成（任务单 C） | 黄金样本 randomlevelsource、chunk、biomesource、synth |
| 地物（湖、矿、黏土、花草、甘蔗、仙人掌、泉、雪、4 种树、大树 BasicTree） | 完成 | G17-1（9 个区块逐方块一致）、G17-2（大树 + treeShape 表） |
| 存档（level.dat、区块、玩家数据读写，读档恢复玩家） | 完成（任务单 B + 2026-10-07 补读档） | leveldata、playerdata、saveleveldata、regionfile、player-restore 单测 |
| 方块与物品（含方块实体：箱子、熔炉、告示牌、下界反应核） | 完成（S11–S12） | registry、inventory |
| 玩家与玩法（挖掘、放置、生存/创造、吃东西、受伤、死亡与重生、床与睡觉） | 完成 | entity、collision、death-and-bed 等单测 |
| 实体与生物（掉落物、TNT、落沙、箭、雪球、蛋、画、9 种生物、刷怪） | 完成（任务单 D、H） | entities、pathfinder、mobai、model |
| 生物 AI（寻路、旧 AI、新 AI 目标系统） | 完成；新 AI 照原版不启用 | pathfinder（12 条路径）、mobai（3 只鸡 400 刻）、new-ai 单测 |
| 合成（123 个配方、13 个熔炉配方） | 完成 | recipes（逐个一致） |
| 渲染（区块、实体、方块实体、粒子、天空、云、光照） | 完成 | model、浏览器截图 |
| 声音 | 完成（任务单 F） | sound 场景 19 条断言 |
| 界面（起始菜单、选世界、新建世界、暂停、选项、制作人员、物品选择、合成、护甲、熔炉、箱子、死亡、睡觉、告示牌编辑、控制台、用户名；三种菜单风格） | 完成 | 各界面单测 + 浏览器截图 |
| 命令（/help、/op、/kick、/ban；/gimmieitems 照原版不注册） | 完成 | console-commands 单测 |
| 联机（RakNet、数据包、ServerPlayer、MultiPlayerLevel、加入游戏界面） | **未做，等用户决定** | — |

数字：台账 **139 条**（其中联机 69 条）；测试 **129 个文件**（分批跑：unit/world+web、unit/client+util+platform、golden，一次跑完超过 5 分钟）；
黄金样本 29 份夹具（fixtures/golden/）。

## 还没做的

1. **联机**（台账 `DEFERRED(Network)` 61 + `OMIT(Network)` 8）：浏览器里不能直接用 UDP 的 RakNet，要做得改成 WebSocket，另立任务单。**等用户决定做不做。**
2. **触屏输入**（`DEFERRED(Touch)` 2，C++ 约 1100 行）：只在手机网页上才需要。
3. **统计**（`DEFERRED/OMIT(Stats)` 3）：不影响游玩。
4. **C++ 里本来就不生效、保持不移植的**（有理由，写在代码里）：
   - 大爆炸 / 水花粒子（创建语句被注释掉；还缺 misc/explosion.png 与 WaterDropParticle）；
   - CreatorMode（只在 `#ifdef CREATORMODE` 时编译）；
   - RolledSelectionListV（只被联机的加入游戏界面使用）；
   - 地牢 DungeonFeature、村庄 TownFeature（没有调用点）；
   - 三脚架相机拍照 takePicture、若干析构函数与调试用代码。
5. **要用户拍板的两件**：大树要不要启用（原版不启用，启用后世界与原版不同）；联机做不做。

## 2026-10-06 ～ 10-07 完成的工作（按顺序）

方块实体渲染 → 告示牌编辑 → 任务单 H（随机数同构、寻路、旧 AI、生物工厂与 9 种生物、自然刷怪、新 AI）→ 吃东西崩溃修复
→ 地物生成 → 选项界面 → 菜单风格黑屏修复 → 合成系统 → 合成与护甲界面 → 熔炉与箱子界面 → 读档恢复玩家
→ 死亡与重生（含“重生后仍是死的”修复）→ 床与睡觉 → 天空、云、光照 → 开关门声音、调试帧时间图
→ 控制台、命令、聊天、用户名界面 → 经典菜单风格的三个界面 → 大树 BasicTree。
每一步的细节见 progress.md 同日条目。


## ⚠ 这几条踩过的坑，别再踩

- **这个世界只有 256×256。** `ChunkCache::fits` 写死区块 `0 <= x,z < 16`
  （`CHUNK_CACHE_WIDTH = 16`），范围外返回 `EmptyLevelChunk`（整块 `invisible_bedrock` 95、
  `heightmap` 恒 0）。连带：`Level.getHeightmap` 对**没生成的区块返回 0 且不触发生成**；
  出生点从世界中心 **(128,128)** 起步，不是 (0,0)。
- **DEFERRED 的函数要写成空实现，不能写成 `throw`。** `postProcess` 就是栽在这上面：
  它在 `ChunkCache.getChunk` 每凑齐 2×2 个区块时都会被调到，写成 throw 等于把整条路堵死。
  上一句 `Dimension.createRandomLevelSource` 的 throw 恰好排在它前面，所以一直没暴露。
- **量地形不能只看"有没有报错"**：`if (top < 0) top = y` 那种写法会把"最高点"记成"最低点"，
  断言看着合理、其实恒为假。**先跑一遍看数字，再写断言。**

---


# 附录：任务单 C ～ H 时期的“当前阶段”记录（2026-10-07 之前，保留作历史）


## Goal

把普通维度的**地形**生成出来，让起始菜单点进一个世界真的能进去。
每一步都用参考 C++ 的黄金样本或浏览器实测验证。

任务单：`docs/ai/TASK-C-世界生成.md`（含结束时的「任务单 C 完成」章节）。
上一份 `docs/ai/TASK-B-存档.md`（存档）已完成，B0–B9 全部走完。

## Next Step

**方块实体渲染做完了（2026-10-06，Claude）**：告示牌在世界里显示（牌子、立杆、四行字）；箱子照原版按方块画。
台账 238 → 232，`DEFERRED(TileEntityRender)` 清零。详见 progress.md 同日条目。告示牌文字编辑（TextEditScreen）也已完成。剩下的候选：生物 AI（PathfinderMob.updateAi）→ MobFactory 与 7 种生物。

**任务单 H（生物与 AI）**：**全部完成**（2026-10-06：寻路、新旧两套 AI、9 种生物、自然刷怪）。台账 181。地物生成也已完成（2026-10-07，G17-1 逐方块一致）。选项界面也已完成（2026-10-07）。合成与护甲界面也已完成（2026-10-07）。熔炉与箱子界面也已完成（2026-10-07）。下一步候选：死亡界面、聊天与控制台、睡觉界面。新 AI 按用户决定放在 H11 移植。

**任务单 F（声音）做完了（F0 ~ F8，5 个提交）。** 任务单 `docs/ai/TASK-F-声音.md`。

| 步 | 提交 | 台账 | 一句话 |
| --- | --- | --- | --- |
| F0 | `26e65c5` | 231 | 任务单落盘 |
| F1 | `9785ea5` | 231 | `SoundDesc` + `SoundRepository` |
| F2 | `8200e41` | 231 | `.pcm` → `sounds.bin` + `sounds.json`（103 条 / 6.09 MB） |
| F3~F7 | `9d9789c` | 222 | 引擎 / Web Audio 后端 / 接线 / 场景 |
| F8 | `5b0b2f2` | 222 | 完成章节 + 手册 + 补两处测试空白 |

**台账 231 → 222**；`DEFERRED(Sound)` 6 → **0**，`OMIT(Sound)` 5 → 1（只剩 levelEvent）。
`pnpm typecheck` 0；`pnpm test` **95 文件 / 1060 条全过**；
场景 `sound.mjs` **19 条断言全过**。**用户已实测：声音基本正常。**

**任务单 G（模型系统与实体渲染）—— 已完成（G0 ~ G12）。**
任务单 `docs/ai/TASK-G-模型与实体渲染.md`（十二小步 G0~G12）。

| 步 | 提交 | 台账 | 一句话 |
| --- | --- | --- | --- |
| G0 | `6e2ded0` | 222 | 任务单落盘（侦察实测 + 用户拍板） |
| G1 | `b420bc6` | 222 | 模型几何黄金样本（`fixtures/golden/model.json`） |
| G2 | `f4bb134` | 233 | `VertexPT` + `PolygonQuad` |
| G3 | `555a544` | 233 | `Model` 基类 + `Cube` + `ModelPart`（造形状那一半） |
| G4 | `e72a4ab` | 225 | `ModelPart` / `Cube` 的渲染那一半 —— **几何层立起来了** |
| G5 | `ea782f6` | 234 | `Model` 基类默认值单测 + `ModelInclude` |
| G6 | `3266257` | 234 | `MobRenderer`（**0 条 DEFERRED**）+ 13 条单测 |
| G7 | `26dcc0f` | 233 | `HumanoidModel`（**0 条 DEFERRED**）+ 25 条单测 |
| G8 | `fdf7cba` | 233 | `HumanoidMobRenderer`（**0 条 DEFERRED**）+ 16 条单测 |
| G9 | `9153163` | 233 | `ChickenModel` + `ChickenRenderer`（**0 条 DEFERRED**）+ 14 条单测 —— 第一只看得见的生物 |
| G10 | `6aea16c` | 233 | `TntRenderer` / `PaintingRenderer` / `TripodCameraRenderer`（相机照 C++ 不注册）—— 23 变异全红、4 张截图 |
| G11 | `8c01c9e` | 231 | `PlayerRenderer` + 空手手臂 + 皮肤预加载修复 —— 30 变异全红、2 张截图 |
| G12 | `f32535b` | 238 | 收尾：7 只生物逐条 `OMIT(Entity)` + PITFALLS「模型几何」一节（无代码逻辑改动） |

**任务单 G 到此结束（G0 ~ G12），等用户定下一步。** G11 之后用户实机确认过：玩家模型没问题。
⚠ 那条"G2–G9 变异清单存疑"已解决：`mutate.mjs` 修好后**补跑过真测试**，四条没抓住的逐条定性
（2 条等价变异换掉、2 条真盲区补测试），最终 **102/102 全红**（提交 `b63c02c`）。

下一步的候选（任务单 G 收尾时列出的「已知缺口」，等用户定）：
1. **`renderer/tileentity/`**（箱子、告示牌）—— `DEFERRED(TileEntityRender)` 那几条；
2. **`EntityTileRenderer`** —— 方块的"实体形态"；
3. **`MobFactory` / `MobAI`** —— 7 只生物（猪牛羊骷髅僵尸苦力怕蜘蛛）的实体与渲染器，
   依赖 `PathfinderMob` 的 AI。

⚠ **G0 侦察时纠正了一条旧记录**：以前写的"11 个实体看不见"是**错的**。
实测 `packages/world/src/entity/` 全 30 个文件，**生物类只移植了 `Chicken` 一个**
（`MobFactory::CreateMob` 整条 `OMIT(Entity)`）。真正"逻辑全对但画面上看不见"的只有 5 个：

| 实体 | 缺什么 |
| --- | --- |
| `Chicken` | `ChickenRenderer` + `ChickenModel` + `MobRenderer` |
| `PrimedTnt` | `TntRenderer` |
| `Painting` | `PaintingRenderer` |
| `TripodCamera` | `TripodCameraRenderer` |
| `Player` | `PlayerRenderer` + `HumanoidMobRenderer` + `HumanoidModel` + `MobRenderer` |

猪/牛/羊/僵尸/骷髅/蜘蛛/苦力怕的模型与渲染器**不做**（实体类本身没有，三个判据一个都用不上），
记 `OMIT(Entity)` 留给 MobFactory / MobAI 落地时一起补。

**用户 2026-10-04 拍板的两个决策**：范围只做上面这 5 个；模型几何**要写黄金样本**
（新开一节 `model`，`fixtures/golden/model.json`）。

规模（`wc -l` 实测）：模型层 **1890** 行 + 缺的渲染器 **1256** 行 ≈ **3146** 行 C++，
切成 **12 小步**（G0~G12）。台账基线 **222**。

更远的两个缺口（本任务单不做）：
1. `PathfinderMob.updateAi`（AI 大系统）→ 生物站着不动；
2. `MobFactory` / `Sheep`（依赖 1）。

以前的进度（任务单 D）：

**任务单 D 做完了（D0 ~ D12）。**

**任务单 D 收官**（提交 `ed57aaa` D0 任务单 → `151fd26` D11.5，19 个提交）：

| 步 | 提交 | 台账 | 一句话 |
| --- | --- | --- | --- |
| D0 | `ed57aaa` | 252 | 任务单落盘 |
| D1 | `5a5ebff` | 251 | `FallingTile` 真类 |
| D2 | `a9b7345` | 245 | 接上线（HeavyTile / SandTile / EntityFactory） |
| D2.5 | `4a9eca6` | 246 | `FallingTileRenderer` |
| D3 | `f3f0df8` | 245 | `Explosion` + `Level.explode`（**唯一带黄金样本的一步**） |
| D4 | `3b3fcdc` | 238 | `PrimedTnt` + `TntTile`（会连锁） |
| D5 | `d3f13a5` | 235 | `TripodCamera` + `Level.takePicture` |
| D6 | `18de1f6` | 235 | `HangingEntity` 基类 |
| D7 | `6dd9db8` | 232 | `Motive` + `Painting` + 接线 |
| D8 | `effaec8` | 232 | `Throwable` 基类 |
| D9 | `1b15d18` | 230 | `Snowball` + 接线 |
| D9.5 | `b5669ec` | 230 | `ItemSpriteRenderer` |
| D10a | `7c51828` | 240 | `PathfinderMob` + `AgableMob`（D0 漏算的两级基类，+10 条 AI 标记） |
| D10b | `cded881` | 240 | `Animal` + `Chicken` |
| D10c | `96bd7e3` | 238 | `ThrownEgg` + 接线（扔蛋孵鸡） |
| D11a | `6b02836` | 238 | `Arrow` 类本身 |
| D11b | `22e4d0d` | 236 | 接线（七种实体全真类） |
| D11.5 | `151fd26` | 236 | `ArrowRenderer` |

**台账 252 → 236；`DEFERRED(Entity)` 8 条 → 2 条**（`MobFactory` + `DyePowderItem` 的 `Sheep` 分支，
都归第四类）。详见 `docs/ai/TASK-D-实体.md` 的「任务单 D 完成」章节与 progress.md。

⚠ **留给后面任务单的三个已知缺口**：
1. **`ChickenRenderer` 等 11 个渲染器没移植**（要模型系统）→ 鸡、TNT、画的逻辑全对但画面上看不见
2. `PathfinderMob.updateAi` 整条 `OMIT(MobAI)` → 生物没有 AI（站着不动）
3. `Sheep` / `DyePowderItem` 那条没解开（依赖 MobAI）

D1 交付：`FallingTile` 从 6 行空接口换成真类，7 条单测。台账 252 → 251
（`FORWARD-DECL(FallingTile)` 消失）。**又一次抓到自己造的无效扰动**（漏包 `f(0.04)` 在
FallingTile 上观测不出差别，差值是一个 ULP 的 1/130），已写进测试注释。详见 progress.md。

任务单 D 的目标是手册阻塞清单里"堵在独立小实体类"那 8 条：
`FallingTile` / `PrimedTnt` / `TripodCamera` / `HangingEntity`+`Painting` / `Snowball` /
`ThrownEgg` / `Arrow`（`Sheep` 归第四类，不算）。
拆成 D1–D12 十二小步，「移植一个类」与「接线」分开，每步各有独立判据。
⚠ 这批**没有黄金样本**（行为/画面），判据是"无头真 Level 单测 + 浏览器场景 + 看截图"。

**（2026-10-04 插进来修的 bug）** 用户报"进任何 UI 界面都看不见鼠标、只能盲选、运动范围还受限"。
查出来是**两个独立的原因**：`AppPlatform_web.hideCursor` 照着参考实现的**形参名**写反了方向
（原版那个三元表达式是反的），以及鼠标坐标是 CSS 像素、画布是设备像素，dpr≠1 时只能够到
屏幕左上角的 1/dpr。都修了，新增 `cursor.mjs` 场景 + `SMOKE_DPR` 环境变量，
PITFALLS 补第 27、28 条。详见 progress.md。

## Current Phase

**C-1 ~ C-7 全部完成。从菜单点进一个新生成的普通世界，两条入口都通。**

### 最终数字

- 67 个测试文件 / **621 条测试**全过；`pnpm typecheck` / `pnpm build` OK
- 移植台账 **252 条**
- 浏览器五个场景全绿：default 21 / storage 13 / startmenu 44 / options 8 / worldgen 22

### 能做的

从起始菜单点进一个**新生成的普通世界** ——「开始游戏 → 新建世界 → Create」和
「选世界界面点一张世界牌」两条入口都通。地形是 1:1 移植的：
高度场 → 石头/水/冰 → 表层（草/沙/沙岩/砾石/雪）+ 基岩 → 洞穴 → 峡谷。
在这之上能挖能放、能存能读、能退回标题再进。

### 做不了的（一条）

**世界里没有地物** —— 湖、矿、树、花草、泉、雪整段是 `RandomLevelSource::postProcess`
（315 行），仍是空实现。所以**挖不到矿、没有树**。

⚠ **区块照样会被标成 `terrainPopulated = true` 存下去** ——
以后补上地物时这些老区块不会追溯补上，开发期间测过的世界得**删掉重新生成**。

## 下一轮该补的

1. **夹具盲点**：G15-1 那 5 个区块 `(20,0) (14,19) (-120,-113) (-37,11) (-40,35)`
   **全在真实世界（256×256）之外**。判据本身有效，但游戏真正会生成的那片区域一个都没逐字节比过。
   补法：往 `tools/golden/harness_randomlevelsource.cpp` 的 `CHUNKS` 里加一个落在 `0..15` 的区块，
   `REF=$REF bash tools/golden/build.sh randomlevelsource` 重新生成夹具。
2. ~~`Dimension.getTimeOfDay` 的 float/double 差异~~ —— 2026-10-07 核实：S4 黄金样本证明现有写法与 C++ 逐位一致，标记过时。
   这一轮没动它（用户没拍板）。
3. **`postProcess`（地物系统）** —— 写它之前要先把湖/矿/树/花草/泉/雪这些 feature 类做齐。
   **顺序是唯一要紧的事**：它按固定顺序消耗同一个 `random` 流，顺序错一步整章地形全错位，
   而且从结果上看不出是哪儿错。


# 附录：任务单 B（存档）的规划与历史 —— 已完成

## Goal

让网页版能存档：新建/保存/读取世界，刷新后还在。每一步都用参考 C++ 的黄金样本或浏览器实测验证。

## Next Step

**任务单 B 做完了，等用户定下一步。**

下一步的候选（按我的判断排序）：

1. **世界生成（`RandomLevelSource`）** —— 现在唯一堵住"进世界"的那块。没有它，
   起始菜单点「开始游戏 → 某个世界」永远抛；`selectLevel` 上面还压着
   `DimensionFactory`、`LevelChunk` 的地形填充、`BiomeSource` 等一串。
   这是把"界面齐了但进不去"变成"真的能玩"的关键，但它也是个大块头，得先摸依赖。
2. **`OptionsScreen` / `UsernameScreen`** —— 移植这两个界面，`Options::save` 的
   另外三个调用点才算接上，"改完选项自动存"才会有（现在只会在启动时存一次）。
3. **`ScrolledSelectionList` + `JoinGameScreen`**（联机那一摊）—— 优先级最低。

我倾向于 1，但这属于"新功能"而不是"接着做任务单"，按项目规则应该先停下来问。

B9（选项文件）实测要碰 8 个文件、约 470 行，超了「一步 300 行 / 5 个文件」的线，
按规则停下来拆三小步：

| 步骤    | 内容                                                          | 文件数 |
| ------- | ------------------------------------------------------------- | ------ |
| **B9a** | `OptionsFile` 本体 + `r`/`w` 文件模式 + 单测                  | 4      |
| **B9b** | 黄金样本（`fgets` 的一堆边界规则太容易想当然，必须有真值）    | 4      |
| **B9c** | 接进 `Options.ts` 的 4 处 + 浏览器场景（选项真的存得住）      | 3      |

B8（界面）**全部完成**。原计划的 B8g 有两件事：换启动入口（用户选"换"）+ 场景扩写。
按「一步 5 个文件」的线拆成 B8g-1 / B8g-2 两小步，都做完了。
**代价（用户已接受）**：打开页面是起始菜单，但点进任何世界都会抛 —— 世界生成没移植。

## Current Phase

**B9b 完成**：黄金样本 G9-1（`2597c16`）—— 22 个读用例 + 7 个写用例。
参考实现的真实行为有几个和我推的不一样，最意外的是 `line-127` 会返回**空表**
（第二段 `:1` 只有 2 字节，被 `len < 3` 丢掉）。做了反向验证：127 改成 128 →
恰好那 4 条边界用例变红。夹具逐字节可复现。
**B9a 完成**（`1ba9132`）： 实测依据：`OptionsFile.cpp`（约 90 行）用 `fopen("r"/"w")`（**文本模式**，
B1 的 `FsMode` 只有 `rb/wb/r+b/w+b`，得补）和 `fgets`（127 字节上限、`len < 3` 跳过、
第一个 `:` 切分 —— 三条规则都容易想当然，所以 B9b 要出黄金样本）。
接线点已经都在：`Minecraft.initApp` 调 `options.load()` + `reloadOptions()`，
`NinecraftApp` 调 `setOptionsFilePath`。C++ 里 `Options::save` 的另外三个调用点
（`OptionsScreen` ×2、`UsernameScreen`）都没移植，所以网页版只会在启动时存一次。

**B8g 完成**（两小步）。B8g-1 换启动入口（`fd30fd3`）：`NinecraftApp.initApp`
换回 C++ 原样的 `screenChooser.setScreen(SCREEN_STARTMENU)`，「有存档就进最近的」那段 ADAPTED(Demo)
删掉，`startDemoWorld()` 降级成场景后门；三个场景改成自己走一遍后门。
B8g-2 场景扩写（`c007c9f`）：`default.mjs` 补「放方块 → 退回标题 → 重进 → 方块还在」，
`startmenu.mjs` 把进世界的**两个入口**都钉上（都抛"世界生成没移植"）。
台账 **254 → 251（−3）**：`NinecraftApp.ts` 里起始界面那条 `DEFERRED(Gui)` 变成了真调用，
另外两条 `ADAPTED(Demo)` 随那段 hack 一起删了。
（**更正**：B8g 的报告里我写的是「254 不变」，那句没测就写了；事后核对才发现少了 3 条。）
**B8f 完成**（`Minecraft.leaveGame` + 暂停界面「Quit to title」，12 条单测 + 14 条浏览器断言，
**从游戏里真的能退回起始菜单了**；台账 254 不变）。
**B8d-3 完成**（`SelectWorldScreen` + `DeleteWorldScreen` + 接线，20 条单测 + 22 条浏览器断言，
**菜单的「开始游戏」真的能点进世界列表了**；台账 250 → 255）。
**B8d-2 完成**（`Touch::WorldSelectionList`，19 条单测；台账 250 不变）。
**B8d-1 完成**（`ProgressScreen`，7 条单测；台账 248 → 250）。
**B8c 完成**（`Touch::StartMenuScreen`，12 条单测 + 13 条浏览器断言，**菜单在浏览器里出来了**）。
**B8b-2 完成**（`TextBox` + `AppPlatform_web` 的隐藏 input，13 条单测）。
**B8b-1 完成**（`LargeImageButton` + `ConfirmScreen`，13 条单测）。
**B8a 完成**（`TweenData` + `RolledSelectionListH`，17 条单测）。
**B8e 完成**（`ChooseLevelScreen` + `SimpleChooseLevelScreen`，16 条单测 + 32 条浏览器断言，「Create new」能点、隐藏 input 真能打字；台账 255 → 254）。
B8 原"一步做完界面"实测是 2000+ 行 C++、10 个新文件，按
「一步 300 行 / 5 个文件」的线拆成十小步（B8d 又按类拆成 3 小步）；
三条决策已由用户确认（详见 `docs/ai/TASK-B-存档.md` 的 B8 段）。

**另外单独提交了一个与 B8 无关的修复**（`7969503`）：`vitest.config.ts` 的 hookTimeout
10 → 30 秒。`s9.test.ts` 的 beforeAll 要启动整个游戏，默认值本来就没余量，并行时会随机红。
在干净工作区（stash 掉本轮全部改动）复现过，**不是 B8c 引入的**；没改任何断言。

B7 完成；B6 完成；**B5 六小步全部完成**（B5a-1 / B5a-2 / B5b-1 / B5b-2 / B5c-1 / B5c-2）；
B4 四步全部完成（`e37c870` / `c7d28eb` / `bb8a63a` / `39797f9`）；build.sh 提速完成（`1a0ad6c`）

## B8 的拆分（界面：起始菜单 / 选择世界 / 新建世界）

实测依赖清单（C++ 行数）→ 八小步。前几步画面上看不到，只能靠单测；B8c 起开截图验证。

| 步骤      | 内容                                                    | C++ 行数 | 状态     |
| --------- | ------------------------------------------------------- | -------- | -------- |
| **B8a**   | `TweenData` + `RolledSelectionListH`                    | 299      | 完成     |
| **B8b-1** | `LargeImageButton` + `ConfirmScreen`                    | 188      | 完成     |
| **B8b-2** | `TextBox` + `AppPlatform_web` 的隐藏 input              | 102      | 完成     |
| **B8c**   | `Touch::StartMenuScreen` + 接线（浏览器里第一次看得见）  | 230      | 完成     |
| **B8d-1** | `ProgressScreen`                                        | 99       | 完成     |
| **B8d-2** | `Touch::WorldSelectionList`（翻牌列表本体）             | —        | 完成     |
| **B8d-3** | `Touch::SelectWorldScreen` + `Touch::DeleteWorldScreen` + 接线 | —  | 完成     |
| **B8e**   | `ChooseLevelScreen` + `SimpleChooseLevelScreen`         | 287      | 完成     |
| **B8f**   | `Minecraft::leaveGame` + 暂停界面 "Quit to title"       | 35       | 完成     |
| **B8g**   | 场景扩写 + 换启动入口（拆成 B8g-1 / B8g-2）             | —       | 完成     |

**`components/ScrolledSelectionList` 剔出去了**：`RolledSelectionListH` 并不继承它，是直接继承
`GuiComponent` 抄了一份横向的。全仓库只有 `JoinGameScreen`（联机，`OMIT(Network)`）真正用它。

**三条已定决策**（用户 2026-10-03）：

1. **不搞平坦维度绕行** —— `selectLevel` 忠实留着，调用即抛（世界生成未移植）。B8 交付界面本身。
2. **文本框挂隐藏 `<input>`，真能打字** —— 标 `ADAPTED(Web)`。
3. **启动入口 B8 期间不动** —— 每步都不影响现有场景。

**B8g 的待决问题已解决**（用户 2026-10-03 选的是「换」）：入口换成起始菜单后 demo 世界就进不去了
（`selectLevel` 抛），`default.mjs` / `storage.mjs` 会断 —— 已按"换"处理，场景改走 `startDemoWorld()` 后门。

**验证菜单的办法**：打开页面就是菜单了（B8g 起）；场景里那句
`__app.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU)` 现在是幂等的，留着当保险。

**顺带要补的**：`gui/title.png`、`gui/default_world.png` 不在 `apps/web/src/assets.ts` 预加载表里（B8d / B8e 补）。

## B5 的拆分（改动过，理由见 `docs/ai/TASK-B-存档.md` 的 B5 段）

原计划 B5 分三步、FolderMethods 在 B6。实测后改动两次，现在是六小步：

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| **B5a-1** | `FolderMethods` + `getRemainingFileSize` 归位 + 补 `LevelData` 的 `DEFERRED(Player)` | 完成 `e627cc5` |
| **B5a-2** | 构造/析构/prepareLevel/saveLevelData/savePlayer/loadPlayer + G14-4 | 完成 `0b96738` |
| **B5b-1** | `LevelConverters` + 区块 `save`/`load` + G14-5 | 完成 `f5d1ed0` |
| **B5b-2** | `tick`/`savePendingUnsavedChunks`/`saveAll`/`flush` + ChunkStorage 那一半（差 saveEntities） | 完成 `2977749` |
| **B5c-1** | `saveEntities` + 补三处 `DEFERRED(Entity)` + 黄金样本 G14-6 | 完成 `a49af5a` |
| **B5c-2** | `EntityFactory`（新）+ `loadEntities` + G14-6 补"读回来"那半 | 完成 |

### B7 记录

- **开工前改了拆分**（用户确认）：原计划含 `leaveGame`，但它一头一尾是网络和界面，唯一调用方
  是暂停界面的 "Quit to title"（B8）。**挪到 B8**，和调用方一起做。
- 新建 `packages/world/src/server/ServerLevel.ts`（97 行 C++）：管睡觉那个类。
  三个函数里的 `raknetInstance->send(...)` 标 `DEFERRED(Network)`，其余逻辑完整。11 条单测。
- `Minecraft.selectLevel` / `getLevelSource` / `setScreen` 的 `saveGame()` 三处接上；
  `NinecraftApp` 换成 `ExternalFileLevelStorageSource('', '')`，**有存档进最近的、没有才新建 demo**。
- **三条实测发现**（都写进任务单了）：
  ① `selectLevel` 现在调不通 —— 它不传维度，`DimensionFactory` 给的普通维度里
     `createRandomLevelSource()` 还是 `DEFERRED(Levelgen)`（`RandomLevelSource` 没移植，调用即抛）。
     所以 demo 入口绕开它、直接构造 `ServerLevel` 并指定 `FlatDimension`。**B8 的世界选择界面对
     非平坦世界还走不通。**
  ② **`main.ts` 从来没调过 `setVfs()`** —— B1b 只把它挂到 `window.__vfs`。B7 之前应用路径上没人用
     `getVfs()`，所以一直没暴露；一接上真存档，页面直接起不来。已补。
  ③ `ServerLevel.updateSleepingPlayerList` 判定"全睡了"之后会给每个人调 `setAllPlayersSleeping()`，
     而 C++ 那个函数头一句就是 `sleepCounter = 0` —— 所以"刚全睡那一瞬间"还跳不了夜。
- 浏览器场景 `tools/verify/scenarios/storage.mjs`：11 条断言全过，**刷新前后两张截图逐像素相同**。
  默认场景重跑也过。
- 台账 246 → 245（−4 条 Storage、+2 条 Network、+1 条 `ADAPTED(Demo)`）。

### B6 记录（提交见下）

- 新建 `LevelStorageSource.ts`（基类 + `LevelSummary` + `TempLevelId` + `levelSummaryLess`）
  与 `ExternalFileLevelStorageSource.ts`。
- **开工前发现 B1 已经铺好路**：`VirtualFS.deleteDirectory` 在 B1 就按 C++ `platform/file.h`
  的语义造好了（含"不是真递归"那条怪癖），注释里还点名了 `deleteLevel`。所以没动 FolderMethods。
- **三处原样保留的怪癖**：① `renameLevel` 里那个 `if` 是**空块**，改名在外面无条件跑，而
  `_renFULLPATH` 只拼 basePath —— 临时世界的改名也落在 basePath；② `readLevelData` 读坏了也算成功，
  于是坏 level.dat 会往列表里塞一条**字段全默认**的摘要；③ `deleteLevel` 的兜底分支不是死代码
  （目录里有非空子目录时整目录删会失败，兜底只删三个文件、子目录留下）。
- **两处 ADAPTED(Web) 偏离**（台账 244 → 246）：`_errno()` 没有对应物；readdir 的 `.` / `..`
  两次探测在 VirtualFS 下必然打不开（路径规范不解析点），结果一样但机制不同，所以不试。
- **又踩了一次 storageVersion 的坑**：测试助手忘了设（默认 0 而 readLevelData 只认 ==1/>=2），
  症状是"世界列表里名字为空"。B5a-2 记过，这次写进测试助手注释了。
- 没写黄金样本：产物不是字节格式（字节那层已由 G14-2/G14-4 盖住），用 20 条单元测试盖。

### B5c-2 记录

- `EntityFactory`（新文件）：`CreateEntity` + `loadEntity`。**只有掉落物是真移植** ——
  TS 里 `FallingTile`/`TripodCamera` 只是 FORWARD-DECL，其余五种连文件都没有，六个 case 原地
  留 `DEFERRED(Entity)`；`id < 64`（生物）整条走不了，`MobFactory::CreateMob` 标 `OMIT(Entity)`。
  台账 236 → 244。
- `loadEntities`：头 12 字节（magic 只读 4 个、**三个 fread 的返回值全被忽略**）→ `numBytes <= left`
  那道闸 → NBT → 实体走 `level.addEntity`，方块实体走 `getChunkAt` + `hasTileEntityAt` + `addTileEntity`。
- **原样保留：这里不检查 `NbtIo::read` 的返回值**，而同一文件里的 `readLevelData` / `loadPlayer`
  都写了 `if (tag)` —— 参考源码自己的不一致。留着（写 `tag!`）。
- **原样保留：`getChunkAt` 从不会返回 NULL**，所以 "Couldn't find chunk" 那条是死代码。
- 夹具 G14-6 补上 `roundTrip`：`firstLoad`（正常进）/ `secondLoad`（方块实体位置已占 → 丢掉）/
  `truncated`（numBytes 比剩下的多 → 什么都不读）。`cases` 的字节没变。

**harness 里踩的两个坑（都不是实现问题）：**

1. **`harness_chunk` 那个两参 `LevelChunk(Level*, x, z)` 不分配方块数组**，任何 `getTile` 都是空
   指针取值 —— 第一次跑就段错误。harness_chunk 没暴露是因为它从没读过区块里的方块。
   定位办法：把 harness 单独用 `-fsanitize=address -g` 重编、跟 `$LVL/*.o` 和 `ent.stubs.oo`
   一起链接（`tools/golden` 里没装 gdb）。
2. **方块实体不能靠 `chunk->setTile` 摆**：`setTile` 末尾会调 `Tile::tiles[t]->onPlace(...)`，
   而 `SignTile::onPlace` 正是创建方块实体挂上去的地方 —— 走它的话 `loadEntities` 跑到时那个坐标
   已经有方块实体了，"Adding TileEntity" 永远走不到（实测两次都走 "Already have"）。
   改成往方块数组里直接写值。

### B5c-1 记录

- `saveEntities`（`ExternalFileLevelStorage`）：两个循环各建一张 ListTag，整棵树过 `NbtIo::write`，
  套 12 字节头写成平文件。**两个 int 走 fwrite（小端）、NBT 走 BitStream（大端）** —— 同一个文件
  里两套端序路径，这正是 B2 出过 bug 的地方，所以 G14-6 记的是整个文件的十六进制。
- 接上 tick / saveGame 两处 `DEFERRED(Entity)`；台账 238 → 236。`createChunkStorage` 那个断言
  终于名副其实（ChunkStorage 六个方法齐了）。
- **`entitiesFile` 字段从没被 C++ 用过**，照原样留着并写明理由；`ChunkVersion_Entity = 2` 只出现在
  一行注释掉的代码里，不建常量、只留注释。
- **玩家永远不会进 entities.dat**：`Entity::save` 开头 `if (removed || id == 0) return false`，
  而 `Player::getEntityTypeId()` 返回 **0**。玩家有单独的路（`players/<名>.dat`）。
- `tick` 里的存实体分支**不在 `if (… && level)` 里面**，也没做空判断 —— 照抄（`this.level!`）。
- 新 harness `harness_entities.cpp` + `entities.json`（两个用例：空世界 / 有实体与方块实体）。
  连跑两次逐字节一致。夹具里空 ListTag 的元素类型记的是 **1（TAG_Byte）** —— 两边 `write` 里
  都是 `else type = TAG_Byte`，对得上。
- **测试踩的三个坑（都不是实现 bug）**：① B5b-2 那个只带 `getChunk` 的 level 替身不够了，
  得补 `entities`/`tileEntities`；② 构造函数自己会建世界目录（C++ 也是），所以"目录不存在"
  测不出来，得先建再删；③ `VirtualFS.remove` 删不掉非空目录（照抄 C++ 的怪癖），删世界目录前
  得先删 `players/`。

### B5c 开工前实测（任务单原文两处错，已改回 `docs/ai/TASK-B-存档.md`）

1. **`entities.dat` 不是 RegionFile。** 原文写"RegionFile 的第二个实例"，但 `entitiesFile` 这个字段
   **声明了却从没被用过** —— 全文件只有 `ExternalFileLevelStorage.h:90` 的声明与 `.cpp:86` 的
   `entitiesFile(NULL)`。实际是裸 `fopen` 的平文件：`"ENT\0"` + int32 version(=1) + int32 numBytes + NBT。
2. **`ChunkVersion_Entity = 2` 是死的** —— 只出现在 `.cpp:469` 一行**被注释掉的**代码里。

**为什么拆**：原文一步 6 个文件、约 420 行。`saveEntities` 不依赖 `EntityFactory`（只有 `loadEntities`
依赖），所以按"存/读"拆，每步的夹具只记这一步真正移植的那半。用户已确认。

**顺带查清**：`EntityFactory::CreateEntity` 在 C++ 里只有两个调用方 —— `loadEntity` 自己，和
`ClientSideNetworkHandler.cpp:235`（网络，没移植）。所以它现在只服务 `loadEntities`。

### B5b-2 记录（提交 `2977749`）

- `tick()`：每 1000 tick 扫区块缓存 16×16，把 `unsaved` 的收进待保存列表并清标记，再挑最老的存两个；
  另外每 60 秒存一次实体。**`savePendingUnsavedChunks(2)` 在 if 里面** —— 平时一个都不存。
- `savePendingUnsavedChunks(maxCount)`：挑 `addedToList` 最小的存。**返回值比实际存的多 1**
  （原文 `while (++count <= maxCount && …)` 先自增再判断），`saveAll` 拿它打日志所以数字总是多一个。
- `saveAll`：C++ 显式调用 `ChunkStorage::saveAll` 那两行 —— TS 只能单继承，照抄过来并注明。
- 三处 `DEFERRED(Entity)`：tick 的存实体分支、`saveGame` 整体（C++ 就一句 `saveEntities`）、
  `createChunkStorage` 还差的 `saveEntities`。台账 236 → 238。
- 顺带发现：`lastSavedEntitiesTick` 只在 `saveEntities` 里被写（527/590 行），所以本步没移植它之前，
  tick 里那个"每 60 秒"的判断每 tick 都成立 —— B5c 补上才恢复。
- 测试：tick 的 level 用只有 `getChunk` 的替身（真 Level 每轮扫 16×16 会当场生成 256 个区块）

### B5b-1 记录（提交 `f5d1ed0`）

- `LevelConverters`（C++ 里定义在 .cpp **内部**、不在头文件）→ 对应地放在同一个文件、不导出
- `save(level, levelChunk)`：regionFile 懒打开；五个数组首尾相接写进 chunks.dat
- `load(level, x, z)`：按 `loadedStorageVersion` 决定读不读光照那两段

**原样保留的坑：缺花括号的 if**

```cpp
if (loadedStorageVersion == 1)
  changed |= LevelConverters::v1_ClothIdToClothData(levelChunk);
  changed |= LevelConverters::ReplaceUnavailableBlocks(levelChunk);   // ← 其实每次都跑
```

不带花括号的 if 只管第一条语句。G14-5 的 `current` 用例就是钉它的：`loadedStorageVersion = 3`
时未注册的 id **照样**被换成 249。

**G14-5 为什么必须来自参考实现**：save 和 load 是同一份代码里的两个函数 —— 两边一起把数组顺序
写错的话，**它们自己是一致的**（往返测试照样通过）。只有拿参考实现产出的载荷字节比才行。

**harness 里踩的两个坑（都不是实现问题）：**
1. **写进 stdio 缓冲没落盘就读** —— `save` 用的 storage 还活着时它的 RegionFile 没 fclose，
   另起一个读同一个 chunks.dat 得到空头（`readChunk 失败`）。让写的那次先出作用域即可。
2. **埋方块的下标越界** —— `CHUNK_BLOCK_COUNT` 是 32768，我埋了 50000/60000，越界写到别的堆内存，
   读回来是 240/255 这种垃圾值，**看着特别像"转换器把 id 换错了"**。现在 harness 开头有
   `checkOps` 兜底、TS 测试里也有一道同样检查。

### B5a-2 记录（提交 `0b96738`）

- R10：C++ 的 `saveLevelData`/`savePlayer`/`loadPlayer` 各有**成员版和静态版同名**，TS 一个类里
  不能静态与实例同名 → **成员版保留原名**（它是 `LevelStorage` 接口的实现），静态版按区分参数
  改名 `saveLevelDataTo` / `savePlayerTo` / `loadPlayerFrom`（对齐手册先例 `animateRespawnFor`）
- `std::ofstream`/`ifstream` 不是 `FILE*`，CFile 套不上 → 直接走 VirtualFS，语义等价处写在注释里
- `createChunkStorage` 返回 `this` 时要断言：C++ 同时继承 LevelStorage 与 ChunkStorage，
  TS 只能单继承，**ChunkStorage 那一半要到 B5b 才补齐**（注释写明现在还不能当 ChunkStorage 用）
- 黄金样本 G14-4 记的是"每次调用后目录里有哪些文件、各自字节"；三用例
  first-save / second-save / missing-dir

**测试写错的两处（都不是实现 bug，但都值得记）：**
1. **把夹具的"序列"当成了"独立用例"** —— first-save / second-save 是**在同一个目录上连着跑两次**
   的结果，第二次的行为依赖第一次留下的文件。第一版每个 case 都从空 VFS 开始，测试立刻红了。
2. **`LevelData` 的 storageVersion 必须显式设**：默认 0，而 `readLevelData` 只认 `==1` 与 `>=2`
   两条路 —— 版本 0 **两条都不走、静默什么都不读**。真实路径不会出现这个值
   （`saveLevelData` 写之前会强制设成 `SharedConstants.StorageVersion`）。

另外撞到 `Entity.load` 会把 x/z 夹进世界边界（`padding = bbWidth*0.5 + 0.001`），y 不夹 ——
测试里给的 `z = -3.5` 被夹成 0.301，看着像存档往返出错，其实是 clamp。

### B5a-1 记录（提交 `e627cc5`）

- `packages/world/src/level/storage/FolderMethods.ts`（新）+ `tests/unit/world/folder-methods.test.ts`（14 条）
- `_mkdir` / `_access` / `_errno` 是 POSIX 裸原语，浏览器没有对应物 → 标 `OMIT(Web)` 并写明谁承担了职责
- **`createTree` 的循环自增是废的**：`for (int i = 0; i < treeLength; ++i && tree[i])` ——
  条件只有 `i < treeLength`，自增表达式的值会被丢弃，所以 `tree[i]` 既拦不住空指针也不影响循环次数，
  反而在最后一轮多读一次 `tree[treeLength]`（越界）。只复刻有效行为，越界读不复刻。
- **补上了 `LevelData.createTagForPlayers` 的 `DEFERRED(Player)`**：先前注释说"Player 序列化还没移植"，
  其实前提早已具备 —— `Player` 不覆盖 `saveWithoutId`/`load`，只覆盖 `readAdditionalSaveData`/
  `addAdditonalSaveData`，这四个在 TS 里都有且都没 DEFERRED。
- 台账 234 → 236（+3 条 `OMIT(Web)`，−1 条 `DEFERRED(Player)`）

## 开工前的实测发现（B4 比任务单写的大）

1. **`StorageVersion = 3` 而不是 1** —— `writeLevelData` 默认走 NBT 分支
   （`createTag()` + `NbtIo::write`），**B2 那套 `v1_write`/`v1_read` 在默认值下用不到**。
2. TS 的 `LevelData` 有 **11 处 `OMIT(NBT)`** 要补。
3. `RakDataInput`/`RakDataOutput` 适配层 TS 里没有（B4a 已补）。
4. `readPlayerData` 是**裸结构体转储**，字节布局取决于编译器对齐填充 —— 风险最高，单独一步。

## Phases

### B4a RakDataInput / RakDataOutput（提交 `e37c870`，3 个文件）

- [x] `packages/util/src/RakDataIO.ts` + 从 util 导出
- [x] `tests/unit/util/rakdataio.test.ts`（6 条）
- [x] divs.py / shadow.py 均无输出
- **Status:** complete

### B4b LevelData 补齐 11 处 OMIT(NBT)（提交 `c7d28eb`）

- [x] `createTag()` / `createTag(players)`
- [x] `getTagData(tag)` / `setTagData(tag, playerTag)`
- [x] `setPlayerTag` / `getLoadedPlayerTag` / `setLoadedPlayerTag`
- [x] `LevelData(CompoundTag*)` 构造
- [x] `v1_write(bitStream)` / `v1_read(bitStream, storageVersion)`
- [x] `setLoadedPlayerTo(player)`
- [x] 拷贝构造/`assign` 里那两处 `DEFERRED(NBT)`
- **Status:** complete（`(int)` 强转用 `Number(BigInt.asIntN(32, ...))` 复刻；只剩 `OMIT(Player)` 与 1 处 `DEFERRED(Player)`）

### B4c readLevelData / writeLevelData + 黄金样本 G14-2

- [x] `packages/world/src/level/storage/ExternalFileLevelStorage.ts`（两个静态函数 + 4 个文件名常量）
- [x] `tools/golden/harness_leveldata.cpp` + build.sh 的 S-B4 段
- [x] `tests/golden/leveldata.golden.test.ts`（5 条）
- [x] **判定 B2 的 `long` 取 8 字节：对**（v1 载荷 61 字节、NBT 载荷 222 字节，与参考逐字节一致）
- [x] 夹具用正式 `build.sh` 生成；原有 14 个夹具逐字节未变
- **Status:** complete（提交 `bb8a63a`）

**B4c 抓出的真 bug：B2 的字节序搞反了。** 详见下面「遇到的错误」第 1 条。

### 附带：build.sh 提速（提交 `1a0ad6c`）

起因是用户说 "build.sh 太慢了"。量出来是**在 16 核机器上串行编 151 个源文件**。

- 并行编译（`xargs -P $(nproc)`）：全量 ~10 分钟 → **50 秒**
- 按节选择性生成（`build.sh <节名>`，`--list` 列全部）：只生成 leveldata 24 秒、random 0.7 秒
- `$REG/sigill_diag.oo` 挪到 `$TMP`，让 collision/leveldata 不再连带编那 30 个方块/物品类
- 顺带去掉 `leveldata.json` 里的 `ts` 字段（它让这个夹具每次重新生成都必产生一行 diff，且无人读）
- **验证：全量重新生成后 14 个夹具逐字节未变**，leveldata 只少那一行 ts

### B4d readPlayerData（裸结构体转储）（提交 `39797f9`）

- [x] 先写 harness 量出 `sizeof(PlayerData)` 与各字段偏移，再动手
- [x] 移植 `readPlayerData` + 黄金样本 G14-3（6 个用例）
- **Status:** complete

**量出来的布局：** `sizeof = 80`；`pos` 0 / `motion` 12 / `xRot` 24 / `yRot` 28 /
`fallDistance` 32 / `onFire` 36 / `airSupply` 38 / `onGround` 40 / `inventorySlots` 44。
（`onGround` 是 bool，后面 3 字节填充 → `inventorySlots` 在 44 而不是 41。）

**这个格式是只读遗留的**：本版本的 `savePlayer` 写 NBT（`players/<名字>.dat`），不写
`player.dat`。所以 harness 只能自己按布局造文件喂给它。

**原样保留的两个行为：**
1. **检查在后、写入在前** —— `if (fread(...) != size) break;` 里 fread 先把 sizeof 字节
   写进结构体、再拿返回值比 size；所以 size 不匹配时结构体**已被覆盖**，只是跳过 clamp
   与版本赋值。TS 的 decode 必须在比较**之前**。
2. **clamp 是这一套**（x/z→[0.5, LEVEL_?-0.5]，y<0→64），不是 `PlayerData.h` 里的
   clampXZ/clampY/clampRot（那些属于仍是 OMIT 的 loadPlayer）。

**踩的坑（两处未初始化内存，都是"连跑两次比对产物"抓的）：**
- 对齐填充（onGround 后 3 字节）没有初值，被 `imageOf()` 一起 memcpy 进夹具 → 每次生成都不一样
- 没被读到的字段（version-2 / truncated 用例）留着未初始化内存 → harness 改为先显式清零
- 顺带修了 harness 自己的 bug：missing 用例原先无条件先造文件，"文件不存在"根本没测到

## 关键决策

| 决策 | 理由 |
|---|---|
| 拆成 B4a–B4d | 超 5 文件 / 300 行；且 B4d 风险性质不同（照抄 ABI 而非逻辑）。用户确认 |
| B4a 的测试用「与 MemoryDataOutput 字节一致」做基准 | 两者共用父类实现、只各自提供 writeBytes 落点；MemoryDataOutput 已由 nbt.json 黄金样本间接验证，等于把 RakDataOutput 钉在同一基准上 |

## 遇到的错误

### 1. B2 的字符串字节序搞反了（B4c 的黄金样本抓出来的）

**这不是 B4c 引入的 bug，是 B2 留下的、一直没被验证过的错。**

`v1_write` 的那几个整数和 `RakString` 的长度前缀都走 C++ 的模板 `Write<T>`，而它会**先做端序交换、再交给 WriteBits**：

```cpp
// src/raknet/BitStream.h:1277
if (DoEndianSwap()) {                    // x86-64 上恒为真
    ReverseBytes(&inTemplateVar, output, sizeof(templateType));
    WriteCompressed(output, sizeof(templateType)*8, true);   // ← 翻转后的字节
}
```

`DoEndianSwap()` = `IsNetworkOrder() == false`；而且 `RakNetDefines.h:24` 那行 `#define __BITSTREAM_NATIVE_END` 是**被注释掉的**，所以交换一直开着 → **大端**。

我在 B2 只读了 `WriteBits` 那条路（原样 memcpy = 小端），漏了上层那一步交换。**两条路的字节序本来就不一样**：

| C++ 写法 | 谁走 | 字节序 |
|---|---|---|
| `Write<T>(整数)` | `v1_write`、RakString 长度前缀 | **大端** |
| `Write(const char*, n)` / `WriteBits` | NBT（`RakDataOutput::writeBytes`） | 原样 = 小端 |

**修正**：`BitStream.ts` 的 `writeInt`/`writeLong`/`writeUint16` 及对应读改成大端，`writeBytes`/`readBytes` 保持原样。

**影响面**：G14-1（RegionFile 只走 fwrite 与 writeBytes）**没受影响**；B2 的 17 条测试当时"从源码确认"过字节序，但**测试钉的是我读出来的结论，结论错了就一起错** —— 真正证伪的只有参考实现写出的真实字节。

### 2. build.sh 的 S-B4 段被 raknet 陷阱桩坑了

**现象**：`build.sh` 跑到 `harness_leveldata` 段错误（退出码 139），留下一句很误导人的现场——`level.dat` 已经 `fopen` 出来、是个 0 字节空文件。

**根因**（用 `nm --undefined-only` 直接验过，不是推测）：S-B4 原本只编了 `raknet/BitStream.cpp` 与 `raknet/RakString.cpp`，而 `RakString` 用到的内存分配器是 `rakMalloc_Ex` / `rakFree_Ex` / `rakRealloc_Ex` / `notifyOutOfMemory`——**小写 `rak` 开头、不含 "RakNet" 字样**，于是被桩生成规则判给 `ud2` 陷阱。`RakString` 有静态初始化，程序还没进 `main()` 就踩上去。

**修正**：把这一整组编成真的——`BitStream`、`RakString`、`RakMemoryOverride`、`SimpleMutex`、`GetTime`、`RakNetTypes`、`StringCompressor`。

**顺带**：这个坑我在临时迭代脚本里已经修过并写了注释，但**没同步回 `build.sh`**——所以"正式路径"跑不通、临时路径跑得通。这说明**只把一次性脚本跑绿不算数，交付物得走正式路径**。

### 3. harness 里的两个连带问题

- `ExternalFileLevelStorage.h` 用了 `RakNet::TimeMS` 却没 include 那个头（平时靠别的头间接带进来），harness 里要自己补 `#include "raknet/RakNetTime.h"`。
- `getEpochTimeS()` 是**实时时钟**，两次运行不可能一样 → 两边都把时间戳那几字节清零后再比，偏移量记进夹具。（布局错位照样会被抓出来：偏移一对不上，后面所有字节就全对不上。）

## 补跑结果（2026-10-04，G2–G9 变异 98/102）
g2 9/10 · g3 15/16 · g4 14/15 · g5 11/11 · g6 7/7 · g7 9/9 · g8 14/15 · g9 19/19（全部真跑，无假阳性）。
四条没抓住已定性：g2 M1 / g3 M12 = 等价变异（改不出可观测差异，数值/结构证明）；
g4 M7 / g8 M8 = 真盲区（跑整份 tests/unit/client 仍然绿）—— 旋转分支的子部件递归、forward 的 (-1,0) 区间。
⇒ 已处置（2026-10-04，提交 `b63c02c`）：补两处盲区测试 + 换两条等价变异后重跑，**102/102 全红**。下一步开工 G12。
