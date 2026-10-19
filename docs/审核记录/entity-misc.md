# world/entity：小文件组

AgableMob、EntityEvent、EntityFactory、EntityPos、EntityRendererId、EntityTypes（共约 336 行）。
第 2 批的一部分；一次提交。工作表逐行结论如下。

## 后续补充：MobCategory.ts（55 行，11 个函数）

第 2 批续审，无代码修改。

| 函数 / 成员                                | 结论                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `initMobCategories()`                      | 一致（monster/creature 刷怪材质 air，waterCreature 为 water；调用时机仍由 `NinecraftApp::init` 保证）                                         |
| 三个静态实例与 `values[]` / `numValues`    | 一致（`monster(10,20,false)`、`creature(10,15,true)`、`waterCreature(5,10,true)`；`numValues = values.length` 等价于 C++ 的 `sizeof/sizeof`） |
| `getBaseClassId()`                         | 一致（`_baseClassId`，取自 `MobTypes::Base*`）                                                                                                |
| `getMaxInstancesPerChunk()`                | 一致（`_max`）                                                                                                                                |
| `getMaxInstancesPerLevel()`                | 一致（`_maxPerLevel`）                                                                                                                        |
| `getSpawnPositionMaterial()`               | 一致（构造时 NULL → TS `null`；初始化后为 air/water）                                                                                         |
| `isFriendly()`                             | 一致（`_isFriendly`）                                                                                                                         |
| `setMaterial(const Material*)`             | 一致（私有，只被 `initMobCategories` 用非空材质调用；C++ 的 const 方法 + mutable 字段在 TS 里是普通私有字段）                                 |
| （工作表第 7 行）`_isFriendly(isFriendly)` | 不是方法：这是 C++ 构造函数初始化列表的一项，已由 TS 构造函数的参数属性对应                                                                   |

身份比较（C++ 比较实例地址）在 TS 里仍是对象身份比较，符合文件头注释。
既有 `tests/unit/world/s4-batch.test.ts` 已覆盖 `values` 长度、刷怪材质、`isFriendly` 与
`getMaxInstancesPerChunk`；其余 getter 是一行返回字段，无需新增测试。

## 结论

`MobCategory.ts` 审核完成：全部一致，无修改、无新增 DEFERRED/OMIT，台账不变。

## AgableMob.ts（7 行）

| 函数                                   | 结论                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgableMob(Level*)`                    | **已修 W10**：`setAge(0)` 改为 `AgableMob.prototype.setAge.call`（C++ 的 `setAge` 不是 virtual，构造期间不派发到子类）；`age = -1 → setAge(0)` 的“出生即成年”怪癖照抄 |
| `getAge()`                             | 一致                                                                                                                                                                  |
| `setAge(int)`                          | 一致（`age<0→>=0` 清 ISBABY、反向置位；`DATA_FLAGS_ID=14`、位号 0）                                                                                                   |
| `addAdditonalSaveData(CompoundTag*)`   | 一致（先 super，再 `putInt("Age", getAge())`）                                                                                                                        |
| `readAdditionalSaveData(CompoundTag*)` | 一致（先 super，再 `setAge(getInt("Age"))`）                                                                                                                          |
| `aiStep()`                             | 一致（先 super；`age<0` 加 1、`age>0` 减 1）                                                                                                                          |
| `isBaby()`                             | 一致（服务端 `age<0`，客户端读同步标志，两条路原样）                                                                                                                  |

非虚的 `getAge` / `setAge` 在普通方法里的调用仍是动态写法；当前没有子类重写，结果相同，
与项目既有写法一致（只把构造函数这一处改成静态调用）。

## EntityEvent.ts

10 个常量（JUMP=1 … EAT_GRASS=10）逐一核对，一致。

## EntityFactory.ts

| 函数                               | 结论                                                                                                                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateEntity(int, Level*)`        | 一致（7 个 case 与 C++ 顺序、类型一致；未识别 id 返回 null）                                                                                                                                                         |
| `loadEntity(CompoundTag*, Level*)` | 一致（tag 为空/无 `id` 返回 null；`id<0` 打 LOGE 且原文含 `MobFactory::loadEntity`；`id<64` 走 `MobFactory.CreateMob`，其余走 `CreateEntity`；`load` 后对 `isItemEntity()` 做空/负数/越界/未注册检查，不合法则丢弃） |

