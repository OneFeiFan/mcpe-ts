# Animal（src/world/entity/animal/Animal.h / .cpp ↔ packages/world/src/entity/animal/Animal.ts）

第 2 批（world/entity/animal）。工作表 8 行全部有结论。C++ `.h` 39 行 + `.cpp` 92 行，
TS 审核前 84 行、审核后 84 行。新增编号 **W27**。

C++ 侧要点：

- 唯一自有成员 `int inLove`（`private`，构造函数初始化列表 `inLove(0)`）；没有未初始化成员。
- `Animal` 继承 `AgableMob`，同时空继承 `Creature`（`class Creature {};`，类体为空）；
  `typedef AgableMob super`。TS 用单继承 + `ADAPTED(Cpp)` 注释，行为等价。
- `Animal.h` 可见性：`public` 段是构造函数、`hurt`、`canSpawn`、`getAmbientSoundInterval`、
  `getCreatureBaseType`、`removeWhenFarAway`；`protected` 段是 `getWalkTargetValue`、`findAttackTarget`。
- 这些函数都重写基类虚函数（C++ 的 `virtual` 可继承，声明处不再写 `virtual`）：
  `hurt` / `canSpawn` / `getAmbientSoundInterval` 来自 `Mob`，`getCreatureBaseType` 来自 `Entity`，
  `getWalkTargetValue` / `findAttackTarget` 来自 `PathfinderMob`。
- 无重载、无默认参数、无字段遮蔽；`findAttackTarget` 的繁殖逻辑整块被注释掉（Animal.cpp:46-82），
  实际只有 `return NULL;`。

## 工作表结论

