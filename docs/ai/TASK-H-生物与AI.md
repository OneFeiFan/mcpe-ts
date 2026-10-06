# 任务单 H：生物 AI、生物工厂与 7 种生物

目标：世界里的鸡会走动；猪、牛、羊、僵尸、骷髅、苦力怕、蜘蛛能被创建、能看见、会按原版的 AI 行动；最后接上自然刷怪。
规模（`wc -l` 实测，C++）：寻路 861、旧 AI 313、动物 677、怪物 1069、工厂/类别/刷怪 525、模型 679、渲染器 218，合计约 **4300 行**。
台账基线：**232**（2026-10-06）。

**一次只做一个步骤**；每步结束：`pnpm typecheck && pnpm test` 通过、台账不升（或说明为什么升）、提交、在本文件把这一步标成完成。

---

## H0 侦察结论（Claude 已完成，开工前通读）

### 1. 这一版有两套 AI，**真正运行的只有旧的那套**
- `Mob::aiStep` 里：`if (useNewAi()) newServerAiStep(); else updateAi();`（Mob.cpp，网页版分支）。
- `Mob::useNewAi()` 默认返回 false；唯一可能返回 true 的是 `Zombie`（`_useNewAi`，只有 `setUseNewAi` 能改），
  而唯一调用 `setUseNewAi` 的 `Level::setZombieAi` **在 Level.cpp:1429 被注释掉了**（`//setZombieAi(zombies);`），
  `NumSmartZombiesPerPlayer` 也是 0。`PigZombie::useNewAi()` 直接返回 false。
- **结论**：`world/entity/ai/` 下的新 AI（GoalSelector、Goal、MeleeAttackGoal、RandomStrollGoal、TargetGoal、HurtByTargetGoal、
  NearestAttackableTargetGoal、BreakDoorGoal、DoorInteractGoal、PathNavigation、MoveControl、JumpControl、Sensing、RandomPos，共 1179 行）
  **在这一版里永远不会执行**。只有 `Zombie` 构造函数会 new 出这些对象。
  → **用户 2026-10-06 决定：新 AI 也要移植**（这一版处在测试阶段，新旧两套并存，保留完整以便日后启用）。
  新 AI 放在 H11 单独做；移植后行为仍与原版一致——因为没人打开 useNewAi，它照样不执行，但可以单独测试（单元测试直接驱动 goal）。
- 真正要做的 AI：`PathfinderMob::updateAi`（旧 AI，找目标、按路径走、随机闲逛）+ `Level::findPath`（PathFinder）。

### 2. 随机数是做黄金样本的最大障碍
- C++ `Mth::random()` / `Mth::random(n)` 用 `Mth.cpp` 里的 `static Random _rand`，种子是 `getTimeMs()`；
  每个实体还有自己的 `random` 成员。
- TS 的 `Mth.random()` 现在是 `Math.random()`，`Mth.random(n)` 是 `Math.random() * n | 0`——
  **与 C++ 的 `nextInt(n)`（梅森旋转 + 拒绝采样）不是同一个分布，更不是同一个序列**。生物 AI 大量调用它们，
  不改就做不了任何“行为”黄金样本。→ 见 H1。
- 现有测试里有 7 个文件、12 处 `vi.spyOn(Math, 'random')`，H1 要一并改。

### 3. 渲染器与模型（EntityRenderDispatcher.cpp:43-51 实测）
| 生物 | 渲染器 | 模型 | 阴影 |
|---|---|---|---|
| 猪 | `PigRenderer`（头文件里实现） | `PigModel(0.5)`，第二个模型传 NULL | 0.7 |
| 牛 | 通用 `MobRenderer` | `CowModel` | 0.7 |
| 羊 | `SheepRenderer` | `SheepModel` + `SheepFurModel` | 0.7 |
| 骷髅 | `HumanoidMobRenderer`（已有） | `SkeletonModel` | 0.5 |
| 僵尸 | `HumanoidMobRenderer`（已有） | `ZombieModel` | 0.5 |
| 苦力怕 | `CreeperRenderer`（头文件里实现） | `CreeperModel` | — |
| 蜘蛛 | `SpiderRenderer`（头文件里实现） | `SpiderModel` | — |
猪、牛、羊的模型都继承 `QuadrupedModel`。`PigZombie` 也在 `MobFactory` 里，但它的渲染器没有注册（只在下界反应堆里出现），本任务单只移植实体类。