C++ 的 `delete e` 在 TS 里是置 null 由 GC 接管（无行为差异）。

## EntityPos.ts

| 项目                                   | 结论                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 三个构造函数的分支与 `rot`/`move` 标志 | 一致                                                                                                            |
| 五个 float 字段                        | **已修 W10**：`x/y/z/yRot/xRot` 赋值全部补 `f()`（C++ 形参与字段都是 float）                                    |
| 未初始化字段                           | ADAPTED：C++ 的 `(x,y,z)` 不初始化 `yRot/xRot`、`(yRot,xRot)` 不初始化 `x/y/z`（UB），TS 统一取 0，代码里已注明 |
| 工作表的 `move(false)`                 | 工作表误报：`move` 是字段，不是函数                                                                             |

## EntityRendererId.ts

21 个枚举值（`ER_DEFAULT_RENDERER` … `ER_FALLINGTILE_RENDERER`）顺序与数值一致。

## EntityTypes.ts

`BaseTypes`、`EntityTypes`、`MobTypes`、`ParticleType` 全部数值与 C++ 一致。
`export declare namespace ParticleType` 只为提供 C++ 嵌套类型 `ParticleType::Id`，编译后不产生代码（ADAPTED）。

## 验证

- 新增 `tests/unit/world/entity-misc-audit.test.ts` 2 条，修复前全部红（EntityPos 存 double；子类重写
  `setAge` 在构造期间被调用了 1 次）。
- `pnpm check`：类型 ✓ 27.5s、测试 **129 文件 / 1395 条** ✓、台账 **151** ✓；prettier ✓。

## 后续补充：MobFactory.ts（81 行，工作表 3 个成员函数）

第 2 批续审，无代码修改。C++ 只有 `MobFactory.h`，三个函数都是头文件内联，没有 `.cpp`。

| 函数 / 成员                                   | 结论                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateMob(int, Level*)`                      | 一致：9 个 case 与 `MobTypes` 数值（10/11/12/13/32/33/34/35/36）和 C++ 顺序完全相同；未识别类型打同一条 `LOGE`（`%d` → 模板字符串）后返回 null；`mob->health = mob->getMaxHealth()` 是虚调用，TS 动态派发一致                                                                                                                                        |
| `clearStaticTestMobs()`                       | 一致：转调 `getStaticTestMob(0, NULL)`。C++ 只在 `Minecraft::~Minecraft` 里调用它，析构按 R3 不移植，所以 TS 没有调用点不是缺口                                                                                                                                                                                                                      |
| `getStaticTestMob(int, Level*)`               | 一致：`wantClear`/`newLevel` 条件、先更新 `lastLevel` 再清空、清空后 `wantClear` 直接返回 null、命中缓存直接返回、未命中则 `CreateMob` 后插入；`std::map::insert` 不覆盖已有键，但此处刚 `find` 过、键必然不存在，`Map.set` 等价；`CreateMob` 返回 null 时 C++ 也把 null 存进 map 并在下次命中时返回 null，TS 的 `found !== undefined` 同样返回 null |
| 两个 static 局部（`_mobs`、`lastLevel`）      | ADAPTED(Cpp)：模块级 `staticTestMobs`，文件头已注明；`std::map` 只做 find/insert/clear、不迭代，遍历顺序差异无影响                                                                                                                                                                                                                                   |
| `//LOGI("Trying to create a mob with type…")` | 一致：C++ 里本来就是注释，TS 不输出                                                                                                                                                                                                                                                                                                                  |

C++ 的 `delete it->second` 在 TS 里是 `Map.clear()`，由 GC 接管；被缓存的都是 MobSpawner 用来做
`canSpawn` 测试的临时生物，没有加进世界，也没有析构副作用（`~Mob` 的函数体是注释掉的）。
既有覆盖：`tests/unit/world/mobs.test.ts` 逐个验证 9 种生物的类、满血、实体类型与渲染器 id；
`tests/unit/world/entity-factory.test.ts` 覆盖未知 id 走 MobFactory 返回 null；
`tests/unit/world/mobspawner.test.ts` 使用 `getStaticTestMob` 并固定其随机种子。

