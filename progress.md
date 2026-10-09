# Progress Log

## 2026-10-07 — 文档同步（Claude）

- MCPE-TS后续清单-S11-S13.csv：逐行核实状态（全部完成；CreatorMode 不移植并写明理由）；15 条过时路径改到 packages/nbt、packages/locale；新增「剩余标记」列。
- MCPE-TS后续清单-S11-S13.html：页首加 2026-10-07 状态说明；新增「阻塞清单核查（第 7 版）」一节（逐条核实第 5、6 版的阻塞项、台账分类、新黄金样本、待拍板事项）；目录与「计划外与以后」同步。
- task_plan.md：顶部重写为当前状态（各方面完成情况与验证方式、数字、还没做的、待拍板）；旧的「当前阶段」移到附录。
- 顺带：Gui.isChatting 原来恒为 false（当时没有聊天/控制台界面），现在按 C++ 判断——控制台开着时显示更多聊天行；修正 3 处过时注释。台账 140 → 139。


## 2026-10-07 — 大树 BasicTree（Claude）

- 移植 BasicTree（主干、斜枝、树叶团）。C++ 里所有 new BasicTree 的语句都被注释掉了，照原样不接线。
- 黄金样本 G17-2：在 G17-1 的世界上用固定参数与种子放 6 棵，返回值、原木/树叶数、25×25×128 区域方块哈希逐个一致；
  另加 treeShape 表（高度 5–20 × 每个 y，float 位模式）——它确认了头文件里不带 Mth:: 的 abs(float) 是 float 重载（换成 ::abs(int) 时 6 棵树仍然都对得上，只有这张表能分辨）。
- 浮点：C 库 sin/cos/sqrt/pow 走 double；Mth::floor 只有 float 版。


## 2026-10-07 — 界面：经典菜单风格（Claude）

- StartMenuScreen（风格 1 的 160×24 与风格 2 的 Java 式 200×20 两套按钮、标题、版本、GitHub 链接）、SmallButton。
- 选世界：ClassicSelectWorldScreen / ClassicWorldSelectionList / ClassicDeleteWorldScreen（导出名避开触屏版的 SelectWorldScreen），ScrolledSelectionList（这一版没有界面用它，照移植）。
- IngameBlockSelectionScreen：按快捷栏样式画背包，键盘/鼠标/滚轮选择，生存模式有护甲、合成按钮。
- ScreenChooser 去掉“暂代”，风格 1、2 用经典界面；两种风格都能建控制台（SCREEN_CONSOLE）。
- RolledSelectionListV 只被联机的 TouchJoinGameScreen 使用，随联机一起暂缓。
- 浏览器截图：风格 2 的起始菜单、选世界、物品选择。


## 2026-10-07 — 界面：控制台、命令、聊天、用户名（Claude）

- ConsoleScreen（T 键）：普通文字显示为 "<名字> 内容"，"/" 开头交给 CommandManager；滚轮在控制台/聊天开着时翻聊天记录。
- 命令系统 src/commands：Command、CommandManager、help、op、kick、ban、gimmieitems（注册被注释掉，照抄）。
  原样：getCommand 判断写反（/help <命令> 总说 not found）；ADAPTED(Safety)：两处解引用 end() 改为安全返回。踢人断线 DEFERRED(Network)。
- ChatScreen（平台对话框输入，这一版无人打开）、DialogDefinitions、UsernameScreen（首次启动时打开）。
- 单测 console-commands.test.ts 5 条；浏览器截图：用户名界面、控制台。
- 下一步：经典菜单风格的 StartMenuScreen、SelectWorldScreen、IngameBlockSelectionScreen 及其列表组件（约 1700 行），替掉 ScreenChooser 里的暂代。


## 2026-10-07 — 视觉小项（Claude）

- LevelRenderer.levelEvent：开关门（门、活板门、栅栏门）的声音，一半开门声一半关门声。
- PerfRenderer（“渲染调试”选项）：左下帧时间竖线，右侧 PerfTimer 饼图与百分比，0–9 键进出子区段。
- 核实后不需要改的两项：
  - Dimension.getTimeOfDay 的 float/double：试着改成全 float 后，C++ 导出的 S4 黄金样本立刻对不上——原来的 double 写法就是逐位一致的，C-4 的标记是过时的。已撤回。
  - 大爆炸、水花粒子：C++ 里创建它们的语句都被注释掉了（LevelRenderer.cpp:1471/1472/1494），大爆炸还缺 misc/explosion.png，水花的基类 WaterDropParticle 在源码里不存在——原版游戏里也看不到。保持 OMIT。
- 单测 visual-small.test.ts 3 条；浏览器截图：调试帧时间图。


## 2026-10-07 — 画面：天空、云、光照（Claude）

- LevelRenderer：renderSky（天空平面、日出日落光晕、太阳、月亮、星星、Beta 天空的虚空平面）、skyColorChanged、renderClouds（PE 平面云）、renderAdvancedClouds（立体云）。
- GameRenderer.prepareAndRenderClouds（大远裁剪面、两段雾距先天空后云）；默认选项（高画质、非 Beta 天空）走这条。
- GLES1 着色器：固定管线逐顶点光照（两盏方向光，位置在 glLightfv 时乘 MODELVIEW；全局环境光；COLOR_MATERIAL；法线属性）。
- 预加载 environment/clouds.png、terrain/sun.png、terrain/moon.png。台账 165 → 140（Sky、Clouds、GLLighting 清零）。
- 浏览器截图：天空与云、生物侧面明暗。


## 2026-10-07 — 睡觉“很快就醒”查明：正常的睡到天亮（Claude）

- 浏览器里给 playerIsSleeping 与 setScreen 加陷阱：醒来来自 ServerLevel.tick → awakenAllPlayers，世界时间正好跳到 19200（这一版一天是 19200 刻，不是 24000）、sleepCounter 101。
  上一轮“时间没跳、stopSleepInBed 没被调用”是误判：一天的长度记错了，日志又在醒来前 0.7 秒就读了。
- 新增单测：ServerLevel 夜里睡约 100 刻后跳到下一天、叫醒、满血、记重生点。
- 睡觉界面截图（截图专用地关掉“睡到天亮”，因为软件渲染截一张图要 4 秒以上）：躺在床上的视角 + Leave Bed 按钮。


## 2026-10-07 — 读档恢复玩家、死亡与重生、床与睡觉（Claude）

- Level.loadPlayer 读回 level.dat 的 Player 标签；LevelData.setLoadedPlayerTo、PlayerData.loadPlayer（原样：最后的 setPos 用未夹的原值）。
- DeathScreen、Minecraft.respawnPlayer/respawnPlayerById/resetPlayer；BedTile.use、InBedScreen；LocalPlayer.displayClientMessage；gui.progress；KeyboardInput 合成键（原样走不到）。
- 修复：Entity/Mob/Player.reset 按 C++ 非虚 _init 调用（重生后玩家仍是 removed）——PITFALLS 第 39 条。
- 单测：player-restore 3 条、death-and-bed 6 条。浏览器：死亡界面、重生后（满血、回出生点、物品掉在地上）已截图查看。
- 全部测试要分批跑（一次跑完超过 5 分钟）：unit/world+web、unit/client+util+platform、golden。


## 2026-10-07 — 熔炉与箱子界面（Claude）

- 移植 BaseContainerMenu（IContainerListener）、ContainerMenu、FurnaceMenu、BaseContainerScreen、FurnaceScreen、ChestScreen；Gui.setScissorRect；ErrorCodes。
- 接线：右键熔炉/箱子打开界面；LocalPlayer.closeContainer 关界面（之前 DEFERRED，关不掉）；受伤时关闭可关闭的界面；
  Player.tileEntityDestroyed 在方块被破坏时关容器；界面关了菜单还在时 postError 一次。
- 修正：FurnaceScreen.addItem 的 setIfNotSet 不能写成 `a || f()`（f 有副作用，C++ 总会先求值）。
- 单测 container-screens.test.ts 2 条；浏览器截图（熔炉在烧、箱子）已查看。124 文件全过。


## 2026-10-07 — 合成与护甲（第二部分：界面）（Claude）

- 移植 NinePatch、ItemPane（CItem/ReqItem）、CraftingFilters、PaneCraftingScreen（CategoryButton、CraftButton）、WorkbenchScreen、StonecutterScreen、ArmorScreen。
- 接线：右键工作台 → 3×3 合成（创造模式不打开，照 C++）；右键切石机 → 切石机；生存模式物品选择界面的 Craft → 2×2、Armor → 护甲界面。
- 单测 crafting-screens.test.ts 4 条（2×2/3×3 配方范围、切石机过滤、木板合成木棍扣料得料、穿脱头盔）；浏览器截图（合成、护甲）已查看。


## 2026-10-07 — 修复：菜单风格改成 1/2 后黑屏（Claude）

- 现象：启动后黑屏，日志停在 Reloading-options，刷新不恢复。
- 原因：选项界面的“调整 → 菜单风格”改成 Xperia(1) 或 Java(2) 后，ScreenChooser 的经典分支只建暂停界面，起始菜单为 null；
  该选项存进 options.txt（IndexedDB），所以刷新后仍然黑屏。复现：把全部选项设到最大值再刷新 → 卡住；只设菜单风格 1 或 2 → 卡住。
- 修正：经典界面（StartMenuScreen、SelectWorldScreen、IngameBlockSelectionScreen）移植之前，暂用触屏风格的同名界面（ADAPTED，注明移植后删除）。
- 回归测试 screen-chooser-menustyle.test.ts 3 条；浏览器复测：菜单风格 0/1/2 与“全部选项最大/最小”都能正常进起始菜单。122 文件 / 1335 条全过。


## 2026-10-07 — 合成与护甲（第一部分：合成系统）（Claude）

- 移植 world/item/crafting 全部（Recipe/ItemPack、ShapedRecipe、ShapelessRecipe、Recipes、工具/武器/盔甲/矿块/食物/建筑/染色配方、FurnaceRecipes）与 CraftingContainer。
- 熔炉的烧制恢复（FurnaceTileEntity.burn / canBurn 查 FurnaceRecipes）。
- 黄金样本 G18-1：123 个合成配方（顺序、类型、产物、大小、材料表）+ 13 个熔炉配方与 C++ 逐个一致。121 文件 / 1332 条全过。
- 原样保留：ShapedRecipe.matches 在这一版里几乎永远不成立（CraftingContainer 对空格子返回空 ItemInstance 而不是 NULL）；触屏合成界面用的是 ItemPack 计数，不受影响。
- 下一部分：NinePatch、ItemPane、CraftingFilters、PaneCraftingScreen、WorkbenchScreen、StonecutterScreen、ArmorScreen 与接线。


## 2026-10-07 — 选项界面（Claude）

- 移植 OptionsScreen、CreditsScreen、OptionsGroup（可滚动、拖动与点击的区分）、OptionsItem、GuiElementContainer、Slider（连续/分档）、KeyOption、TextOption。
- 暂停界面与起始菜单的“Options”接上。关闭时保存选项（options.txt，经虚拟文件系统）。
- 原样保留：render 里对已是界面坐标的鼠标位置再换算一次；charPressed 调的是 super.keyPressed；关闭时的 else 分支走不到。
- 单测 options-screen.test.ts 7 条；浏览器截图（通用、画面两页）已查看。120 文件 / 1329 条全过。


## 2026-10-07 — 地物生成（Claude）

- 移植 levelgen/feature：Feature 基类 + 湖、矿、黏土、花（含蘑菇）、草丛、甘蔗、仙人掌、泉、橡树、白桦、云杉、松树；
  Biome.getTreeFeature/getGrassFeature 与森林、雨林、针叶林的重写；RandomLevelSource.postProcess（含雪、postProcessSpawnMobs）；树苗长树。
- 黄金样本 G17-1：真实 Level、固定取区块顺序，ChunkCache 自动 postProcess；9 个区块的方块与数据逐个一致。
- 单测 sapling-grow.test.ts 3 条。119 文件 / 1322 条全过。
- BasicTree 未移植：C++ 里所有用它的地方都被注释掉；那些空的 `if (random.nextInt(n) == 0) {}` 照样保留以对齐随机数。
- 旧存档里已标记“地物已生成”的区块不会补上地物，需新建世界。


## 2026-10-06 — 修复：吃东西后再右键崩溃（ItemInstance.use 读到 null）（Claude）

- 原因：`Player.startUsingItem` 存的是**引用**。C++ 是 `void startUsingItem(ItemInstance instance, int)`（按值）、`useItem = instance`（复制）、
  `instance == useItem`（operator== 比较内容）。吃完一口后 `stopUsingItem` 的 `useItem.setNull()` 把背包里那一叠清成 id 0、数量 0；
  下次右键 `getSelected()` 拿到它，`getItem()` 为 null → 崩溃。属于 PITFALLS 第 10 条（按值语义），S12 移植 Player 时留下的。
- 修正为 `if (instance.equals(this.useItem)) return; this.useItem = new ItemInstance(instance);`。弓（拉弓也走 startUsingItem）一并受益。
- 回归测试 `tests/unit/world/eat-food.test.ts`（2 条；去掉修正时两条都失败）。
- 顺带：新 AI 追击测试的偶发失败查明——平坦 demo 维度永远白天，僵尸被晒死（死后 isImmobile，AI 停止）；测试改为夜里、固定种子。
- 117 文件 / 1310 条全过。


## 2026-10-06 — 任务单 H11（新 AI）+ H10（收尾）：任务单 H 全部完成（Claude）

- 新 AI 15 个文件 + 接线 + Level.setZombieAi；单测 5 条（强制打开新 AI 的僵尸会追玩家并打到）。
- 修正了三个测试文件里玩家悬空 1.62 格的 moveTo 用法（PITFALLS 第 30 条）；夜里刷怪的测试改为固定种子、可复现。
- ModelInclude 6 条 OMIT 落地；PITFALLS 新增 29–35 条。台账 232 → 181。116 文件 / 1308 条全过。
- 任务单 H 全部完成。下一步候选：地物生成（树、矿、花草，C-7 遗留）；选项界面；合成与护甲界面；聊天与控制台。


## 2026-10-06 — 任务单 H9：自然刷怪（Claude）

- MobSpawner、Level.getRandomMobSpawnAt、Level.tick 刷怪、僵尸登记、下界反应堆生成僵尸猪人。加载循环用注入解决（Level.mobSpawnerTick）。
- 单测 6 条；115 文件 / 1303 条全过。生存世界才刷；demo（平坦）维度永远白天、不刷怪物——与 C++ 一致。
- 顺带核实：上一轮截图“脸朝后”是拍摄方式造成（moveTo 只设头的朝向、又冻结了 tick），游戏里头与身体夹角始终在 ±75° 内。
- 下一步：H11 新 AI → H10 收尾。


## 2026-10-06 — 任务单 H4–H8：生物工厂与 9 种生物（Claude）

- 实体：Pig、Cow、Sheep、Monster、Zombie、Spider、Skeleton、Creeper、PigZombie；MobFactory、EntityFactory 读生物、Level.getMob。
- 模型与渲染：QuadrupedModel、Pig/Cow/Sheep/SheepFur/Zombie/Skeleton/Creeper/Spider 模型；Pig/Sheep/Creeper/Spider 渲染器；C++ 的 9 个生物渲染器全部注册。
- 模型黄金样本 13 个模型逐位一致；mobs.test.ts 15 条；浏览器 9 种生物同屏截图。114 文件 / 1297 条全过。
- 原样保留的怪癖：Sheep::NumColors 用指针大小算（64 位得 24）；蜘蛛模型 body0 注册两次、body1 没注册；Spider::makeStepSound 方法遮蔽同名字段从不被调用；
  Monster::getLastHurtByMob 判断的是 targetId；PigZombie 的箭主人缺失时 C++ 解引用空指针。
- 下一步：H9 自然刷怪 → H11 新 AI → H10 收尾。


## 2026-10-06 — 任务单 H2（寻路）+ H3（旧 AI）：鸡会走了（Claude）

- H2：`pathfinder/` 四个类 + Level.findPathToEntity/ToTile。黄金样本 G16-1：12 条路径逐节点一致。
- H3：PathfinderMob.updateAi 等。黄金样本 G16-2：三只鸡 400 刻，位置差 ≤2e-6、标志逐条一致、角度差 ≤1.1e-4°。修了 Mob.updateAi 的 float 截断。
- 用户决定新 AI（goal 系统）也要移植 → 任务单新增 H11。
- 浏览器：demo 世界放 4 只鸡，40 秒后全部走动。`pnpm test` 113 文件 / 1273 条全过。
- 下一步：H4 MobFactory → H5 猪牛 → H6 羊 → H7 僵尸蜘蛛 → H8 骷髅苦力怕 → H9 刷怪 → H11 新 AI → H10 收尾。


## 2026-10-06 — 任务单 H 落盘 + H1（Mth.random 与 C++ 同构）（Claude）

- 新任务单 `docs/ai/TASK-H-生物与AI.md`（H0 侦察结论 + H1–H10）。关键结论：**新 AI（goal 系统，1179 行）在这一版是死代码**——
  `Level::setZombieAi` 在 Level.cpp:1429 被注释掉，只有 Zombie 可能 useNewAi，而它永远是 false。真正要做的是旧 AI（PathfinderMob.updateAi）+ 寻路。
- H1：`Mth.random` 以前是 `Math.random`，`random(n)` 的分布和序列都与 C++ 的 `nextInt(n)` 不同，生物 AI 做不了黄金样本。
  改为模块级 `Random`（C++ Mth.cpp 的 `static Random _rand`），测试打桩改走 `tests/helpers/mthRandom.ts`。111 文件 / 1259 条全过。
- 下一步：H2 寻路（Node、BinaryHeap、Path、PathFinder，861 行）+ 黄金样本 G16-1。


## 2026-10-06 — 告示牌编辑界面 TextEditScreen（Claude 完成）

放下告示牌（SignItem → LocalPlayer.openTextEdit）现在会打开编辑界面：上方是放大的牌子，四行字，当前行带 "> … <"，右上角关闭按钮。
- 移植 `gui/screens/TextEditScreen`（146 行）。关闭时的 SignUpdatePacket 记 `DEFERRED(Network)`；`setChanged` 照常调用。
- 数值：牌子缩放 `((height / 2) / 32) * 0.9f` 是两次整数除法（PITFALLS 第 1 条），已按 Math.trunc 写。
- 单测 `text-edit-screen.test.ts`（5 条）：最多 15 个字、回车换行与回绕、退格删字与空行回到上一行（0 → 3）、关闭时 setChanged + 收起键盘 + 关界面。
- 浏览器：走真实路径放下告示牌 → 界面打开 → 键盘输入 → 关闭 → 世界里的牌子显示输入的字。截图已查看。
- `DEFERRED(Gui)` 31 → 30（另加 1 条 `DEFERRED(Network)`，台账总数仍为 232）；`pnpm test` **110 文件 / 1257 条全过**。

**原版行为提醒**：`Screen::updateEvents` 先处理完本帧所有按键事件、再处理所有输入字符。打字快于帧率时，回车会排在同一帧里尚未处理的字符之前
（无头浏览器每秒约 1 帧时，"Hello web⏎from TS" 会变成 "Hello w" / "ebfrom TS"）。正常帧率下不会出现；C++ 的事件顺序相同，未改动。


## 2026-10-06 — 方块实体渲染：告示牌看得见了（Claude 完成）

范围：`renderer/tileentity/`（TileEntityRenderer、TileEntityRenderDispatcher、ChestRenderer、SignRenderer）、
`model/ChestModel`、`model/SignModel`、`renderer/EntityTileRenderer`，约 560 行 C++。台账 **238 → 232**，
`DEFERRED(TileEntityRender)` 5 → **0**，`DEFERRED(EntityRender)` 1 → 0。

### 侦察时的关键发现（决定了“箱子”这一半做到什么程度）
1. **这一版 C++ 里箱子不用 ChestRenderer**：`ChestTileEntity.cpp:16` 的 `rendererId = TR_CHEST_RENDERER;` 被注释掉，
   `ChestTile.cpp:29` 的 `SHAPE_ENTITYTILE_ANIMATED` 也被注释掉 → 世界里的箱子是**普通方块**（六面贴图），没有开盖动画。
   ChestRenderer / ChestModel / EntityTileRenderer 照 C++ 移植并注册，但正常游戏中不会被调用；单测把这条原版行为钉住了。
   它绑定的 `item/chest.png` 不在材质包里，所以没有加进预加载表。
2. **告示牌只能靠方块实体渲染器显示**：SignTile 的渲染形状是 `SHAPE_INVISIBLE`。以前世界里放下的告示牌是看不见的。

### 验证
- **黄金样本**：`harness_model.cpp` 增加 ChestModel、SignModel；`REF=… bash tools/golden/build.sh model` 只重新生成 model 节，
  旧条目逐字节未变；`model.golden.test.ts` 新增一组比较（部件位置、旋转、贴图尺寸、可见性、每个 cube 的边界、顶点和 6 个面的 UV），通过。
- **单测** `tests/unit/client/tileentity-render.test.ts`（6 条）：注册的两种渲染器、箱子 rendererId 为默认值且 EntityTileRenderer 不画、
  64 格距离截断、立着/墙上告示牌的平移旋转与立杆可见性、四行字的位置与选中行的 "> … <"。
- **浏览器**：新场景 `tools/verify/scenarios/sign.mjs`；截图里墙上告示牌、立着的告示牌（含立杆和选中行）带字，箱子按方块显示。
- `pnpm typecheck` 0；`pnpm test` **109 文件 / 1252 条全过**。

### 踩到的坑（又是第 25 条）
第一张截图里两块告示牌分别画成了地形图集和字体图集——`item/sign.png` 没有预加载，绑定失败后沿用了上一张纹理。
已加进 `apps/web/src/assets.ts`。

### 顺带记录
- `s9.test.ts`、`leave-game.test.ts` 的 `beforeAll` 要生成真实地形，在较慢的机器上约 35 秒，超过默认的 30 秒钩子超时。
  它们在本机能过，但余量很小，建议这两个文件单独放宽 `hookTimeout`。
- 告示牌的文字目前只能由代码写入：编辑文字的 `TextEditScreen` 仍是 `DEFERRED(Gui)`。


## 2026-10-04 — 任务单 E 开工：E0 ~ E3（粒子系统）

用户 2026-10-04 拍板：**粒子先做，做完停下来汇报一次，再做任务单 F（声音，音源走 `.pcm` → 二进制那条路）**。
任务单 `docs/ai/TASK-E-粒子.md`（十二小步 E0~E11）。

| 步 | 提交 | 台账 | 一句话 |
| --- | --- | --- | --- |
| E0 | `320d35e` | 236 | 任务单落盘 |
| E1 | `30f1369` | 236 | `Particle` 基类 + `ParticleTextures` |
| E2 | `ef460ab` | 236 | `SmokeParticle` / `ExplodeParticle` / `RedDustParticle` |
| E3 | `3f61fbb` | 236 | `FlameParticle` / `BubbleParticle` / `CritParticle2` |

### 规划阶段的三个发现（决定了方案长什么样）

1. **接线端已经躺着等了**：TS 里十几处已经在调 `level.addParticle`（FireTile / Explosion / Mob /
   Entity / Arrow / Snowball / ThrownEgg / Throwable / PrimedTnt / TripodCamera / Player），
   `Level.addParticle` 与 `LevelListener` 也都是真实现 —— 唯独没人接住。所以这不是"从零加一个系统"。
2. **粒子 id 有"数字 vs 字符串"的历史不一致**：C++ 实际传的永远是字符串
   （`PARTICLETYPE(x)` 宏是逗号表达式，枚举重载整段是死代码），而 TS 里混着两种写法，
   **已有四条断言钉的是数字**（`snowball.test.ts:167` 等）。→ 解法是唯一入口做一次数字→名字归一化。
3. **`SoundSystem` 该放 client 包而不是 `packages/platform`**（留给任务单 F）——
   它的签名要吃 `SoundDesc`，而 platform 是被 client 依赖的，放过去是反向依赖；项目已有先例
   （`AppPlatform` 基类就在 client）。

### 开工后踩的坑（都是"测试写错了，实现没问题"）

- **`reference()` 忘了传速度**：`FlameParticle` 把形参原样传给 super，而基类的
  `mul = 0.4f*speed/dd` 依赖速度大小，拿 `(0,0,0)` 造的参照物不是子类内部那个。
- **`CritParticle2` 的 lifetime 走 `Mth::random()`，不是 `sharedRandom`** ——
  按 sharedRandom 回放去算，算出来 14、实际 10。
- **`SmokeParticle` 的 lifetime 也是 `Mth::random()`**（同类错）。
- **`Tesselator` 写进的是 Float32Array**，`_vertexForTest` 读回来**已经是 float32**，
  期望值要再 `f()` 一次；**QUADS 拆成 6 个顶点，索引 0..5 = v0,v1,v2,v0,v2,v3** ——
  第 4 个顶点在索引 **5** 上（我按"索引 i 就是第 i 个顶点"写了，错了）。
- **`age++ >= lifetime` 是后置递增**：要跑 `lifetime + 1` 刻才 remove（我按 lifetime 写，错了）。
- **`tick` 里 `yd += 0.004f` 在 `move()` 之前**：想让 `y === yo` 得把 yd 设成 **-0.004f**（不是 0）。

### ⚠ 变异测试抓出的两个真漏洞（这是这一轮最有价值的部分）

1. **E2 第一版把 `Math.random` 定死成 0.5，导致基类的初速度全是 NaN。**
   0.5 → 抖动 `(rnd*2-1)*0.4f` 恰好是 0 → 三个速度全 0 → `dd = 0` →
   `mul = 0.4f*speed/0 = Infinity` → `0 * Infinity = NaN`（C++ 同样，除法没保护）。
   **NaN 之间用 `toBe`（Object.is）是相等的**，所以一条"漏掉 ×0.1f"的变异没让测试变红 ——
   断言其实什么都没测到。换成 0.75 后立刻变红。已把这条陷阱写进 `particle.test.ts` 的注释。
2. **`RedDustParticle` 的 lifetime 是 double 运算，而 r=0.5 时 float 版和 double 版结果相同**
   （都是 13）—— 那条断言钉不住任何东西。**搜了一个能区分开的值**
   （`r=0.6590909191166341` → double 10 / float 11）写进测试，现在"改成 float"的变异会红。
   同类处理也用在了 `BubbleParticle` 的 lifetime 上。

另外两条弱断言（都是测试不够强，不是实现错）：
- Bubble 的阻力：三个方向初值都是 0 时 `0×0.85` 和 `0×0.96` 都是 0 → 改成给非 0 初值。
- Bubble 的 `lifetime--`：`lifetime=1` 时后置/前置递减最终值都是 0，而"不是水就 remove"
  又把 `removed` 提前弄成 true → 用 `vi.spyOn(level,'getMaterial')` 返回 `Material.water` 挡住材质那条，
  改成断言 `removed`。

**变异总数**：E1 十条、E2 十三个（修正后全红）、E3 十七个（修正后全红）。

### 一个反复出现的脚本错误（记下来）

三次"变异没红"里，有**两次是我变异脚本改错了行**（改 `zd` 却断言 `yd`；改 `zd` 那行去验 `xd`）。
和 D 时期那次"改 xd 验 zd"是同一个毛病。以后写变异先确认**被改的那一行就是断言关心的那一行**。

## 2026-10-04 — 任务单 D 收官：D10 ~ D11.5 + D12 收尾

| 步 | 提交 | 台账 | 一句话 |
| --- | --- | --- | --- |
| D10a | `7c51828` | 230 → **240** | `PathfinderMob` + `AgableMob`（D0 漏算的两级基类，+10 条 AI 标记） |
| D10b | `cded881` | 240 → 240 | `Animal` + `Chicken`（会下蛋的鸡） |
| D10c | `96bd7e3` | 240 → 238 | `ThrownEgg` + 接线（扔蛋孵鸡） |
| D11a | `6b02836` | 238 → 238 | `Arrow` 类本身（346 行，这批最大） |
| D11b | `22e4d0d` | 238 → 236 | 接线（`BowItem` / `EntityFactory`，七种实体全真类） |
| D11.5 | `151fd26` | 236 → 236 | `ArrowRenderer`（箭看得见了） |

### D10 拆成三步 —— D0 的估算错了

D0 当时写"`Chicken`（113）+ `Animal`（92）= 205 行，只需要 Mob 的骨架"。真去读源码才发现
`Animal` 的基链是 **`Chicken → Animal → AgableMob → PathfinderMob → Mob`**（外加一个空的
`Creature` 接口），而 TS 里只有 `Mob` —— **中间少两级**。
`PathfinderMob.cpp` 248 行里大半是 AI（`Sensing` / `PathNavigation` / `Path` / `level->findPath`），
而 `Animal::hurt` 要写的 `fleeTime` / `attackTargetId` **就声明在 `PathfinderMob` 里**，绕不过去。
按"一步 ≤300 行、≤5 文件"的规矩拆成 a/b/c，写回任务单，然后一步步做。