### 4. 已经有的
`Mob`、`PathfinderMob`（字段和非 AI 部分）、`AgableMob`、`Animal`、`Chicken`（含模型和渲染器）、`Arrow`（骷髅射箭要用）、
`Explosion`（苦力怕要用）、`MobRenderer`、`HumanoidMobRenderer`、`HumanoidModel`、`EntityFactory`、`MobCategory`。

---

## H1 Mth.random 改成与 C++ 同构（ADAPTED 改为 1:1）——✅ 已完成（2026-10-06，Claude）

完成情况：`Mth.ts` 新增模块级 `_mthRand`（`new Random(getTimeMs())`），`random()` / `random(n)` 改走 `nextFloat()` / `nextInt(n)`；
7 个测试文件的 12 处 `vi.spyOn(Math, 'random')` 换成 `tests/helpers/mthRandom.ts` 的 `mockMthRandom(v)`（保留原语义 `(v*n)|0`，断言一条没改）；
新增 `tests/unit/util/mth-random.test.ts`（2 条）。全部 111 文件 / 1259 条通过；default 场景 21 条断言通过。

原计划：
- `packages/util/src/Mth.ts`：模块级 `const _rand = new Random(getTimeMs())`；`random()` → `_rand.nextFloat()`，`random(n)` → `_rand.nextInt(n)`。
  导出一个**只给测试和 harness 对照用**的 `Mth._setRandomSeed(seed)`（文件头注明 ADAPTED(Test)）。
- 先 `grep -rn "spyOn(Math, 'random')" tests` 找出 7 个文件，逐个改成 `Mth._setRandomSeed(…)` 或对 `Mth.random` 打桩。
  **改测试前先读懂那条断言在测什么**；断言值变了要能解释（序列换了），不能为了变绿改期望值而不解释。
- 验收：全部测试通过；新增单测：`_setRandomSeed(42)` 之后 `Mth.random()` 前 5 个值与 `new Random(42).nextFloat()` 前 5 个值相同。

## H2 寻路：Node、BinaryHeap、Path、PathFinder（861 行，四个头文件 + Path.cpp）——✅ 已完成（Claude）

完成情况：四个类 + `Level.findPathToEntity` / `findPathToTile`（R10）。**G16-1：12 条路径（缺口、关着/能开的门、台阶、栅栏、进水/避水、坑、岩浆旁、超距离、以实体为目标）逐节点与 C++ 一致**，首次即通过。
原样保留的怪癖写在 PathFinder.ts 文件头（isFree 从不返回 TYPE_WALKABLE、水中起点会永久关掉 avoidWater 等）。

原计划：
- 目录：`packages/world/src/level/pathfinder/`。`PathFinder.h` 是整个实现都写在头文件里（394 行），照搬。
- `BinaryHeap` 是数组实现的最小堆，**比较与上浮下沉的细节决定了同代价节点的出队顺序**，必须逐句照抄（不要换成通用优先队列）。
- `Node` 的哈希（`createHash`）用于 `std::map` / 自己的哈希表：照抄位运算，注意 `int` 溢出（PITFALLS 第 4 条）。
- `Level.findPath` 两个重载（Level.cpp:381、404，R10 情形 B：`findPathToEntity` / `findPathToPos`）+ `_pathFinder` 字段，替换 Level.ts 里的 3 条标记。
- **黄金样本 G16-1**（必须）：harness 用 `GoldenStorage + EmptyDimension`（照 `harness_collision.cpp`）搭一个场地：
  平地、一堵带缺口的墙、一级台阶、一片水、一个两格深的坑。用一个固定位置的 `Chicken` 当寻路主体，
  对 6–8 个目标点调用 `level->findPath(&path, mob, x, y, z, maxDist, false, false)`，输出每条路径的节点序列 `(x,y,z)` 与长度。
  TS 搭同样的场地逐个比较（第一档：完全相等）。
- 验收：G16-1 通过；台账 −3。

## H3 旧 AI：PathfinderMob（248 行 .cpp）——✅ 已完成（Claude）

完成情况：`updateAi`、`findRandomStrollLocation`、`isPathFinding`、`setPath`。**G16-2：三只鸡 400 刻**——位置与 C++ 最大相差 2e-6、y 完全一致、
着地与是否在寻路 1200 条记录逐条一致；朝向最大相差 1.1e-4 度（离路径点很近时角度对位置差敏感），角度容差定为 1e-3 度。
过程中修了 `Mob.updateAi` 缺的 float 截断（0.02f / 0.05f / 0.8f 的比较、yRotA、yRot 累加）。harness 的随机数：`objcopy` 把 `Mth::random` 变成弱符号、由 harness 给出可设种子的版本。
浏览器：demo 世界放 4 只鸡，40 秒后 4 只都走动了（截图已查看）。