## 结论（MobFactory）

`MobFactory.ts` 审核完成：全部一致，无修改、无新增 DEFERRED/OMIT，台账不变。

## 后续补充：Motive.ts（113 行，工作表 3 个成员函数）

第 2 批续审，无代码修改。C++ 的 29 个静态实例、28 项列表与顺序用脚本逐项比对过：

| 函数 / 成员                                     | 结论                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 29 个静态实例                                   | 一致：名称、`w/h/uo/vo`（含 `n * 16` 展开值）、`isPublic` 全部逐项相同；声明顺序与 C++ 相同                                                                   |
| `DefaultImage`                                  | 一致：C++ 是 `&Motive::Kebab` 的指针，TS 是同一个对象引用；TS 静态字段按源码顺序求值，排在 Kebab 之后，与 C++ 同翻译单元内的初始化顺序一致                    |
| `getAllMotivesAsList()`                         | 一致：28 项、顺序逐项相同（`Aztec2` 在 `Alban` 前，`Aztec` 不在列表里）；C++ 每次调用新建 vector，TS 每次返回新数组                                           |
| `getMotiveByName(const std::string&)`           | 一致：遍历列表按 `name` 相等返回；查不到返回 `DefaultImage`（`"Aztec"` 也会落到 Kebab，原样保留）；名字全是 ASCII，`std::string` 字节比较与 JS 字符串相等等价 |
| `Motive(std::string, int, int, int, int, bool)` | 一致：五个字段按初始化列表顺序赋值；`isPublic` 默认参数 `true` 与 C++ 头文件默认值相同；C++ 的 `const` 成员对应 TS `readonly`                                 |
| `MAX_MOTIVE_NAME_LENGTH = 13`                   | 一致；C++ 里除定义处外没有使用者，TS 同样只作为常量导出                                                                                                       |

既有覆盖：`tests/unit/world/painting.test.ts` 断言 28 项列表的完整顺序、`Aztec` 不在列表且按名字查落到
`DefaultImage`、四张 `isPublic=false` 的画、若干尺寸/贴图坐标与常量 13。

## 结论（Motive）

`Motive.ts` 审核完成：全部一致，无修改、无新增 DEFERRED/OMIT，台账不变。

## 后续补充：Painting.ts（111 行，工作表 11 个成员函数）

第 2 批续审。对照 C++ `Painting.h`（26 行）与 `Painting.cpp`（77 行）。C++ 的三个构造函数与 TS 合并
成一个带重载签名的构造函数，分支逐句对应。

