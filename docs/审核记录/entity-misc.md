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

## 后续补充：SharedFlags.ts（23 行，工作表 0 个成员函数）

第 2 批续审，无代码修改。C++ 只有 `SharedFlags.h`（纯常量类，无 `.cpp`、无成员函数）。

| 项目                                                                                                              | 结论                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `enum SharedFlags`（FLAG_ONFIRE … FLAG_USINGITEM）                                                                | 一致：5 个值 0–4，顺序与数值逐项相同                                                                                                          |
| `typedef char SharedFlagsInformationType`                                                                         | 一致：写成 `type SharedFlagsInformationType = number`；char 的符号语义由 `SynchedEntityData` 的类型码实现（该文件已审过）承担，此处无独立行为 |
| `static const unsigned int DATA_SHARED_FLAGS_ID = 0`                                                              | 一致：`export const DATA_SHARED_FLAGS_ID = 0`；`Mob` 构造里 `defineByte(…, 0)` 与 C++ `define(…, (TypeChar) 0)` 对应                          |
| `FLAG_RIDING` / `FLAG_SPRINTING` 零使用                                                                           | 一致：C++ 全源码里也只有定义、没有任何使用者；TS 同样只声明（C++ 的“声明了不用”怪癖原样）                                                     |
| namespace 顶层的 5 个便捷 `const`（`FLAG_ONFIRE` 等）                                                             | NEW（无行为影响）：C++ 调用点写 `SharedFlagsInformation::FLAG_ONFIRE`，TS 的 enum 嵌在 namespace 里要多一层；这 5 个 const 让                 |
| `Mob`/`Player` 里能写成 `SharedFlagsInformation.FLAG_ONFIRE`，与 C++ 字面对应。未被测试单独断言（值就是 enum 值） |

`class SharedFlagsInformation` 本身在 TS 里写成 `export namespace`（C++ 的这个类只有静态成员，
不能实例化，namespace 是 TS 里“静态成员集合”的惯用对应，与 `EntityTypes` 同款写法）。

## 结论（SharedFlags）

`SharedFlags.ts` 审核完成：全部一致，无修改、无新增 DEFERRED/OMIT，台账不变（157）。
既有覆盖：`tests/unit/world/pathfindermob.test.ts` 用 `entityData.setFlag(14, 0)` 间接经过
`DATA_SHARED_FLAGS_ID` 所在的 defineByte 体系；`chicken.test.ts` 断言 `isOnFire()`（FLAG_ONFIRE 的
读路径）。常量表本身无逻辑，无需新增测试。

## 后续补充：SynchedEntityData.ts（383 行，工作表 50 个成员函数）

第 2 批续审，无代码修改。对照 C++ `SynchedEntityData.h`（`DataItem`/`DataItem2<T>` 模板 +
`SynchedEntityData`）与 `SynchedEntityData.cpp`。C++ 用模板按值的静态类型选类型码，TS 按 R10 情形 B
拆成具名方法（文件头 ADAPTED(Cpp) 已注明），逐条核对如下。

### DataItem / DataItem2&lt;T&gt;