原计划：
- 恢复 `PathfinderMob.ts` 里的 `OMIT(MobAI)`：`isPathFinding`、`setPath`、`updateAi`、`findRandomStrollLocation`、`getNavigation`（返回 null，见 H0）。
- `updateAi` 里用到的 `findAttackTarget`、`checkHurtTarget`、`getWalkTargetValue`、`shouldHoldGround` 等虚函数：确认基类默认实现，子类在后面步骤里重写。
- **黄金样本 G16-2**（必须）：同一个场地，一只 `Chicken`（实体 `random.setSeed(固定值)`，`Mth` 的 `_rand` 在 harness 里把 `getTimeMs` 桩成常数）
  跑 200 刻 `tick()`，每刻输出位置、`yRot`、`onGround`、是否在寻路。TS 用 `Mth._setRandomSeed` 与同样的实体种子回放，第二档（1e-4）比较位置、第一档比较标志。
  （harness 里 Mth 的种子：在 harness 里给出 `getTimeMs()` 的定义并返回常数，不链接 platform/time.cpp。）
- 浏览器场景 `chicken-walk.mjs`：放 3 只鸡，等 10 秒，断言至少两只的位置变了，截图看它们没有卡进方块。
- 验收：G16-2 通过；场景通过并看过截图。**做完这一步，鸡就会走了。**

## H4 MobFactory + Level.getMob——✅ 已完成（Claude）

完成情况：MobFactory 9 种生物全部接上；EntityFactory 读存档里的生物走它；Level.getMob。单测：存下的猪读回来还是猪。

- `world/entity/MobFactory.h`（90 行）：`CreateMob(mobType, level)` 的 switch。先只接已有的 `Chicken`，其余分支标 `DEFERRED(Entity)`，在 H5–H8 逐个解开。
- `EntityFactory` 里创建生物的分支（存档读回生物时用）改走 `MobFactory`。
- `Level.getMob`（Level.cpp:1064，`OMIT(Mob)`）恢复。
- 验收：单测：存档写出一只鸡、读回来还是鸡（类型、位置、生命值）。

## H5 四足模型 + 猪、牛（模型 270 行、实体 149 行）——✅ 已完成（Claude）

完成情况：Pig、Cow、QuadrupedModel、PigModel、CowModel、PigRenderer；注册 humanoid/猪/牛渲染器；预加载 9 张生物贴图。

- `QuadrupedModel`、`PigModel`、`CowModel`；`Pig`、`Cow`；`PigRenderer`（头文件实现）；在 `EntityRenderDispatcher` 注册 `ER_PIG_RENDERER`、`ER_COW_RENDERER`。
- 模型几何：在 `harness_model.cpp` 里加这三个模型，`REF=… bash tools/golden/build.sh model`，`model.golden.test.ts` 照 ChestModel 那组加比较。
- 猪的鞍（`PigRenderer` 第二个模型传 NULL）：照 C++ 不画。
- 贴图 `mob/pig.png`、`mob/cow.png` 加进 `assets.ts`（PITFALLS 第 25 条）。
- 验收：模型样本通过；场景截图里猪和牛看得见、会走。

## H6 羊（实体 253 行 + 模型 + 渲染器）——✅ 已完成（Claude）

完成情况：Sheep、SheepModel、SheepFurModel、SheepRenderer；DyePowderItem 给羊染色恢复。

- `Sheep`（毛色、剪毛、吃草长毛）、`SheepModel`、`SheepFurModel`、`SheepRenderer`。
- 解开 `DyePowderItem` 里给羊染色的那条 `DEFERRED(Entity)`；剪刀剪羊（`ShearsItem`）检查是否已有调用点。
- 毛色表 `Sheep::COLOR`（float 数组）逐个 `Math.fround`。
- 验收：模型样本；单测：染色、剪毛掉落羊毛的数量范围；场景截图。

## H7 Monster 基类 + 僵尸、蜘蛛（Monster 144、Zombie 129、Spider 137）——✅ 已完成（Claude）