| 函数 / 成员                                  | 结论                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Painting(Level*)`                           | 一致：只设 `entityRendererId = ER_PAINTING_RENDERER`；C++ 不初始化 `motive`（UB），TS 见下一条                                                                                                                                                                                   |
| `Painting(Level*, xTile, yTile, zTile, dir)` | 一致：转调 `super(level, xTile, yTile, zTile, dir)`，随后只设 `entityRendererId`；**不调 `setDir`**（C++ 也不调），`dir` 被基类 `init()` 覆盖成 0 的怪癖由 HangingEntity 保留                                                                                                    |
| `Painting(Level*, x, y, z, dir, motiveName)` | 一致：先 `getMotiveByName(motiveName)` 再 `setDir(dir)`，最后 `entityRendererId`；顺序与 C++ 相同                                                                                                                                                                                |
| `motive` 字段                                | **已修 W16**：C++ `const Motive* motive;` 在单参构造里未初始化（UB）。按 PITFALLS #20 改为 `Motive \| null = null` 并标 ADAPTED(Cpp)（台账 +1）；这样 `addAdditonalSaveData` 里照抄的 `motive != NULL` 守卫才真正生效（旧实现是 `undefined`，守卫放行后读 `.name` 抛 TypeError） |
| `setRandomMotive(int dir)`                   | 一致：遍历 `getAllMotivesAsList()`、跳过 `!isPublic`、逐个赋值后 `setDir` + `survives()` 收集；非空则 `Entity.sharedRandom.nextInt(length)` 取一个再 `setDir`，否则 `DefaultImage`；随机源是 `Entity.sharedRandom` 而不是 `level.random`                                         |
| `getWidth()` / `getHeight()`                 | 一致：返回 `motive.w` / `motive.h`。TS 加了 `!`（C++ 直接解引用，未设置时同样是 UB），调用点都在 `setRandomMotive`/`setDir` 之后                                                                                                                                                 |
| `dropItem()`                                 | 一致：`getGameType() != Creative` 时 `spawnAtLocation(Item.painting.id, 1)`                                                                                                                                                                                                      |
| `getEntityTypeId() const`                    | 一致：`EntityTypes.IdPainting`（83）                                                                                                                                                                                                                                             |
| `isPickable()`                               | 一致：true                                                                                                                                                                                                                                                                       |
| `addAdditonalSaveData(CompoundTag*)`         | **已修 W16（可见性）**：C++ 在 `public:` 段，TS 原为 `protected override`，按 `docs/移植规范.md` 第 147 行改为 `public override`；函数体一致（先判 `motive != null` 写 `"Motive"`，再 `super`）                                                                                  |
| `readAdditionalSaveData(CompoundTag*)`       | **已修 W16（可见性）**：同上改为 `public override`；函数体一致（先 `getString("Motive")` → `getMotiveByName`，再 `super`）                                                                                                                                                       |

### W16 的测试

`tests/unit/world/painting-audit.test.ts` 2 条，修复前全红（`undefined !== null`；`save()` 抛
`TypeError: Cannot read properties of undefined (reading 'name')`），修复后全绿。另因字段类型改为可空，
`PaintingRenderer.render` 与既有 `painting.test.ts` 第 159 行补了 `!`（C++ 在这两处也是直接解引用），
断言语义未变。

`packages/client/src/renderer/entity/PaintingRenderer.ts` 只改了那一处 `!`，属本文件审核带出的连带修改；
它的 2 个函数仍按 `待审清单` 留待第 6 批（client/renderer）审核。

## 结论（Painting）

`Painting.ts` 审核完成：11 行结论全部一致，除 W16 两处修复（`motive` 初值、存档方法可见性）外无其他改动。
台账 153 → 154（新增 `ADAPTED(Cpp)` 1 条）。

## 后续补充：PathfinderMob.ts（256 行，工作表 18 个成员函数）

第 2 批续审。对照 C++ `PathfinderMob.h`（60 行）与 `PathfinderMob.cpp`。旧 AI（`updateAi`、
`findRandomStrollLocation`）已在任务单 H3 移植，本表逐句核对；`tests/golden/mobai.golden.test.ts`
（三只鸡 400 刻，逐刻比较位置、yRot、onGround、isPathFinding）继续作为行为基准。

| 函数 / 成员                          | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PathfinderMob(Level*)`              | 一致：`attackTargetId=0`、`holdGround=false`、`fleeTime=0`（初始化列表顺序）；函数体 `sensing = new Sensing(this)`、`navigation = new PathNavigation(this, level, 16)` 顺序相同                                                                                                                                                                                                                                                                                          |
| `~PathfinderMob()`                   | 不移植（析构函数，R3）；原有 `OMIT(MobAI)` 标记保留                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `canSpawn()`                         | 一致：`super.canSpawn() && getWalkTargetValue(floor(x), floor(bb.y0), floor(z)) >= 0`；`Mth.floor` 内部已先转 float                                                                                                                                                                                                                                                                                                                                                      |
| `isPathFinding()`                    | 一致：`!path.isEmpty()`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `setPath(Path&)`                     | 一致：C++ 默认赋值是逐成员浅拷贝（`Path.assignFrom`，id 也复制）；C++ 与 TS 都零调用点                                                                                                                                                                                                                                                                                                                                                                                   |
| `getAttackTarget()`                  | 一致：`attackTargetId == 0` 返回 NULL/null，否则 `level->getEntity(id)`；C++ 与 TS 都零调用点                                                                                                                                                                                                                                                                                                                                                                            |
| `setAttackTarget(Entity*)`           | 一致：`attacker ? attacker->entityId : 0`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `shouldHoldGround()`                 | 一致：返回 false                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `updateAi()`                         | 一致：逐句核对。随机数取数顺序完全相同（`nextInt(20)`/`nextInt(180)`/`nextInt(120)`/`nextInt(100)`/`nextFloat()` 的短路与先后、`findRandomStrollLocation` 每轮 13/7/13）；`yFloor = floor(f(bb.y0 + 0.5f))`；`r = f(bbWidth * 2)` 与 `r * r`；`atan2*180/PI - 90` 每步 float；±360 归一化、MAX_TURN 钳制、`holdGround` 分支的 `xxa/yya`、`yd > 0` 跳跃、`lookAt(30,30)`、`horizontalCollision && !isPathFinding()`、`nextFloat() < 0.8f && (inWater\|\|inLava)` 全部对应 |
| `findRandomStrollLocation()`         | **已修 W17**：三处 `Mth::floor(x + random.nextInt(13) - 6)` 的实参在 C++ 里是 float 字段加 int、再减常量，每一步都舍入；TS 旧写法用 double 一次算完，只在 `Mth.floor` 内舍入一次。边界上取到相邻整数（实测 2000 万随机样本有 243921 个不同）。改为 `Mth.floor(f(f(x + n) - k))`                                                                                                                                                                                          |
| `checkHurtTarget(Entity*, float)`    | 一致：空函数体；形参 `d` 未使用（空函数里无法观测舍入，保持 `_d`）                                                                                                                                                                                                                                                                                                                                                                                                       |
| `checkCantSeeTarget(Entity*, float)` | **已修 W18**：形参是 float，TS 旧写法直接拿 double 比较；`32 + 1e-7` 在 C++ 里舍入成 32（不清目标），旧 TS 当成 > 32 清掉。补 `d = f(d)`                                                                                                                                                                                                                                                                                                                                 |
| `getWalkTargetValue(int,int,int)`    | 一致：返回 0（`Animal`/`Monster` 的重写已在各自文件审过）                                                                                                                                                                                                                                                                                                                                                                                                                |
| `findAttackTarget()`                 | 一致：返回 NULL/null                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `getWalkingSpeedModifier()`          | 一致：`fleeTime > 0` 时 `speed *= 2`（float 乘 2 是精确的）；基类值已由 W14 修成 `f(0.7)`                                                                                                                                                                                                                                                                                                                                                                                |
| `getNoActionTime()`                  | 一致：返回 `noActionTime`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `getNavigation()`                    | 一致（ADAPTED 类型放宽）：C++ 返回非空指针，TS 返回 `navigation` 字段（类型 `PathNavigation \| null`，`Mob` 构造函数里先置 null；`Mob::_init` 不清它，与 C++ 一致）；不做空检查，与 C++ 相同。已加 `ADAPTED(Cpp)` 注释                                                                                                                                                                                                                                                   |
| `AIData`（`target(NULL)`）           | 不移植：参考源码里除定义外零使用；新增 `OMIT(MobAI)` 标记                                                                                                                                                                                                                                                                                                                                                                                                                |