| 函数 / 成员                                        | 结论                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataItem(int type, int id)`                       | 一致：`dirty(true)` 初始化；`type`/`id` 是 const（TS `readonly`）                                                                                                                                                                                                                                                                |
| `~DataItem()`（virtual）                           | 不移植（析构函数，R3）；TS 单类合并了 `DataItem2<T>`，无多态删除                                                                                                                                                                                                                                                                 |
| `getId()` / `getType()` / `isDirty()` / `setDirty` | 一致（一行 getter/setter）                                                                                                                                                                                                                                                                                                       |
| `isDataEqual(rhs)`（virtual）                      | 一致：`type == rhs.type`；TS 里无调用点（与 C++ 相同），原样保留                                                                                                                                                                                                                                                                 |
| `DataItem2<T>::setFlag/clearFlag/getFlag`          | 一致：`data \| (1<<flag)`、`data & ~(1<<flag)`、`(data & (1<<flag)) != 0`。C++ 里 data 是 `TypeChar`（signed char），位运算经 int 提升后赋回 char 截断；TS 的 `DataItem.setFlag/clearFlag` 用 `SynchedEntityData.wrap(type, …)` 按类型码截断（byte `<<24>>24`、short `<<16>>16`、int `\|0`、float `f()`），与 C++ 的隐式窄化等价 |

### SynchedEntityData 本体

| 函数 / 成员                                                                                 | 结论                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SynchedEntityData()`                                                                       | 一致：`_isDirty(false)`                                                                                                                                                                                                                                                                                                                                                     |
| `~SynchedEntityData()`                                                                      | 不移植（析构函数，R3；delete 各 DataItem 由 GC 接管）                                                                                                                                                                                                                                                                                                                       |
| `MAX_STRING_DATA_LENGTH = 64`                                                               | 一致：C++ 里除定义外零使用，TS 同样只作为常量导出                                                                                                                                                                                                                                                                                                                           |
| `EOF_MARKER = 0x7f`、`TYPE_*`（7 个）、`TYPE_MASK = 0xe0`、`TYPE_SHIFT = 5`、`MAX_ID_VALUE` | 一致：`MAX_ID_VALUE = ~TYPE_MASK & 0xff` = 0x1f，逐项相同                                                                                                                                                                                                                                                                                                                   |
| `getTypeId` 的 7 个重载                                                                     | ADAPTED(Cpp)：模板重载按静态类型选类型码 → TS 的具名 define/set 方法自带类型码（defineByte→TYPE_BYTE 等），无需独立方法                                                                                                                                                                                                                                                     |
| `define<T>(idd, value)`                                                                     | 一致：`idd > MAX_ID_VALUE` 打 LOGE 原文（两条一条带 `\n` 一条不带，TS 的模板字符串与之相同）；重复 id 打 `Duplicate id value for %d!` 后 return；`std::map::insert` 不覆盖已有键，但此处刚 find 过、键必然不存在，`Map.set` 等价                                                                                                                                            |
| `defineItemInstance` / `definePos` 的拷贝                                                   | 一致：C++ `DataItem2<ItemInstance>`/`<Pos>` 的 `T data` 按值成员 → TS 存 `new ItemInstance(value)` / `new Pos(value.x, value.y, value.z)`                                                                                                                                                                                                                                   |
| `getByte` … `getPos`（7 个 getter）                                                         | 一致：查不到或类型不符返回 0 / 0 / 0 / 0 / `""` / `ItemInstance()`（init(0,0,0)）/ `Pos()`（0,0,0）；C++ 按值返回副本 → `getItemInstance`/`getPos` 返回新对象，数值/字符串不可变等价                                                                                                                                                                                        |
| `set<T>(id, value)`（一参）                                                                 | 一致（崩溃路径差异见下）：`itemsById[id]` → TS `get(id)`；键不存在时 C++ 的 `operator[]` 会往 map 插一个 NULL 条目再 LOGE，之后 `packDirty`/`packAll` 遍历到它解引用崩溃；TS 只 LOGE、不插条目（`set` 未注册 id 属编程错误，实体代码都先 define 后 set；崩溃路径不复刻）                                                                                                    |
| `set<T>(DataItem*, value)`（二参）                                                          | 一致：`dataItem == NULL` 打 `DataItem not found!`；类型不符打 `ERROR: Id %d is not correct type. %d != %d!`；`d->data == value` 相等则不置脏——`ItemInstance` 走 `operator==`（id/auxValue/count），`Pos` 走 `operator==`（x/y/z），TS 的 `dataEquals` 同一语义；赋值时 `ItemInstance`/`Pos` 再拷贝一份（与按值成员赋值等价）；`setDirty(true)` + `_isDirty = true` 顺序相同 |
| `setFlag<T>(id, flag)` / `clearFlag<T>(id, flag)`                                           | 一致：改前记 `oldFlag`、改后不同才 `markDirty(id)`；TS 的具名方法省掉了模板强转（`DataItem2<T>*` 只用于编译期检查），行为相同                                                                                                                                                                                                                                               |
| `getFlag<T>(id, flag)`                                                                      | 一致（同为崩溃路径）：未注册 id 时 C++ `operator[]` 插 NULL 后解引用崩溃，TS `undefined!` 抛 TypeError                                                                                                                                                                                                                                                                      |
| `markDirty(id)`                                                                             | 一致：`setDirty(true)` + `_isDirty = true`；未注册 id 同为崩溃路径                                                                                                                                                                                                                                                                                                          |
| `isDirty()`                                                                                 | 一致                                                                                                                                                                                                                                                                                                                                                                        |
| `pack(items, output)`（static）                                                             | 一致：`items != NULL` 才循环，末尾 `writeByte(EOF_MARKER)`；C++ 里唯一的调用者 `SetEntityDataPacket` 属网络包（DEFERRED(Network)），TS 无调用点、按原样保留                                                                                                                                                                                                                 |
| `packDirty()`                                                                               | 一致：`_isDirty` 为真才遍历，遍历中先 `setDirty(false)` 再收集；无论真假最后 `_isDirty = false`；`std::map` 按 id 升序 → `sortedItems()` 升序（NEW 辅助方法，语义就是 map 的有序遍历）                                                                                                                                                                                      |
| `packAll(output)`                                                                           | 一致：全部条目升序 `writeDataItem` + `EOF_MARKER`                                                                                                                                                                                                                                                                                                                           |
| `unpack(input)`（static）                                                                   | 一致：header 读到 `EOF_MARKER` 停；`(header & TYPE_MASK) >> TYPE_SHIFT` 取类型、`& MAX_ID_VALUE` 取 id；7 个 case 的读序逐项相同（ITEMINSTANCE：short/byte/short；POS：int×3）；未知类型码 C++ `push_back(NULL)`、TS push null（注释已注明）；`readByte` 两侧都是有符号 char（DataIO 已按 U 系修复）                                                                        |
| `assignValues(items)`                                                                       | 一致：按 id 找到才 set；C++ 的 7 个 case 各 `set<T>(jt->second, data)`，TS 合并为 `setItem(jt, item.getType(), item.data)`——类型码取自 item 本身，与 C++ 按同一值分派等价；`default` 打 `Incorrect type id: %d` 相同；`unpack` 产出 null 条目时 C++ 解引用 NULL 崩溃、TS 抛 TypeError（同为崩溃路径）                                                                       |
| `writeDataItem(output, dataItem)`（static）                                                 | 一致：`((type << 5) \| (id & 0x1f)) & 0xff` 写 header；7 个分支的写序逐项相同（ITEMINSTANCE：`getItem()->id`、`count`、`getAuxValue()`；空实例 `getItem()` 返回 NULL 时 C++ 解引用崩溃、TS `!` 抛 TypeError，同为崩溃路径）；`getItem()->id` 与 `instance.id` 等价（Item.items 查表）                                                                                       |
| TS 侧 `wrap` / `get` / `dataEquals` / `sortedItems`                                         | NEW：分别是 C++ 隐式窄化的集中实现（byte/short/int/float）、7 个 getter 的公共查找、`operator==` 的分派（数值/字符串 `===`，ItemInstance/Pos 值比较）、`std::map` 的有序遍历                                                                                                                                                                                                |

