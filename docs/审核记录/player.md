# world/entity/player

对照：`src/world/entity/player/*.h` / `*.cpp` ↔ `packages/world/src/entity/player/*.ts`。
第 2 批的一部分，按 `docs/全量审核方案.md` 逐函数审核。

## Abilities（src/world/entity/player/Abilities.h ↔ packages/world/src/entity/player/Abilities.ts）

C++ 只有头文件、没有 `.cpp`，两个方法都是内联实现。工作表 3 行，结论如下。

| 函数 / 成员                            | 结论                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 构造函数初始化列表（4 个 bool）        | 一致：C++ `invulnerable(false), flying(false), mayfly(false), instabuild(false)`；TS 四个字段初始化器同为 `false`，声明顺序也相同。工作表把最后一项 `instabuild(false)` 误列成“缺失方法”——它是初始化列表的一项，不是方法                                                                                                         |
| `addSaveData(CompoundTag* parentTag)`  | 怪癖保留：C++ 原句 `tag->putBoolean("flying", invulnerable);` —— 写 `flying` 键时用的是 `invulnerable` 的值（原版 bug）。TS 第 17 行照抄并有注释。其余三行键/值一一对应；`parentTag->put("abilities", tag)` ↔ `parentTag.put('abilities', tag)`（TS 的 `put` 与 C++ 一样先 `setName`、再按 `std::map::insert` 语义不覆盖已有键） |
| `loadSaveData(CompoundTag* parentTag)` | 一致：`contains("abilities")` 只查键存在（不查类型）→ `getCompound`（键存在但类型不是 TAG_Compound 时返回新建空标签）→ 四个 `getBoolean`（`getByte != 0`，类型不符得 false）。TS 的 `CompoundTag` 实现逐项核对过，语义相同                                                                                                       |

补充核对（TS 侧 `CompoundTag`，属 nbt 包已审范围）：`put` 先 `tag.setName(name)` 再 `insertNew`
（不覆盖同名键）、`putBoolean` 写 `1/0`、`getBoolean` 为 `getByte(name) !== 0`、`getCompound`
缺键/类型不符时 `new CompoundTag(name)` —— 均与 C++ `CompoundTag.h` 的内联实现一致。

**调用点**：在参考 C++ 全源码里 `grep` `addSaveData` / `loadSaveData` 只有这两个定义、没有调用者
（`Player.cpp` 也没有调用）。TS 同样无调用点，属于原样保留的死代码，不算 DEFERRED。

## 结论（Abilities）

`Abilities.ts` 审核完成：工作表 3 行全部有结论，两个方法一致或怪癖保留（原版 `flying` 写入 bug
照抄），无代码修改、无新增 DEFERRED/OMIT，台账不变（157）。
