# world/entity：小文件组

AgableMob、EntityEvent、EntityFactory、EntityPos、EntityRendererId、EntityTypes（共约 336 行）。
第 2 批的一部分；一次提交。工作表逐行结论如下。

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