| #   | C++ 函数                        | C++ 位置      | TS 方法                   | TS 行 | 相似度 | 结论                                                                                                                                                                                                                                   |
| --- | ------------------------------- | ------------- | ------------------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Animal(Level* level)`          | Animal.cpp:8  | `constructor`             | 34    | 1.00   | 一致：`super(level)` 后 `inLove = 0`，与初始化列表顺序一致                                                                                                                                                                             |
| 2   | `hurt(Entity* source, int dmg)` | Animal.cpp:15 | `hurt`                    | 40    | 1.00   | 一致：先设 `fleeTime = 3 * 20`、清 `attackTargetId` 与 `inLove`，再 `super.hurt`（经 AgableMob/PathfinderMob 落到 `Mob::hurt`，与 C++ 相同）                                                                                           |
| 3   | `canSpawn()`                    | Animal.cpp:23 | `canSpawn`                | 48    | 0.95   | 一致：`getTile(floor(x), floor(bb.y0)-1, floor(z)) == Tile.grass.id && getRawBrightness(...) > 8 && super.canSpawn()`；TS 的 `super.canSpawn()` 经 AgableMob 落到 `PathfinderMob::canSpawn`，同样带上 `getWalkTargetValue >= 0` 这一条 |
| 4   | `getAmbientSoundInterval()`     | Animal.cpp:31 | `getAmbientSoundInterval` | 60    | 1.00   | 一致：`12 * TicksPerSecond`（20）= 240，整数精确                                                                                                                                                                                       |
| 5   | `getWalkTargetValue(int x,y,z)` | Animal.cpp:36 | `getWalkTargetValue`      | 65    | 0.89   | 一致：草上方返回 10（int→float 精确）；否则 `getBrightness`（Float32Array 元素，float）减 `0.5f` 后 `f()`；可见性见第 20 条                                                                                                            |
| 6   | `findAttackTarget()`            | Animal.cpp:42 | `findAttackTarget`        | 71    | 1.00   | 一致：`return NULL` / `return null`；被注释掉的繁殖逻辑不参与执行，未复制                                                                                                                                                              |
| 7   | `removeWhenFarAway()`           | Animal.cpp:85 | `removeWhenFarAway`       | 76    | 1.00   | **已修 W27**：C++ 在 `public` 段（基类 `Mob.h` 的是 `protected`），TS 原为 `protected`，已改 `public override`                                                                                                                         |
| 8   | `getCreatureBaseType() const`   | Animal.cpp:90 | `getCreatureBaseType`     | 81    | 1.00   | 一致：返回 `MobTypes::BaseCreature`（C++ `EntityTypes.h:41` = 2；TS `EntityTypes.ts:19` = 2）                                                                                                                                          |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复

**W27 `removeWhenFarAway` 可见性与 C++ 不一致（清单第 20 条）。**
C++ `Animal.h:30` 把 `bool removeWhenFarAway()` 写在 `public` 段；基类 `Mob.h:136` 的同名虚函数在
`protected` 段。TS 原先写成了 `protected override`，导致类外无法通过 `Animal` 类型调用。
修复：改为 `public override`，并在方法注释里注明 C++ 的 `public` 段与基类的 `protected`。
运行行为不变（JS 没有编译期可见性），但类型契约必须与 C++ 一致。

先红后绿：

- 红：把该方法临时改回 `protected`，`npx tsc -p tests/tsconfig.json --noEmit` 报
  `tests/unit/world/animal-audit.test.ts(31,19): error TS2445: Property 'removeWhenFarAway' is protected and only accessible within class 'Animal' and its subclasses.`（退出码 2）。
- 绿：恢复 `public` 后同一命令 0 错误（退出码 0）。
- vitest 运行时看不到可见性差异（转译后就是普通方法），所以由 tsc 锁定；`animal-audit.test.ts`
  从类外以 `Animal` 类型调用并断言恒为 `false`，`npx vitest run tests/unit/world/animal-audit.test.ts` 1/1 通过。

## 注释修正（无行为变化）

- 文件头把 `Creature` 称作“空接口”，实际是空的 `class`，已改为“空基类”。
- 文件头引用的注释行号 `Animal.cpp:49-57` 只覆盖了注释块的一部分，实际整块是 `46-82`，已改正。
- 其余注释核对无误：`Animal.cpp` 92 行 / `Animal.h` 39 行；“`getBreedOffspring` 全参考源码零调用方”
  （C++ 与 TS 都只有定义/声明，无调用点；Sheep 那份在 `Sheep.h:80` 被注释掉）仍成立。

## 35 条清单核对要点

- 第 1–2 条：`inLove` 是 int，`hurt` 的 `dmg` 是 int；`fleeTime` / `attackTargetId` 是 int。
  本文件没有 float 字段；`getWalkTargetValue` 的返回值是 float（TS 用 `f()` 舍入）。
- 第 3–7 条：`getWalkTargetValue` 的 `getBrightness` 返回 float（`Float32Array` 元素），
  `f(brightness - f(0.5))` 与 C++ `getBrightness(...) - 0.5f` 的 float 运算一致；`return 10` 精确。
  `3 * 20`、`12 * 20` 是整数常量，无溢出；无整数除法。
- 第 8 条：`canSpawn` 的 `Mth.floor(x)` / `Mth.floor(bb.y0)` / `Mth.floor(z)` 用 `Mth.floor`
  （内部先 `f()` 再 `f2i`），与 C++ `Mth::floor(float)` 一致；`Tile.grass.id` 是 int 比较。
- 第 9–12 条：除 `Mth.floor` 外无数学函数；无 long、无字符串格式化。
- 第 13–18 条：全部方法在 TS 里是 `override`；`super.hurt` 经 `AgableMob` / `PathfinderMob`
  落到 `Mob::hurt`，`super.canSpawn` 落到 `PathfinderMob::canSpawn`（含 `getWalkTargetValue >= 0`），
  均与 C++ `super`（`typedef AgableMob super`）的解析结果一致；无重载、默认参数、字段遮蔽。
  构造函数体内没有虚调用。
- 第 19 条：唯一自有成员 `inLove`，声明/初始化顺序无歧义。
- 第 20 条：`removeWhenFarAway` 见 W27；`findAttackTarget` 两侧都是 `protected`；
  `getWalkTargetValue` 在 C++ 是 `protected`，但基类 `PathfinderMob` 的是 `public`，TS 不能收窄，
  保持 `public` 并已在文件头标 `ADAPTED(Cpp)`；其余方法两侧都是 `public`。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：本文件不使用随机数；`canSpawn` 的 `&&` 短路顺序与 C++ 相同
  （`getTile` → `getRawBrightness` → `super.canSpawn`）；被注释掉的代码里没有随机数调用。
- 第 30–33 条：字符串均为 ASCII 字面量；无 char / bool 转换与日志。
- 第 34 条：本文件没有 DEFERRED / OMIT 标记；`ADAPTED(Cpp)` 双继承说明仍成立。
- 第 35 条：文件头注释已按上述修正；`getBreedOffspring` 死代码说明核对无误。

## 验证

- `npx vitest run tests/unit/world/animal-audit.test.ts`：1/1 通过。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误（W27 红绿对照见上）。
- `npx prettier --check packages/world/src/entity/animal/Animal.ts tests/unit/world/animal-audit.test.ts`：通过。
- `pnpm ledger`：共 170 条；Animal.ts 本次只改可见性与注释，没有新增/删除任何
  DEFERRED / OMIT / ADAPTED 标记，台账条数不变。