C++ 的 `std::map<int, DataItem*>`：`packDirty`/`packAll` 的输出顺序依赖它按 id 升序——TS 的
`sortedItems()` 在每次遍历前排序，语义相同（JS `Map` 是插入序，所以显式排序；实体实际只 define
十几个 id，开销可忽略）。

## 结论（SynchedEntityData）

`SynchedEntityData.ts` 审核完成：50 行工作表全部有结论，全部一致或 ADAPTED/NEW（文件头已登记），
无代码修改、无新增 DEFERRED/OMIT，台账不变（157）。C++ 里 `pack`/`packDirty`/`packAll`/`unpack`/
`assignValues` 的唯一调用者是网络包（`AddMobPacket`/`AddPlayerPacket`/`SetEntityDataPacket` 等，
TS 侧 DEFERRED(Network)），所以这些方法在 TS 里暂无调用点，按原样移植待接线。
`DataItem`/`DataItem2` 合并为一个类是文件头注明的 ADAPTED：C++ 的 `DataItem2<T>` 只是给基类加了
`T data` 与三个位方法，TS 单类带 `data: DataValue` 等价；`isDataEqual` 两侧都无调用点，原样保留。

## ItemEntity（src/world/entity/item/ItemEntity.h / .cpp ↔ packages/world/src/entity/item/ItemEntity.ts）

工作表 14 行全部有结论。`tick` 在 W4 已审过（float 运动链，G12-2 黄金样本逐位），本次补齐其余 13 行。