- D10a：`PathfinderMob` 只移植非 AI 的那半（字段 + `canSpawn` / `getWalkTargetValue` /
  `findAttackTarget` / `checkCantSeeTarget` / `getWalkingSpeedModifier` / `getNoActionTime`），
  `updateAi` / `findRandomStrollLocation` / `setPath` / `isPathFinding` / `getNavigation`
  **整函数 `OMIT(MobAI)`**，`sensing`/`navigation` 两句 `DEFERRED(MobAI)` —— 和 `Mob.ts` 的老办法一致。
  后果写进注释：`Mob.tick` 里那句 `this.updateAi()` 走的是 Mob 的基类实现 = "这只生物没有 AI"。
  台账 +10 条标记（这就是 230 → 240 那一跳）。
- D10b：`Animal` + `Chicken`。写测试时三处**测试的假设错**（不是实现错）：
  ① `aiStep` 里 `super.aiStep()`（Mob）会先跑 `travel()`，`onGround` 以那之后为准 ——
  站在地上但 yd=0 时反而不算落地；② "在空中 yd<0 乘 0.6"只能断言**不等式**
  （travel 先动过 yd，测试不重新实现那套算式）；③ "幼崽不掉蛋"不能用 `setAge(-1)` 验 ——
  `AgableMob.aiStep` 会先把 age 加一格（-1 → 0），跑到 `isBaby()` 时它已经成年了（原样行为），
  得用 age = -100。
- D10c：`ThrownEgg`。孵鸡的两次随机抽取**连着**（先 `nextInt(8)==0` 再 `nextInt(32)==0`），
  用的都是 `Entity.sharedRandom`。测试里用 `Random.setSeed` 探针把三个种子
  （会孵 / 不会孵 / 孵 4 只）**算出来**，把随机行为测成确定性的。
  场景 `egg.mjs` 同一帧连扔 80 个蛋（(7/8)^80 ≈ 0.002% 一只不孵），**实测孵出 14 只**。

### D11：`Arrow` 是"另一份 Throwable"

`Arrow` 继承的是 **`Entity`**（不是 D8 的 `Throwable`），所以 `shoot`/`lerpMotion`/`tick`
是两份相似但**有差异**的代码，差异全部原样保留（文件头有对照表）：除零保护（Arrow 没有）、
落地存活（`++life == 60*TPS` vs 硬编码 `20*60`）、重力（0.05f vs 虚函数 0.03）、
`clip` 的重载、`tick` 开头那段"自己在不在方块碰撞盒里"（inGround 的主要来源）。
⚠ 两处改名/保护：`_init()` → `_initArrow()`（撞 `Entity._init`）、`Tile.tiles[t]` 前加 `if (tile)`
（没法照抄的 UB 保护）。
⚠ 扰动时又发现**我自己测试里的两个真空白**：暴击伤害原来只断言"落在 [2,4]"（把 `+2` 改成 `+20`
能碰运气过）、水的阻力原来断言 `|zd| < |zd0|*0.9` 而 **`f(0.9)` 比 double 的 0.9 小**，
把 0.8 改成 0.9 的扰动被放过去了 —— 都改成精确值/种子化断言。

### D2.5 / D9.5 / D11.5 —— 三个渲染器（D0 没算到）

三次都是"实体逻辑做完、画面上看不见"逼出来的（`EntityRenderDispatcher` 拿不到渲染器就跳过）。
三个都**不依赖模型系统**：`FallingTileRenderer`（32 行）、`ItemSpriteRenderer`（41 行，雪球+蛋共用）、
`ArrowRenderer`（62 行）。
⚠ `ArrowRenderer` 要的 `item/arrows.png` 得加进 `apps/web/src/assets.ts` 的预加载表 ——
**漏了它不报错**，但 `bindTexture` 会沿用上一次绑定的纹理（PITFALLS 第 25 条那种"画错了图"）。

### 工具上的两个教训（都是我自己的脚本/流程）

1. **扰动脚本不能用"把新串换回旧串"来回退**：旧串本来有两处时，回退会把两处都换回去，
   等于多改一处 —— 这样把 `EntityRenderDispatcher.ts` 改坏过一次（两行变成同一个 id、
   蛋的注册丢了）。改成"改动前备份、回退从备份还原"（`mut.py --restore`）。
2. **本仓库文件是 CRLF**：扰动脚本里的多行锚点必须写 `\r\n`（写成 `\n` 会 MUTATE_FAILED）。
   另外有一次改 `xd` 那一行去验 `zd` 的断言 —— 扰动指错了变量，白跑一轮。

### D12 收尾

- 手册 `docs/MCPE-TS后续清单-S11-S13.html` 加「阻塞清单核查（第 6 版）」：第三类 8 条逐条标结果
  （7 条已解除、`Sheep` 那条仍未解除且理由成立），补记三个渲染器与仍缺的渲染器
- `docs/ai/TASK-D-实体.md` 加「任务单 D 完成」章节（19 个提交的台账轨迹、D0 漏算的三件事、
  已知缺口、每步的验证方式）
- `docs/ai/README.md` / `CLAUDE.md` 里的「PITFALLS 28 条」**已经是对的**（之前那一轮就改过了），
  D12 没有再动
- 修掉 `EntityFactory.ts` 头注释里一句过时的话（"TripodCamera 还是 FORWARD-DECL" —— D5 起它是真类）

**台账 252 → 236，`DEFERRED(Entity)` 8 条 → 2 条**（`MobFactory` 那句 + `DyePowderItem` 的 `Sheep` 分支，
都归第四类 MobAI）。

## 2026-10-04 — 任务单 D 的中段：D3 ~ D9.5（补齐之前没记的部分）

用户当天临时破例："自动跑完整个 D"。下面按提交顺序记；**台账数字都是在对应提交上
用临时 worktree 实测的**（`node tools/ledger.mjs | tail -1`），不是估的。

| 步 | 提交 | 台账 | 一句话 |
| --- | --- | --- | --- |
| D3 | `f3f0df8` | 246 → **245** | `Explosion` + `Level.explode`，**这批第一个带黄金样本的** |
| D4 | `3b3fcdc` | 245 → **238** | `PrimedTnt` + `TntTile` 接线，TNT 会炸、会连锁 |
| D5 | `d3f13a5` | 238 → **235** | `TripodCamera` + `Level.takePicture`（+ `0483f1e` 补 typecheck） |
| D6 | `18de1f6` | 235 → **235** | `HangingEntity` 抽象基类 |
| D7 | `6dd9db8` | 235 → **232** | `Motive` + `Painting` + 接线 |
| D8 | `effaec8` | 232 → **232** | `Throwable` 抽象基类 |
| D9 | `1b15d18` | 232 → **230** | `Snowball` + 接线（+ `05333d6` 修场景里的 id） |
| D9.5 | `b5669ec` | 230 → **230** | `ItemSpriteRenderer` —— 雪球/蛋在画面上看得见了 |

### D3 —— `Explosion` + `Level.explode`

`Explosion.ts` 202 行 + 头。**这批唯一有黄金样本的一步**（`harness_explosion.cpp`、
`fixtures/golden/explosion.json` 6 个 case、`explosion.golden.test.ts` 一档逐位比较）。

两处原样保留：`Explosion` 的**两个随机源**（射线能量用 `level->random`，fire 分支用成员
`random`）；`Tile::setExplodeable(x)` 存的是 `x*3`、`getExplosionResistance()` 再 `/5`。
`TilePosSet` 是 `std::set<TilePos>` 的替身（按 `hashCode` 升序 + 等价去重）。

⚠ 教训：单测原本只断言"有没有炸出坑"，**扰动 8 条里 5 条骗得过去**；改黄金样本后 7/8 会红。

### D4 —— `PrimedTnt`

`wasExploded` 里那条 `level.random.nextInt(life/4) + life/8` 是**连着还原**的 ——
它消耗一次 `level->random`，少调一次后面整条随机流都错位（80 → `nextInt(20)+10`，引信 [10,30)）。
两个除法都是 int/int。
三个怪癖照抄：四参构造才 `makeStepSound = false`（单参不设）；四参只对齐 `xo/yo/zo`，
**没有** `xOld/yOld/zOld`（FallingTile 那边两者都设）；NBT 读 `Fuse` 不带 `& 0xff`。
场景 `tnt.mjs` 摆 3×3 TNT、炸第一下，**后面全是游戏自己连锁的**，735 格削到 273 格。

### D5 —— `TripodCamera` + `Level.takePicture`

`getEntityTypeId()` 硬编码返回 **0**（EntityTypes 里没这个 id）；`life == 0` / `life == 8`
是**等于**判断；`CameraItem.use` **没有** `!isClientSide` 守卫。
它继承 `Mob` 但 `tick()` 整体重写不调 super —— 所以 Mob 那 14 条 `DEFERRED(MobAI)` 碰不到它，
这是它能独立做完的关键。

⚠ **流程错误（我自己的）**：测试文件写完**没跑 typecheck 就提交**了，`ItemInstance` 少传第三个
参数，靠 `0483f1e` 补。从那以后每步提交前都先跑 `pnpm typecheck`。

### D6 —— `HangingEntity`

四个怪癖：构造函数的 `dir` 参数**被丢弃**（`init()` 里 `dir = 0`）；`survives()` 里查重叠挂件的
循环写在 `for (ss...)` **里面**；NBT 同时写 `"Direction"` 和 `"Dir"`（值还不一样），读时优先前者；
`move()` 和 `push()` 函数体一模一样。
⚠ 写测试时自己踩了三个坑：`checkInterval++` 是**后置**自增 → 检查在第 **101** 刻；
子类 `getEntityTypeId()` 不能返回 0（`Entity.save` 里 `id === 0` 直接 return false，实体存不下来）；
EAST 方向的坐标算错。

### D7 —— `Motive` + `Painting`

两个顺序陷阱：`getAllMotivesAsList()` 的顺序**和声明顺序不同**（`Aztec2` 排在 `Alban` 前），
而 `setRandomMotive` 的随机下标建立在这个顺序上；**`Aztec` 根本不在列表里** —— 按名字查它
落到 `DefaultImage`（= Kebab）。原样保留，没"顺手补进去"。
⚠ 扰动有 **2 条无效**：只拿 Pointer（64×64 正方形）测尺寸，把 `getWidth` 写成返回 `h` 看不出来
（补了 Fighters 64×32 / Wanderer 16×32）；没有任何断言看 `entityRendererId`（补上）。

### D8 —— `Throwable`

硬编码 `life == 20*60`（**不乘 TicksPerSecond**，Arrow 那边写的是 `60*TicksPerSecond`）；
NBT 读 `inTile`/`shake` **带 `& 0xff`**（和 FallingTile/PrimedTnt 相反）；`tick()` **调 `super.tick()`**。
⚠ 单测写出来才发现：**`inGround` 只有 `readAdditionalSaveData` 会写** —— `Throwable::tick` 只读不写，
连 `Snowball::onHit` 都不写。所以"插在地上"只能靠读存档进入，单测也走那条真路。
⚠ 第一轮扰动 1 条无效（去掉 `super.tick()` 照样绿）→ 补了断言 `xo/yo/zo` 被 `baseTick` 对齐。

### D9 —— `Snowball` + 接线（本步我第一次亲手做的）

`Snowball.h` 是纯头文件（50 行），实体体全在 `Throwable` 里。三条原样行为：
`onHit` 里 `hurt(this, 0)`（**伤害 0**，打人不掉血）；`onHit` 是 **public**（ThrownEgg 那边是
protected）—— 单测直接调它，**那行代码本身就是编译期证明**；`onHit` **不设 `inGround`**。
接线：`SnowballItem.use` 的 `addEntity` 那句 + `EntityFactory` 的 `IdSnowball` case。
11 条扰动全红（其中一条的锚点在注释里也出现过，脚本拒绝后换了唯一锚点）。

⚠ **场景第一次跑就炸了**：`ItemC.items[76]` 是 null。根因是**物品 id 带 +256 偏移** ——
C++ `Item::Item(int id) : id(256 + id)`、`items[this->id] = this`（Item.h:213-225），TS 照抄
（Item.ts:247）。`new SnowballItem(76)` 构造完 `id === 332`，要查 `Item.items[332]`。
⚠ 还有一条**我自己写错的断言**：demo 世界是创造模式，`abilities.instabuild` 为真，
`if (!player->abilities.instabuild) instance->count--;` 不执行 —— 我原来断言"数量减一"。
改成：创造模式断言不减（16），另起一段把 `instabuild` 关掉、断言生存模式扣一（16 → 15）。

### D9.5 —— `ItemSpriteRenderer`（D9 的收尾，照 D2.5 的先例）

D9 之后雪球能飞、能撞、能消失，**但画面上看不见** —— 和 D2 的落沙同一个缺口。
C++ 里雪球和蛋共用 `ItemSpriteRenderer`（`EntityRenderDispatcher.cpp:55-56`），
是那一批里最小的：不依赖模型系统也不依赖 TileRenderer，4 个顶点。

⚠ 它读 `Item.egg` / `Item.snowBall`，所以**必须在 `initItems()` 之后**构造分派器单例。
真机顺序天然满足（`NinecraftApp.initApp` 里 initTiles → initItems 都在渲染之前），
但已有的 `fallingtile-renderer.test.ts` 是直接 `getInstance()` 的 —— 给它补了一个
`beforeAll { createFlatLevel(); initItems(); }`（**没动任何断言**），把真实顺序补上。

⚠ **我自己把工具用坏了**：扰动脚本原来用"把新串换回旧串"回退，遇到旧串本来就有两处的情况
会多改一处，把 `EntityRenderDispatcher.ts` 改坏过一次（两行变成同一个 id、蛋的注册丢了）。
已改成"改动前备份、回退从备份还原"（`mut.py --restore`），坏掉的那次手工修回并对了 diff。

浏览器场景 `snowball.mjs` 17 条断言全绿；4 张截图逐张看过 —— **01/03 两张里白球就在画面正中**
（⚠ 第一版 01 是空的：刚扔出来那一帧球还在玩家身上、几乎在视锥外，得先飞几刻再定格）。

## 2026-10-04 — D2.5：FallingTileRenderer（提交 4a9eca6）

用户报"下落的沙子和沙砾没有实体显示，落地了才重新出现"。**不是接线错**，是
**实体渲染器整体没移植**（D0 划出去的）—— `EntityRenderDispatcher.renderAt` 拿不到渲染器就跳过。
`FallingTileRenderer` 是那批里唯一不依赖模型系统的，所以能单拎出来先补。

- 新建 `packages/client/src/renderer/entity/FallingTileRenderer.ts`（C++ 那边 32 行 + 头 22 行）
- `EntityRenderDispatcher` 里注册一行（C++: `EntityRenderDispatcher.cpp:58`）
- client 出口补 `EntityRenderer` / `EntityRenderDispatcher`（原来只导了 `ItemRenderer`）

### ⚠ 补完渲染器，画面**还是空的** —— 又查出一层

这个坑比渲染器本身更值得记。第一版拍出来的 `01-沙砾在半空中.png` 是一片空天。
查下来是**相机插值**：

```
相机实际朝向 = xRotO + (xRot - xRotO) * a          （EntityRenderDispatcher.prepare）
而 xRotO 只在 Entity.tick() 里被赋成 xRot
```

场景为了拍"下落中的方块"会把世界 `pause` 住（无头浏览器只有约 1 帧/秒，不按住根本拍不到），
**一暂停就再也不 tick** —— 于是对准时改的 `xRot` 只被插值走一小截，镜头基本还平视，
实体在三十几格高处**直接被视锥裁掉**。表现出来就是"明明对准了却什么都没有"，
特别容易误判成"渲染器没生效"。

修法：改 `xRot` 的时候把 `xRotO` 一起改（`yRot`/`yRotO` 同理）。
PITFALLS 的 F 节加了两条：相机插值这条 + "用 `pause` 定格截图"这条。

### 照抄与没法照抄

- 照抄：`Level* level = tile->getLevel();` 写在 `if (tt != NULL)` **之前**（后面用不到也先取）；
  `shadowRadius = 0.5f` 过 `f()`。
- 没法照抄：`Tile::tiles[tile->tile]` 的下标**可能为负**（FallingTile 读 NBT 不带 `& 0xff`）。
  C++ 那边是读数组前面的野内存（UB），TS 里就是 `undefined`、被 `tt != null` 挡住不画。注释写明。
- `OMIT`：析构函数 `delete tileRenderer` 整条没移植（JS 没有析构函数，GC 管）。

### 又一次无效扰动（第四次）

`shadowRadius = f(0.5)` → `= 0.5` —— 断言照样绿。原因是 **`f(0.5)` 与 `0.5` 逐位相等**
（0.5 在 float32 里精确可表示）。和 D1 那条 `f(0.04)` 是同一类，但那个还差一个 ULP 的 1/130，
这个干脆一点不差。改成 `f(0.4)` 会红，说明断言本身是活的。已写进测试注释。

### 验证

- 新增 `tests/unit/client/fallingtile-renderer.test.ts`（4 条）—— 钉住**注册那一行**
  （类还在、编译也过、就是不画，最容易丢的就是它）；3 处扰动确认会红
- `falling.mjs` 现在真的拍到了半空中的沙砾，以及"沙子站在悬空石头上"（两格都看得见）
- `pnpm typecheck` / 70 文件 **645 测试** / `pnpm build` 全过；六个浏览器场景全绿；台账 **245 → 246**

---

## 2026-10-04 — D2：FallingTile 接上线（提交 a9b7345）

`HeavyTile.checkSlide` 的三句、`SandTile.checkSlide` 的两句、`EntityFactory` 的 case 全接上。

### ⚠ 实测推翻了一个想当然的结论：**游戏里的沙子不是 SandTile，是 HeavyTile**

