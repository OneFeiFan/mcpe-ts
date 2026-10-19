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
