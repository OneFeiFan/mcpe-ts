# Cow（src/world/entity/animal/Cow.h / .cpp ↔ packages/world/src/entity/animal/Cow.ts）

第 2 批（world/entity/animal）。工作表 13 行全部有结论；C++ `.h` 42 行 + `.cpp` 79 行
（TS 审核前 78 行、审核后 79 行）。新增编号 **W29**。

C++ 侧要点：

- Cow 没有自有字段；构造函数初始化列表只有 `super(level)`，体内依次设
  `entityRendererId = ER_COW_RENDERER`、`textureName = "mob/cow.png"`、`setSize(0.9f, 1.3f)`。
- `public`：构造函数、`getEntityTypeId() const`、`getMaxHealth()`、`addAdditonalSaveData`、
  `readAdditionalSaveData`、`interact`；`protected`：`getAmbientSound`（返回 `const char*`）、
  `getHurtSound` / `getDeathSound`（返回 `std::string`）、`getSoundVolume`（返回 `float`）、
  `getDeathLoot`（返回 `int`）、`dropDeathLoot`、`getBreedOffspring`（返回 `Animal*`）。
- `getBreedOffspring` 在 Cow.h 里没有 `virtual`，且 `Animal` / `Mob` / `Entity` / `AgableMob`
  都没有声明它（全参考源码零调用方，属于死代码，照抄）；Cow.h 把它写在 `protected` 段。
- 没有未初始化成员；没有重载、默认参数、字段遮蔽。
- `addAdditonalSaveData` 的拼写（少一个 i）是 C++ 原样，TS 保留。

## 工作表结论

| #   | C++ 函数                               | C++ 位置   | TS 方法                  | TS 行 | 相似度 | 结论         |
| --- | -------------------------------------- | ---------- | ------------------------ | ----- | ------ | ------------ |
| 1   | `Cow(Level* level)`                    | Cow.cpp:6  | `constructor`            | 13    | 0.76   | 一致         |
| 2   | `getEntityTypeId() const`              | Cow.cpp:15 | `getEntityTypeId`        | 20    | 1.00   | 一致         |
| 3   | `getMaxHealth()`                       | Cow.cpp:19 | `getMaxHealth`           | 24    | 1.00   | 一致         |
| 4   | `addAdditonalSaveData(CompoundTag*)`   | Cow.cpp:23 | `addAdditonalSaveData`   | 28    | 1.00   | 一致         |
| 5   | `readAdditionalSaveData(CompoundTag*)` | Cow.cpp:27 | `readAdditionalSaveData` | 32    | 1.00   | 一致         |
| 6   | `interact(Player*)`                    | Cow.cpp:31 | `interact`               | 36    | 1.00   | 一致         |
| 7   | `getAmbientSound()`                    | Cow.cpp:40 | `getAmbientSound`        | 40    | 1.00   | 一致         |
| 8   | `getHurtSound()`                       | Cow.cpp:44 | `getHurtSound`           | 44    | 1.00   | 一致         |
| 9   | `getDeathSound()`                      | Cow.cpp:48 | `getDeathSound`          | 48    | 1.00   | 一致         |
| 10  | `getSoundVolume()`                     | Cow.cpp:52 | `getSoundVolume`         | 52    | 0.83   | 一致         |
| 11  | `getDeathLoot()`                       | Cow.cpp:56 | `getDeathLoot`           | 56    | 1.00   | 一致         |
| 12  | `dropDeathLoot()`                      | Cow.cpp:60 | `dropDeathLoot`          | 60    | 1.00   | 一致         |
| 13  | `getBreedOffspring(Animal* target)`    | Cow.cpp:77 | `getBreedOffspring`      | 76    | 1.00   | **已修 W29** |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复

**W29 `getBreedOffspring` 可见性与 C++ 不一致（清单第 20 条）。**
C++ Cow.h 把 `Animal* getBreedOffspring(Animal* target)` 写在 `protected` 段；TS 以前写成 public。
Cow 之外没有任何调用方（`Animal.ts` 文件头注释与全仓搜索均确认，C++ 侧同样是零调用方的死代码），
收窄可见性不改变任何运行行为，但类型契约必须与 C++ 一致。
修复：`Cow.ts` 中改为 `protected getBreedOffspring(...)`，并在方法上注明 C++ 的 `protected`。
验证：类型层面先红后绿——修复前 `npx tsc -p tests/tsconfig.json --noEmit` 报
`tests/unit/world/cow-audit.test.ts(144,5): error TS2578: Unused '@ts-expect-error' directive.`；
修复后该文件 0 错误（测试里的 `TestCow` 子类仍可调用）。vitest 不做类型检查，
所以运行时 7 条在修复前后都通过，这条由 `@ts-expect-error` 在 tsc 里锁定。

## 35 条清单核对要点

- 第 1–2 条：Cow 无 float 字段、无 float 形参；构造函数 `setSize(0.9f, 1.3f)` 写作
  `setSize(f(0.9), f(1.3))`，`setSize` 内部再 `f()` 一次，重复舍入无影响。
- 第 3–7 条：除上述常量外无浮点运算；`getSoundVolume` 返回 `f(0.4)`，对应 C++ `0.4f`。
- 第 8 条：`dropDeathLoot` 的循环计数器是 int 语义，最多 2/3 次，无溢出与整数除法。
- 第 9–12 条：无数学函数、无 long、无字符串格式化。
- 第 13–18 条：基类已有的方法 TS 全部 `override`；`getBreedOffspring` 无基类声明（非虚，死代码）；
  无重载、无默认参数、无字段遮蔽。`super.addAdditonalSaveData` / `super.readAdditionalSaveData`
  经 `Animal`（未声明）落到 `AgableMob`，再转 `Mob`，与 C++ `super::…`（super = Animal，解析到
  AgableMob 的实现）一致；`super.interact` 落到 `Entity`（Mob / AgableMob 未重写），与 C++ 一致。
- 第 19 条：构造函数只调 `super(level)`，无自有字段；体内三条赋值顺序与 C++ 源码顺序相同。
- 第 20 条：可见性见 W29，其余方法 public / protected 均与 Cow.h 一致。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：随机源是成员 `this.random`（对应 C++ `Entity::random`）；`dropDeathLoot`
  按 C++ 顺序取两次：`nextInt(3)` → 皮革循环 → `nextInt(3) + 1` → 牛肉循环；
  `isOnFire()` 在牛肉循环内部调用且无副作用，不影响取数顺序；`spawnAtLocation` 生成的
  ItemEntity 用的是模块级 `Mth.random()`，不会扰动 Cow 的随机序列。
- 第 30–33 条：字符串均为 ASCII 字面量；无 char / bool 转换与日志。
- 第 34 条：本文件没有 DEFERRED / OMIT 标记。
- 第 35 条：文件头“1:1 移植自 Cow.h 与 Cow.cpp（任务单 H5）”与代码一致，无过时注释。

## 验证

- `npx vitest run tests/unit/world/cow-audit.test.ts`：7 条全部通过（含掉落顺序、
  着火熟牛肉、float 尺寸/音量、随机数取两次的逐条锁定）。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：`cow-audit.test.ts` 0 错误（工作区另有
  本文件范围外的 `tripodcamera-audit.test.ts` TS2511，未触碰）。
- `npx prettier --check` 两个改过的文件：通过。
- `pnpm ledger`：共 170 条，与修改前一致（本文件无标记增删）。

待确认项：无。