| #   | 函数                                                                 | 结论                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ItemEntity(Level*, float x, float y, float z, const ItemInstance&)` | **已修 W21**：`bobOffs = (float)(Mth::random() * Mth::PI * 2)`、`heightOffset = bbHeight / 2.0f`、`yRot = (float)(Mth::random() * 360)`、`xd/zd = (float)(Mth::random() * 0.2f - 0.1f)` 全部按 float 分步；`yd = +0.2f` |
| 2   | `ItemEntity(Level*)`                                                 | 一致：只做 `entityRendererId / setSize / heightOffset`，不 `setPos`、不设随机速度；`bobOffs` 同样消耗一次 `Mth::random()`（W21 一并按 float）                                                                           |
| 3   | `~ItemEntity()`                                                      | **OMIT**（新增）：空析构函数，R3 不移植                                                                                                                                                                                 |
| 4   | `tick()`                                                             | W4 已审（重力 / 岩浆 / 摩擦 / 反弹按 float）。本次补：岩浆分支的 `random.fizz` 音量 `0.4f`、音高 `2.0f + nextFloat * 0.4f` 按 float（W21）                                                                              |
| 5   | `isInWater()`                                                        | 一致：`checkAndHandleWater(bb, Material::water, this)`                                                                                                                                                                  |
| 6   | `hurt(Entity*, int)`                                                 | 一致：`markHurt()` → `health -= damage` → `<= 0` 则 `remove()`，恒返回 false                                                                                                                                            |
| 7   | `playerTouch(Player*)`                                               | **已修 W21**：`random.pop` 的音量 `0.3f`、音高 `((a - b) * 0.7f + 1.0f) * 2.f` 按 float 分步；`throwTime == 0 && isAlive() && inventory->add(&item)` 的短路顺序一致                                                     |
| 8   | `burn(int)`                                                          | 一致：转调 `hurt(NULL, dmg)`                                                                                                                                                                                            |
| 9   | `checkInTile(float, float, float)`                                   | **已修 W21**：三个形参先转 float；`xd/yd/zd = x - xTile` 是 float 运算；`1 - x` 按 float；`speed = nextFloat() * 0.2f + 0.1f` 按 float。`south` 分支没有 `closest = 1 - zd` 是 C++ 原样（注释已说明）                   |
| 10  | `addAdditonalSaveData`                                               | 一致：`(char) health` 的 8 位截断保留（大伤害后 health 可能 < -128）；`(short) age` 由 `ShortTag` 构造时截断；`putCompound("Item", item.save(...))`                                                                     |
| 11  | `readAdditionalSaveData`                                             | 一致：`getShort("Health") & 0xff`、`getShort("Age")`、`getCompound("Item")` → `item.load`                                                                                                                               |
| 12  | `isItemEntity()`                                                     | 一致：true                                                                                                                                                                                                              |
| 13  | `getEntityTypeId()`                                                  | 一致：`EntityTypes.IdItemEntity`                                                                                                                                                                                        |
| 14  | `getLifeTime()`                                                      | 一致：返回 `lifeTime`（初始 `5 * 60 * TicksPerSecond`）                                                                                                                                                                 |

补充核对（怪癖保留）：

- **`tickCount` 遮蔽**：`ItemEntity.h:44` 自己声明了一个 `int tickCount`，遮蔽 `Entity.h:183` 的同名字段。
  C++ 的 `ItemEntity::tick` 里 `tickCount++` 改的是自己那个（**没有任何读取点**），`Entity::baseTick` 改的是基类那个。
  TS 无法让两个字段并存，因此把被遮蔽的私有字段改名为 `itemTickCount`（R10），与 `Entity.tickCount` 完全独立。
  这个字段在 C++ 里是死字段，但保留它才能让“两个计数器各自递增”的行为可测。
- `checkInTile` 恒返回 false（C++ 也是），调用方不看返回值。

**W21 验证**：新增 `tests/unit/world/itementity-audit.test.ts`（9 条）。撤掉 8 处修复后重跑，
3 条变红（构造函数 float 分步 ×2、tickCount 遮蔽）；恢复后 9 条全绿。`pnpm check` 全绿，台账 167 → 168。

## Arrow（src/world/entity/projectile/Arrow.h / .cpp ↔ packages/world/src/entity/projectile/Arrow.ts）

工作表 13 行全部有结论。W5 已改过三处速度长度的结合顺序；本次补齐其余行，新增修复编号 W22。