完成情况：Monster、Zombie（新 AI 的构造语句仍 DEFERRED(MobAI)，等 H11）、Spider、ZombieModel、SpiderModel、SpiderRenderer。

- `Monster`：`findAttackTarget`（找最近玩家）、`checkHurtTarget`、`isDarkEnoughToSpawn`、白天燃烧（在 `Mob`/`Zombie` 里，确认位置）。
- `Zombie`：构造函数里 new 新 AI 的那几行按 H0 标 `OMIT(MobAI)`；`useNewAi()` 照抄返回 `_useNewAi`（恒为 false）。
- `Spider`：爬墙（`onClimbable` 依据 `horizontalCollision`）、跳扑、白天中立。`SpiderModel`、`SpiderRenderer`（眼睛发光那一遍：查 C++ 怎么设混合模式）。
- `ZombieModel`（继承 HumanoidModel，手臂前伸）。
- 难度：`Difficulty.PEACEFUL` 时怪物 `remove()`（看 Monster::tick）。
- 验收：模型样本（Zombie、Spider）；单测：僵尸在 16 格内找到玩家并产生路径、贴身时造成伤害；场景：夜晚放一只僵尸，几秒后靠近玩家。

## H8 骷髅、苦力怕（Skeleton 107、Creeper 114）+ PigZombie（138，只做实体）——✅ 已完成（Claude）

完成情况：Skeleton、Creeper、PigZombie、SkeletonModel、CreeperModel、CreeperRenderer；C++ 的 9 个生物渲染器全部注册。

- `Skeleton`：远程射箭（用已有的 `Arrow`），`SkeletonModel`（细胳膊腿）。
- `Creeper`：`swell` 计时、靠近玩家时膨胀、爆炸（已有的 `Level.explode`），`CreeperModel`、`CreeperRenderer`（膨胀时的闪白与缩放）。
- `PigZombie`：实体类本身 + `MobFactory` 分支；渲染器不注册（与 C++ 一致）。解开 `NetherReactorTileEntity` 里生成僵尸猪人的 `DEFERRED(Mob)`。
- 验收：模型样本（Skeleton、Creeper）；单测：苦力怕 swell 到 30 刻爆炸、爆炸破坏方块；骷髅射出的箭方向；场景截图。

**H4–H8 的验证**：模型黄金样本扩到 13 个模型（8 个生物模型的部件位置、旋转、贴图尺寸、可见性、每个面的 UV 与 C++ 逐位一致）；
`tests/unit/world/mobs.test.ts` 15 条（工厂、僵尸追踪与近战、苦力怕 30 刻爆炸、骷髅射箭方向与 3 秒冷却、羊剪毛与染色）；
浏览器截图：9 种生物同屏，模型与贴图正确。全部 114 文件 / 1297 条通过。

## H9 自然刷怪：MobSpawner + MobCategory + 生物群系的刷怪表（MobSpawner 284 行）——✅ 已完成（Claude）

完成情况：MobSpawner 全部函数（tick 里 `goto chunkLoop` 用带标签的 continue 还原“从头再轮一遍”）、Level.getRandomMobSpawnAt、Level.tick 每 2 刻刷怪、
tickEntities 的僵尸登记（setUseNewAi(false)）、下界反应堆生成僵尸猪人。Level 不能值导入 MobSpawner（会经 MobFactory 形成加载循环），改为 MobSpawner 加载时注入 `Level.mobSpawnerTick`（ADAPTED(ESM)）。
单测 mobspawner.test.ts 6 条（位置规则、addMob、固定种子的幼崽、开关、白天刷动物、夜里围绕玩家刷怪物且 ≥24 格）。
说明：只有生存世界刷怪（LevelData::spawnMobs = gameType == Survival）；平坦 demo 维度永远是白天（Dimension 基类，与 C++ 一致），所以 demo 世界里不会刷出怪物。
postProcessSpawnMobs 的调用点在 RandomLevelSource.postProcess（地物生成，尚未移植）里，目前没人调用。


- `MobSpawner::tick`（Level.cpp 里 `DEFERRED(MobSpawner)` 那一整块）、`isSpawnPositionOk`、`addMob`（也被 NetherReactor 用）、`postProcessSpawnMobs`（生成区块时放动物）。
- `Biome` 的 `getMobs(category)` 刷怪表：检查 TS 里是否已有数据（Biome.ts:44 有类型），没有就照 Biome.cpp 补。
- `Level.getRandomMobSpawnAt`（`OMIT(MobSpawner)`）恢复。
- 选项 `levelData.getSpawnMobs()`：确认来源。
- 验收：单测：固定种子下一次 tick 的刷怪结果（数量、类型、位置）——能做黄金样本更好（G16-3，harness 用固定种子的 Level）；
  场景：新建普通世界，跑 30 秒，世界里出现动物；夜晚出现怪物。