原来以为"沙子（SandTile）只在**随机刻**检查下落，所以场景里没法等，得手动递一刻进去"。
**是错的**：[`Tile.cpp:173`](file:///$REF/src/world/level/tile/Tile.cpp) 是
`sand = (new HeavyTile(12, 18))->init()...` —— **id 12 的沙子本来就是 HeavyTile**，
放下去就排刻、邻居变了也排刻，自己就会掉。
`SandTile` 那个类是**死代码**：`rg SandTile src/` 只命中它自己和 `Tile.cpp` 里一行注释掉的
`hellSand`；真正 `public HeavyTile` 的子类只有 `GravelTile`。

**这个错误是浏览器场景自己抓出来的**：我在场景里埋了条"沙子的 onPlace 是空的、不该排刻"的
断言，跑出来是 `+1`。顺着 +1 查了 `LevelChunk.setTile` → `onPlace` → 最后
`rg addToTickNextTick` 只剩火焰/沙砾/液体三处能排，再回头查注册表才发现 id 12 是 HeavyTile。
`SandTile.ts` 的头注释已经改对了（现在写着"这个类是死代码，别被类名骗了"）。

顺带查清：`HeavyTile.onLand` 在**全 C++ 里零调用方**（`rg onLand src/` 只命中声明和定义本身）——
`FallingTile::tick` 落地那两个分支被原作者掏空之后，这个虚函数就再没人调了。照抄保留，注释写明是死的。

### 接线时最容易抄错的地方（单测专门钉住）

| | HeavyTile | SandTile |
| --- | --- | --- |
| 实参 | `…, id, level->getData(x,y,z)` | `…, id`（**不传 data**，默认 0） |
| 钩子 | 调 `falling(e)` | **不调**（压根没这个方法） |
| 守卫 | `tick()` 一道 + `checkSlide` 的 else 一道，**两处** `isClientSide` | **一处都没有** |
| 继承 | `HeavyTile` | `public Tile`（**不是** HeavyTile 的子类，是抄了两遍的拷贝） |

### 又一次无效扰动（第三次了）

"HeavyTile 删掉 `tick()` 里的 `isClientSide` 守卫" —— **照样全绿**。
原因不是断言松，是**守卫本身重复了**：`checkSlide` 的 else 分支上还有一道，删一道另一道还挡着。
补了一条走 `instaFall` 支路的用例（那条只有 `tick()` 的守卫拦得住）才把两者分开。
另外 8 处扰动逐个确认会红。

### 验证

- 新增 `tests/unit/world/fallingtile-wiring.test.ts`（12 条）—— 专钉上表那几处差异 + 端到端下落
- 新增 `tools/verify/scenarios/falling.mjs`（24 条断言）—— **一格方块都不手动 tick**，
  全靠游戏自己的循环：正前方放沙砾等它掉、垒石头+沙子在半空、挖掉石头看沙子掉下来
- `pnpm typecheck` / **641 测试** / `pnpm build` 全过；六个浏览器场景全绿；台账 **251 → 245**

### 场景踩的坑（都写进 falling.mjs 的注释了）

- **`h.state` 的 fn 里看不见模块级常量**（会被 toString 后在页面里重求值）。我在文件头写了这条
  注意事项，然后自己照样踩：`ReferenceError: AIR_TOP is not defined`。
- **无头浏览器画面只有约 1 帧/秒**，落体每刻走约 2 格 —— 等截图落盘方块早着地了。
  解法：`a.pause = true`（`Minecraft.pause` 只挡 `level.tick/tickEntities`，渲染照跑）
  把世界按住、等画面追上来再拍。
- 第一版相机根本没对着方块（沿用了出生点的默认朝向），四张截图里一格方块都看不见。

### ⚠ 留下的缺口（用户报的）

**降落途中的方块画面上看不到**，落地后才重新出现。根因**不是接线错**，是
**实体渲染器没移植**（D0 明确划出去的那一项）—— `EntityRenderDispatcher` 拿不到渲染器就跳过。
补 `FallingTileRenderer` 约 **30 行 + 一行注册**（`FallingTileRenderer.cpp` 一共 32 行，
`TileRenderer` 那 3227 行**已经移植过了**）。等用户定：现在补，还是留到"实体渲染器"那一轮。

---

## 2026-10-04 — D1：FallingTile（落沙）类本身

`packages/world/src/entity/item/FallingTile.ts` 从 6 行 FORWARD-DECL 空接口换成真类（157 行）。
**这一步只做类本身，不动任何接线** —— HeavyTile / SandTile / EntityFactory 是 D2 的事。

### 两处原样保留的怪癖（都写进文件头了）

1. **落地那段是两个空块**：`if (放置成功) { } else if (!isClientSide) { }` ——
   原作者把"放不进去时怎么办"的逻辑掏空了，只留下判断本身的副作用（`mayPlace` 与
   `setTileAndData` 的调用）。照抄，没合并。
2. **NBT 读回来没有 `& 0xff`**：`tile = tag.getByte("Tile")` 直接赋 int，所以 tile id > 127
   读回来是负数。同批的 Arrow / Throwable 都带 `& 0xff`，只有这里不带 —— 不一致是原样，钉了测试。

还有一条容易抄错的：`tick()` **不调 `super.tick()`**（本批里 Arrow / Throwable 反过来是调的）。

### 踩的坑：平坦世界在无头环境下只有一块 3×3 平台

测试第一版写在 (40,40)，跑出来落沙一路掉到 y=-47 出界。查下来：
`FlatChunkSource` **只在区块 7–9（方块 x/z 112..159）填地形**，其余区块全是空气。
改用 (130,130)。（`headlessLevel.createFlatLevel()` 出来的就是这个"一块平台 + 一片虚空"的世界。）

顺带发现自己在测试里写错一处：断言 `bbWidth === 0.98` —— 而代码是 `f(0.98)`（C++ 的 `0.98f`）。
**代码是对的，断言错了**，改成 `Math.fround(0.98)`。

### 反向验证：**又一次无效扰动，自己抓到了**

| 扰动 | 结果 |
|---|---|
| `time === 1` → `time === 2`（时机） | **红 2 条** ✓ |
| `heightOffset = bbHeight/2` → `/4`（落点） | **红 1 条** ✓ |
| `tile === 0` 早退条件改掉 | **红 1 条** ✓ |
| `f(this.yd - f(0.04))` → `f(this.yd - 0.04)`（漏包字面量） | **照样全绿** ✗ |

最后那条一开始被我当成"测试不够严"，加了逐刻精确断言之后**还是绿的**。查数值才明白
**是扰动本身无效**：
- 起始值 0 那次：`0 - x` 是精确的，`f(0 - 0.04)` 与 `f(0 - f(0.04))` 逐位相同；
- 后续：`0.04` 与 `f(0.04)` 差 **8.94e-10**，而 `yd` 收敛在 -1.96 附近、那儿的 float 间距是
  **1.19e-7** —— 差一个 ULP 的约 1/130，永远翻不过去。

**结论：包 `f()` 是忠实照抄，但在 FallingTile 上没法用断言证明。** 这条写进了测试注释，
免得下次有人拿它做扰动、得到一个假绿。（这已经是本项目第二次抓到自己造的无效扰动了 ——
上一次是 C-5 的 `f(x * f(0.5))`。）

### 测试结果

- `pnpm typecheck` OK / `pnpm test` **68 文件 628 测试全过**（原 67/621，+7）
- `pnpm ledger` **252 → 251**（`FORWARD-DECL(FallingTile)` 消失）；`DEFERRED(Entity)` 仍 25 条（D2 才降）
- `pnpm build` OK
- 浏览器 `default` / `worldgen` 回归通过（本步不涉及画面，只确认模块加载没被新导出影响）

### 下一步

**D2**：接线 —— `HeavyTile.ts:64-66`（三行）、`SandTile.ts:61-62`（两行，**写法与 HeavyTile 不同**：
没有 `!isClientSide` 守卫、不传 data、不调 `falling()`）、`EntityFactory.ts:42` 的 case、
`entity-factory.test.ts` 对应那条；新增浏览器场景：挖掉沙子底下那格，等几刻，看沙子真的落下来。


## 2026-10-04 — 修 bug：界面里看不见鼠标（两个独立的原因）

用户报的现象：PC 端浏览器里进任何 UI 界面，鼠标光标看不见、只能盲选，
而且**运动范围好像有限制**。首页和游戏内界面都有。

### 原因一：`hideCursor` 照着形参名写，方向反了

参考 `AppPlatform_glfw.h:135`：

```cpp
virtual void hideCursor(bool hide) override {
  int isHide = hide ? GLFW_CURSOR_NORMAL : GLFW_CURSOR_HIDDEN;   // ← 反的
  glfwSetInputMode(window, GLFW_CURSOR, isHide);
}
```

形参叫 `hide`，`hide == true` 设的却是 `NORMAL`（**显示**）—— 参数的实际含义是"显示"。
`GameRenderer` 按 C++ 原句调 `hideCursor(!rpiCursor)`，默认 `rpiCursor = false` →
`hideCursor(true)` → 系统光标**可见**。

`AppPlatform_web` 写成了 `hide ? 'none' : ''` —— 正好反了。于是**每进一个界面系统光标就被藏掉**，
而 `rpiCursor` 默认又是 false、游戏也不画自己的光标 → 两边都没有，只能盲选。
（顺带记一下：基类 `AppPlatform::hideCursor` 是**空函数**，win32/android 干脆什么都不做。）

### 原因二：鼠标坐标是 CSS 像素，画布是设备像素

`main.ts` 里 `canvas.width = clientWidth * dpr`（高分屏不糊），而 `DomInput` 用
`getBoundingClientRect()` 取坐标（**CSS 像素**）。游戏里 `mc.width = canvas.width`
（**设备像素**），`xMouse = Mouse.getX() * InvGuiScale` —— 两个坐标系差一个 dpr。

结果：**鼠标只能够到屏幕左上角的 1/dpr**。Windows 缩放 125% 就是 1/1.25，150% 就是 1/1.5。
这就是用户说的"运动范围有限制"，右下角一大片按钮永远点不到。

### 复现与验证

新场景 `tools/verify/scenarios/cursor.mjs`，**必须在 `SMOKE_DPR=1.5` 下跑**
（`smoke.mjs` 原来写死 `deviceScaleFactor: 1`，加了 `SMOKE_DPR` 环境变量；场景自己会检查 dpr，
不是 1.5 就报错，免得"跑绿了"其实是没测到）。

修之前跑，两条都红：
- `起始菜单上系统光标是可见的（cursor="none"）` ← 抓到原因一
- `鼠标放在「开始游戏」正中间点一下，真的进了选世界界面（实际：TouchStartMenuScreen）` ← 抓到原因二

算一下就知道对得上：按钮在 GUI x=142..217，`screenW=360 / mcW=1440 / cssW=960`。
鼠标放在 CSS 479 时，老代码算出 `trunc(479 * 0.25) = 119` —— **142 之前，点空**；
新代码 `trunc(479 * 1.5 * 0.25) = 179` —— 落在按钮里。

修完两条都绿。

### 改了什么

- `apps/web/src/AppPlatform_web.ts` —— `hideCursor` 反过来（按行为，不按名字），注释写清来龙去脉
- `apps/web/src/DomInput.ts` —— 加 `pixelScale()`（`canvas.width / rect.width`），
  `pos()` 和锁定态的 `vx/vy` 累加都换算成设备像素；`onLockChange` 的初始位置也改成设备像素
- `tools/verify/smoke.mjs` —— 加 `SMOKE_DPR` 环境变量（默认 1，不影响已有场景）
- `tools/verify/scenarios/cursor.mjs` —— 新增
- `.claude/skills/mcpe-porting/PITFALLS.md` —— 新增第 27 条（**形参名会骗人，判据是行为**）
  和第 28 条（**CSS 像素 ≠ 设备像素**），F 节补一条"默认 dpr=1 会掩盖这类 bug"

### 测试结果

- `pnpm typecheck` OK / `pnpm test` 67 文件 **621 全过** / `pnpm build` OK / `pnpm ledger` 252 不变
- **dpr=1**：default / storage / startmenu / options / worldgen 五个场景全绿（无回归）
- **dpr=1.5**：default / startmenu / worldgen / cursor 全绿 —— 之前从没在高分屏下测过
- 截图打开看过：`cursor/02-点对了按钮.png` 确实是选世界界面


## 2026-10-03 — C-7：收尾（任务单 C 完成）

### 台账收口：逐条核过，一条过时的都没有

| 标记 | 条数 | 都是什么 |
|---|---|---|
| `DEFERRED(LevelgenFeature)` | 5 | `RandomLevelSource.ts:394` 的 `postProcess` + `Sapling.ts` 4 条树木地物 |
| `OMIT(LevelgenFeature)` | 5 | `Biome.getTreeFeature`/`getGrassFeature` + 三个子群系的重写 |
| `OMIT(Levelgen)` | 4 | `waterDepths`、`fi/fis`、`calcWaterDepths`、`PerformanceTestChunkSource`（全是死代码） |

**252 条**（C-7 本身不改代码，条数不变）。

### 文档

- `docs/ai/TASK-C-世界生成.md`：补上结尾的「任务单 C 完成（C-1 ~ C-7）」章节。
- 两份工作手册（HTML，gitignore）各加了一段更正：
  - `MCPE-TS后续清单-S11-S13.html`：顶部横幅里"从菜单进世界会抛"改掉，数字更新。
  - `MCPE-TS最小Demo实施流程-修订版10.html`：新增「更正（第 4 版，2026-10-03）」（含目录项），
    并把第 3 版那条"世界生成仍未做"划掉、标注已被推翻；「当前进度与下一步」里补一条现状更新。
  - 两份都用 Playwright 打开、滚到改动处截图看过（正文、目录项、表格都没串行）。

### 最终数字

- `pnpm typecheck` OK / `pnpm test` **67 文件 621 测试全过** / `pnpm build` OK
- `pnpm ledger` **252 条**
- 浏览器五个场景全绿：default 21 / storage 13 / startmenu 44 / options 8 / **worldgen 22**

### 任务单 C 到此结束

**能做的**：从菜单点进一个新生成的普通世界，两条入口都通；里面有山有水有洞，能挖能放能存。
**做不了的**：世界里**没有地物**（湖/矿/树/花草/泉/雪整段是 `postProcess`，仍空实现）——
所以挖不到矿、没有树。区块照样会被标成 `terrainPopulated = true` 存下去，
以后补地物时老区块不会追溯补上，得删掉重新生成。

### 下一轮该补的（记在这里）

1. **夹具盲点**：G15-1 那 5 个区块全在真实世界（256×256）之外。
   补法：往 `harness_randomlevelsource.cpp` 的 `CHUNKS` 里加一个落在 `0..15` 的区块再生成夹具。
2. **`Dimension.getTimeOfDay` 的 float/double 差异**（C-4 时标记，第三档渲染，一直没修）。
3. **`postProcess`**：写它之前要先把地物系统做齐 —— 顺序是唯一要紧的事。


## 2026-10-03 — C-6b：浏览器实测 —— 从菜单真的点进了一个生成出来的世界

`tools/verify/scenarios/worldgen.mjs`（新场景）走**真菜单**：
开始游戏 → Create new → 填种子 → Create → `Minecraft.selectLevel`。
**截图里真的有山有水**（沙滩 + 海 + 长满草的山坡）。

### 撞上一个真问题：`postProcess` 写成了 `throw`

C-6a 把 `Dimension.createRandomLevelSource` 的 throw 换掉之后，菜单路**还是**走不通 ——
换了一句报错：`RandomLevelSource.postProcess 尚未移植`。

`ChunkCache.getChunk` **每凑齐 2×2 个区块就调一次 `postProcess`**（`ChunkCache.ts:145` 起四段判断），
也就是每个区块都会走到。它原来是个 `throw`，但它在 `Dimension` 那句 throw 后面才轮到，
所以之前一直没暴露。

按 task_plan 里早就写好的决策（"`postProcess` DEFERRED 之后生成的区块照样会被标成
`terrainPopulated = true` 存下来"）把它改成**空实现**，C++ 那句 `isGeneratingTerrain` /
`HeavyTile::instaFall` 的一进一出也一并 DEFERRED（那对开关是给地物用的，没有地物就没有"生成期间"）。

### 一个必须记住的结论：这个世界只有 256×256

扫种子时扫出"负坐标区块整块 heightmap = 0"，一度以为是 bug。查下来是**原版就这样**：

```cpp
bool fits(int x, int z) {
  return (x >= 0 && z >= 0 && x < LevelConstants::CHUNK_CACHE_WIDTH && z < LevelConstants::CHUNK_CACHE_WIDTH);
}
```

`CHUNK_CACHE_WIDTH = 16` → 世界就是区块 `0..15` × `0..15` = **256×256 格**。
范围外 `ChunkCache` 返回 `EmptyLevelChunk`：整块 `invisible_bedrock`(95)、`getHeightmap` 恒 0。
TS 是 1:1 照抄的，没问题。

**两个后果记在这里：**
- `level.getHeightmap` 对**没生成的区块直接返回 0**（`hasChunk` 为假就 return 0），不触发生成 ——
  扫地形要先自己 `getChunk`。第一版扫描就是这么被骗的（每个种子都报 `hMin=0`）。
- 出生点**不是 (0,0)**：`Level.setInitialSpawn` 从世界中心 **(128,128)** 起步，不合法才随机游走。

### 夹具覆盖面的一个已知盲点

黄金样本 G15-1 那 5 个区块是 **`(20,0) (14,19) (-120,-113) (-37,11) (-40,35)`** ——
**全在真实世界（区块 0..15）之外**。它们照样是有效的判据（`RandomLevelSource` 对坐标没有"世界边界"这个概念），
但**游戏里真正会生成的那 256×256 里一个区块都没被逐字节比过**。
要补的话：往 harness 的 `CHUNKS` 里加一个落在 `0..15` 的区块再重新生成夹具。**本轮没做。**

### 场景本身踩的两个坑

1. **起伏量错了东西**：`if (top < 0) top = y` 记的是**最低**那个非空气格 ——
   每根柱子都停在 y=0 的基岩上，"最高减最低"恒等于 0，`地面有起伏` 这条**永远为假**。
   断言看着很合理，其实量错了对象。
2. **方向反了**：先站在最高点朝出生点看，拍出来一片平沙 ——
   种子 777 的地形是"一大片低地 + 东北角一片高地"，站在高地上往低处看当然看不到山。
   改成站在出生点朝最高处看。

种子是**扫出来的**：临时脚本按真实出生点周围 ±96 比了 10 个种子，
选了 `777`（落差 46 / 31% 是水）；`20251003`、`1234567` 落差更大但**一滴水都没有**，
`999983` 是 85% 的纯海、落差只有 2。

### 测试结果

- `pnpm typecheck` OK / `pnpm test` 67 文件 **621 全过** / `pnpm build` OK
- `pnpm ledger` **252 条不变**（`postProcess` 那条 DEFERRED 标记原地保留）
- 浏览器 5 个场景全过：`worldgen`（新）、`startmenu`（两条断言翻转）、`default`、`storage`、`options`
- 截图逐张看过：`worldgen/03-朝最高处看.png` 就是验收要的那张

### 审查（port-reviewer）

两处移植代码（`Dimension.createRandomLevelSource`、空 `postProcess`）**都对得上，无问题**。
它另外核了几件我没查的：

- `isGeneratingTerrain` 在参考 src 里只有 4 处、**没有任何读取方**；`HeavyTile::instaFall`
  默认就是 false，且 `postProcess` 函数体 220-534 没有 #ifdef、没有提前 return，结尾必然恢复 false ——
  所以这对开关一并 DEFERRED 掉，稳态与 C++ 一致。
- 计时那段 `getTimeS()/totalTime` 是死代码（totalTime 全文无读取方），不算缺陷。
- RNG 不会被串到：`getChunk` 和 `postProcess` 各自在入口 `setSeed`。

**它标了一条我该记住的**：黄金 harness **不调 `postProcess`**（`harness_randomlevelsource.cpp:247`），
所以这个空实现的正确性**黄金样本覆盖不到**，目前只靠 C-6b 的浏览器实测兜底。

### 下一步

**C-7**：收尾 —— `postProcess` 的账结清、文档、台账。


## 2026-10-03 — C-6a：接线 Dimension.createRandomLevelSource

`Dimension.ts` 那条 `DEFERRED(Levelgen)` 的 throw 换成真调用：

```ts
return new RandomLevelSource(
  this.level,
  this.level.getSeed(),
  this.level.getLevelData().getGeneratorVersion(),
  !this.level.isClientSide && this.level.getLevelData().getSpawnMobs(),
);
```

`FlatDimension` 不受影响（它 override 了，返回 `FlatChunkSource`）。

### 接线本身也补了判据

之前所有黄金样本都是**手工** `new RandomLevelSource` 的 —— **算法对不等于接的线对**。
新增一条不传 `fixedDimension`、走 `DimensionFactory` 真路（跟 `Minecraft.selectLevel` 一样）的
测试，拿 `level.dimension.createRandomLevelSource()` 出来的区块跟夹具逐字节比。

### 反向验证

把接线临时换回 `throw` → **正好那两条新测试红**（黄金那条 + 单测那条），其余 35 条不动。
改回来即全绿。

### 顺带修掉的过时测试

`tests/unit/world/dimension.test.ts` 里有一条断言"调用 `createRandomLevelSource()` 会抛
`RandomLevelSource 尚未移植`"—— 那是钉 `DEFERRED` 的，现在该换。
改成断言建出来的是真的 `RandomLevelSource` 实例。
`helpers/fakeLevel.ts` 的 `getLevelData()` 跟着补了 `getGeneratorVersion` / `getSpawnMobs` 两个 getter。

### 测试结果

- `pnpm typecheck` OK
- `pnpm test` 67 文件 / **621 测试全过**（原 620 + 新增 1）
- `pnpm ledger` **253 → 252** —— 降的正好是 `Dimension.ts` 那条 `DEFERRED(Levelgen)`

### 拆步说明

原计划的 C-6 要动 9 个文件（`Dimension.ts`、4 个测试/辅助文件、新场景、`startmenu.mjs`，
外加 3 个写着"点 Create 会抛"的过时注释），超过 CLAUDE.md「碰 5 个以上文件就停下拆细」的线。
按性质切成 C-6a（接线 + 用黄金样本钉住）与 C-6b（画面上的验收），已写回 `docs/ai/TASK-C-世界生成.md`。

### 下一步

**C-6b**：浏览器实测。新场景走真菜单（开始游戏 → 新建世界 → Create）；
`tools/verify/scenarios/startmenu.mjs` 里那两条**当初就写着"将来会红"**的断言
（`点 Create 会抛` / `进世界会抛`）翻成"真的进得去"；
`Minecraft.selectLevel`、`NinecraftApp.startDemoWorld`、`SimpleChooseLevelScreen` 文件头
三处"会抛"的注释一并改掉。验收：**截图里真的有山有水**。


## 2026-10-03 — C-5：CanyonFeature + getChunk/create（地形全通）

新增 `CanyonFeature.ts`，`RandomLevelSource` 补上 `canyonFeature` 成员与
`getChunk`/`create` 本体。测试 21 → 31 条：**夹具五段 × 5 个区块全部逐字节相同**。

### 里程碑：`RandomLevelSource` 只剩 `postProcess`

```
DEFERRED(Levelgen)       1 条 —— 而且是 Dimension.ts:55 的，不是这个文件的
OMIT(Levelgen)           4 条 —— 全是死代码
DEFERRED(LevelgenFeature) 1 条 —— postProcess（C-7）
```

**世界生成除了地物，一条 C++ 语句都没落下。**

### 峡谷与洞穴长得几乎一样，但有七处实在的差别

逐行 diff 后写进了文件头。最要命的是**浮点字面量的后缀不同**：
`rad` 里的 `1.5`、`xd`/`zd`/`yd` 里的 `0.5` 在峡谷这边**没有 `f` 后缀**（洞穴是 `1.5f`/`0.5f`），
所以那几段是 double 算完只在赋值时收口一次。另外 `addFeature` 是**直接早退**
（`nextInt(15) != 0` 就 return，一个随机数都不多抽），洞穴则是先抽一串再决定。

### 补 `getChunk` 时被测试抓到一个真坑

`getChunk` 直接用 `LevelChunk.ChunkBlockCount` —— **那个静态量默认是 0**，要 `Minecraft.init`
才设成 32768（PITFALLS 第 19 条）。**重放路径自己 `new Uint8Array(32768)` 把坑绕过去了**，
所以只有"直接调 getChunk"的测试抓得到。第一次跑 5 条全红，查出来就是这个。

顺带：`getChunk` 最后调的 `recalcHeightmap()` 要读 `level.dimension` 和一串 Level 方法，
鸭子类型的替身撑不住（先是 `hasCeiling` 报错、补了 dimension 又轮到 `getHeightmap`）——
那几条测试改成用**真的 `Level`**，建法与 `tests/helpers/headlessLevel.ts` 的 `createFlatLevel` 一致。

### 反向验证（三次，其中一次是无效扰动）

| 改动 | 结果 |
| --- | --- |
| `xRota *= 0.5` → `f(xRota * f(0.5))` | **照样全过** —— 这是**无效扰动**（0.5 二进制精确，两行恒等），我自己发现后换掉 |
| `xRota * f(0.6)` | **只有 `(20,0)` 与 `(-120,-113)` 红** —— 正好是夹具里唯二有峡谷的区块 |
| `getChunk` 里去掉峡谷那一步 | **同样只有那 2 个红** —— 编排也验证到了 |

### 审查纠正了我一处**说错的判断**（没写进任何文档）

我原以为"另 3 个区块连 `addTunnel` 都没进，所以它们兜住了早退不多抽随机数"。
审查实测：那 3 个各进了 11~24 次 `addTunnel`；而且"早退多抽随机数"**根本不可观测** ——
`apply` 对每个坐标都重新 `setSeed`，多抽的数不会被后续任何消费读到。

审查另外确认：七处差别一条不漏、浮点字面量后缀全对、控制流逐字一致、
`step == -1`/`singleStep` 在峡谷里**结构上不可达**（峡谷没有 addRoom，step 只能是 0 或递归传下来的 ≥0）。
覆盖盲区：`hasGrass` 与 `y1 > 120` 的钳位在这 5 个区块里没走到（是夹具的盲区，不是移植的错）。

### 验证

- `pnpm typecheck` / `pnpm test`（67 文件 **620 全过**）/ `pnpm build` 全绿
- `divs.py` 逐条判过（9 处除法全是浮点）；`shadow.py` 干净
- `pnpm ledger` 255 → 253
- 夹具本步没动（五段早就备好了）
- 未跑浏览器场景：`Dimension.ts:54` 仍是 throw，这个类还没被实例化

### 下一步

**C-6**：接线 `Dimension.ts:54` + 浏览器场景 —— 验收是**截图里真的有山有水**。

## 2026-10-03 — C-4：LargeFeature + LargeCaveFeature（洞穴）

新增 `LargeFeature.ts`（基类，35 行）+ `LargeCaveFeature.ts`（洞穴，~290 行），
接进 `RandomLevelSource.caveFeature`。夹具加了"洞穴之后"一段，测试 16 → 21 条。

### 给夹具加了一段：`afterCaves`

原来四段，可是 C-4 的判据不能是最后那段 `afterFeatures` —— 那里面还有峡谷，是 C-5 的事。
所以在 harness 的洞穴与峡谷之间插了一份快照。同时**删掉了 `fromGetChunk` 字段**：
它按构造等于 `afterFeatures`（自检不成立时整个夹具都不该用），TS 只读它做那个等式断言。
一增一减，夹具仍是 1.31MB。

### 一次就对，但这是三步里风险最高的一段

每次递归 `addTunnel` 都 `new Random(this.random.nextLong())` —— 随机流在这里分叉，
错一步整片洞穴错位。5215 个改动字节一次全对上之后照例反向验证：
`xRota *= 0.90f` 改成 `0.80f` → **只有 5 条洞穴测试红，其余 16 条全绿**。

### port-reviewer 这次抓到的是**反向**的错

C-3 的教训是"`0.2f` 要包 `f()`"。这次我把 `-0.7`（C++ 里**没有** `f` 后缀）也包了 ——
**那是 double 字面量**，比较按 double 提升做，包 `f()` 反而错，已改回。
**规则补全：判据是"C++ 原句有没有 `f` 后缀"，不是"这个数精不精确"。** 写进 PITFALLS 第 3 条了。

### 审查顺带证明/证伪的四件事（都是实测，不是推测）

- **求值顺序**：`nextFloat() - nextFloat()` 在 C++ 里两侧求值顺序未规定。我按从左到右写并对上了。
  审查给出论证：顺序反了的话差值会整体取负、半数次采样翻符号，5 区块上千次迭代**必然大面积分歧** ——
  逐字节全过即证明本构建同序。（是经验结论不是语言保证；换编译器要重验，而夹具就是重验手段。）
- **三角函数重载**：C++ 那些不带前缀的 `sin`/`cos`/`floor` 走 float 还是 double 重载？
  审查用同版本 g++ 探针**实测是 float 重载**（`<math.h>` 包装头在全局 `using std::sin`）。
  所以 `f(Math.sin(x))` 写法正确。
- **64 位那串**：`(x*xScale + z*zScale) ^ seed` 坐标 ±2²¹ 内 double 精确；
  JS 的 32 位 `^` 等于 C++ 64 位异或的低 32 位，而 `setSeed` 要的就是低 32 位。推理成立。
- **分支覆盖**：审查插桩统计 17 个目标分支，**并集全覆盖**。脆弱点：`hasGrass`（泥土→草）
  只靠 `(20,0)` 提供（2 次命中），以后换区块最容易丢。

### ⚠ 审查提了一条范围外但值得单独查的

`Dimension.ts:161/167`（`getTimeOfDay`）写成 `f(1 - (Math.cos(...) + 1) * 0.5)` ——
只在**最后**收一次口，中间按 double 算；而 C++ 那边 `cos` 走 float 重载、每步都收口，
**两者会差 1 位**。属渲染（第三档），按规则可以不管。**没动它，记在任务单里。**

### 验证

- `pnpm typecheck` / `pnpm test`（67 文件 **610 全过**）/ `pnpm build` 全绿
- 夹具两次生成 sha256 相同（`47663215…`），逐字节可复现；5 个区块自检全 True
- `divs.py` 逐条判过（10 处除法全是浮点）；`shadow.py` 干净
- `pnpm ledger` 257 → 256（`caveFeature` 那个 DEFERRED 转正）
- 未跑浏览器场景：这个类还没被实例化（`Dimension.ts:54` 仍是 throw）

### 下一步

**C-5**：`CanyonFeature`，验收是夹具最后一段 `afterFeatures` 整段对上。

## 2026-10-03 — C-3：prepareHeights + buildSurfaces

`RandomLevelSource.ts` 里两个方法从 DEFERRED 变成真实现；测试扩到 16 条。
夹具前三段（高度场 / prepareHeights 后 / buildSurfaces 后）在 **5 个区块**上全部逐位/逐字节相同。

### port-reviewer 揪出一个我完全没想到的 bug 类：**浮点字面量**

> C++ 的 `0.2f` 是 float，TS 直接写 `0.2` 是 **double** —— 两者差约**半个 float ULP**。
> 所以 `f(r * 0.2)` 与 C++ 的 `r * 0.2f` 结果不同。

我一开始想错了：以为差别在 2⁻⁵³ 量级（那样几乎不会影响结果）。实际 `0.2` 这个 double 和
`f(0.2)` 这个 float 差的**就是半个 float ULP**。**实测正好 20.00% 的输入差 1 位。**

要分清的是：**两个已经是 float 的值**之间的 +−×÷，在 double 里算完再 fround，
与 C++ 的单步 float 运算是逐位相同的（double 53 位够用，二次舍入无害）；
出问题的**只有十进制字面量本身**。本文件里要包 `f()` 的是 `0.2`（两处）、`0.3`、`1.4`；
其余（0.25、1.121、2 的幂…）要么二进制精确、要么已被 `getRegion` 内部 fround 掉。全修了。

**这类问题夹具原来测不出来** —— 改前改后 16 条测试都一样绿。所以只能靠审查 + 推理抓。

### 又关掉两条"写错也测不出来"的分支

审查同时指出 buildSurfaces 的 `gravel` 与 `runDepth <= 0` 两条分支一次都没走到（夹具里 0 个砾石字节）。
给夹具加了两个区块，现在 5 个：

| 区块 | 补的是哪条分支 |
| --- | --- |
| `(20,0)` | 温带海岸：草/沙/沙岩/水/岩浆 |
| `(14,19)` | 寒带海岸：**冰** |
| `(-120,-113)` | `getHeights` 正 dr 路径 + `depth > 1` clamp |
| `(-37,11)` | **砾石**（16 列）|
| `(-40,35)` | **`runDepth <= 0`**（71 列"水面之上顶着裸石"）|

两次反向验证都精确命中：砾石那行改成沙 → **只有 `(-37,11)` 红**；
`runDepth <= 0` 改成永不成立 → **只有 `(-40,35)` 红**。

**挑区块时踩的坑（值得记）**：一开始按"`gravelBuffer > 3` 就一定出砾石"挑，
挑中的 `(-40,0)` **一列砾石都没有** —— 砾石那段还套在
`y >= waterHeight-4 && y <= waterHeight+1` 的窗口里，陆地区块地表在水面之上，进不去。
**必要条件是阈值，充分条件还得看窗口。** 后来改成"用已经逐位核对过的 TS 直接跑一遍看输出"才挑对。

（另外 `--scan` 只能扫非负坐标，而砾石集中在负坐标那一片 —— 24×24 那轮扫不到它，不是因为它不存在。）

### 还剩一条极窄的子分支（如实记下）

`if (y < waterHeight && top == 0)`（`runDepth<=0` 把 top 清成 0 时补铺水/冰）：
要可见得地表正好落在 y=63，5 个区块都没撞上。且 `temp` 写死为 1，
`temp < 0.15f` 那个冰分支**结构性不可达**，实际只剩 `top = calmWater` 一句。
**这条目前写错也测不出来**，已在任务单里记下，并写明将来要怎么找样本。

### 反向验证（每段都单独证明过）

| 改动 | 结果 |
| --- | --- |
| `yc*8+y >= waterHeight - 1` → `- 2` | 只有 (14,19) 的 prepare/build 红（另两个区块没冰）|
| `nextInt(5)` → `nextInt(6)` | 只有 3 条 buildSurfaces 红，heights 与 prepare 全绿 |
| 砾石那行 `gravel.id` → `sand.id` | 只有 `(-37,11)` 红 |
| `runDepth <= 0` → `<= -999` | 只有 `(-40,35)` 红 |

改完全部还原。分段设计的价值在这里体现得很清楚：每次都能定位到**具体哪一段、哪个区块**。

### 验证

- `pnpm typecheck` / `pnpm test`（67 文件 **605 全过**）/ `pnpm build` 全绿
- 夹具两次生成 sha256 相同（`40d203c1…`），逐字节可复现；5 个区块自检全 True
- `divs.py` 逐条判过；`shadow.py` 干净
- `pnpm ledger` 259 → 257（prepareHeights / buildSurfaces 两个 DEFERRED 转正）
- 未跑浏览器场景：这个类还没被实例化（`Dimension.ts:54` 仍是 throw）

### 下一步

**C-4**：`LargeFeature` + `LargeCaveFeature`，验收是夹具的 `afterFeatures` 开始对上（洞穴部分）。

## 2026-10-03 — C-2：RandomLevelSource 类骨架 + 构造函数 + getHeights

新增：
- `packages/world/src/level/levelgen/RandomLevelSource.ts` —— 类骨架（继承 `ChunkSource`）、
  构造函数（8 个 PerlinNoise）、`getHeights`，以及几个本来就没依赖的小方法
  （`hasChunk`/`tick`/`shouldSave`/`gatherStats`/`getMobsAt` 直接做真的）
- `tests/golden/randomlevelsource.golden.test.ts` —— 4 条
- `packages/world/src/index.ts` —— 导出

**高度场 68 个 float × 3 个区块逐位一致，一次就对。**

### 提交前跑了 port-reviewer —— 它揪出一个真缺口（这一步很值）

审查结论是"可以提交"，但它做了**我没有的分支覆盖实测**：

> 夹具那两个区块的 `dr` 样本**全是负的**，于是 `getHeights` 里
> `else { if (depth > 1) depth = 1; depth = depth / 8; }` **一次都没走到** ——
> 就算把 `depth / 8` 写成 `depth * 8`、或漏了 fround，G15-1 也照样通过。

这是真问题（正 `dr` 在地形里约占四成，实际游戏天天走这条路）。**已补**：
harness 加第三个区块 `(-120,-113)`（`dr` 全为正且都 > 8000，顺带打到 `depth > 1` 的 clamp），
夹具重新生成。两个区块变三个。

它另外提的两条也改了：`SNOW_SCALE` 原写成 double `0.3`（应为 `f(0.3)`，C-7 会拿它做浮点乘）；
`calcWaterDepths`（死函数）与 `PerformanceTestChunkSource`（死类）补了 OMIT 标记。

### 两次反向验证（"一次就对"的结果不能直接信）

1. **浮点纪律**：把 `const f = Math.fround` 临时换成恒等函数 → **2 条测试立刻变红**。
2. **新补的那条分支**：把 `depth / 8` 改成 `depth * 8` → **只有 `(-120,-113)` 变红**，
   另两个区块照样绿 —— 正好印证审查员说的"那两条根本走不到这里"。

两次都验完立刻还原，测试恢复全绿。

### 台账 +12（247 → 259）

TASK-C 里原写的"每步台账条数不升"**对新起文件的步骤是错的**（那是 B 那一串"把 DEFERRED 换成真调用"的经验），
已在任务单里更正并写明理由。12 条逐条对得上：
- `DEFERRED(Levelgen)` ×6：两个成员对象 + `getChunk`/`create`/`prepareHeights`/`buildSurfaces`
- `OMIT(Levelgen)` ×4：死字段 `waterDepths`、`fi`/`fis`；死函数 `calcWaterDepths`；死类 `PerformanceTestChunkSource`
- `OMIT(Debug)` ×1：构造函数里那句 `Random randomCopy = random; printf(...)`（打的是副本，零影响）
- `DEFERRED(LevelgenFeature)` ×1：`postProcess`

### 读 C++ 与审查时查清的几件事

- **`version` 是个没用的参数** —— 构造函数收了它，既不存也不读。签名照保留。
- **`CHUNK_WIDTH = 4`（.h:39）是死常量**，`.cpp` 用的全是 `LevelConstants::CHUNK_WIDTH`（16）。代码里标红了。
- **`if (depth < -1) depth = -1;` 可证明永假**：进该分支时 depth 非负，`3*depth-2 ≥ -2`，再 `/2` 得 `≥ -1`，
  严格小于 -1 不可能。任何夹具都覆盖不到，不用为它设计样本。
- 两处真正的整数除法是 `16 / xSize` 与 `wScale / 2`，都写了 `Math.trunc`；
  `divs.py` 报的其余 11 处左操作数都是 float（`depth * ySize / 16` 容易误判成整数除法，其实不是）。
- 夹具的十六进制是**内存字节序**（小端），测试里按小端拼回 uint32 才能跟 JS 的位模式比 —— 当大端读会全错。
- `shadow.py` 的成员清单要写成**文件**传，不能当字符串传。

### 验证

- `pnpm typecheck` / `pnpm test`（**67 文件 / 593 全过**）/ `pnpm build` 全绿
- 夹具两次生成 sha256 相同（`93ecf96e…`），逐字节可复现
- `pnpm ledger` 247 → 259（上面逐条对过）
- 没跑浏览器场景：这个类还没被任何地方实例化（`Dimension.ts:54` 仍是 throw），画面上不会有变化

### 下一步

**C-3**：`prepareHeights` + `buildSurfaces`，验收是夹具里那两份快照
（`afterPrepareHeights` / `afterBuildSurfaces`）都对上。
`prepareHeights` 的三线性插值是这一步的高风险点。

## 2026-10-03 — C-2：RandomLevelSource 类骨架 + 构造函数 + getHeights

新增：
- `packages/world/src/level/levelgen/RandomLevelSource.ts` —— 类骨架（继承 `ChunkSource`）、
  构造函数（8 个 PerlinNoise）、`getHeights`、以及几个小的 ChunkSource 方法
  （`hasChunk`/`tick`/`shouldSave`/`gatherStats`/`getMobsAt` —— 这几条本来就没有依赖，直接做真的）
- `tests/golden/randomlevelsource.golden.test.ts` —— 3 条（1 条夹具体检 + 每区块 1 条高度场比对）
- `packages/world/src/index.ts` —— 导出

**高度场 68 个 float × 2 个区块逐位一致，一次就对。**

### 反向验证（这一步不能省）

结果太顺，所以把 `const f = Math.fround` 临时换成恒等函数跑了一遍 —— **2 条测试立刻变红**。
说明这份夹具确实在卡浮点精度，不是"怎么跑都通过"的假测试。改完立刻还原（3 条恢复全绿）。

### 台账 +10，且逐条对得上

`247 → 257`。**TASK-C 里原来写的"每步结束台账条数不升"是错的**（那是 B 那一串"把 DEFERRED 换成真调用"
的经验，对新起一个类的步骤不成立），已在任务单里更正并写明理由。

这 10 条：
- `DEFERRED(Levelgen)` ×6：两个成员对象 `caveFeature`/`canyonFeature`（C-4/C-5 的类还没移植）
  + `getChunk`/`create`/`prepareHeights`/`buildSurfaces` 四个方法体
- `OMIT(Levelgen)` ×2：死字段 `waterDepths`（只被清零）与 `fi`/`fis`（只被置 NULL 和 delete）
- `OMIT(Debug)` ×1：构造函数里那句 `Random randomCopy = random; printf("random.get...")`
- `DEFERRED(LevelgenFeature)` ×1：`postProcess`

### 读 C++ 时查清的几件事

- **`version` 是个没用的参数** —— 构造函数收了它，既不存在成员里也不读。签名照保留。
- **`waterDepths` / `fi` / `fis` 是死字段**，逐条 grep 核过，按 TASK-C 的清单记 OMIT。
- **`CHUNK_WIDTH = 4`（.h:39）是死常量**，`.cpp` 里用的全是 `LevelConstants::CHUNK_WIDTH`（16）。
  代码里标了红，防止以后有人"顺手"改。
- `getHeights` 里两处真正的整数除法是 `16 / xSize` 与 `wScale / 2`，都写了 `Math.trunc`；
  `divs.py` 报的其余 11 处左操作数都是 float，是浮点除法（`depth * ySize / 16` 容易被误判成整数除法，
  其实 `depth` 是 float，整体仍是浮点）。
- 夹具的十六进制是**内存字节序**（小端），测试里按小端拼回 uint32 才能跟 JS 的位模式比 —— 当大端读会全错。

### 工具

- `python tools/porting/divs.py` —— 11 处，逐条判过
- `python tools/porting/shadow.py` —— 干净（成员清单要写成**文件**传，不能当字符串传）

### 验证

- `pnpm typecheck` / `pnpm test`（**592 全过**，589 + 新增 3）/ `pnpm build` 全绿
- `pnpm ledger` 247 → 257（上面逐条对过）
- 没跑浏览器场景：这个类还没被任何地方实例化（`Dimension.ts:54` 仍是 throw），画面上不会有变化

### 下一步

**C-3**：`prepareHeights` + `buildSurfaces`，验收是夹具里那两份快照
（`afterPrepareHeights` / `afterBuildSurfaces`）都对上。
`prepareHeights` 的三线性插值是这一步的高风险点。

## 2026-10-03 — C-1：地形生成的黄金样本 G15-1（提交 218a39d）

`tools/golden/harness_randomlevelsource.cpp` + `fixtures/golden/randomlevelsource.json`。

把 `getChunk` 拆成四段分别记快照：高度场 / `prepareHeights` 后 / `buildSurfaces` 后 / 洞穴峡谷后。
另记一份**真 `getChunk`** 的结果做自检（`replayMatchesGetChunk`）—— 它对不上就说明那条重放
不忠实，四份快照都不能当判据。

### 两个想法被实测推翻（都比原计划好）

**① 替身 Level 整个不需要。**我原先写了一个 `tools/golden/stub/rls/world/level/Level.h`，
打算用 `-I` 排在参考源码前面顶掉它。写 build.sh 那节时回头看 `harness_collision.cpp`，
发现它用一个 `GoldenStorage : MemoryLevelStorage` 就把**真 Level** 建起来了 ——
`Level` 的构造函数自己会调 `dimension->init(this)`，`BiomeSource` 跟着就出来了。
真货在手，就没有"替身够不够忠实"那一整类风险。**替身目录已删。**

**② 区块坐标必须扫出来，不能随手挑。**这条是这一轮最重要的发现。

一开始沿用 (0,0)/(1,0)，跑出来的 `prepareHeights` 结果只有 `{0, 1}` —— 整片高地，
水面高度 64 在它下面。也就是说：**水、冰、沙、砾石、沙岩这五条分支一条都没盖上**。
拿它当判据，C-3 把 `prepareHeights` 的水那段、`buildSurfaces` 的沙/砾石/沙岩那几段
**全写错也照样通过**。

于是给 harness 加了 `--scan N`（复用同一份重放代码，所以扫的结论和夹具同源），
扫 576 个区块，按"**每个阶段都要盖全**"挑出两个特征最丰富的：

| 区块 | prepare | surface | final |
| --- | --- | --- | --- |
| `(20, 0)` 温带海岸 | `0,1,9` | `+2,3,7,12,24` | `+10` |
| `(14,19)` 寒带海岸 | `+79`（冰） | `+3,7,12,24` | `+10` |

合起来盖住全部 10 个 id。缺的只有砾石(13)和岩浆(11) —— 这轮地形本来就不产生它们。

### 查证过的技术点

- **`getHeights` 不消耗 `random`**（只调构造时建好的噪声表）→ "先单独调它取快照"不会
  打乱后面的随机流。这是四段重放能成立的前提。
- **`prepareHeights` 把 16×16×128 每个下标都写了一遍**（`offs = x<<11 | z<<7 | y`，
  `xChunks=1` 时正好铺满 0..32767）→ 缓冲区没有未初始化字节 → 夹具能逐字节复现。
- `LevelChunk::blocks` 是 protected，走公开的 `getBlockData()`；只有 `getHeights` 是 private，
  用 `#define private public` 撬开（只作用于这个编译单元）。
- `spawnMobs` 只出现在 `.cpp:507` 的 `postProcess` 里（刷怪），**不影响地形**，取 false。

### 踩的坑

**从 Git Bash 传给 `wsl bash -c '...'` 的那串命令里，`$变量` 会在到达 WSL 之前就被外层展开成空**
（`$(命令替换)` 反而没事）。表现是脚本里 `$d`、`$R`、`$TMPDIR` 全是空字符串、静默跑错 ——
前面那个"`R=` 为空、查了半天"的谜团就是这个。
**解法：要传给 WSL 的脚本写成文件，用 `bash <路径>` 执行**，别塞在命令行里。

另外 `build.sh` 里加节名要改**两处** `any_want` 列表：除了建 `$LVL` 那处，还有建
`sigill_diag.oo` 那处（`build.sh:124`）。漏了第二处会在链接时报 `cannot find sigill_diag.oo`。

### 验证

- **两次生成 sha256 完全相同**（`00375db5…aad5`）—— 夹具逐字节可复现（C-1 的验收标准）
- 两个区块的 `replayMatchesGetChunk` 都是 `true`
- `pnpm typecheck` / `pnpm test`（589 全过）/ `pnpm build` 全绿；`pnpm ledger` 247 条不变
- 浏览器场景没跑：本步只加夹具生成器，不动 TS 代码

### 下一步

**C-2**：`RandomLevelSource` 类骨架 + 构造函数 + `getHeights`，验收是高度场那串 float 对上。
构造函数要建 8 个 `PerlinNoise`（16/16/8/4/4/10/16/8 层），层数写错后面全错。

## 2026-10-03 — 更新两份工作手册里过时的三处（不涉及代码）

用户点名的三处，实际落在两份文档上（都在 `.gitignore` 里，本地手册，不入仓库）：

`docs/MCPE-TS最小Demo实施流程-修订版10.html`、`docs/MCPE-TS后续清单-S11-S13.html`

### 改之前先实测（不凭记忆）

| 量 | HTML 里写的 | 实测 | 怎么测的 |
| --- | --- | --- | --- |
| 测试 | 27 文件 / 194 测试（工作手册，「S9 之后」） | **66 文件 / 589 测试** | `pnpm test` |
| 测试 | 32 文件 / 213 测试（后续清单，S11 交付记的） | 同上 | 同上 |
| 台账 | 410 条（工作手册，「S9 之后」） | **247 条** | `pnpm ledger` |

> 我口头汇报时说过"约 516 条" —— 那是估的，实际 589。**估的数不当数用**。

### 三处（实际动了 6 处文字，因为是同一个根因）

**根因：B8g-1 把启动入口从"打开页面即进世界"换成了起始菜单**，于是所有以
"首页"为主语的句子都不成立了。

1. 工作手册「S9 包」那条：`覆盖后 pnpm dev:web 打开首页即是 demo`
   → 加了括注说明那是 S9 当时的行为。
2. 工作手册「当前数字（S9 之后）」
   → **原行一字未动**（它是历史记录），后面补一行实测量的现状。
3. 后续清单 S12/S13 的 4 处检查点/交付描述：`首页：…` → `进世界后：…`。
4. 后续清单 S13 状态段：`仍 DEFERRED：选项界面、起始菜单与"回到标题"（依赖存档）、…` 里的
   **起始菜单 /「回到标题」/ 文本框三项删掉**（任务单 B 做完了），保留仍缺的。
5. 两份文件各加一段**更正横幅 / 更正（第 3 版）**，一次性说清：
   - 入口变了；
   - **世界生成仍未做** —— 从菜单进世界那条路（开始游戏 → 选世界 → 进世界）
     走 `Minecraft::selectLevel` → `Dimension::createRandomLevelSource()`，现在**会抛**；
     只有后门 `startDemoWorld()` 能真进世界；
   - 存档整块做完了，可它在这两份文档里被列在"计划外与以后"；
   - 数字更新。
6. 工作手册目录加了一条「更正（第 3 版）」导航。

### 一个差点写错的地方（记一下）

我本来准备写"起始菜单里点 Demo 那张牌进世界"。动手前去看了代码，发现
**起始菜单根本没有 Demo 牌**：三个大按钮是 加入游戏 / 开始游戏 / 选项，右上角关闭；
`startDemoWorld()` 已经**只被场景和测试用**（`NinecraftApp.ts` 的注释就写着）。
要不是去核了一遍，这句假话就进文档了。

### 为什么这样改，而不是全部覆盖

- **检查点（"进世界后：屏幕中央有准星"）** 是给人照着做的**指令**，改掉；
- **带日期的历史数字**（"S9 之后 194 个测试"）**保留原样**，只在旁边补一行现状 ——
  直接改掉就等于篡改历史记录。

### 核验

- 替换脚本每处都断言"恰好命中一次"，10 处全过。
- 改完用 `html.parser` 查标签闭合：两份都是 未闭合 0、配对错误 0。
- 行尾：两份原本都是纯 LF，改后仍是（写入时 `newline=''`）。
- Playwright 打开两份各截图看过：横幅、「更正（第 3 版）」、「现状更新」都渲染正常，版面没坏。
- 临时脚本已删；HTML 在 `.gitignore` 里，所以这一步**没有提交可做**。

### 下一步

回到 **C-1**（`harness_randomlevelsource` + 四份快照夹具），
卡点是编译验证没走正式路径 —— 应该直接写 `build.sh` 的 `randomlevelsource` 节，用已经跑通的方式调它。

## 2026-10-03 — B9c：选项存得住（接上 OptionsFile）—— 任务单 B 收尾

### 做了什么

`Options.ts` 里那 4 处 `DEFERRED(Storage)` 换成真调用：

| 原句 | 现在 |
| --- | --- |
| `OptionsFile optionsFile;` | `private readonly optionsFile = new OptionsFile()` |
| `optionStrings = optionsFile.getOptionStrings()` | 真取 |
| `optionsFile.save(stringVec)` | 真存 |
| `optionsFile.setOptionsPath(path + "/options.txt")` | 真设 |

C++ 的 `Options::load` 用 `std::find_if` **从头找键**，这里 `Array.find` 语义相同；
找不到就 `continue`（不认识的键跳过）。

### 一个要说清楚的行为：改完选项**不会自动存**

参考 C++ 里 `Options::save` 只有四个调用点：`Minecraft::init`（经 `reloadOptions`）、
`OptionsScreen` 两处、`UsernameScreen` 一处。后三个界面都还没移植，而且
**`Minecraft::optionUpdated` 本身不存盘**（查过：它只处理服务器可见性和切换触摸屏）。

所以照着 C++ 移植的话，在暂停界面改个选项是**不会落的盘**。
场景里显式调了一次 `save()`，测的是"存下去 → 刷新 → 读回来"这条链本身。
**我没有去加 C++ 没有的自动保存** —— 那是"顺手优化"。

### 浏览器场景：拿用户名当试金石

`tools/verify/scenarios/options.mjs`：改用户名 → 存盘 → **刷新页面** → 还在。

选它有三个好处：
1. 是字符串（数字选项被 `parseInt`/`parseFloat` 一过，读错也看着差不多）；
2. **起始菜单左上角就画着 `Username: <它>`** —— 改没改一眼看得见，有截图；
3. 每次启动 `Minecraft::init` 都会 `options.load()` + `reloadOptions()`，开局就有一份文件。

截图 `02-刷新后-用户名还在.png` 上是 `Username: XiaoMing`。

### 我自己的测试写错了三处（记一下）

写完单测第一次跑红了 4 条，查下来**全是测试的错，实现没问题**：

1. 正则写窄了：`/^options\.[a-z0-9]+:/` —— 选项键是 camelCase（`options.guiScale`），
   还有带小数点的（`options.key.forward`）。
2. 辅助函数忘了建父目录：`vfs.open(path, 'w')` 在父目录不存在时返回 null（C 的 ENOENT），
   我直接 `.write()` 就炸了。
3. `new Options(null)` 不能调 `set()`：它会走 `notifyOptionUpdate` → `minecraft.optionUpdated`。
   C++ 那边这个指针也不可能是空的（构造时就是 `&app`），改成给个替身。

### 验证

```
pnpm run ci   全绿 —— 66 文件 / 589 测试（原 65 / 581）
pnpm ledger   251 → 247（−4，正是这四处 DEFERRED）
node tools/verify/smoke.mjs                                        21/21
node tools/verify/smoke.mjs tools/verify/scenarios/storage.mjs     13/13
node tools/verify/smoke.mjs tools/verify/scenarios/startmenu.mjs   38/38
node tools/verify/smoke.mjs tools/verify/scenarios/options.mjs      8/8
```

---

## 任务单 B 全部完成（B0–B9）

最后一次统计：**66 个测试文件 / 589 条测试**；台账 247 条；四个浏览器场景全绿。

### 现在能做什么

- **存档整条链通了**：新建世界（走 B8 的界面）→ 放方块 → 存 → **刷新页面** → 方块还在。
- **退回标题再进**：暂停界面 → Quit to title → 起始菜单 → 再进那个世界，方块还在。
- **界面齐了**：起始菜单 / 选世界 / 删世界 / 新建世界 / 加载中 / 暂停，都能开。
- **选项存得住**：改完（显式）存盘、刷新后还在。

### 现在**不能**做什么（一条就够）

**从菜单点进任何一个世界都会抛。** `Minecraft.selectLevel` 要建普通维度，
而 `RandomLevelSource`（地形生成）没移植，调用即抛。

这是 B8 开工时定的决策 1（"不搞平坦维度绕行，忠实留着"）+ 用户后来拍板"换入口但接受点不进去"
的直接结果。**界面是完整的，世界是进不去的** —— 缺的就是世界生成那一块。

场景里那个 `startDemoWorld()` 后门（ADAPTED(Demo)）就是为了绕开这一点才留着的，
它走的还是真存档，所以存档链本身测得很透。

## 2026-10-03 — B9b：OptionsFile 的黄金样本 G9-1

### 为什么这个样本值得做

`OptionsFile` 总共才 90 行，看着不像需要黄金样本的那种代码。但它读文件靠的是
`fgets` + `strlen` + `strchr` 这一套 C 的字符串函数，五条规则**互相咬**：

1. `fgets(lineBuff, 128, f)` **最多读 127 字节**，读满或碰 `
` 就停
   → **超过 127 字节的行会被切成几段，后面那些段自己当成一行参与后面的判断**
2. `strlen` 撞到第一个 ` ` 为止
3. 尾部连续的 `
` / `
` 全剥掉（**只剥尾部**）
4. 剥完**短于 3 字节的整行丢掉**
5. `strchr` 找**第一个** `:`；没有就跳过

这几条按"读代码推"很容易差一点。特别是第 1 条 —— 切在哪儿、切出来的下一段还满不满足第 4 条。

### 那个样本告诉我的事（有几条我猜错了）

| 用例 | 行内容 | 参考 C++ 的结果 |
| --- | --- | --- |
| `line-125` | `x`×125 + `:1
`（共 128 字节） | `['x'×125, '1']` |
| `line-126` | `x`×126 + `:1
` | `['x'×126, '']` ← 第一刀切在 `:` 后面，值是空的 |
| `line-127` | `x`×127 + `:1
` | **`[]`** ← 我原本以为会出来点东西 |
| `line-130` | `x`×130 + `:1
` | `['xxx', '1']` ← 第二段的 `xxx` 跟 `:` 拼成了键 |

`line-127` 那条是最有意思的：第一段 127 个 `x` 没冒号被丢，第二段是 `:1` 只有 **2 字节**，
又被第 4 条丢掉 —— 整行什么都不剩。**这条我自己推的时候是错的。**

### 做法：save 走真实现，read 直接喂畸形字节

- **save 那批**：走真的 `OptionsFile::save`（连 `mkdir` 那段一起），7 个用例，
  然后在 /tmp 的临时目录里把写出来的**原始字节** dump 成 hex。
- **read 那批**：**故意不走 `save`** —— 要的就是畸形内容（1/2/3 字节的短行、没冒号的、
  超长行、嵌入 ` ` 的），直接写原始字节喂给 `getOptionStrings`。22 个用例。

文件字节一律 hex 报（内容里有 ` `、`
` 这类不好放进 JSON 字符串的字节），
解析出来的字符串才用 JSON 字符串。

### 「一次就全过」不可信，所以做了反向验证

34 条一次全绿。但"我的实现和参考实现一致"这件事，如果样本本身没钉在边界上，也会全绿。
所以做了一次反向验证：**把 `127` 改成 `128`**，重跑 ——

```
× line-126  × line-127  × line-130  × line-126-no-newline
Tests  4 failed | 30 passed
```

**恰好这 4 条变红，别的一条不动。** 样本确实钉在那条线上。

### 一个已知差异，写在明面上

那一刀如果正好切在一个多字节 UTF-8 字符中间，参考实现留下的是**裸的半个字符**
（`std::string` 里就是几个非法字节）—— 这既进不了合法 JSON，也没法用 JS 字符串无损表示，
TS 侧只能给替换符。**夹具里没有这个用例**，测试里单独写了一条把它说清楚，
不假装它不存在、也不拿它当通过标准。

### 夹具可复现

跑第二遍 `build.sh optionsfile`，跟第一遍**逐字节相同**（`diff` 过）。

### 验证

```
pnpm run ci   全绿 —— 65 文件 / 581 测试（原 64 / 547）
pnpm ledger   251 不变
WSL 里 bash tools/golden/build.sh optionsfile   两遍逐字节相同
```

### 下一步

**B9c**：把 `Options.ts` 里那 4 处 `DEFERRED(Storage)` 换成真调用，再加浏览器场景验证
「选项改完刷新还在」。

## 2026-10-03 — B9a：OptionsFile 本体 + 文本模式 r/w

### 为什么 B9 拆成三小步

`OptionsFile.cpp` 本体才 90 行，看着是一步。算下来要碰 8 个文件、约 470 行（两处基础设施改动 +
本体 + 单测 + 黄金样本 + 接线 + 浏览器场景），超了「一步 300 行 / 5 个文件」的线，拆成：
B9a 本体 + 单测 / B9b 黄金样本 / B9c 接线 + 浏览器场景。

### 实测查出 B1 漏了两种文件模式

B1 定 `FsMode` 时统计的是存档那批代码，结论是"只用到 `rb`/`wb`/`r+b`/`w+b`，`ab` 一次没有"。
**但 `OptionsFile` 用的是 `fopen(path, "w")` 和 `fopen(path, "r")`** —— 文本模式，当时没人查它。
参考构建的目标是 POSIX，那里文本/二进制模式逐字节等价，所以行为上和 `wb`/`rb` 一样；
但源码写的既然是 `"w"`/`"r"`，就把这两个模式也收进 `FsMode`，省得在调用处偷偷映射。

### `fgets` 那几条规则都逐条抄了

`CFile` 只有 `read/write/seek/tell/close`，没有 `fgets` 的对应物。读行这件事靠的是
`fgets`（**最多 127 字节**、碰到 `
` 停）+ `strlen`（撞到第一个 ` ` 为止）+
剥尾部 `
`/`
` + **剥完短于 3 字节的整行丢掉** + `strchr` 找**第一个** `:` 切开。

这几条不是"差不多就行"：**超长的行会被切成好几段，后面那些段自己当成一行参与判断**，
这是 C 的真行为，不是 bug。所以 TS 里按**字节**复刻了这个循环，不是按字符。

一处等价改写：C++ 是反复 `fgets` 流式读的，TS 先把整个文件读进内存再按同样规则切。
分次读盘和最终结果无关（`CFile.read` 本来也没有"读到换行为止"的语义），注释里写明了。

### 单测（15 条）刻意**不**写有歧义的那几条

`fgets` 的 127 字节切行该怎么切，我是**读 C 推**出来的，推错了单测也会跟着错。
所以 15 条单测只钉规则明确的部分（默认路径、写出的字节、整个重写不追加、自建父目录、
UTF-8、CRLF、短行丢弃、只认第一个冒号、不裁空白……），
**127 字节切行留给 B9b 的黄金样本** —— 那边是参考 C++ 真跑出来的结果，推错了它会告诉我。

### 台账：251 不变（这次是量过的）

顺便**更正 B8g 报告里的一处错误**：那里我写「台账 254 不变」，其实 **254 → 251（−3）**。
少了的三条都在 `NinecraftApp.ts`：起始界面那条 `DEFERRED(Gui)` 变成了真调用，
另外两条 `ADAPTED(Demo)` 随那段 hack 一起删了 —— 是**应该少的**，那些语句已经不存在了。
**问题在于那句话我没测就写了。** 已经在 `task_plan.md` / `progress.md` 里改正。

### 踩的坑：那条"量台账"的命令把我没提交的改动抹了

为了量 B8f 那时的台账条数，我跑了：

```
git checkout c07e7d9 -- packages apps   # 把 B8f 的版本覆盖到工作区
pnpm ledger
git checkout HEAD -- packages apps       # 恢复
```

第二句 `git checkout HEAD -- …` 恢复的是**已提交**版本，而 B9a 的三个文件
（`CFile.ts` / `VirtualFS.ts` / `index.ts`）当时**还没提交** —— 改动就这么没了。
命令末尾那句 `git status --short` 其实已经显示出来了（只剩文档和两个未跟踪文件），
**我看漏了**，之后直接 `git add -A && git commit`，把一个编译不过的提交推了出去。
Stop 钩子的类型检查才把它拦下来（`"w" is not assignable to FsMode`）。

**教训两条**：
1. **工作区不干净时不要用 `git checkout <commit> -- <paths>`。** 想量历史版本的台账，
   用 `git stash` 先收好，或者干脆 `git show <commit>:<file>` 只读单个文件。
2. **命令跑完要读它的输出。** 那次 `git status` 的输出就是证据，扫一眼就过去了。

现在已经把那三处补回来、`pnpm run ci` 全绿，原来的提交 `aeaf0b1` 用 `--amend` 补成
完整的 6 个文件（新 hash `1ba9132`）。

### 验证

```
pnpm run ci   全绿 —— 64 文件 / 547 测试（原 63 / 532）
pnpm ledger   251（不变，量过）
divs.py / shadow.py   无问题
```

### 下一步

**B9b**：黄金样本 G9-1 —— 用参考 C++ 真跑一遍 `OptionsFile::save` / `getOptionStrings`，
把写出来的字节和读回来的键值对钉住（重点盖 127 字节切行、短行丢弃、CRLF 这几条边界）。

## 2026-10-03 — B8g：换启动入口 + 场景扩写（B8 收尾）

### 做了什么（两小步，两个提交）

**B8g-1（`fd30fd3`）换启动入口。**
`NinecraftApp.initApp` 里那段 `ADAPTED(Demo)`「有存档就进最近那个、没有就新建 demo」整段删掉，
换成 C++ 原样的 `screenChooser.setScreen(SCREEN_STARTMENU)`。`startDemoWorld()` 保留，
但降级成**场景/测试后门** —— 从菜单进世界要走 `selectLevel`，那条路会抛。

**B8g-2（`c007c9f`）场景扩写。**
`default.mjs` 补上「砌一格石头 → 暂停里 Quit to title → 再进那个世界 → 石头还在」；
`startmenu.mjs` 把进世界的**两个入口**都钉上（新建世界的 Create、世界列表上点一张牌），
两条都抛"世界生成没移植"。

### 用户选的那条路，代价说清楚

原来入口如果不动（继续直接进 demo 世界），B8g 就只能验证「退回标题」这一半。
换成起始菜单之后**界面终于完整了**，但**从菜单点进任何一个世界都会抛** ——
因为 `selectLevel` → 普通维度 → `RandomLevelSource`（没移植）。用户确认接受。

### 原计划的「新建世界 → 放方块 → …」为什么做不了

**新建世界也走 `selectLevel`**，同样抛。所以 B8g 交付的是：
用 `startDemoWorld()` 后门进世界，把**能测的那半**（退出落盘、重进恢复）在浏览器里测透；
进不去的那半等世界生成移植。

### 拆两小步的理由

原计划要碰 6 个文件（`NinecraftApp.ts`、`s9.test.ts`、`leave-game.test.ts`、三个场景），
超了「一步 5 个文件」的线。按项目规则停下来拆开：B8g-1 只做入口不动断言，B8g-2 才加新覆盖。
现在每个提交最多碰 6 个文件、每个都是 1~30 行的小改，但**分开了好定位** —— 入口一换，
`startmenu.mjs` 立刻红了 4 条，一眼就知道是"世界列表空了"，不是别的问题。

### 改了两个已有测试文件的 **setup**（断言一条没动）

`s9.test.ts` 和 `leave-game.test.ts` 的 `beforeAll` 原来靠 `initApp` 自动进世界。
入口一换它们就红了，所以补上 `app.startDemoWorld()` 和 `app.setScreen(null)`。

- `s9.test.ts` 另外补了一句 `app.releaseMouse()`：`setScreen(null)` 会顺手 `grabMouse()`，
  而那个文件里有两条测的正是「光标没锁 → 点击才锁」那条路。
- `s9.test.ts` 自己的标题就写着「init → startDemoWorld → tick → render」——
  `startDemoWorld` 本来就是它概念上的一步，只是以前被 `initApp` 顺手做了。

### `startmenu.mjs` 红了 4 条 —— 这是真发现，不是误报

它原来假定"启动时已经自动建好 demo 世界"（`worldIds.includes('demo')`、删除按钮是亮的、
翻牌有第二张可翻）。入口一换，世界列表空了，这 4 条当场红。
**没有把断言改软**：改成场景自己先「进世界 → 退回标题」把世界造出来再存下去，
4 条断言原样保留，另外还多了 3 条（退回标题后确实回到了菜单、世界确实留在存档里）。

### 反向验证（这次在浏览器里做的）

「方块还在」那条断言有可能是白测的。把 `leaveGame` 里的 `saveAll(true)` 注释掉重跑
`default.mjs`：**只有它变红，别的一条不动**。确认有效之后改回来。

### 踩的坑：反向验证会覆盖同一个输出目录

反向跑那次把 `tools/verify/out/default/05-….png` 覆盖成了"方块不见了"的版本。
我后来去读那张截图，一度以为实现有问题，还专门跑了两个诊断场景（打印玩家坐标/朝向/
`levelRenderer` 统计），查下来数据完全一致，最后才反应过来是读了旧的图。
**记住：看截图前确认它是哪一次跑出来的。**

### 验证

```
pnpm run ci   全绿 —— 63 文件 / 532 测试（B8g 两步都没增删测试）
pnpm ledger   254 → 251（−3）
              ↑ 起始界面那条 DEFERRED(Gui) 变成真调用，两条 ADAPTED(Demo) 随那段 hack 删掉
              【更正】这一行原本写的是「254 不变」，那句**没测就写了**。事后核对才发现少了 3 条。
node tools/verify/smoke.mjs                                        21/21，7 张截图
node tools/verify/smoke.mjs tools/verify/scenarios/storage.mjs     13/13
node tools/verify/smoke.mjs tools/verify/scenarios/startmenu.mjs   38/38
```

### 下一步

**B9**：`OptionsFile` —— `Options.ts` 里 4 处 `DEFERRED(Storage)`，让选项也能存下来。

## 2026-10-03 — B8f：Minecraft::leaveGame + 暂停界面「Quit to title」

### 做了什么

- `Minecraft.leaveGame(renameLevel = false)`（C++ 35 行）—— 原来这里是一行 `OMIT(Storage)`。
  顺序照抄 C++：**先 `saveAll(true)` 把没存的区块落盘，再拆引用**，反过来就丢档。
- `PauseScreen.buttonClicked`：两处 `DEFERRED(Storage)` 换成真调用（`leaveGame()` / `leaveGame(true)`）。
- `tests/unit/client/leave-game.test.ts`（新，12 条）。
- `default.mjs` 扩到 **14 条断言 / 4 张截图**：暂停界面点「Quit to title」→ 拆干净 + 退回起始菜单。

### C++ 里的三处 `delete` / 空指针，怎么处理的

| C++ | TS |
| --- | --- |
| `raknetInstance->disconnect();` | `// DEFERRED(Network)`（单机版 raknetInstance 恒为 null，照抄就是崩） |
| `particleEngine->setLevel(NULL);` | `// DEFERRED(Particle)` |
| `delete netCallback; netCallback = NULL;` | 只有赋值（GC，没有 delete） |
| `delete level->getLevelStorage(); delete level;` | `// 析构不移植（R3）` + 赋值 null |

**那个 `delete level->getLevelStorage()` 值不值得担心？** 查过了：`ExternalFileLevelStorage`
的析构（ExternalFileLevelStorage.cpp:66）只 `delete regionFile / loadedLevelData`，**不落盘**。
落盘全靠它上面那句 `saveAll(true)`。所以省掉它是安全的，不是"少存了一次"。

### 这次做了一次「反向验证」

单测里那条「退出去再进来，方块还在」有可能**是白测的** —— 万一 `startDemoWorld()` 是从内存里
拿回旧数据的呢？所以我把 `leaveGame` 里那句 `saveAll(true)` 临时注释掉重跑了一遍，
确认那条断言**当场变红**（方块变回空气）。改回来之后才留的这条测试。

（`startDemoWorld()` 走的是 `storageSource.selectLevel()` → 新建 `ServerFileLevelStorage`，
数据只能从 VFS 里读，确实是真读盘。）

### 浏览器里验证的

`default.mjs` 末尾（**只能放最后**，拆完这个 demo 世界就回不来了）：点暂停界面的「Quit to title」，
然后断言 `app.level` / `app.player` / `levelRenderer.level` 全是 null、界面变成 `TouchStartMenuScreen`、
存档文件 `level.dat` / `chunks.dat` 还在（没被顺手删）。之后**再等 1200ms 让它跑几十帧** ——
相机目标和玩家都是 null，任何空指针都会变成 `pageerror` 让场景挂掉，而这次是 0 个页面错误。
截图 `04-退回起始菜单.png` 看过：起始菜单干干净净，背后没有残留的旧世界，HUD 也没留在画面上。

### 台账

254 → **254**。拆开看是：−1 `OMIT(Storage)`、−2 `DEFERRED(Storage)`，+1 `Gui`、+1 `Network`、
+1 `Particle` —— 正好抵消。（那两条 `DEFERRED(Storage)` 是 `PauseScreen` 里原来的两行。）

### 验证

```
pnpm run ci   全绿 —— 63 文件 / 532 测试（原 62 / 520）
pnpm ledger   254（不变，上面有拆分）
node tools/verify/smoke.mjs                       14/14，4 张截图
node tools/verify/smoke.mjs tools/verify/scenarios/storage.mjs     11/11
node tools/verify/smoke.mjs tools/verify/scenarios/startmenu.mjs   32/32
```

### 下一步

**B8g**：场景扩写（新建世界 → 放方块 → 回到标题 → 重进 → 方块还在）。
⚠ 动手前要先找用户确认那个待决问题 —— 「启动入口换不换成起始菜单」和决策 1（`selectLevel` 调用即抛）
冲突，换了之后 demo 世界就进不去、`default.mjs` / `storage.mjs` 两个场景也跟着断。

## 2026-10-03 — B8e：ChooseLevelScreen + SimpleChooseLevelScreen（新建世界）

### 做了什么

- `packages/client/src/gui/screens/ChooseLevelScreen.ts`（新，C++ 26 行）：基类，只有
  「把世界列表读进来」和「名字撞了就加横线」两件事。
- `packages/client/src/gui/screens/SimpleChooseLevelScreen.ts`（新，C++ 261 行）：新建世界那一屏。
- `TouchSelectWorldScreen` 里两处 `DEFERRED(Gui)` 接上（「Create new」真的能点了）。
- `tests/unit/client/simple-choose-level-screen.test.ts`（16 条）。
- `startmenu.mjs` 扩到 **32 条断言 / 6 张截图**。

### 浏览器里验证了两件事（都不是单测能覆盖的）

1. **B8b-2 那个隐藏 `<input>` 真的管用**：点输入框之后 `document.activeElement` 变成了
   `<input>`（手机上软键盘就是靠它弹的），然后用**真键盘**敲 `XYZ`，输入框里出现了
   `New WorldXYZ` —— 整条 `DomInput → Keyboard.feedText → TextBox.charPressed` 通了。
2. **点「Create」现在必失败**：抛的正是"世界生成没移植"那一句。这条写成了断言，**将来会红**
   —— 那时候说明 `RandomLevelSource` 移植好了，把它改成"真的能进世界"。（见 B8 的决策 1）

### 改了一条 B8d-3 写下的断言（说明一下理由）

`select-world-screen.test.ts` 里原本有一条：「"Create new" **现在**不打开任何东西（新建世界界面是 B8e）」
—— 那条断言的名字和注释里就写着"现在"和"B8e"。B8e 把界面接上之后它必然红，改成断言真实行为
（打开 `SimpleChooseLevelScreen`，而且传进去的名字是去重过的 `World-`）。这不是把测试改软，
是把当时故意留的坑填上。

### 我自己写错又改回来的一处

文件头注释里我一度写下"`I18n.get("selectWorld.gameMode.survival")` 这个键不存在，会显示成
`键名<`"。**看截图时发现按钮显示的是 "Survival"，去查才是我错了** —— 之前用 `head -6` 把
lang 文件的输出截断了，那个键在第 55 行（`selectWorld.gameMode.survival=Survival`）。
注释已改正，顺带记下真正的怪癖：**初始文字是 I18n 的 "Survival"，切换之后就换成硬编码的
"Survival mode"/"Creative mode"** —— 大小写都不一样，C++ 就是这么写的。

### 又发现一个死字段

`SimpleChooseLevelScreen::levelName` —— 构造函数存下来之后**从没被读过**（和 `accRatio`、
`_height` 那些一样）。照抄并注明。

### 验证

- `pnpm run ci` 全绿：**62 文件 / 520 测试**（原 61 / 504）
- `pnpm ledger` 255 → 254（−2 条 `DEFERRED(Gui)`，+1 条 `DEFERRED(Network)`）
- `divs.py`：`ChooseLevelScreen` 无输出；`SimpleChooseLevelScreen` 的除法也都包了 `Math.trunc`；
  `shadow.py` 无输出
- 浏览器三个场景都过：`startmenu.mjs` **32/32**、`default.mjs` 5/5、`storage.mjs` 11/11，
  0 页面错误；**6 张截图逐张看过**

### 下一步

**B8f**：`Minecraft::leaveGame` + 暂停界面 "Quit to title"。

## 2026-10-03 — B8d-3：SelectWorldScreen + DeleteWorldScreen + 接线（B8d 收尾）

### 做了什么

- `TouchSelectWorldScreen.ts` 补上另外两个类（`TouchDeleteWorldScreen`、`SelectWorldScreen`）——
  C++ 那个 .cpp 的三个类现在都到位了。
- `ScreenChooser` 接上 `SCREEN_SELECTWORLD`。
- `tests/unit/client/select-world-screen.test.ts`（20 条）。
- `tools/verify/scenarios/startmenu.mjs` 扩了「点开始游戏 → 世界列表 → 翻牌」三段。

**现在起始菜单的「开始游戏」真的能点进去了**，浏览器里能看到世界列表、卡片、翻牌动画。

### 截图里抓到一个真 bug（单测抓不到的那种）

第一次截图，世界卡片上的预览图是一坨**花屏**（正好是刚画完字的字体图集）。查下来：
`gui/default_world.png` 没进 `apps/web/src/assets.ts` 的预加载表 —— `loadTexture` 返回
`InvalidId`、`bind()` 不执行，于是**沿用上一次绑定的纹理**。这正是 PITFALLS 第 25 条说的
"画错了图"，也是我在 B8 规划时列过、B8c 只补了 `title.png` 漏了它的一处。

补进预加载表，并加了一条断言（`gui/default_world.png` 真的有像素）把这类坑钉住。
**这条只有看图才能发现** —— 脚本当时是全绿的。

### 三处可见性放宽（TS 没有 friend）

C++ 用 `friend class SelectWorldScreen` 让外层屏去摸列表的 `protected` 成员。TS 没有 friend，
所以把被用到的三个放宽为 public，各写了注释说明是为什么：
`getNumberOfItems()`、`selectItem()`（B8d-2 里我写窄了，这步改回来）、`stepLeft/stepRight`。

### 照抄下来的几处

- **`_mouseHasBeenUp` 在 C++ 里没初始化**（构造函数没有它，只有 `init()` 里赋值）→ 给 false。
- **`bWorldView.selected` 恒为 false** —— 它靠 `Screen::updateTabButtonSelection` 设，而那个函数
  整个在 `#ifdef TABBING` 里，网页版构建没开（TS 那边就是空实现）。所以 `keyPressed` 里
  那段左右键翻牌永远走不到。照抄分支，没简化。
- **`static char ILLEGAL_FILE_CHARACTERS[]` 声明了没人用** —— 唯一的使用点在一个 `#if 0` 块里。
  值照抄（15 个字符 + 隐式终止符，共 16 个）。
- **`render` 第一次用 (0,0) 而不是真实指针位置** —— 免得一进界面鼠标还按着就被当成拖动。

### 测试踩的坑

`tick` 那条用例第一次红了，因为**不能直接改 `selectedItem` 来测**：`tick()` 第一件事就是
`worldsList.tick()`，而那个会按滚动位置把 `selectedItem` **重新算一遍**，从外面硬设的值
当场被覆盖。改成用 `xo`（滚动偏移）摆位置：`xo = -367` 让第 0 张居中、`-247` 让第 1 张居中。

### 验证

- `pnpm run ci` 全绿：**61 文件 / 504 测试**（原 60 / 484）
- `pnpm ledger` 250 → 255（+2 `DEFERRED(Gui)`、+3 `DEFERRED(Network)`）
- 浏览器三个场景都过：`startmenu.mjs` **22/22**、`default.mjs` 5/5、`storage.mjs` 11/11，
  0 页面错误；**4 张截图逐张看过**（含上面那个花屏的修复前后对比）
- `divs.py` / `shadow.py`：见下

### 下一步

**B8e**：`ChooseLevelScreen` + `SimpleChooseLevelScreen` —— 「Create new」那张牌才能点。

## 2026-10-03 — B8d-2：Touch::WorldSelectionList

### 做了什么

- `packages/client/src/gui/screens/TouchSelectWorldScreen.ts`（新，本步只放了这个文件里的
  **第一个类** —— C++ 的那个 .cpp 装了三个类，后两个在 B8d-3 补，文件结构照 C++ 保留在一起）。
- `tests/unit/client/touch-world-selection-list.test.ts`（19 条）。

横向"翻牌"的世界列表：每张牌是一个世界（预览图 + 四行字：名字 / 上次游玩 / 目录名 / 游戏模式），
左右滑、松手有惯性并自动对齐；**最后多一张牌是 "Create new"**（`getNumberOfItems()` 返回
`levels.size() + 1` 为它留的）。

### 四个死东西（照抄并在注释里写明）

| 东西 | 情况 |
| --- | --- |
| `_height` | 只在构造函数里被赋过一次值，**从没被读过** |
| `stoppedTick` | 同上 |
| `accRatio` | 头文件里声明了，**.cpp 里一次都没出现过** |
| `commit()` 里的预览图分支 | 拿一个初值就是 `InvalidId` 的局部变量去判 `if (id != InvalidId)` —— 那个能把 id 设成有效值的调用**压根没写**，所以永远走 else，永远用 `gui/default_world.png` |

`accRatio` 这种（连赋值都没有）很容易被当成"我抄漏了"，所以三个都留着并注明。

### 另外两处照抄

- **`selectedItem` 在 C++ 里没有初值** —— 构造函数没初始化它，只有 `commit()` 里
  "有 >= 1 个世界"时才被设成 0。一个世界都没有时它是未初始化的值（PITFALLS 第 20 条：
  不复刻未定义行为，这里给 0）。
- **`renderItem` 里那句 `t.color(0.3f, 1.0f, 0.2f)` 是废的** —— 它写在 `t.begin()` **之前**，
  颜色马上被下面 `t.color(textColor)` 覆盖掉。照抄。

### 一个测试自己的坑

`selectStart` / `selectCancel` 那条用例第一次红了。不是实现的毛病：**置位和清零是两件事**
—— `selectStart` 只管置 true，清 true 是 `selectCancel` 的活，我中间漏了一次 `cancel()`，
上一次的 true 就留着。补上就好，注释也写明了。

### divs.py 抓到一处

`if (diff < -itemWidth/2)` 我一开始写成 `-this.itemWidth / 2`（浮点除法）。C++ 是
**一元负号先结合、再做整数除法**，所以改成 `Math.trunc(-this.itemWidth / 2)`。
itemWidth 恒为 120、两种写法结果一样，但不想留这个隐患。

### 验证

- `pnpm run ci` 全绿：**60 文件 / 484 测试**（原 59 / 465）
- `pnpm ledger` 250 → 250（本步不产生 DEFERRED/OMIT）
- `divs.py` 的 8 处除法逐条核对；`shadow.py` 无输出
- 没跑浏览器场景：入口还没接线（B8d-3 才把屏和菜单接起来）。

### 下一步

**B8d-3**：`Touch::SelectWorldScreen` + `Touch::DeleteWorldScreen` + `ScreenChooser` 接线 ——
做完「开始游戏」才真的能点进这个界面。

## 2026-10-03 — B8d-1：ProgressScreen

### 又拆了一刀

B8d 原写成"`ProgressScreen` + `Touch::SelectWorldScreen`"，但 `TouchSelectWorldScreen.cpp`
一个文件里装了**三个类**、605 行，加上 `ProgressScreen` 的 99 行合起来 ~700 —— 又超线。
按类拆成三小步：**B8d-1** `ProgressScreen`（本步）/ **B8d-2** `Touch::WorldSelectionList`
（翻牌列表本体）/ **B8d-3** `Touch::SelectWorldScreen` + `Touch::DeleteWorldScreen` + 接线。

### 做了什么

- `packages/client/src/gui/screens/ProgressScreen.ts`（新，C++ 99 行）：「正在生成世界」的加载屏。
- `tests/unit/client/progress-screen.test.ts`（7 条）。

### 两个值得点名的行为

1. **`render()` 里会自己 `setScreen(null)`** —— 世界一生成好就把自己关掉。写在 render 开头，
   不是笔误，原样抄了，并且有用例钉住（"生成好时一个字都不画、直接关屏"）。
2. **`keyPressed` 是故意留空的重写** —— C++ 写的是 `virtual void keyPressed(int eventKey) {}`，
   专门盖掉基类，免得在加载屏上按 ESC 把屏关掉。TS 里这种"空实现"很容易被当成漏写删掉，
   注释写明了，也有用例。

### 两处平台差异

- **`OMIT(Web): sleepMs(50);`** —— C++ 在 `render()` 末尾**阻塞主线程** 50ms，给加载屏减速
  （PITFALLS 第 26 条：浏览器不能阻塞）。去掉，写明来由。台账 +1 条 `OMIT(Web)`。
- **`DEFERRED(Gui)`**：`tick()` 里 10 秒后跳的那个 `DisconnectionScreen` 没移植。

### 验证

- `pnpm run ci` 全绿：**59 文件 / 465 测试**（原 58 / 458）
- `pnpm ledger` 248 → 250（+1 `OMIT(Web)`、+1 `DEFERRED(Gui)`）
- `divs.py`：3 处除法都是 `/ 32`（浮点，纹理坐标）；`shadow.py` 无输出
- 没跑浏览器场景：这一屏的入口（选世界 / 新建世界）都还没接线，暂时**没有画面能走到它**。
  B8d-3 接上之后在浏览器里看。

### 下一步

**B8d-2**：`Touch::WorldSelectionList`（横向翻牌列表本体）。

## 2026-10-03 — B8c：起始菜单（第一次在浏览器里看得见）

### 做了什么

- `packages/client/src/gui/screens/TouchStartMenuScreen.ts`（新，C++ 230 行）。
- `ScreenChooser` 接上 `SCREEN_STARTMENU` 分支。
- `apps/web/src/assets.ts`：补 `gui/title.png`、`gui/logo/github.png` 进预加载表。
- `apps/web/src/AppPlatform_web.ts`：`openURL` → `window.open`（对照 glfw 里的 `__EMSCRIPTEN__` 分支）。
- `tests/unit/client/touch-start-menu-screen.test.ts`（12 条）、`tools/verify/scenarios/startmenu.mjs`（13 条断言 + 2 张截图）。

### 菜单真的出来了

三块 75×75 的图标按钮、右上角的关闭按钮、MINECRAFT POCKET EDITION 标题图、版本号、
用户名、右下角的 github 图标加仓库地址、版权 —— 全都在，位置与公式对得上。截图逐张看过。

**验证办法**：`screenChooser.setScreen(SCREEN_STARTMENU)` 把菜单摆出来（因为按定下的决策，
启动入口不动，而且现在从菜单进世界会撞上 `selectLevel` 抛异常）。

### 三处照抄下来的东西

1. **`constructor` 里那段"用完就把 `defSrc.y += defSrc.h`"** —— 拿 `getSrc()` 返回的**引用**原地改，
   依次给三个按钮取竖排的第 1/2/3 块（y = 26 / 101 / 176）。`setImageDef` 内部是**拷贝**，
   所以先后顺序不能动。用例把三个 y 都钉住了。
2. **`copyright = "\xffMojang AB"`** —— 字符串首字节就是一个裸 `0xFF`。`Font` 那边 `& 0xff`
   取码位，画出来是个字形。
3. **`handleBackEvent` 不看 `isDown`** —— 收到就直接 `quit()`，按下抬起都一样。

三处 `DEFERRED`：「加入游戏」（`locateMultiplayer` + `SCREEN_JOINGAME` 都是联机）、
「选项」（`OptionsScreen` 没移植）。按钮照画，点了没反应。台账 245 → 248。

### 我写错了两次断言（实现都是对的）

都是窄屏布局那条，两次都在**用整数去算浮点**：

- 第一次把按钮数组当成视觉顺序（其实是 push 顺序 host, join, options）。
- 第二次按 `trunc(2 * trunc(spacing))` 算，实际 C++ 是 `(int)(2 * spacing)` ——
  **spacing 是浮点，只在对齐时截断一次**。屏宽 240 时 spacing = 3.75，所以是 3 / 82 / 161，
  不是 3 / 81 / 159。

顺带纠正一个我看走眼的印象：竖屏那张截图里左右两个按钮**并没有被切出画外**，
只是几乎顶满宽度（右边缘 236，屏宽 240）。

### 一个与 B8c 无关的既有脆弱点（单独提交 `7969503`）

`pnpm test` 会报 `s9.test.ts > Hook timed out in 10000ms`。查下来**不是本步引入的**：
把本轮改动全部 stash、在干净工作区跑同一套测试，**同样超时**。根因是 s9 的 beforeAll
要走完 `NinecraftApp` 的完整启动，单跑就 10 秒出头，正好卡在默认 hookTimeout 上，并行时被抢 CPU 就超。
把 hookTimeout 放到 30 秒即可（60 秒验证过整套 58 文件 / 458 测试全绿）。**没改任何断言。**

### 验证

- `pnpm run ci` 全绿：**58 文件 / 458 测试**（原 57 / 446）
- `pnpm ledger` 245 → 248（+2 `DEFERRED(Gui)`、+1 `DEFERRED(Network)`）
- `divs.py` / `shadow.py`：见下（本步新文件都过了）
- 浏览器三个场景都过：`startmenu.mjs` 13/13、`default.mjs` 5/5、`storage.mjs` 11/11，0 页面错误；
  **截图逐张看过**
- 截图里能看到 demo 世界在菜单背后 —— 因为我们是**强行把菜单压在跑着的世界上面**的。
  真入口切成菜单之后（B8g）没有世界，`renderBackground` 会走 dirt 背景那一支。

### 下一步

**B8d**：`ProgressScreen` + `Touch::SelectWorldScreen`（含横向翻牌列表、删除确认）——
做完「开始游戏」才真的能点。

## 2026-10-03 — B8b-2：TextBox + 隐藏 input（B8b 收尾）

### 做了什么

- `packages/client/src/gui/components/TextBox.ts`（新，C++ 102 行）：单行输入框。
- `apps/web/src/AppPlatform_web.ts`：`showKeyboard` / `hideKeyboard` 接上离屏的隐藏 `<input>`（`ADAPTED(Web)`）。
- `tests/unit/client/text-box.test.ts`（新，13 条）。

**文本框本身不碰 DOM** —— `setFocus` 里那句 `platform()->showKeyboard()` 由 `AppPlatform_web` 接住，
结构和 C++ 一致（C++ 那边是 `AppPlatform_android` 操作 IME）。

### 隐藏 input 为什么这么做

- **要离屏，不能 `display:none`**：多数手机浏览器不给 `display:none` / `visibility:hidden` 的元素弹软键盘。
- **不能设 readonly**：iOS 对 readonly 的输入框同样不弹。
- **value 要清掉**：它只是"键盘吸铁石"。按键由 `DomInput` 在 `window` 上收（事件从聚焦的 input 冒泡上去），
  input 自己会顺手把字符攒进 value，没用，一有输入就清空。
- **桌面浏览器上它基本空转** —— 那边本来就能直接打字（`DomInput` 对任何可打印按键都喂文本，不看焦点在谁身上）。

### 一个 C++ 语义的实测收获

测试里我先断言"`'中'` 会被挡掉"，红了。查下来**实现是对的、我的预期错了**：

C++ 的形参是 `char`，超过一个字节的码位在 gcc 上只保留**低 8 位**。

| 输入 | 码位 | 低 8 位 | 结果 |
| --- | --- | --- | --- |
| `'ÿ'` | 255 | 0xFF → 有符号 char 是 −1 | 被 `c >= 32` 挡掉 |
| `'中'` | 20013 (0x4E2D) | 0x2D = 45 = `'-'` | **是合法可打印字符，收下** |

`(x << 24) >> 24` 正是 `(char)` 强转（先丢高位、再按有符号解释）。测试改成钉住这个行为并写清来由。

### 原样保留的两处

1. **`render` 里那两个三元两边一模一样** —— C++ 写的是 `focused ? 0xffa0a0a0 : 0xffa0a0a0`（边框同理），
   大概是改到一半留下的。看着像少了"聚焦高亮"，但照抄，别"修"。
2. **光标是临时塞进 `text` 里的一个下划线**：`text += '_'` 画完再 `slice(0,-1)` 删掉。
   有一条用例确认画完文本能还原。

R10：C++ 三个构造函数是 `(id,msg)` / `(id,x,y,msg)` / `(id,x,y,w,h,msg)`，与基类 `Button` 的
`(id,msg,x,y,w,h)` 顺序不同。这里统一成 Button 的惯例，调用方注意。

### 验证

- `pnpm run ci` 全绿：**57 文件 / 446 测试**（原 56 / 433）
- `pnpm ledger` 245 → 245（本步不产生 DEFERRED/OMIT）
- `divs.py` / `shadow.py` 对 `TextBox` 都无输出
- 浏览器：`default.mjs` 5/5、`storage.mjs` 11/11 全过，0 页面错误；**打开截图看过**（画面正常）。
  本步 `AppPlatform_web` 在应用路径上，所以两边都重跑了；但 `showKeyboard` 现在还没有调用方，
  行为上等同于没改。

### 下一步

**B8c**：`Touch::StartMenuScreen` + 接线 —— **这一步起浏览器里能看见菜单**，会开截图验证。

## 2026-10-03 — B8b-1：LargeImageButton + ConfirmScreen

### 又拆了一刀

B8b 原计划是 `LargeImageButton` + `TextBox` + `ConfirmScreen` 三个。算下来
`TextBox` 加上网页版的输入接线（隐藏 `<input>`）和它自己的测试约 270 行，和另外两个合起来 ~400，
超了「约 300 行」的线 —— 按 B5 的先例拆成 **B8b-1**（本步）和 **B8b-2**（TextBox + 隐藏 input）。

### 做了什么

- `packages/client/src/gui/components/LargeImageButton.ts`（新）：起始菜单那三个 72×72 的大图标按钮。
- `packages/client/src/gui/screens/ConfirmScreen.ts`（新）：确定/取消对话框。
- `tests/unit/client/large-image-button.test.ts`（6 条）、`tests/unit/client/confirm-screen.test.ts`（7 条）。

### 与基类 ImageButton 的真实差别（先读了基类才敢下笔）

TS 的 `ImageButton.render` 里已经有 `scaleWhenPressed`，乍看像把 LargeImageButton 的行为混进去了。
对照 C++ 才发现**不是**：两者确实只差三处 ——

| | `ImageButton` | `LargeImageButton` |
| --- | --- | --- |
| 悬停缩放 | 一步乘 0.95 | 每帧走 0.025 逼近 0.95 / 1.00 |
| 取哪半张图 | 可覆盖的 `isSecondImage(hovered)`（`OptionButton` 靠它） | 固定按 `hovered` |
| 文字 y | 16 / 17 / 16 | 一律 11 |

### 原样保留的三处

1. **更新缩放那几行在 `if (isTextureIdValid(texId))` 里面** —— 没有有效贴图的按钮压根不跑缩放那段。
   看着像漏写的花括号，但反正它也什么都不画，没影响。有一条用例钉住。
2. **`ConfirmScreen::init()` 里是 `if (true) { Touch::TButton } else { Button }`** —— else 分支的
   `Button` 永远造不出来。只保留真分支。
3. **`ConfirmScreen::postResult` 会解引用 `parent`，而 `parent` 允许是 NULL** ——
   `Touch::DeleteWorldScreen` 传的就是 NULL（它覆盖了 postResult 所以走不到）。

### 构造函数的虚函数两次调用

`setupDefault()` 在 C++ 里是虚函数：`ImageButton` 的构造函数调一次（那时对象还是 ImageButton，
走基类版本，设 48×48 + `scaleWhenPressed=true`），`LargeImageButton` 的构造函数再调一次
（这时才走派生版本，设 72×72）。TS 在构造函数里就会派发到派生版本，所以第一次进去的就是派生版本
—— 结果一样（尺寸设两遍），但过程不同。文件头写明了，免得以后被当成笔误。

### R10：ConfirmScreen 的两个构造函数参数顺序不同

C++ 是 `(parent, t1, t2, id)` 和 `(parent, t1, t2, yes, no, id)` —— 第 4 个参数含义不一样
（id 还是按钮文字）。TS 只能留一个入口，把 `id` 提到第 4 位（对上短的那个），两个按钮文字用默认
参数接在后面。**调用方的参数顺序与 C++ 不同**，文件头标注了。

### 一个测试自己的坑

`LargeImageButton` 的缩放测试一开始全红（缩放恒为 1）。原因不在实现：`render` 里是
`_imageDef.name.length > 0 ? loadAndBindTexture(...) : InvalidId`，而我造的按钮没给 `ImageDef` 起名字，
`name` 是空串，于是整块贴图逻辑（包括缩放更新）都没进。补一个带名字的 `ImageDef` 就好了。

### 验证

- `pnpm run ci` 全绿：**56 文件 / 433 测试**（原 54 / 419）
- `pnpm ledger` 245 → 245（本步不产生 DEFERRED/OMIT）
- `divs.py`：`ConfirmScreen` 无输出；`LargeImageButton` 的 4 处除法都是 UV 计算，C++ 原文有 `(float)` 强转
- `shadow.py`：两个文件都无输出
- **画面上仍然看不到东西** —— 两个新类还没被任何屏引用（`pnpm build` 的模块数还是 302，
  没变），所以没有截图可看。真正的截图从 B8c 起始菜单开始。

### 下一步

**B8b-2**：`TextBox` + `AppPlatform_web` 的隐藏 `<input>`（`ADAPTED(Web)`）。

## 2026-10-03 — B8a：RolledSelectionListH（选世界界面那个横向翻牌列表）

### 开工前改了拆分（用户确认）

原任务单写"B8 = 起始菜单 + 选世界 + 新建世界"。实测一读 `ScreenChooser.cpp`，这一步不是两个屏，
是 **2000+ 行 C++、10 个新文件**的整条界面链 —— 远超「一步 300 行 / 5 个文件」的线，拆成七小步。
三条决策定了：**不搞平坦维度绕行**（`selectLevel` 忠实留着，调用即抛）、**文本框挂隐藏 `<input>` 真能打字**、
**启动入口 B8 期间不动**。

### 又剔掉一个文件

`components/ScrolledSelectionList` 看着像列表基类，其实 `RolledSelectionListH` **不继承它**
——它直接继承 `GuiComponent`，把纵向那套字段抄成了横向。全仓库只有 `JoinGameScreen`（联机，
`OMIT(Network)`）真正继承它；两个 `StartMenuScreen` 里的 `#include` 是没人用的残留。
所以 B8 一个屏都不需要它，从拆分里删掉了。

### 做了什么

- `packages/client/src/gui/TweenData.ts`（新）：6 行数据类，选世界界面的补间动画参数。
- `packages/client/src/gui/components/RolledSelectionListH.ts`（新，C++ 299 行）。
- `tests/unit/client/rolled-selection-list-h.test.ts`（新，17 条）。

**居然能直接单测 `render()`** —— 拖拽、点选这套状态机全藏在 `render()` 里，本来以为只能等浏览器。
借 S6/S7 那套无头 GL（`glSetContext(new GLES1(null))` 之后所有 gl 调用空转、Tesselator 照样攒顶点），
加上 `Mouse.feed(...)` 注入按键状态，就能在这儿把整台状态机跑一遍。

### 原样保留的两个怪癖

1. **第一次点击会被吃掉。** `dragState` 初值是 `DRAG_OUTSIDE(-2)`，第一次按下两个分支都不进
   （`== NO_DRAG` 不成立、`>= 0` 也不成立），只把状态推成 `DRAG_NORMAL`；抬起时才落到 `NO_DRAG`。
   于是**第一次点击只会"武装"这个列表**，第二次快点才算选中。单独立了一条用例钉住。
2. **`setRenderHeader(bool, int)` 的参数叫 headerHeight，赋给的却是 `headerWidth`** ——
   横向版把它当"横向留白"用；关掉时还要归零。只能从 `getMaxPosition()` 间接观察（字段是 private），
   测试就是这么测的。

还有两处照抄的小事：`render()` 里那对**套了两层的 `if (dragState >= 0)`**；选中框分支里
**用局部变量遮蔽了同名的成员 `y0`/`y1`**（TS 里改写成 `sy0`/`sy1`，注释写明）。

### 一个类型系统的小坑

`render()` 一开始写了 `override`，类型检查报 TS4113。查参考源码：**C++ 的 `GuiComponent` 里根本没有
`render`**，所以 `RolledSelectionListH::render` 不是重写，是新开的虚函数（`ScrollingPane` 同理，
它也没写 `override`）。去掉即可。

### 验证

- `pnpm run ci` 全绿：**54 文件 / 419 测试**（原 53 / 402）
- `pnpm ledger` 245 → 245（本步不产生 DEFERRED/OMIT）
- `divs.py` 列出 7 处除法，逐条核对都是浮点除法（`(float)(itemWidth-width)/2`、`height/2.0f`、`/32`）；
  整数除法那几处都已经包在 `Math.trunc` 里
- `shadow.py` 无输出
- `node tools/verify/smoke.mjs` 默认场景 5/5 过、0 页面错误。
  **注意：本步画面上看不到任何东西** —— 新类还没被任何屏引用，浏览器渲染路径一个字没动，
  所以没有看截图的必要（真正的截图验证从 B8c 起始菜单开始）。

### 下一步

**B8b**：`LargeImageButton` + `TextBox`（挂隐藏 input）+ `ConfirmScreen` 三个小零件。

## 2026-10-03 — B7：接进 Minecraft（存档真的跑起来了）

**这一轮的目标达到了：真浏览器里放方块 → 存档 → 刷新页面 → 方块还在。**

### 做了什么

- **`packages/world/src/server/ServerLevel.ts`（新）**：C++ 的 97 行，比 Level 多做一件"管睡觉"的事
  —— 判断是不是所有人都睡了，是的话跳过夜晚、叫醒大家、血补满。三个函数里的
  `raknetInstance->send(...)` 标 `DEFERRED(Network)`（TS 的 `Level.raknetInstance` 是 `unknown`），
  其余逻辑完整。11 条单测。
- **`Minecraft.selectLevel` / `getLevelSource` / `setScreen` 里的 `level.saveGame()`** 三处接上
  （前两个原来是 `OMIT(Storage)`，第三个是 `DEFERRED(Storage)`）。
- **`NinecraftApp`** 换成 `ExternalFileLevelStorageSource(externalStoragePath, externalCacheStoragePath)`
  （网页版两者都是空串，正好拼出 `/games/com.mojang/minecraftWorlds`）；
  **有存档就进最近的那个、没有才新建 demo**（用 `levelSummaryLess` 排序，它是倒序）。
- 浏览器场景 `tools/verify/scenarios/storage.mjs`。

### 三条实测发现（都不是"顺手改"）

**① `Minecraft.selectLevel` 现在调不通。** 它不传维度（C++ 也没传），于是 `Level._init` 走
`DimensionFactory.createDefaultDimension` 拿到普通维度；而普通维度的 `createRandomLevelSource()`
在 TS 里还是 `DEFERRED(Levelgen)` —— **`RandomLevelSource`（地形生成）没移植，被调用时直接抛**。
处理：

- `selectLevel` 忠实移植、原样留着（等世界生成移植好就能用），注释里把这件事写在最显眼处；
- **demo 入口绕开它**：`NinecraftApp.startLevel` 直接构造 `ServerLevel` 并指定 `FlatDimension`
  （demo 本来就是平坦世界），除多传一个维度外与 `selectLevel` 逐行相同。

**这意味着 B8 的世界选择界面对非平坦世界还走不通** —— 要等世界生成。已写进任务单。

**② `main.ts` 从来没调过 `setVfs()`。** B1b 只把 VirtualFS 挂到了 `window.__vfs`（给 smoke 场景用），
模块级注入点一直没装。B7 之前应用路径上没有任何代码走 `getVfs()`，所以一直没暴露 ——
一接上真存档，页面直接起不来（"还没有注入 VirtualFS"）。已补，并写明为什么放在 `try` 外面。

**③ `ServerLevel.updateSleepingPlayerList` 会把所有人的睡眠计时清零。** 它判定"全睡了"之后给每个人
调 `setAllPlayersSleeping()`，而 C++ 那个函数头一句就是 `sleepCounter = 0`。于是"刚全睡的那一瞬间"
`allPlayersSleeping()` 还是 false，得再睡满一整轮（`SLEEP_DURATION` 拍）才跳夜。
写测试时被这条绊了一下（以为是自己的 bug），单独立了一条用例钉住。

### 浏览器实测

`tools/verify/scenarios/storage.mjs`：11 条断言全过，0 页面错误。
**刷新前后两张截图逐像素相同** —— 那堵石墙活过了页面重载。

脚本通过不等于画面对，所以截图逐张看过了：第一版把镜头瞬移到墙边，结果玩家在坠落途中、地面
全出画；改成不动玩家、只把 `yRot` 钉成 0（这样刷新后能用同一条公式重算墙的位置），画面就对了。

顺带踩到一个 `smoke.mjs` 的用法：`h.state` 的 fn 会被 `toString()` 之后在页面里**重新求值**，
闭包全丢 —— 引用任何 Node 侧变量都是 `ReferenceError`。场景里凡是进页面的数字一律写死。

默认场景 `default.mjs` 也重跑过，没坏。

### 测试结果

- `pnpm run ci` 全绿：53 文件 / **402 测试**（原 391 + ServerLevel 11）
- `pnpm ledger` 246 → **245**（−4 条 Storage、+2 条 `DEFERRED(Network)`、+1 条 `ADAPTED(Demo)`）
- 没改夹具

### 下一步

B8：起始菜单 / 选择世界 / 新建世界 + 暂停界面的 "Quit to title"（`Minecraft.leaveGame` 在 B7 时
挪到了这一步，因为它的头尾是网络和界面，唯一调用方就是它）。**等用户确认后再开始。**

## 2026-10-03 — B6：ExternalFileLevelStorageSource

存档任务单的第三大步。做完之后"世界列表 / 新建 / 删除 / 改名"这一层齐了。

### 做了什么

- **`LevelStorageSource.ts`（新）**：抽象基类 + `LevelSummary` 结构 + `TempLevelId`
  （`"_LastJoinedServer"`）。顺带把 `levelSummaryLess` 移进来 —— 那是 C++ 的
  `bool LevelSummary::operator<`，比较的却是 `lastPlayed >`，**是个倒序**。
- **`ExternalFileLevelStorageSource.ts`（新）**：构造函数建三级目录树、`getLevelList`、
  `selectLevel`、`deleteLevel`、`renameLevel`，以及几个恒定的实现。
- 没动 `FolderMethods` —— 见下。

### 开工前的发现：B1 已经铺好路

`VirtualFS.deleteDirectory` 在 **B1 就按 C++ `platform/file.h` 的语义造好了**，注释里还点名了
`ExternalFileLevelStorageSource::deleteLevel`：它**不是真递归**（把目录里每一项交给 `remove`，
而 `remove` 删不掉非空子目录）。所以这一步一行都没改 B1 的代码，直接用。

### 三处原样保留的怪癖（都写了测试钉住）

1. **`renameLevel` 里那个 `if` 是个空块。** 原文是
   ```cpp
   bool couldRename = false;
   if (hasTempDirectory() && isTempFile) {
   }
     couldRename = couldRename || rename(_renFULLPATH(old), _renFULLPATH(new)) == 0;
   ```
   花括号里什么都没有 —— 改名在**外面**、无条件执行。而 `_renFULLPATH` 这个宏
   `#define _renFULLPATH(s) ((basePath + "/" + s).c_str())` **只拼 basePath**，根本不看
   tmpBasePath。所以临时世界的改名也发生在 basePath 里，`isTempFile` 除了喂这个空条件没人用。
   又一处"缩进骗人"。
2. **`readLevelData` 读坏了也算成功**（B4c 记过），于是"目录在、level.dat 是坏的"照样会往
   世界列表里塞一条**字段全默认**（名字空）的摘要 —— 列表里可能出现空白条目。
3. **`deleteLevel` 的兜底分支不是死代码。** 世界目录里只要有 `region/` 这种带文件的子目录，
   整目录删就失败，转到"逐个删 chunks.dat / player.dat / level.dat"—— 而那三个 remove
   **不会碰子目录**，留下一个残缺目录。

### 两处 ADAPTED(Web) 偏离（台账 244 → 246）

1. `getLevelList` 失败时 C++ 打 `_errno()`；VirtualFS 用返回值表示成败、没有错误码可取
   （B5a-1 已标 `OMIT(Web)`）。
2. C++ 的 `readdir` 会把 `.` 和 `..` 也交给循环（它们同样是 `DT_DIR`），由**操作系统**把
   `<basePath>/./level.dat` 解析回 `<basePath>/level.dat`。VirtualFS 的路径规范化明确不解析
   `.` / `..`，那两次探测在这里必然打不开、什么也不会加 —— **结果一样，机制不同**，所以不试。

### 测试里又踩了一次同一个坑

测试助手 `makeWorld` 忘了设 `storageVersion`（默认 0，而 `readLevelData` 只认 `==1` 与 `>=2`，
版本 0 静默什么都不读），症状是"世界列表里名字是空的"。**B5a-2 记过这条，这次又中招** ——
已经写进测试助手的注释里了。

### 测试结果

- `pnpm run ci` 全绿：52 文件 / **391 测试**（原 371 + 新增 20）
- `pnpm ledger` 244 → **246**（两处 ADAPTED(Web)）
- `divs.py` / `shadow.py` 均无输出
- 改夹具：**没有**（这一步的产物不是字节格式；字节那层已由 G14-2 / G14-4 逐字节盖住）

### 下一步

B7：接进 Minecraft（`selectLevel` / `leaveGame` / `getLevelSource`；`NinecraftApp` 换成
`ExternalFileLevelStorageSource`）。**等用户确认后再开始。**

## 2026-10-03 — B5c-2：EntityFactory + loadEntities

**B5 到此全部完成。** `ExternalFileLevelStorage` 在 C++ 里的成员函数已经一个不落。

### 做了什么

- **`packages/world/src/entity/EntityFactory.ts`（新）**：`CreateEntity` + `loadEntity`。
  **只有掉落物是真移植**：TS 里 `FallingTile` / `TripodCamera` 只是 FORWARD-DECL（空接口），
  `PrimedTnt` / `Arrow` / `ThrownEgg` / `Snowball` / `Painting` 连文件都没有。六个 case 原地留
  `DEFERRED(Entity)`；`id < 64`（生物）整条走不了，`MobFactory::CreateMob` 标 `OMIT(Entity)`。
  台账 236 → **244**。
- **`loadEntities`**：头 12 字节 → `numBytes <= left` 那道闸 → NBT → 实体走 `level.addEntity`，
  方块实体走 `getChunkAt` + `hasTileEntityAt` + `addTileEntity`。
- 夹具 G14-6 补上 `roundTrip`：`firstLoad`（正常进）/ `secondLoad`（方块实体位置已占 → 丢掉）/
  `truncated`（numBytes 比剩下的多 → 什么都不读）。

### 原样保留的两条

1. **`loadEntities` 不检查 `NbtIo::read` 的返回值**，而**同一个文件里的 `readLevelData` 和
   `loadPlayer` 都写了 `if (tag)`** —— 参考源码自己的不一致。留着（写成 `tag!`）：标签读不出来时
   C++ 段错误、TS 抛 TypeError。
2. **`getChunkAt` 从不会返回 NULL**（ChunkCache 会当场把区块生成出来），所以 "Couldn't find chunk"
   那条错误分支是死代码。

### harness 里踩的两个坑（都不是实现问题）

1. **`harness_chunk` 那个两参 `LevelChunk(Level*, x, z)` 不分配方块数组**，任何 `getTile` 都是
   空指针取值 —— 第一次跑就段错误。harness_chunk 没暴露，是因为它从没读过区块里的方块；
   这里 `loadEntities` 会走 `addTileEntity → setTileEntity → SignTileEntity::setLevelAndPos →
   Level::getTile`。
   **定位办法**（`tools/golden` 的容器里没装 gdb）：把 harness 单独用 `-fsanitize=address -g` 重编，
   跟 `$LVL/*.o` 和 `ent.stubs.oo` 一起链接 —— ASan 直接给出带函数名的回溯。
2. **方块实体不能靠 `chunk->setTile` 摆**：`setTile` 末尾会调 `Tile::tiles[t]->onPlace(...)`，
   而 `SignTile::onPlace` 正是创建方块实体挂上去的地方 —— 走它的话 `loadEntities` 跑到时那个坐标
   已经有方块实体了，"Adding TileEntity" 那条正常分支永远走不到（实测两次都走 "Already have"）。
   改成往方块数组里直接写值绕开 onPlace —— 这也正是"区块刚从磁盘读出来"的样子。

### 测试里踩的一个坑（也不是实现问题）

"非法物品"那几条用例第一版是**假绿**的：先 `save` 再把 `Item` 子标签换掉 —— 换不动，因为
**`CompoundTag.put` 不覆盖已有的键**（`insertNew` 开头 `if (this.tags.has(name)) return;`，
复刻 C++ `std::map::insert` 的语义）。换不掉就还是原来那个合法物品。改成一开始就把想要的值
交给构造函数。

### 测试结果

- `pnpm run ci` 全绿：51 文件 / **371 测试**（原 357 + 黄金 4 + 单测 10）
- `pnpm ledger` 236 → **244**（+6 处没移植的实体类型、+1 处 MobFactory 调用、+1 条 MobFactory 的 OMIT）
- `divs.py` / `shadow.py` 均无输出
- 夹具 `entities.json` 连跑两次一致；`cases` 的字节没变，只多了 `roundTrip`；其它夹具未动

### 下一步

B6：`ExternalFileLevelStorageSource`（世界列表、新建/删除/重命名世界）。**等用户确认后再开始。**

## 2026-10-03 — B5c-1：saveEntities + 黄金样本 G14-6

**B5c 又拆了。** 开工前实测发现任务单原文两处错，且一步要碰 6 个文件、约 420 行。
`saveEntities` 不依赖 `EntityFactory`（只有 `loadEntities` 依赖），所以按"存 / 读"拆成
B5c-1 / B5c-2，每步的夹具只记这一步真正移植的那半。用户已确认。

**任务单原文的两处错（都改回去了）：**

1. **`entities.dat` 不是 RegionFile。** 原文写"RegionFile 的第二个实例"，但 `entitiesFile`
   这个 `RegionFile*` 字段在 C++ 里**声明了却从没被用过** —— 全文件只有头文件第 90 行的声明
   与 `.cpp:86` 的 `entitiesFile(NULL)`。实际是裸 `fopen` 的平文件：
   `"ENT\0"` + int32 version(=1) + int32 numBytes + NBT。
2. **`ChunkVersion_Entity = 2` 是死的。** 只出现在 `.cpp:469` 一行**被注释掉的**代码里。

### 做了什么

- `saveEntities`：两个循环各建一张 ListTag（`Entities` / `TileEntities`，**平级**不嵌套），
  整棵树过 `NbtIo::write`，套 12 字节头写成平文件。
- 接上 tick / saveGame 两处 `DEFERRED(Entity)`；台账 238 → 236。
  `createChunkStorage` 那个断言终于名副其实（ChunkStorage 六个方法齐了）。

### 这个样本真正钉住的东西

**同一个文件里有两套端序路径**：头部那两个 int32 走 `fwrite(&x, sizeof(int), 1, fp)`
（直接倒内存，**小端**），紧跟其后的 NBT 走 BitStream（**大端**）。B2 那个 bug 就是把这俩
弄混了，v1 载荷因此一直错着。所以 G14-6 记的是**整个文件**的十六进制，哪一套错都会露馅。

夹具里空 ListTag 的元素类型是 **1（TAG_Byte）** —— 两边 `write` 里都是 `else type = TAG_Byte`，
对得上。空世界那条用例值得单独钉：新世界第一次存档就是这个形状。

### 顺带查清的两条

- **玩家永远不会进 entities.dat**：`Entity::save` 开头 `if (removed || id == 0) return false`，
  而 `Player::getEntityTypeId()` 返回的就是 **0**（C++ 与 TS 一致）。这不是漏了 ——
  玩家走单独的一条路（`players/<名字>.dat`）。
- **tick 里的存实体分支不在 `if (… && level)` 里面**，也没做空判断，level 为 NULL 时直接解引用。
  照抄（写成 `this.level!`）。

### 测试踩的三个坑（都不是实现 bug）

1. B5b-2 那个只带 `getChunk` 的 level 替身不够了，得补 `entities` / `tileEntities`。
2. "目录不存在时 fopen 失败"测不出来 —— **构造函数自己会建世界目录**（C++ 也是）。
   改成构造完再删目录。
3. 删世界目录时 `remove` 返回 false：**`VirtualFS.remove` 删不掉非空目录**（照抄 C++ 的怪癖），
   得先删 `players/`。

### 测试结果

- `pnpm run ci` 全绿：50 文件 / **357 测试**（原 348 + 黄金 4 + 单元 5）
- `pnpm ledger` 238 → **236**
- `divs.py` / `shadow.py` 均无输出
- 夹具 `entities.json` **连跑两次逐字节一致**；原有 14 个夹具未变

### 下一步

B5c-2：`EntityFactory`（新文件）+ `loadEntities` + G14-6 补"读回来"那半。**等用户确认后再开始。**

## 2026-10-03 — B5b-2：tick / savePendingUnsavedChunks / saveAll（提交 `2977749`）

- `tick()`：每 1000 tick 扫区块缓存 16×16，把标了 `unsaved` 的收进"待保存列表"并清掉标记，
  再挑最老的存两个；另外每 60 秒存一次实体
- `savePendingUnsavedChunks(maxCount)`：挑 `addedToList` 最小的存
- `saveAll` / `flush` / `unsavedChunkList` 字段 + `UnsavedLevelChunk` 接口

**ChunkStorage 那一半共六个方法**（load / save / saveAll / tick / flush / saveEntities），
现在**只差 saveEntities**（B5c）—— `createChunkStorage` 的注释已相应更新。

### 两个原样保留的怪癖

1. **返回值比实际存的多 1**：原文 `while (++count <= maxCount && …)` 先自增再判断，
   存满 maxCount 个后 count 要到 maxCount + 1 才退出；列表提前空掉时也是"存的个数 + 1"。
   `saveAll` 拿它打日志，所以那句 "Saving %d additional chunks." 报的数字总是多一个。
   空列表时也返回 1。
2. **`savePendingUnsavedChunks(2)` 在 tick 的 if 里面**：只有每 1000 tick 那一拍才顺带存两个区块。

### 顺带挖出来的一条

`lastSavedEntitiesTick` **只在 `saveEntities` 里被写**（527/590 行）。本步没移植 `saveEntities`，
所以 tick 里那个"距上次存实体超过 60 秒"的判断现在**每 tick 都成立** —— B5c 补上之后才恢复
正常节奏。这处已标 `DEFERRED(Entity)`，台账 236 → 238（三处：tick 的存实体分支、`saveGame`
整体、`createChunkStorage` 还差的 `saveEntities`）。

### 测试（4 条，共 12 条）

其中一条钉的是"一拍最多存两个 + 时间戳打平时谁算最老"：三个区块在同一拍入列，`addedToList`
是同一个毫秒，而 C++ 用的是**严格小于**，所以"最老的"就是先扫到的那个 —— 断言写进去的正好是
扫描顺序（z 外层、x 内层）的前两个。

`tick` 的 level 用了一个只有 `getChunk` 的替身：用真 Level 的话每轮扫 16×16 会让平坦世界当场
生成 256 个区块，又慢又跟被测的点无关。

## 2026-10-03 — B5b-1：区块的 save/load + 黄金样本 G14-5（提交 `f5d1ed0`）

**又拆了一次**：B5b 本来要碰 5 个以上文件，按规则再分成 B5b-1（`LevelConverters` + `save`/`load`
+ G14-5）和 B5b-2（`tick`/`savePendingUnsavedChunks`/`saveGame`/`saveAll`）。

- `LevelConverters`：C++ 里定义在 .cpp **内部**、不在头文件 → 对应地放在同一个文件、不导出
- `save`：regionFile 懒打开；五个数组（方块 32768 + 数据/天空光/方块光各 16384 + updateMap 256
  = 82176）首尾相接写进 chunks.dat
- `load`：按 `loadedStorageVersion` 决定读不读光照那两段

**4 条测试一次通过**，包括 82176 字节载荷的逐字节比对。

### 原样保留的坑：缺花括号的 if

```cpp
if (loadedStorageVersion == 1)
  changed |= LevelConverters::v1_ClothIdToClothData(levelChunk);
  changed |= LevelConverters::ReplaceUnavailableBlocks(levelChunk);   // ← 其实每次都跑
```

不带花括号的 if 只管第一条语句。G14-5 的 `current` 用例就是钉它的：`loadedStorageVersion = 3`
时未注册的 id **照样**被换成 249。夹具里的实测结果：

| 用例 | 200/250（未注册） | 101/115（老羊毛） |
| --- | --- | --- |
| `current`（v3） | → 249 | → 249 |
| `legacy`（v1） | → 249 | → **35**（羊毛） |

### G14-5 为什么必须来自参考实现

save 和 load 是同一份代码里的两个函数 —— 两边一起把数组顺序写错的话，**它们自己是一致的**
（往返测试照样通过）。只有拿参考实现产出的载荷字节比才行。

### harness 里踩的两个坑（都不是实现的问题）

1. **写进 stdio 缓冲没落盘就读** —— `save` 用的那个 storage 还活着时，它的 RegionFile 没 fclose，
   另起一个 RegionFile 打开同一个 chunks.dat 读到的是空头（`readChunk 失败`）。让写的那次先
   出作用域（析构 → fclose）就好。
2. **埋方块的下标越界** —— `CHUNK_BLOCK_COUNT` 是 32768，我一开始埋的是 50000/60000：
   越界写到了别的堆内存，读回来是 240、255 这种垃圾值，**看着特别像"转换器把 id 换错了"**，
   害我往转换器那边查了一阵。现在 harness 开头有 `checkOps` 兜底（越界当场报错退出），
   TS 测试里也有一道同样的检查。

## 2026-10-03 — 修掉"CI 从来没跑过"（提交 `8c695ee`）

Stop 钩子拦住了我：`tests/unit/world/external-file-level-storage.test.ts(138,13): error TS2511:
Cannot create an instance of an abstract class.` —— 而**我上一轮刚说过 `pnpm ci` 全绿**。

### 根因：`pnpm ci` 不是那个脚本

`ci` 是 **pnpm 自带的子命令**（等于 `install --frozen-lockfile`），**优先于 package.json 里的同名脚本**。
所以：

- `pnpm ci` → 删掉 `node_modules` 重装依赖，**永远返回 0**
- `pnpm run ci` → 才是我以为的那个脚本（format:check && typecheck && test && build）

危害是双向的：

1. **我**连续几轮把"pnpm ci 全绿"当成验证通过 —— 它一次都没跑过。
2. `.github/workflows/ci.yml` 里写的就是 `run: pnpm ci` —— **这个仓库的 GitHub CI 从来没有检查过
   任何东西**，每次 push 只装了一遍依赖。

### 顺带暴露的第二个问题

`Player` 在 TS 里**显式声明成 abstract**，测试里不能直接 `new`。之所以一直没被发现：
**vitest 用 esbuild 剥类型、不做检查，运行期照样能跑，只有 `tsc` 会报**。
（它的抽象成员其实都已实现，给个空的具体子类 `TestPlayer` 就行 —— 对应 C++ 那边 Player
也是抽象基类、具体的是 LocalPlayer。）

### 改了什么

- `.github/workflows/ci.yml`：`pnpm ci` → `pnpm run ci`（并写明为什么不能省那个 `run`）
- `docs/commands.md`、`docs/ai/README.md`：同样改掉并加说明
- 测试改用 `TestPlayer`

### 验证

用**正确的命令**跑 `pnpm run ci`：四步都在日志里看得见
（prettier "All matched"、48 文件 / 340 测试、vite "✓ built in"），退出码 0。

## 2026-10-03 — B5a-2：ExternalFileLevelStorage 的杂项 + 黄金样本 G14-4（提交 `0b96738`）

**移植**：构造函数（建目录 → 读 level.dat → 读 player.dat）、析构（C++ 是 delete，TS 交给 GC，
注释写明是**有意**不写等价物）、`prepareLevel`、`checkSession`、`closeAll`、`createChunkStorage`、
`saveLevelData`（成员 + 静态）、`savePlayer`/`loadPlayer`（成员 + 静态）。

**R10 改名**：C++ 里 `saveLevelData`/`savePlayer`/`loadPlayer` 各有**成员版和静态版同名**，
TS 一个类里不能静态与实例同名。按手册 R10 情形 B：**成员版保留原名**（它是 `LevelStorage` 接口的
实现、是"分派入口"），静态版按区分参数改名 —— 对齐手册给的先例 `静态的 Player::animateRespawn`
→ `animateRespawnFor`：`saveLevelDataTo` / `savePlayerTo` / `loadPlayerFrom`。

**ADAPTED(Web)**：`std::ofstream`/`ifstream` 不是 `FILE*`（B1 的 CFile 套不上）→ 直接走 VirtualFS。
语义等价处写在注释里。`createChunkStorage` 返回 `this` 要断言 —— C++ 同时继承 LevelStorage 与
ChunkStorage，TS 只能单继承，**ChunkStorage 那一半要到 B5b 才补齐**（注释写明现在还不能当它用）。

**黄金样本 G14-4**：这个函数的可观测结果全在文件系统上，所以夹具记的是每次调用后**目录里有哪些
文件、各自字节**。三个用例：first-save（空目录 → 只留 level.dat）、second-save（已有 level.dat →
上一份被挪成 level.dat_old）、missing-dir（目录不存在 → 什么都不留）。
**`level.dat_old` 恰好等于第一份的 `level.dat`** —— 夹具真的区分开了两次保存。

### 我自己写错的两处（都不是实现 bug）

1. **把夹具的"序列"当成了"独立用例"**。first-save / second-save 是**在同一个目录上连着跑两次**
   的结果，第二次的行为本来就依赖第一次留下的文件。第一版每个 case 都从空 VFS 开始，于是第二次
   也走"目录是空的"那条路，清单里当然没有 `level.dat_old` —— 测试立刻红了，是测试错了。
2. **`LevelData` 的 storageVersion 必须显式设**：默认 0，而 `readLevelData` 只认 `==1` 与 `>=2`
   两条路 —— **版本 0 两条都不走、静默什么都不读**。真实路径不会出现这个值（`saveLevelData`
   写之前会强制设成 `SharedConstants.StorageVersion`）。

另外撞到 `Entity.load` 会把 x/z 夹进世界边界（`padding = bbWidth*0.5 + 0.001`），y 不夹：
测试里给的 `z = -3.5` 被夹成 `0.301`，看着像存档往返出错，其实是 clamp。

## 2026-10-03 — B5a-1：FolderMethods（提交 `e627cc5`）

**为什么先做它**：任务单把 FolderMethods 排在 B6，但 B5a 一开头就要用（构造函数要
`createFolderIfNotExists` 建世界目录和 `players/` 子目录，`saveLevelData` 要
`exists`/`remove`/`rename`）。而且 B4c 已经因为同样原因把 `getRemainingFileSize` **临时**
塞进了 `ExternalFileLevelStorage` —— 再拖下去这处临时代码会变成三份。用户确认提前做。

- `packages/world/src/level/storage/FolderMethods.ts`（新，7 个函数）
- `tests/unit/world/folder-methods.test.ts`（14 条）
- 3 个 POSIX 裸原语（`_mkdir`/`_access`/`_errno`）标 `OMIT(Web)`，写明谁承担了职责
- `getRemainingFileSize` 从 ExternalFileLevelStorage 归位，临时注释撤掉

### 读出来的一个 C++ 怪癖：createTree 的循环自增是废的

```cpp
for (int i = 0; i < treeLength; ++i && tree[i])
```

条件只有 `i < treeLength`；自增表达式 `++i && tree[i]` 的**值会被丢弃**（for 的自增就是拿值
当语句用）。所以 `tree[i]` 那半截：① 拦不住空指针，② 不影响循环次数，③ 反而在最后一轮
多读一次 `tree[treeLength]`（越界读）。只复刻有效行为，越界读不复刻（PITFALLS 第 20 条）。

### 顺带补上 LevelData.createTagForPlayers 的 DEFERRED(Player)

先前注释说"Player 的存档序列化还没移植"，其实前提早已具备：`Player` **不覆盖**
`saveWithoutId`/`load`，只覆盖 `readAdditionalSaveData`/`addAdditonalSaveData` ——
这四个在 TS 里都已经有、且都没有 DEFERRED。补上之后"带玩家数据存档"这条路径才是通的。

台账 234 → 236（+3 条 `OMIT(Web)`，−1 条 `DEFERRED(Player)`）。

## 2026-10-03 — B4d：readPlayerData（裸结构体转储）（提交 `39797f9`）

**做法按约定：先量布局，再动手。** 量得 `sizeof(PlayerData) = 80`，
`pos` 0 / `motion` 12 / `xRot` 24 / `yRot` 28 / `fallDistance` 32 /
`onFire` 36 / `airSupply` 38 / `onGround` 40 / `inventorySlots` 44。
（`onGround` 是 bool，后面 3 字节填充 → `inventorySlots` 在 44 而不是 41。）
**这条顺序省掉了试错：TS 写完一次就跑通 7 条测试。**

- `packages/world/.../ExternalFileLevelStorage.ts`：`readPlayerData` + `PLAYER_DATA_LAYOUT`
  + `decodePlayerData`（都是 ADAPTED(Cpp)）
- `tools/golden/harness_playerdata.cpp` + build.sh 的 `playerdata` 节（与 leveldata 共用 `$LVL`）
- `tests/golden/playerdata.golden.test.ts`（7 条，含一条逐项核对布局的）

### 这个格式是只读遗留的

本版本的 `savePlayer` 写 NBT（`players/<名字>.dat`），**不写 `player.dat`** ——
也就是说 `readPlayerData` 读的是一个再也不会被写出来的旧格式。harness 只能自己按布局造文件。

### 原样保留的两个行为

1. **检查在后、写入在前**：`if (fread(...) != size) break;` 里 fread 先把 sizeof 字节写进
   结构体、再拿返回值比 size —— 所以 size 不匹配时结构体**已被覆盖**，只是跳过 clamp 与
   版本赋值（版本停在 -1）。TS 里 decode 必须在比较**之前**，位置换一下就与参考不符。
2. **clamp 是这一套**（x/z→[0.5, LEVEL_?-0.5]，y<0→64），不是 `PlayerData.h` 里的
   clampXZ/clampY/clampRot（那些属于仍是 OMIT 的 loadPlayer）。

### 踩的坑：两处未初始化内存，都是"连跑两次比对产物"抓的

- **对齐填充**：`onGround` 后 3 字节没有初值，`imageOf()` 把它一起 memcpy 进夹具 →
  每次生成都不一样（第一次 `1f0000`、第二次 `000000`）。填字段前先 `memset`。
- **没被读到的字段**：`version-2`（根本不读）和 `truncated`（只读一半）的用例里，
  未初始化的 `xRot` / `inventorySlots` 会原样留在夹具里。harness 改为先显式清 0 ——
  记录的就成了确定的"这条路径不写这些字段"，而不是复刻未定义内存（PITFALLS 第 20 条）。
- 顺带修了 harness 自己的 bug：`missing` 用例原先无条件先造文件，所以 `fopen` 失败那条路
  根本没测到（`ret` 一直是 1）。

**顺带一提**：`build.sh playerdata` 一次 20 秒（改了 build.sh 之后），
所以这一轮的"改 harness → 重生成 → 比对"循环很快，才敢把上面这些坑一个个试出来。

## 2026-10-03 — build.sh 提速（提交 `1a0ad6c`）

用户提"build.sh 太慢了"。**先量再改**：16 核的机器上，build.sh 一路串行编 151 个源文件
（S11 的 30 个 + S12 的 121 个，共 22795 行）—— 这就是全部原因。

| | 改前 | 改后 |
|---|---|---|
| 全量 | ~10 分钟 | **50 秒** |
| 只生成 leveldata | — | **24 秒** |
| 只生成 random | — | **0.7 秒** |

- **并行编译**：新增 `compile_many`，用 `xargs -P $(nproc)`。单文件编译命令由一个生成的
  小脚本 `$TMP/compile-one.sh` 承担（不用 `export -f` 是因为 `$CF` 是数组、没法跟着函数导出）。
  目标名由调用方给，保证与串行版本逐个一致 —— **尤其 `$REG` 那组仍旧用 basename**：
  改链接顺序会影响静态初始化顺序，不敢动。
- **按节选择性生成**：`build.sh [节名...]`，节名就是夹具主文件名，`--list` 列全部。
- `$REG/sigill_diag.oo` 挪到 `$TMP/sigill_diag.oo`：collision 与 leveldata 只需要这一个文件，
  原来却因为它在 `$REG` 里而连带编了那 30 个方块/物品类。挪走后这两节彻底解耦。
- 顺带去掉 `leveldata.json` 的 `ts` 字段（它让这个夹具每次重新生成都必产生一行 diff，且无人读）。

**验证这次重构没改变任何输出**：全量重新生成后，**原有 14 个夹具逐字节未变**，
`leveldata.json` 的唯一变化就是少了那行 `ts`。

## 2026-10-03 — B4a / B4b / B4c：level.dat 的读写

**B4a RakDataInput / RakDataOutput**（提交 `e37c870`）
- `packages/util/src/RakDataIO.ts`：NBT 与 BitStream 之间的适配层（`writeBytes` → `bitStream.writeBytes`）
- 6 条测试，基准是"与 `MemoryDataOutput` 写出的字节一致" —— 后者已被 nbt.json 间接验证
- 因为 B4c 查出的字节序问题，这一层的**读写字节与 B2 的整数路径不同**（见下）

**B4b LevelData 补齐 11 处 OMIT(NBT)**（提交 `c7d28eb`）
- `createTag` / `createTagForPlayers` / `getTagData` / `setTagData` / `setPlayerTag` /
  `getLoadedPlayerTag` / `setLoadedPlayerTag` / `LevelData(CompoundTag*)` / `v1Write` / `v1Read` / `setLoadedPlayerTo`
- `(int)` 截断用 `Number(BigInt.asIntN(32, tag.getLong(...)))` 复刻
- 只剩 `OMIT(Player)` 与 1 处 `DEFERRED(Player)`

**B4c readLevelData / writeLevelData + 黄金样本 G14-2**（提交 `bb8a63a`）
- `packages/world/src/level/storage/ExternalFileLevelStorage.ts`（两个静态函数 + 4 个文件名常量）
- `tools/golden/harness_leveldata.cpp` + `build.sh` 的 S-B4 段
- `tests/golden/leveldata.golden.test.ts`（5 条）
- G14-2 判定 **B2 的 `long` 取 8 字节是对的**：v1 载荷 61 字节、NBT 载荷 222 字节，与参考逐字节一致

### B4c 抓出的真 bug：B2 的字节序搞反了

详见 `task_plan.md` 的「遇到的错误」第 1 条。要点：C++ 模板 `Write<T>(整数)` 会**先做端序交换**再交给
`WriteBits`（`RakNetDefines.h:24` 的 `__BITSTREAM_NATIVE_END` 被注释掉了，交换一直开着）→ **大端**；
而 `Write(const char*, n)` / `WriteBits` 是原样 → 小端。**两条路本来就不一样**，我当初只读了后者。

B2 的 17 条测试当时"从源码确认"了字节序 —— 但测试钉的是我读出来的结论，结论错了就一起错。
**真正证伪的只有参考实现写出的真实字节。**

影响面：G14-1（RegionFile 只走 fwrite 与 writeBytes）没受影响。

### 踩的坑

- **build.sh 的 S-B4 段被 raknet 陷阱桩坑了**：只编 `BitStream.cpp` + `RakString.cpp` 时，
  `rakMalloc_Ex` / `rakFree_Ex` / `rakRealloc_Ex` / `notifyOutOfMemory` 这几个**小写 rak 开头、不含
  "RakNet" 字样**的符号被桩规则判给 `ud2`；`RakString` 有静态初始化，程序没进 `main()` 就崩，
  现场表现为段错误 + 一个 0 字节的 `level.dat`。
  **这个坑我在临时迭代脚本里修过并写了注释，但没同步回 build.sh** —— 教训：一次性脚本跑绿不算数，交付物必须走正式路径。
- `ExternalFileLevelStorage.h` 用了 `RakNet::TimeMS` 却没 include 那个头，harness 里要自己补。
- `getEpochTimeS()` 是实时时钟 → 两边都把时间戳那几字节清零后再比，偏移量记进夹具。

## 2026-10-03 — B2 / B3 完成

**B2 RakNet::BitStream 的最小子集**（提交 `6ea47f8`）
- `packages/util/src/BitStream.ts` + 17 条单元测试，字节布局逐条钉死。
- 字节序从源码确认（`WriteBits` 的 memcpy 分支 → 宿主内存序 → x86-64 小端）。
- `long` 取 8 字节（LP64），B4 的 G14-2 最终判定。

**B3 RegionFile**（提交 `eb176ee` + `11df05b`，按 5 文件规则拆成 B3a/B3b）
- `packages/world/src/level/storage/RegionFile.ts` + 模块级注入点 `setVfs/getVfs`。
- 黄金样本 G14-1 **一次通过**：chunks.dat 24576 字节逐字节一致。
- 原有 14 个夹具经正式 build.sh 重新生成后一字节未变。
- 手算文件大小 28672 与 harness 的 24576 对不上 —— 是我漏看了"复用刚释放的扇区"这一步，不是 bug。

### 下一步

B4：LevelData 的读写 + 黄金样本 G14-2（level.dat 字节）。会判定 B2 里 `long` 取 8 字节的判断对不对。**等用户确认后再开始。**

## 2026-10-03 — B1b 完成

- 新增 `apps/web/src/IndexedDbBackend.ts`（实现 VfsBackend，库 mcpe-ts/store files+meta）
- 新增 `tests/unit/web/indexeddb-backend.test.ts`（7 条，fake-indexeddb）
- `main.ts`：app.init 之前 load、200ms 防抖、pagehide/visibilitychange 兜底、挂 `window.__vfs`、库打不开时降级
- 装了 devDependency `fake-indexeddb@6.2.5`
- 浏览器场景加了一条真浏览器的 IDB 往返断言
- 提交 `607e463`
- 验证：format:check / typecheck / test（39 文件 266）/ build 全绿；smoke 退出码 0、5 断言全过、截图已看
- 踩坑：IDB 的 `tx.oncomplete` 必须在创建事务的同一个任务里挂，等 `await` 完再挂会永久挂死（7 条测试全超时）

### 下一步

B3：RegionFile（移植 `world/level/storage/RegionFile.h/.cpp`，216 行）+ 黄金样本 G14-1。
用 `/port-unit world/level/storage/RegionFile`。**等用户确认后再开始。**

## 2026-10-03 — 全仓库套用 Prettier（用户要求，独立于 B1）

`prettier.config.js` 一直存在但仓库从未按它格式化过（293 个文件不合规）。用户确认可以标准化后套用。

- 新增 `.prettierignore`，**最关键是排除 `fixtures/`**：黄金样本是 JSON，Prettier 会重排，
  等于手改"标准答案"。`tools/hooks/guard.mjs` 只在 Edit/Write 时拦截，拦不住
  `prettier --write` 走 Bash，必须靠 ignore 兜住。实测确认排除生效、`git status fixtures/` 为空。
- `package.json` 的 `ci` 加 `format:check`，防止再次漂移。
- 新增 `.git-blame-ignore-revs` 并已 `git config blame.ignoreRevsFile`。
- 提交：`2523373`（格式化，293 文件）、`30a976d`（blame 配置）。
- 验证：format:check / typecheck / test（259）/ build / ledger（246）全绿；三个重排过的钩子脚本逐个 `node --check` 并实测 guard 仍能拦截。

## 2026-10-03 — B1a 完成

### 交付物

| 文件 | 动作 |
|---|---|
| `packages/platform/src/fs/VirtualFS.ts` | 新增 |
| `packages/platform/src/fs/CFile.ts` | 新增 |
| `packages/platform/src/index.ts` | 加两行 export（保持原双引号风格） |
| `tests/unit/platform/vfs.test.ts` | 新增，27 条测试 |
| `docs/ai/TASK-B-存档.md` | 修正 B0 的 4 处错误规格 + 补 2 条实测发现 |
| `.gitignore` | 忽略规划三件套 |

### 测试结果

- `pnpm typecheck` OK
- `pnpm test` 38 文件 / **259 测试全过**（原 232 + 新增 27）
- `pnpm ledger` 246 条不变
- 未跑浏览器场景：B1a 不涉及画面（`main.ts` 的接线在 B1b）

### 规划阶段发现（详见图 findings.md 与 TASK-B 的修正）

实测参考源码后发现 B0 有 4 处与实际不符：mode 列表漏了 `w+b`、`fread` 返回元素个数而非字节数、`beforeunload` 同步写 IDB 做不到、`IndexedDbBackend` 放不进 platform 包。

设计审查另外查出两个 B0 没提的真问题，都已实现并写测试钉住：
- `TypedArray.set` 是逐元素拷贝，`Uint8Array.set(Int32Array)` 会静默截断数据（B3 移植 RegionFile 必踩）
- 只存文件的话空目录刷新后会丢

### 踩的坑

- 有一条测试失败，查下来**不是实现 bug**：新加的"父目录不存在则 open 失败"检查正确地拦住了测试辅助函数没建中间目录的情况。补 `mkdirp` 修测试。
- prettier 把 `index.ts` 原有双引号一起改了；查全仓库发现 308 个文件都不是 prettier-clean，说明并未按该配置格式化过，于是还原原风格只留新增两行。

### 下一步

B1b：`apps/web/src/IndexedDbBackend.ts` + fake-indexeddb 测试 + `main.ts` 接线（挂 `window.__vfs`、接 pagehide/visibilitychange）。**等用户确认后再开始。**

---

## 任务单 E（粒子）· E9 — `TakeAnimationParticle`（2026-10-04）

### 做了什么

捡起掉落物时"那件物品飞向玩家"的动画。它是这批里**唯一不画 billboard** 的粒子：
内部藏一个没进世界的 `ItemEntity`，每帧算个插值位置，再交给
`EntityRenderDispatcher.renderAt(e, xx, yy, zz, e.yRot, a)`（**6 参数那个**）去画。

| 文件 | 做什么 |
| --- | --- |
| `packages/client/src/particle/TakeAnimationParticle.ts` | 新建（C++ 头文件 63 行，没有 .cpp） |
| `packages/client/src/player/LocalPlayer.ts` | `take()` 里换掉最后一条 `DEFERRED(Particle)` |
| `packages/client/src/index.ts` | 导出 |
| `tests/unit/client/particle-take.test.ts` | 新建，24 条 |
| `tools/verify/scenarios/particles.mjs` | 新增第 7 节：4 条断言 + 截图 03 |
| `tools/verify/scenarios/_dbg-pickup.mjs` | 新建（隔离调试工具，保留） |

### 测试结果

- `pnpm typecheck` OK
- `pnpm test` **91 文件 / 1001 测试全过**
- `pnpm ledger` **229 → 228**（`DEFERRED(Particle)` 全清）
- 场景 `particles.mjs`：状态 16 / 断言 **19 条全过** / 页面错误 0 / 截图 4 张

### 反向验证

13 个源码变异，**13 个全部变红**。两个等价变异（测不出来，已写成"记录"测试）：
`this.e.x` ↔ `this.x`、`life === lifeTime` ↔ `life >= lifeTime`。

### 踩的坑

1. **`Entity` 是抽象类** —— 测试里 `new Entity(level)` 过不了 tsc，但 vitest 不做类型检查，
   所以测试全绿、只有 `pnpm typecheck` 红。补了 `PlainEntity extends Entity` 最小子类。
2. **场景里那颗粒子"看不见"** —— 我把掉落物摁在玩家**眼睛高度**，于是起点=终点=相机原点，
   整颗卡在近裁剪面里：脚本全绿、截图空白。隔离实验（`_dbg-pickup.mjs` 把起点人为挪到
   前方 3 格 → 立刻显形）证明渲染路径没问题。改成摁在**脚下一格**就对了。
   **教训：画面为空先怀疑测试设定，且必须用隔离实验把"设定问题"和"代码问题"分开。**
3. 粒子只活 **3 tick**（约 0.15 秒），无头里一次 wait 就是几百毫秒 —— 想断言"它出现过"
   不能数场上还剩几颗（赛跑），要在页面上给 `particleEngine.add` 包一层记流水。

### 下一步

E10 / E11：死代码 `OMIT` 标记（`SplashParticle`、`HugeExplosion*`）、手册、台账、完成章节。
任务单 E 收尾后转任务单 F（声音，`.pcm` → 二进制）。

---

## 任务单 E 收尾（E10 + E11，提交 `61dd1e5`）

补上被跳过的 `ParticleInclude.h`（C++ 那份"哪些粒子类存在"的清单头）→
三个明确不搬的类有了落档的地方：`HugeExplosionParticle`、`HugeExplosionSeedParticle`、
`SplashParticle`。台账 228 → 231（涨的 3 条是补记缺口，不是退步）。

写完成章节时**抓到自己两个写错的数**：先写成"`DEFERRED(Particle)` 10 → 0、
`OMIT(Particle)` 0 → 6"，用台账那条严格正则重数才发现基线是 **DEFERRED 10 / OMIT 2**，
HEAD 是 **0 / 6**。第一次用宽松 `grep "OMIT(Particle)"` 数成了 8，把正文里提到
"标 `OMIT(Particle)`"的说明文字也算进去了。**教训：数标记必须用和台账一模一样的正则。**
（这已经是这条规则第三次栽跟头了，见记忆 `no-unverified-claims-in-artifacts`。）

台账表里每一步的数字都是用临时 worktree 逐个 checkout 实测的 ——
顺带发现 `tools/ledger.mjs` 在路径里含 `~1`（8.3 短名）时会解析错，
临时 worktree 要放在不含 `~` 的路径下。

### 任务单 E 全量结果

- `pnpm typecheck` 0；`pnpm test` **91 文件 / 1001 条全过**
- 任务单 E 新增测试：7 个文件 / 146 条
- 反向验证：95 个源码变异全部变红；其中 9 个一开始没红，全是测试漏洞，已补
- 浏览器场景 `particles.mjs`：19 条断言全过 / 页面错误 0 / 4 张截图逐张看过
- 台账 236 → 231；`DEFERRED(Particle)` 10 → 0

### 下一步

**任务单 F（声音）**。先写 `docs/ai/TASK-F-声音.md`（F0），架构：`SoundDesc`/`SoundRepository`/
`SoundEngine` 放 `packages/client/src/sound/`，`SoundSystem` 抽象也放 client（它要 `SoundDesc`，
而 platform 被 client 依赖，放不进去），Web Audio 后端放 `apps/web/src/`；
音源走 `.pcm` → 二进制。**等用户确认后再开始。**

---

## 任务单 F（声音）· F0 ~ F2（2026-10-04）

### F0 — 任务单落盘（提交 `26e65c5`）

侦察阶段实测出**两条和原计划不符**的事实：

1. **`.pcm` 磁盘上是 C 源码数组**，不是裸二进制（计划里写的是"裸 PCM16 + 16 字节头"）。
   103 个文件、磁盘 23.07 MB、**解码后 6,090,080 字节 = 6.09 MB**；
   17 个用十六进制写法；`pop2.pcm` 的 `};` 后面粘着一行 `SoundDesc SA_pop2(...)`。
2. **`SOUND_DISTANCE = 16` 那道硬剔除在 `LevelRenderer::playSound`**，
   `SoundEngine::play` 里那两句同款代码是复制粘贴留下的残骸（`dist` 算完从不使用）。
   原计划一个字都没提。

用户拍板：**距离衰减两层都复刻**（手算 SoundEngine 那层 + PannerNode 复刻 OpenAL 的
`AL_LINEAR_DISTANCE_CLAMPED`，ref5/max16/rolloff6）；**二进制打成一个包**。

### F1 — SoundDesc + SoundRepository（提交 `9785ea5`）

两个纯头文件类。台账 231 不变。新增 14 条测试，**11 个源码变异全部变红**。

⚠ `frames` 必须用 `subarray` 而不是 `slice`（共享内存的视图 = C++ 的指针语义），
而且打包文件里每个 desc 的 **byteOffset 不是 0**，读头必须用 `data.byteOffset`。

### F2 — `.pcm` → 二进制（提交 `8200e41`）

`tools/sound/build.mjs` + 产物 `apps/web/public/sounds/{sounds.bin,sounds.json}`。
6,390,080 字节，103 条索引。新增 16 条测试，**9 个源码变异全部变红**。

**这一步踩的坑（三个都是自己挖的）**：

1. **测试差点覆盖真产物**：`run()` 最初不带 `--out`，脚本会写到
   `apps/web/public/sounds/`，把已提交的产物换成一个只含临时样例的包。
   给脚本加了 `--out`，并在两处写了警告注释。
2. **自造的"合法输入"是错的**（18 个值，但头里声明 2 帧 = 20 字节）——
   被脚本的自校验当场抓出来。顺带证明自校验有效。
3. **两条变异第一轮没抓住**：`offset 不累加`（只喂了 1 个文件，offset 恒为 0）、
   `取最后一个 }`（真实素材的脏尾巴里没有 `}`，是**等价变异**）。都补了用例。

### 测试结果

- `pnpm typecheck` 0；`pnpm test` **93 文件 / 1031 条全过**
- `pnpm ledger` 231 不变
- `node tools/sound/build.mjs "$REF/src/client/sound/data" --check` → ✓ 一致

### 下一步

F3（`SoundSystem` 抽象）→ F4（Web Audio 后端，含两层衰减 + 自动播放解锁 + 播放记录）
→ F5（`SoundEngine` 100 条名字表）→ F6 接线 → F7 场景 → F8 收尾。

---

## 任务单 F（声音）· F3 ~ F7 —— **声音能响了**（提交 `9d9789c`）

用户反馈"我在浏览器没听见声音"——原因很简单：**F3~F6 还没做，一条通往音频的路都没有**
（`apps/web/src/` 里没有后端、`Minecraft.soundEngine` 还是 null、11 条标记一条没接）。
现在接上了。

| 步 | 交付 |
| --- | --- |
| F3 | `SoundSystem`（有默认实现的基类；放 client 不放 platform，否则成环） |
| F4 | `apps/web/src/WebAudioSoundSystem.ts` + 纯函数 `pcm16ToFloatPerChannel` |
| F5 | `SoundEngine`（**100 条表程序化提取**，归并 42 个名字）+ `SoundBank` + `SoundBackend` |
| F6 | 6 个文件接线（Minecraft / LevelRenderer / GameMode / SurvivalMode / Screen / 选格界面） |
| F7 | 场景 `tools/verify/scenarios/sound.mjs`，**19 条断言全过** |

**`DEFERRED(Sound)` 6 → 0；`OMIT(Sound)` 5 → 1（只剩 levelEvent）；台账 231 → 222。**

### 三处"新增能力"（C++ 网页版根本没有音频后端，没有原版可对照）

1. **数据是裸 PCM16、不是容器格式**，`decodeAudioData` 解不了 → 直接 `createBuffer` +
   手工把交错 PCM16 铺成各声道 Float32（顺带绕开各浏览器解码器差异）。
2. **自动播放策略**：`AudioContext` 要**在启动时就建**，不能拖到第一次 `playAt` ——
   解锁用的 pointerdown 监听是建 context 时挂的，拖晚了用户得点两次才听得到。
3. **听者永远在原点**（只设朝向）、`playAt` 收**相对坐标** —— 严格照 C++。
   第二层衰减用 PannerNode 的线性模型（ref 5 / max 16 / rolloff 6，抄 SoundSystemAL.cpp:71-73）。

### ⚠ 三条断言是我一开始写错的，都被实测纠正

- "脚下是 1.1" —— `clamp(1.1 - d/20, -1, 1)` 的**上界是 1.0**，所以 dist ≤ 2 格就是正好 1；
- "5 格 = 1.1 - 5/20" —— `_invMaxDistance = f(1/20)`，和 1/20 差一个 float 位；
- 单测里拿玩具包跑那 42 个名字 —— 包里只有 2 个文件；改成读**真产物**（顺带把产物也验了）。

### 下一步

F8 收尾：手册、台账、任务单 F 的完成章节。

---

## 任务单 F 完成（F8 收尾，提交 `5b0b2f2`）

工作树干净。台账 **231 → 222**（实测：基线 231 → F0/F1/F2 231 → F3~F7 222），
`DEFERRED(Sound)` **6 → 0**、`OMIT(Sound)` **5 → 1**（只剩 `levelEvent`）、
新增 1 条 `ADAPTED(Web)`（`WebAudioSoundSystem::enable`）。

`pnpm typecheck` 0；`pnpm test` **95 文件 / 1060 条全过**；场景 `sound.mjs` 19 条断言全过。

F8 补做的两件事：
1. **F3~F7 的反向验证**（之前只做了 F1/F2）：14 个变异，12 个红、2 个记为等价变异
   （`_invMaxDistance` 的 fround、`play()` 第一道音量守卫）；
   顺带抓出两处测试空白并补了断言（变体数、SoundBank 的 subarray/slice）。
2. **手册**：`PITFALLS.md` 新增 E2（素材不只是图片）、E3（音频后端特有的两件事）
   + F 节两条（vitest 不做类型检查、数标记/数测试要用的口径）。

### ⚠ 上面第 1 条是**错的**，2026-10-04 做任务单 G 侦察时实测纠正

数了 `packages/world/src/entity/` 全部 **30 个**文件：**生物类只移植了 `Chicken` 一个**。
猪、牛、羊、僵尸、骷髅、蜘蛛、苦力怕、僵尸猪人的实体类**根本不存在**
（`EntityFactory.ts:92` 那条 `id < 64` 走 `MobFactory::CreateMob`，而 `MobFactory` 整条 `OMIT(Entity)`）。

真正"逻辑全对但画面上看不见"的只有 **5 个**：`Chicken` / `PrimedTnt` / `Painting` /
`TripodCamera` / `Player`。其余 7 个连实体都没有，谈不上"看不见"。

教训和记忆条目 `no-unverified-claims-in-artifacts` 是同一条：**没核实就写进产物 = 第四次**。

### 任务单 G（模型系统与实体渲染）—— G0 落盘（2026-10-04）

任务单：`docs/ai/TASK-G-模型与实体渲染.md`。**用户拍板两条**：
范围只做上面那 5 个；模型几何**要写黄金样本**（新开 `model` 一节）。

实测规模：模型层（`src/client/model/` 含 `geom/`）**1890** 行 +
缺的 11 个渲染器 **1256** 行 ≈ **3146** 行 C++，切成 **12 小步**（G0~G12）。
台账基线 **222**，其中 `DEFERRED(EntityRender)` 2 / `OMIT(EntityRender)` 2 / `DEFERRED(Model)` 1。

规划时实测出来的六个坑（都写进任务单了）：`ModelPart::compile` 的 6 次空转与
`draw()` 硬编码顶点数互相抵消（画面是对的）、`Cube` 构造里 6 个成员被形参遮蔽且写入后无人读、
`Cube` 六个面的 UV 参数**和 Java 版对不上**（顶面 v 反了）但必须原样保留、
`PolygonQuad` 的 UV 是反着给的且四行符号不同、
`ModelPart::operator=` 要用 `assign()` 不能换对象、模型是 `glScalef2(-1,-1,1)` 整个镜像画的。

### 任务单 G —— G1 完成（2026-10-04，提交 `b420bc6`）

**模型几何黄金样本**：新开一节 `model`，`REF=$REF bash tools/golden/build.sh model` 出
`fixtures/golden/model.json`（**42,611 字节**，6 个合成形状 + `HumanoidModel` 64×32 / 64×64
+ `ChickenModel`，共 **33 个 cube**）。每个 cube 记 6 个成员 `x0..z1`、8 个顶点、
6 个面 × 4 个角的位置与 UV，浮点按 `%.9g`（float32 往返精度）打印。
**连跑两遍逐字节相同。**

做这步时挖出三件事（都写进任务单了）：

1. ⚠ **`build.sh` 的通用参数 `CF` 少了 `-DOPENGL_ES`。** `CMakeLists.txt:383` 给网页版定义了它；
   少了这个宏 `ModelPart::draw()` 会走 `glCallList` 那条**显示列表**分支
   （`ModelPart.cpp:203-209`），和网页版真实行为相反。已补进 `CF`，并写明为什么**不能**
   同时补 `__EMSCRIPTEN__`（会让 `gles.h` 去 `#import <GLES/gl.h>`，Linux 上没有）。
   补之前查过影响面：全树带 `OPENGL_ES` 分支的只有 9 个文件，**没有一个被已有的节编译**；
   实测重生成已有的 `mth` 节，工作树无变化。
2. `stub/glad/glad.h` 只声明了 5 个 GL 函数，模型要 `glRotatef` 与 `glScalef`。补了声明。
3. harness 自己给了 `anGenBuffers` 的空实现：`ModelPart::_init` 构造时就调它，
   不给自己会踩上陷阱桩的 `ud2`。

**自己踩的坑**（记下来当教训）：改 JSON 输出的开括号时忘了改闭括号，夹具多一个 `]`、
`JSON.parse` 直接抛。是 `check-model-fixture.mjs` 抓出来的 —— **生成夹具之后必须立刻解析一遍**。

`pnpm typecheck` 0；`pnpm test` **95 文件 / 1060 条全过**。

### 任务单 G —— G2 完成（2026-10-04，提交 `f4bb134`）

`packages/client/src/model/geom/` 的 `Vertex.ts` + `Polygon.ts`（`VertexPT` / `PolygonQuad`）。

**两处 C++ 死代码记了 `OMIT(Model)`**（零调用方，且在 TS 里只差参数类型、重载区分不了）：
`VertexPT(const Vec3&, float, float)`（`Vertex.h:33`）、
`PolygonQuad(v0..v3, float u0,v0,u1,v1)`（`Polygon.h:15`）。台账 **222 → 224**。

**定了一条和原计划不同的规矩**：这一类**不适用**「第三档渲染代码不逐步 fround」的豁免。
理由写进 `Polygon.ts` 头注释了 —— 它的输出被夹具**逐位**钉住，而 `us = -0.002f / texW`
不是 float32 能精确表示的数，少包一层 `f()` 数值就变。**不是理论担忧**：G1 生成夹具时
head 那个面的 UV 正是因为这个才定在 `0.375031263`。

**浮点比对的口径**：夹具是 `%.9g` 的十进制，读回来先 `fround` 才是原来那个 float32
（9 位有效数字正好是往返精度）。`toBe(f(0.375031263))` 对，`toBe(0.375031263)` 会红。

**新增工具 `tools/verify/mutate.mjs`**（改坏源码 → 跑测试 → 看是否变红 → 还原，
每个变异要求 `from` 恰好出现一次）。
**10 个变异 10 个红**，没有等价变异要记。

又栽了一次 PITFALLS 里记过的那条：`vv0` 少写一个 `!`，**vitest 全绿而 `tsc` 报错**。

`pnpm typecheck` 0；`pnpm test` **96 文件 / 1075 条全过**。

### 任务单 G —— G3 完成（2026-10-04，提交 `555a544`）

`packages/client/src/model/` 的 `Model.ts` + `geom/Cube.ts` + `geom/ModelPart.ts`
（**只做「造形状」那一半**）。

**⚠ 计划改过一次（已写回任务单）**：原来的「G3 `Cube` → G4 `ModelPart` → G5 `Model`」切法
**编不过** —— 三个类互相引用（`Cube` 的构造函数收 `ModelPart*`、`ModelPart::addBox` 又 `new Cube`、
`setModel` 收 `Model*`），单拆哪一半都不成立。改成按**「造形状」/「把形状画出来」**切：
「造形状」在 G3（判据 = 黄金样本 `shapes` 一节），渲染那一半留 G4（8 个函数标 `DEFERRED(Model)`）。

**判据**：`tests/golden/model.golden.test.ts`（7 条，6 个合成形状逐位比对
bounds / 8 个顶点 / 6 个面 × 4 个角）+ `tests/unit/client/model-part.test.ts`（19 条，
盖住夹具盖不到的那一半：`setModel` 登记摘除 / `addBox` 三个重载 / `mimic` / `clear` / `assign`）。
夹具里的 `models` 一节要等 G7/G9 才有 `HumanoidModel`/`ChickenModel` 可比 —— 测试头里标了「别忘了」。

**反向验证 16 个变异 16 个红**，其中两条正是这类代码最容易被人"顺手改对"的地方：
- M1：把第 3 行那个看起来像笔误的 UV（顶面 v 反的）改成"对的" → **黄金样本抓住**；
- M6：把 `Cube` 那 6 个「没外扩的成员」顺手加上 `g` → 同样抓住。

台账 **224 → 233**；`pnpm typecheck` 0；`pnpm test` **98 文件 / 1101 条全过**。

### 任务单 G —— G4 完成（2026-10-04，提交 `e72a4ab`）—— **几何层立起来了**

把 G3 里标 `DEFERRED(Model)` 的 8 个函数填上（`ModelPart` 的 `render` / `renderRollable` /
`translateTo` / `compile` / `draw` / `renderHorrible` / `drawSlow` + `Cube::compile`）。

**判据换成两层可观察的东西**（这一半没有黄金样本可用）：
- `SpyGL extends GLES1` 记下 `push/pop/translate/rotate/drawArrays`，`glSetContext` 换上去；
- `vi.spyOn` 数 `Tesselator.instance` 的方法 —— **顶点数是最硬的判据**：
  `compile` 那层 6 遍的循环让 1 个 cube 写出 `6 × 6 × 4 = 144` 个顶点，`draw()` 只报 36 个。

**照抄下来、很容易被"顺手统一"的差异**：`render` 旋转顺序 z→y→x（只有旋转分支 push/pop）；
`renderRollable` 是 y→x→z、不递归子部件、无条件 push/pop（零调用方）；`translateTo` 不 push/pop；
`renderHorrible` 不 compile、走 `drawSlow`。

⚠ **`t.color(255,255,255,255)` 的坑**：C++ 那 4 个 int 选中 `color(int,int,int,int)`，
而 TS 的 `color(a,b,c,d)` 四参形式是浮点版（内部 `×255`）。照字面抄会算出 `255*255` 再被钳回 255
—— 看着也对、纯属侥幸。必须写 `colorInt`。

**反向验证 15 个变异 15 个红。** 第一次跑有 4 条被**跳过**：`from` 在文件里出现了 2 次，
`mutate.mjs` 的守卫拦下了（改成带上下文的长串才唯一）—— 这道守卫是有用的。

台账 **233 → 225**；`pnpm typecheck` 0；`pnpm test` **99 文件 / 1122 条全过**。

（教训：写测试时把 `Mth.RADDEG` 自己重算成 `f(180/Math.PI)`，而它是 `f(180/f(PI))`，差最后一位；
方向也说反了 —— 它是**弧度转度**。**期望值不要重算，直接用被测的那个常量。**）

### 任务单 G —— G5 完成（2026-10-04）—— `Model` 基类 + `ModelInclude`

`Model.ts` **一行没改** —— G3 落盘时就抄对了，本步是补测试把 6 个字段和 5 个虚函数钉住。

新增 `tests/unit/client/model.test.ts`（7 条）：5 个字段默认值对着 `Model.h:15-21` 逐条核、
⚠ `young` 默认 **`true`**、`cubes` 每实例各一份、四个虚函数真的是空的（不改字段也不画东西）、
`onGraphicsReset` 遍历**全部**部件 / **不**清空 `cubes` / **真的**把部件打回未编译
（最后这条靠 `Tesselator.begin` 的调用次数看，要等 G4 的 `compile` 落地才可观察）。

新增 `ModelInclude.ts`：**此刻没有真 export**，9 条 `#include` 全是注释 ——
2 条 `DEFERRED(Model)`（G7/G9 换成真 export）、6 条 `OMIT(Entity)`、1 条 `DEFERRED(TileEntityRender)`。

⚠️ **推翻了 G0 写在任务单里的一条**："`ModelInclude.h` 在 C++ 里是空的" —— **错的**。
`wc -c` = 407 字节、`grep -c include` = **9**。当初是看 `clean.py` 的输出判断的，
而 **`clean.py` 会把 `#include` 整行删掉**，于是输出里只剩一行标题，看着像空文件。
（⚠ 另外实测 `ChickenModel` 的父类是 `Model` 而**不是** `QuadrupedModel`，所以 G9 不依赖那 4 只没搬的四足兽。）

**反向验证 11 个变异 11 个红**。台账 **225 → 234**；`pnpm typecheck` 0；
`pnpm test` **100 文件 / 1129 条全过**。

（两个自找的坑：① 没有 import/export 的 `.ts` 是"脚本"不是"模块"，`tsc` 报
`TS2306: ... is not a module`，加一句空 `export {}` 解决；② 顺手 `prettier --write` 了 `index.ts`，
它把**整个文件**的行尾符改了 —— 回头核基线才发现**HEAD 上本来就不通过**，于是回滚不动它。
**`--write` 之前先对基线 `--check` 一次。**）

### 2026-10-04 —— 暂停开发，做了一次 token 花费审计 + 两个工具

用户发现"开发过程中 token 消耗过高"，要求自查来源并给出可减的环节。**实测（不猜）：**

transcript 里躺着真实的账：`cost-state` 记录显示**这次会话累计 $537.46**，
3688 次真实 API 请求，**平均每次请求上下文 351k token**（p10=120k，p50=345k，最大 752k），
累计读入 **1.30B**，其中 **99% 是缓存读取**；我自己写出的 token 只占 **0.2%**。

> ⚠️ 第一遍我把请求数算成 40912 次、总量 14B —— **错的**。transcript 里同一条 assistant 消息
> 会因为**流式更新被重复写很多行**（40912 行只对应 3685 个不同的 `message.id`），
> 不去重会把花费算成 11 倍。**分析 transcript 必须先按 `message.id` 去重。**

**成本公式：`花费 ≈ 请求次数 × 平均上下文 × 缓存单价`**（实测每次请求均价 **$0.146**）。
工具调用 4027 次（Bash 2632 = 65%）；内容构成：工具返回 69%、思考 17%、参数 12.5%、正文 0.9%。

**PWF 钩子的 A/B 实测**（用户点名要做的）：让工具调用**交替**开关钩子
（开关 = `task_plan.md` 存不存在，改名即可**当场生效、不用重启**），然后看相邻请求的上下文增量
（`残差 = ctx(i) − ctx(i−1) − 我上一条的输出`，把我的思考量减掉，所以它不构成噪声）。

```
第几次  1     2     3     4     5     6     7     8     9    10    11    12
增量    18   674    18   674    18   674    18   674    18   674    18   719
```

**低簇 6 次均值 18，高簇 6 次均值 682，比值 37.9× → 每次工具调用的钩子开销 = 664 token。**
PreToolUse 那一档挂在 `Write|Edit|Bash|Read|Glob|Grep` 上，**每次调用都重复注入同一份
`task_plan.md`**，而同一份内容 UserPromptSubmit 时刚给过。按 4027 次调用算累计注入约 267 万 token；
按滚动窗口模型估约占会话总读入的 **20%（~$100）**。

（实验途中还撞到两件事：钩子块**不在 `message.content` 里**，它挂在记录顶层的 `toolUseResult`
字段上，而且 **Bash 调用的那块根本没写进 transcript**（Edit 才写）—— 所以"按标记判读哪次带了块"
这条路走不通，最后改成对残差做一维 2-means 聚类。）

**交付两个工具**（都已提交、都做了负向测试）：

- `tools/verify/check.mjs` + `pnpm check` —— **定型检查**：typecheck + 测试 + 台账 + 变异一次跑完，
  **只打印摘要**，完整日志写临时目录。分成 3~4 次跑就是 3~4 次完整上下文重读 ≈ $0.5/步。
  ⚠ 第一版有个 bug：`--mutate A B` 里的 A 和"要跑的测试文件 A"是同一个字符串，按值排除把过滤器
  一起排掉了 —— 给了过滤条件却跑了全量 1129 条。**参数解析必须按位置来。**
  负向测试：故意给个不存在的测试文件，它确实红、退出码 1（不是永远说 ✓ 的假工具）。
- `tools/verify/token-audit.mjs`、`tools/verify/pwf-ab.mjs` —— 算账与钩子 A/B，随时可复跑。

**还没做**：把 PreToolUse 那一档关掉（需要改插件缓存里的 `hooks.json`，或者全关
`PLANNING_DISABLED=1`）—— 这要用户拍板，已把选项和代价报上去。

### 现在剩下的两个大缺口（G 之后的）

1. **`PathfinderMob.updateAi` 整条 OMIT** → 生物"没有 AI"，站着不动。
2. **`MobFactory` / `Sheep`** 那条链没解开（依赖 1）；解开之后 G 里记 `OMIT` 的
   7 只生物的模型与渲染器才能补上。

### G6 `MobRenderer` 完成（2026-10-04，提交 `3266257`）

`packages/client/src/renderer/entity/MobRenderer.ts`（268 行）+ 13 条单测 + `tools/verify/mutations-g6.json`。
**0 条 DEFERRED** —— 用到的 GL 函数 / `Model` / `Font` / `Tesselator` / `OptionId` 在 TS 里都已存在。
台账 **234 → 234**；`pnpm typecheck` 0；`pnpm test` **101 文件 / 1142 条全过**；7 个变异 7 个全红。

踩到的两个坑 `PITFALLS.md` 里本来就有同类条目，这次又各踩一次：
F 节「`vitest` 不做类型检查」（13 条先全绿、`pnpm typecheck` 报 6 处 `noUncheckedIndexedAccess`）、
#17「只写类型的导入等于没导入」（`extends Model` 写成 `import type`）。

下一步 **G7 `HumanoidModel`**（322 行 C++：64×64 现代皮肤分支、`hair`、`renderHand` 的 `arm0`）。

### G7 `HumanoidModel` 完成（2026-10-04，提交 `26dcc0f`）

`packages/client/src/model/HumanoidModel.ts`（291 行）+ 25 条单测 + `tools/verify/mutations-g7.json`。
**0 条 DEFERRED**；顺带把 `model/ModelInclude.ts` 里 HumanoidModel 那条标记换成了真再导出。
台账 **234 → 233**；`pnpm typecheck` 0；`pnpm test` **102 文件 / 1167 条全过**；9 个变异 9 个全红。

踩到的新坑：**`Mth.sin/cos` 查的那张 65536 项表在模块加载时全是 0**，必须先调
`Mth.initMth()`（`NinecraftApp::init` 第一行就是它）。忘了调的症状很怪 —— `-cos(0)*5` 算出 `-0`、
`bcos` 从 0.1f 变成 0.05f，5 条测试挂掉。`tests/unit/util/mth-preinit.test.ts` 正在钉"初始化前就是 0"
这件事，说明这不是 bug 而是设计；已写进单测文件头的 beforeAll。

下一步 **G8 `HumanoidMobRenderer`**。

### G8 `HumanoidMobRenderer` 完成（2026-10-04，提交 `fdf7cba`）

`packages/client/src/renderer/entity/HumanoidMobRenderer.ts`（236 行）+ 16 条单测
+ `tools/verify/mutations-g8.json`。**0 条 DEFERRED**。台账 **233 → 233**（唯一动过的
`ItemInHandRenderer` 那条 `DEFERRED(PlayerRender)` 只是把过时的理由改成"缺 G11 的
`PlayerRenderer` / `setModernSkin`"，条数不变）。`pnpm typecheck` 0；
`pnpm test` **103 文件 / 1183 条全过**；**15 个变异 15 个全红**。

验收比任务单要求的严：任务单只要求断言"调用了 `renderItem` 且变换次数对"，实际用 `SpyGL`
把四路手持物品的每条 `translate/rotate/scale` **逐条对字符串**，披风的 24 个顶点也全列出来逐条对。

踩到的新坑：**`Tesselator.draw()` 自己会发 4 条客户端数组开关**（`drawArrayVTN`），
spy 记到的 op 数组里会多出 `enable:32888, enable:32884, disable:32884, disable:32888` ——
披风那条测试第一版就因为漏了这 4 条挂掉。

另外记两笔：披风那段是 double/float 混着的（`capeX/px/dx` 是 double 不包 `f()`，
`bodyYaw/forward/lift/walk/capeXRot` 是 float 要包）；`ER_HUMANOID` **没有**注册 ——
TS 里没有任何实体用这个渲染器，等 G9/G11 有真调用方再补。

下一步 **G9 `ChickenModel` + `ChickenRenderer`**（鸡是第一个画面上看得见的生物）。

### G9 `ChickenModel` + `ChickenRenderer` 完成（2026-10-04，提交 `9153163`）

第一只画面上看得见的生物。`packages/client/src/model/ChickenModel.ts`（149 行）+
`packages/client/src/renderer/entity/ChickenRenderer.ts`（39 行）+ 14 条单测
+ `tools/verify/mutations-g9.json` + 场景 `tools/verify/scenarios/entity-model.mjs`。
**0 条 DEFERRED**。台账 **233 → 233**（净零：−1 `DEFERRED(Model)`、+1 `ADAPTED(Cpp)`，
`git stash -u` 对 HEAD 实测核对）。`pnpm typecheck` 0；`pnpm test` **104 文件 / 1197 条全过**；
**19 个变异 19 个全红**。

验收：两张截图都打开看过 —— 00 白色鸡身 + 橙色喙 + 红冠 + 黄腿正对镜头；01 原地转 90° 侧身、
喙转向一侧。场景没走任务单建议的 `level.addEntity(new Chicken(...))`（页面里够不到 `Chicken` 类，
`MobFactory::CreateMob` 整条 OMIT，没有造鸡后门），改走真实链路：一帧扔 160 个蛋，
`(7/8)^160 ≈ 5e-10` 必出鸡，孵化后 `moveTo` 到镜头前定格。

踩到的新坑：**测试里建 `EntityRenderDispatcher`（以及任何 `new 模型()`）之前要先铺 GL 上下文** ——
`ModelPart` 的构造要 `glGenBuffers`，无上下文时 `gles.ts` 抛。G9 的注册一次连带伤了 21 条旧测试，
修的是测试环境（3 个文件补 `glSetContext(new GLES1(null))`、particle-take 的假 GL 补 `genBuffers`），
**断言一个没动**（真机 GL 本就先于分派器）。另一条：**`initItems()` 之前必须先 `initTiles`**
（测试里 `createFlatLevel()`），`initItems` 读 `Tile.grass.id`。两条都补进了 PITFALLS F 节。

下一步 **G10 `TntRenderer` / `PaintingRenderer` / `TripodCameraRenderer`**（+注册）。

### G10 `TntRenderer` / `PaintingRenderer` / `TripodCameraRenderer` 完成（2026-10-04，提交 `6aea16c`）

三个渲染器 + 两行注册。`TntRenderer.ts`（81 行）+ `PaintingRenderer.ts`（116 行）+
`TripodCameraRenderer.ts`（108 行）+ 24 条单测（9 / 6 / 9）+ `tools/verify/mutations-g10.json`（23 条）
+ 场景 `tools/verify/scenarios/g10-renderers.mjs`（25 条断言）。三个实现文件 **0 条 DEFERRED**。
台账 **233 → 233**；`pnpm typecheck` 0；`pnpm test` **107 文件 / 1221 条全过**；**23 个变异 23 个全红**。

⚠ **`TripodCameraRenderer` 照 C++ 不注册** —— `EntityRenderDispatcher.h:55` 只有一行注释掉的成员
`//TripodCameraRenderer tripodCameraRenderer;`，assign 列表里没有它，**原版画面上相机实体就是隐形的**。
单测第一条钉死"渲染表里没有它"；场景里相机实体挪到镜头正前方 4 格、画面空空 —— 那张"相机截图"就是
"没注册渲染器"的视觉证据（不是 bug）。
（更正：G10 提交说明初版写"3 个新测试文件（35 条）"，实测 **24 条** —— vitest 报告 24 passed、
总测试 1197 → 1221 正好 +24；已 amend 修正，`7962f0d` → `6aea16c`。）

验收：4 张截图都打开看过 —— 00 TNT 正常态（悬浮方块）；01 引信拨到 0：`g = 0.9⁴ ≈ 0.656` →
放大 ~1.2 倍 + 半透明白光泛白；02 石墙正中的画（这轮随机到 2×2 蜘蛛画，正好走多块循环）；
03 相机隐形（画面空空）。点燃走**真实链路**：打火石塞热键 0 → `gameMode.useItemOn` →
`TntTile.destroy` → `PrimedTnt`（断言 life=80、原方块清空）。

踩到的新坑：**pause 后加入的实体 `xOld` 停在 0**（渲染插值读 `xOld`，它只在 `_init` / `moveTo` /
存档 / `Level::tick` 里同步）→ 画不可见。实测断言 `xoldBefore === 0` 坐实根因；药方是原版路径
`level.tickEntity(e, false)`（C++ `Level::tick(e, false)`，只同步不 tick）。**实现与 C++ 一致，
是场景造出的处境**。另两条测试坑（`vi.spyOn` 默认 call-through 要 `.mockImplementation(() => {})`；
`SpyGL` 子类要显式 `constructor() { super(null); }`）一并补进 PITFALLS F 节。

### G11 玩家 + 空手手臂 完成（2026-10-04，提交 `8c01c9e`）

`PlayerRenderer.ts`（154 行，0 条 DEFERRED）+ 21 条单测 + `mutations-g11.json`（30 条）+
场景 `g11-player.mjs`（6 条断言）+ 接线（ERD 注册与 setModernSkin、`MobRenderer.setArmor`、
IIH 空手支）。台账 **233 → 231**；`pnpm typecheck` 0；`pnpm test` **108 文件 / 1242 条全过**；
**30 个变异 30 个全红**（mutate.mjs 修好后真跑 2m43s）。

验收：两张截图打开看过 —— 00 第三人称背后视角（自己站在草地上，头/身/手臂/腿齐全、Steve 皮肤）；
01 第一人称空手（右臂伸在右下角）。切第三人称走 `options.toggle(2)`（= 按 F5 那句）；
手臂支：清空物品栏 → 等 `IIH.tick` 把 `item.id` 清 0 → 断言 id===0 再截图。

⚠ **新踩的"画错了图"**：`assets.ts` 预加载表漏 `mob/char.png` → `loadTexture` 返回 `InvalidId`
（永久记进 idMap）→ `bind` 跳过 → 沿用 terrain 图集 → 玩家全身画成地形图（头顶草地绿、
身上羊毛色块）。补齐后复验皮肤正常。这类坑 assets.ts 里已有 5 条同类注释，这是第 6 次。

⚠ **mutate.mjs 的 Windows 假阳性**（提交 `c923422`，单独一笔）：`execFileSync('npx')` 没带
`shell` → Node 从 CVE-2024-27980 起拒绝执行 .cmd → 立即 ENOENT → 每条变异"立即红"，
一次测试都没跑（30 条 0.3 秒"全过"）。修复后 G11 真跑 2m43s、G10 真跑 1m58s 全红。
**G2–G9 的 10 份清单尚未重跑，"全红"结论存疑**（等用户定夺）。

下一步 **G12 收尾**（7 只生物的 `OMIT(Entity)`、PITFALLS 模型几何节、台账与文档）。

### G2–G9 变异补跑（2026-10-04）—— 98/102
mutate.mjs 修好后**首次真跑**（每条 ~5–6s）：g2 9/10(61s) · g3 15/16(93s) · g4 14/15(86s) ·
g5 11/11(62s) · g6 7/7(40s) · g7 9/9(52s) · g8 14/15(83s) · g9 19/19(325s)。
日志：`%LOCALAPPDATA%/Temp/mcpe-g2g9/*.log`（g2–g9 各一份 + extra.log）。

**四条没抓住，逐条定性（都实测过）**：
- g2 M1「us 少包一层 fround」= **等价变异**：去掉外层 fround 的差 ~1e-12，被后续 `f(f(uu/texW) − us)` 的
  fround 吸收。数值实测：texW 16/32/64 × 4097 个 uu 采样点，最终 u **零差异**。
- g3 M12「assign 忘了 clear」= **等价变异**：clear() 只做两件事（清 this.cubes、setModel(null) 摘旧 model），
  后面 `this.cubes = rhs.cubes.slice()` 与 `this.setModel(rhs.model)` 各重做一遍，删掉看不出来。
- g4 M7「render 旋转分支不递归子部件」= **真盲区**：唯一的子部件测试用无旋转父部件（走别的分支）。
  拿整份 `tests/unit/client` 跑这条变异**仍然绿**。
- g8 M8「forward 夹下限 < 0 改成 <= -1」= **真盲区**：唯一的 forward 测试用 -1000（两版都夹）。
  同样全目录仍绿。C++ 是 `< 0`，(-1,0) 区间没测。

**已处置（2026-10-04，用户拍板「补完再开 G12」，提交 `b63c02c`）**：g4/g8 各补一条新测试
（旋转父部件的子部件递归、forward 的 (-1,0) 区间）、g2/g3 两条等价变异换成改得出差异的，
重跑四份清单：g2 10/10 · g3 16/16 · g4 15/15 · g8 15/15 —— **102/102 全红**。
`pnpm check`：类型 ✓ / 108 文件 1244 条 ✓ / 台账 231。接下来开工 G12。

### G12 收尾完成（2026-10-04，提交 `f32535b`）—— 任务单 G 到此结束

**7 只没实体的生物的渲染器注册逐条记标记**（`EntityRenderDispatcher.ts` 构造末尾）：C++ 第 43–51 行
挨着的九行 `assign`，除第 46 行（鸡，G9 已做）外的八行 —— `ER_HUMANOID_RENDERER`（cpp:43）记
`DEFERRED(Entity)`（侦察实测它不是死代码：`Monster.cpp:15` 把它当基类默认渲染器；零件
`HumanoidMobRenderer` + `HumanoidModel` 已齐，等实体侧一起注册）；猪/牛/羊/骷髅/僵尸/苦力怕/蜘蛛
（cpp:44/45/47/48/49/50/51）各一条 `OMIT(Entity)`，带 C++ 原句与行号。苦力怕、蜘蛛的模型不在
`ModelInclude.h` 里（各自渲染器直接 include），只记在分派器这。原来那条笼统的 `DEFERRED(EntityRender)`
（八行挤在一起）删掉，文件头第 6 行同步改写。

`ModelInclude.ts` 复核（rg）：仍是 6 条 `OMIT(Entity)`（牛/猪/羊/羊毛/僵尸/骷髅）+ 1 条
`DEFERRED(TileEntityRender)`（SignModel），G5 记的那批无遗漏。

`PITFALLS.md` 新增 `## G. 模型几何（任务单 G 教我的）`：`compile` 外层 6 遍循环被内层
`unsigned int i` 遮蔽（写 144 个顶点只画 36 个，画面是对的 —— 原样照抄）、`Cube` 成员遮蔽
（成员=没外扩的值、顶点=外扩后的局部值，`swap` 改的是局部）、六面 UV 与 Java 版 `ModelBox` 不同
（第 3 行顶面 v 反、第 6 行 +z 面 u 多跨一格）、`ModelPart::assign` 是"拷进现有对象"而非"换对象"。

台账 **231 → 238（+7 = 删 1 条 + 新增 8 条）**。`pnpm check` 当场实测：类型 ✓ / 测试 108 文件
1244 条 ✓ / 台账 238 ✓。本步**无代码逻辑改动**（只动注释与文档）。
### 仓库清理（2026-10-04）—— 删掉两个纯产物目录

用户勾选确认后删除（都在 .gitignore 里，不进 git 历史）：

- `tools/verify/out/`（9.2MB，22 个场景目录 / 78 张历次验证截图）—— 安全：`smoke.mjs:41` 每次
  跑场景都 `mkdirSync(outDir, { recursive: true })` 自己重建。
- `.bootstrap-backup/`（559KB，388 个文件 / 9 份 2026-09-22 初始化当天的根配置快照）——
  git 历史已完整覆盖，快照本身没用了。

**用户选择保留**：`apps/*/dist` + 15 个 `*.tsbuildinfo`（约 2.2MB，下次 build/typecheck 自动重建的缓存）。
其余未动：`node_modules/`、`.codegraph/`、docs 两份 HTML 手册、`docs/ai/` 任务单、PWF 三件套、
`apps/server/`（占位服务器，文件头写明其用途）。

删除后被跟踪文件零变化（`git status` 空，无需提交）；`pnpm check` 当场实测全绿：
类型 ✓ 17.4s / 测试 **108 文件 1244 条** ✓ / 台账 **238** ✓，退出码 0。