### 顺带修正

- `MAX_TURN` 的注释原写“只被 OMIT 掉的 updateAi 用”，但 updateAi 已移植并使用它（W18 同批修正）。
  C++ 里它声明在 `public:` 之前（private），TS 保持 public 并在注释里标 `ADAPTED(Cpp)` —— 既有测试
  断言它的值，改 private 就得删断言（方案第 6 节禁止）。
- `tests/unit/world/pathfindermob.test.ts` 文件头原写“这个文件不测 AI（updateAi 整条 OMIT）”，已过时；
  改为指向 H3 的移植与两个 AI 测试文件（W18 同批修正）。

### 验证

`tests/unit/world/pathfindermob-audit.test.ts` 2 条，修复前全红（W17：`xBest` 期望 2 实得 1；
W18：`32 + 1e-7` 的目标被清掉），修复后全绿。

- `pnpm check`：类型 ✓ 17.2s、测试 **136 文件 / 1431 条** ✓、台账 **157** ✓。
- prettier ✓。

## 结论（PathfinderMob）

`PathfinderMob.ts` 审核完成：18 行全部有结论。修复 W17（三处 floor 的 float 分步）、W18（两处 float
形参舍入）；注释修正 2 处；新增 `ADAPTED(Cpp)` 2 条、`OMIT(MobAI)` 1 条。台账 154 → 157（+3）。