## H11 新 AI（目标系统，1179 行）——用户决定要移植——✅ 已完成（Claude）

完成情况：ai/ 下 15 个文件全部移植（R10：PathNavigation 的 createPath/moveTo 重载 → ToPos/ToMob/ToPath；RandomPos 返回 Vec3|null）；
Mob 的新 AI 字段与 tick 链、PathfinderMob 的 sensing/navigation/getNavigation、Zombie 构造里的两个 selector 与两个控制、Level.setZombieAi（调用点照 C++ 注释掉）。
单测 new-ai.test.ts 5 条：GoalSelector 的优先级与控制位（含“同一刻里先加入的低优先级 goal 会先启动、下一刻才被挤掉”这一原版细节）、
MoveControl 每刻最多转 30°、tickEntities 每刻把僵尸的新 AI 重置为关、**强制打开后僵尸会选中玩家、追过去并打到**。
台账 MobAI 只剩 1 条（析构函数，JS 没有）。

- 文件：`world/entity/ai/` 下全部：`Sensing`、`control/Control`、`MoveControl`(.h/.cpp)、`JumpControl`、`goal/Goal`、`GoalSelector`、
  `MeleeAttackGoal`、`RandomStrollGoal`、`BreakDoorGoal`、`DoorInteractGoal`、`goal/target/TargetGoal`、`HurtByTargetGoal`、
  `NearestAttackableTargetGoal`、`util/RandomPos`、`PathNavigation`。目录 `packages/world/src/entity/ai/`。
- 接线：Mob.ts 的 14 条 `DEFERRED(MobAI)`（字段、getMoveControl/getJumpControl、newServerAiStep 里的 tick 链）、PathfinderMob 构造里的 sensing/navigation、
  Zombie 构造里的 goal、`Level.setZombieAi`（照 C++ 保留：调用点在 Level.cpp:1429 被注释掉，函数本身移植）。
- 验证：单元测试直接驱动：`GoalSelector` 的优先级与互斥位（`canUseInSystem`/`setRequiredControlFlags`）、`MeleeAttackGoal` 追到目标、
  `RandomStrollGoal` 用 `RandomPos` 选点、`PathNavigation` 走完路径、`MoveControl` 的转向限速；并在测试里 `setUseNewAi(true)` 跑一只僵尸，看它会追玩家。
- 验收：台账 `DEFERRED(MobAI)` 清零；正常游戏行为不变（`useNewAi` 仍为 false）。

## H10 收尾——✅ 已完成（Claude）

完成情况：ModelInclude 的 6 条 OMIT(Entity) 改为真正的再导出；PITFALLS 新增第 29–35 条（H 节）；台账 232 → **181**。
剩下与生物有关的只有：TripodCamera 拍照（`LevelRenderer.takePicture`，OMIT(Entity)）、PathfinderMob 析构（OMIT）。
地物生成（RandomLevelSource.postProcess：树、矿、花草，以及它调用的 MobSpawner.postProcessSpawnMobs）不在本任务单内。

原计划：
- Mob.ts 的 14 条 `DEFERRED(MobAI)` 统一改为 `OMIT(MobAI)`，注释引用 H0 的依据（Level.cpp:1429、Mob.cpp 的 useNewAi 分支）。
- 更新 `PITFALLS.md`：随机数（H1 的经验）、寻路的堆顺序、其他新坑。
- 写“任务单 H 完成”章节：每步提交号、台账变化、剩余缺口（新 AI 整体、死亡界面等）。

---

### 每一步提交前的自检
- [ ] 读 C++ 用的是 `clean.py`（网页版分支），没有误读被 `#ifdef` 掉的代码
- [ ] PITFALLS 逐条过了一遍；`divs.py`、`shadow.py` 跑过
- [ ] 新的随机数调用都走 `Mth.random` / 实体自己的 `random`，**没有直接用 `Math.random`**
- [ ] 新纹理加进了 `assets.ts`
- [ ] 需要的黄金样本通过；旧夹具没变（`git diff --stat fixtures/golden`）
- [ ] 有画面的：跑了场景并看过截图