| #   | 函数                                       | 结论                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Arrow(Level*)`                            | 一致：初始化 `playerArrow=false / ownerId=0` 后 `_init()`；`_init` 改名 `_initArrow` 是 R10（避免与 `Entity._init` 撞名，Throwable 同理）                                                                                                                                                                 |
| 2   | `Arrow(Level*, float x, float y, float z)` | 一致：`_init()` → `setPos` → `heightOffset = 0`                                                                                                                                                                                                                                                           |
| 3   | `Arrow(Level*, Mob*, float power)`         | **已修 W22**：形参 `power` 入口 `f()`；`cos/sin(yRot * DEGRAD)` 与 `xRot / 180 * PI` 改读 `moveTo` 之后的 `this.yRot/this.xRot`（C++ 读的是成员，已舍入成 float）；其余 float 分步原本正确                                                                                                                |
| 4   | `_init()`                                  | 一致：渲染 id、`setSize(0.5f, 0.5f)`、各字段初值逐项相同                                                                                                                                                                                                                                                  |
| 5   | `shoot(...)`                               | **已修 W22**：五个 float 形参入口 `f()`；朝向用 `f(Mth.atan2(...) * Mth.RADDEG)` —— 原写法照抄了 Throwable 的 `* 180 / Mth::PI`，但 Arrow.cpp 写的是 `std::atan2(...) * Mth::RADDEG`（实测 14007 个方向里 5276 个末位不同）；半径/三次 nextGaussian/乘 pow 的顺序与结合顺序一致                           |
| 6   | `lerpMotion(float, float, float)`          | **已修 W22**：三个形参入口 `f()`；两处朝向同样改 RADDEG                                                                                                                                                                                                                                                   |
| 7   | `tick()`                                   | **已修 W22**：开头与结尾共四处朝向改 RADDEG；`dmg = (int) std::ceil(...)` 改用 `f2i`（x86 越界/NaN 语义）；反弹分支 `yRot/yRotO += 180` 按 float 字段加法；四组 `±= 360` 回绕补 `f()`。其余（重力 0.05f、inertia 0.99f/0.80f、水中粒子、crit 粒子、`60 * TicksPerSecond` 判断、方块命中后的位置回退）一致 |
| 8   | `addAdditonalSaveData(CompoundTag*)`       | 一致：`(short)` 三个坐标、`(char)` 转 byte、`inGround ? 1 : 0`、`player` 布尔                                                                                                                                                                                                                             |
| 9   | `readAdditionalSaveData(CompoundTag*)`     | 一致：`inTile/inData/shake` 都带 `& 0xff`，`inGround = getByte == 1`，`getBoolean("player")`                                                                                                                                                                                                              |
| 10  | `playerTouch(Player*)`                     | 一致：客户端直接返回；`inGround && playerArrow && shakeTime <= 0` 才捡；`random.pop` 音量 `0.2f`、音高 `((a-b)*0.7f+1.0f)*2.f` 按 float 分步（两个 nextFloat 的实参求值顺序 C++ 未规定，按先例左到右，见 W21 同类注释）                                                                                   |
| 11  | `getShadowHeightOffs()`                    | 一致：返回 0                                                                                                                                                                                                                                                                                              |
| 12  | `getEntityTypeId()`                        | 一致：`EntityTypes.IdArrow`                                                                                                                                                                                                                                                                               |
| 13  | `getAuxData()`                             | 一致：返回 `ownerId`                                                                                                                                                                                                                                                                                      |

补充核对：

- **RADDEG 与 180/PI 不是同一个式子**：`Mth::RADDEG = f(180/f(PI))` 是一次乘常量；`(atan2 * 180) / PI` 是两次 float 舍入。
  Arrow.cpp 全文用的是 `std::atan2(...) * Mth::RADDEG`，而 `Throwable.cpp` 用的是 `Mth::atan2(...) * 180 / Mth::PI` ——
  两个文件确实不同，原 TS 把 Throwable 的式子抄了过来。本次 Arrow 按原文改回 RADDEG，Throwable 留待其审核时确认。
- `tick` 开头的方块 AABB 判断里多一个 `if (tile)` 空保护，是 UB 保护（C++ 直接解引用 `Tile::tiles[t]`），文件内已有注释。
- `shoot` 没有除零保护、`++life == 60 * TicksPerSecond`、重力写死 0.05f —— 都是与 Throwable 的差异，原样保留（文件头表格已列）。

**W22 验证**：新增 `tests/unit/world/arrow-audit.test.ts`（5 条）。撤掉修复后 4 条变红
（RADDEG、pow/uncertainty 入口、lerpMotion 入口、构造用 this.yRot）；恢复后 5 条全绿。
`pnpm check` 全绿（140 文件 / 1482 条），台账保持 168（无新增标记）。
