# Spider（src/world/entity/monster/Spider.h / .cpp ↔ packages/world/src/entity/monster/Spider.ts）

第 2 批（world/entity/monster）。工作表 17 行全部有结论。C++ `.h` 62 行 + `.cpp` 137 行，
TS 审核前 118 行、审核后 120 行。新增编号 **W36**；新增 0 处 `DEFERRED`、0 处 `ADAPTED`。

C++ 侧要点：

- `Spider` 继承 `Monster`，`typedef Monster super`。自有成员只有 `int fireCheckTick`
  （`protected`，构造函数初始化列表 `fireCheckTick(0)`）；`DATA_FLAGS_ID` 是 `static const int = 16`，
  `DataFlagIdType` = `SynchedEntityData::TypeChar` = `signed char`（`SynchedEntityData.h:109`）。
- 可见性（`Spider.h`）：`public` 段 = 构造函数、`aiStep`、`tick`、`getMaxHealth`、`onLadder`、
  `makeStuckInWeb`、`getModelScale`、`isClimbing`、`setClimbing`、`getEntityTypeId`；
  `protected` 段 = `makeStepSound`、`findAttackTarget`、`getAmbientSound`、`getHurtSound`、
  `getDeathSound`、`checkHurtTarget`、`fireCheckTick`、`getDeathLoot`。TS 与之一致。
- 构造函数：`setSize(1.4f, 0.9f)`、`runSpeed = 0.5f`、`textureName = "mob/spider.png"`、
  `entityRendererId = ER_SPIDER_RENDERER`、`entityData.define(DATA_FLAGS_ID, (DataFlagIdType) 0)`。
  只有 `fireCheckTick` 在初始化列表里，其余是函数体赋值；无未初始化成员。
- 原版怪癖（全部照抄）：
  1. `bool Spider::makeStepSound()` 是**方法**，遮蔽了基类 `Entity::makeStepSound` **字段**
     （`Entity.h:217`，`Entity.cpp:299` 读的是字段）——这个方法从不被调用，蜘蛛照样有脚步声。
     TS 按 R10 改名 `makeStepSoundMethod`（字段名保留）。
  2. `onLadder()` 直接返回 `isClimbing()`：攀爬时即使附近没有梯子也返回 true。
  3. `getMaxHealth()` 返回 8，C++ 注释里写着 `// 12`（未生效）。
  4. `makeStuckInWeb()` 空函数（蜘蛛不被网粘住）；C++ 注释 `// do nothing - spiders don't get stuck in web`。
  5. `fireCheckTick` 声明并置 0，但 Spider 从不读它（只有 Zombie / Skeleton 用同名成员）。
  6. `setClimbing(bool)` 的两个分支都是 `return <void 表达式>`（C++ 合法、无实际作用）。
  7. `checkHurtTarget` 里 `br > 0.5f` 时清目标；否则 2–6 格才扑跳，**其余情况**（含 2 格内）走
     `super::checkHurtTarget` 的普通近战。
- 被注释掉的 C++ 不复制：`dropDeathLoot`、`getRideHeight`、`getMobType`、`canBeAffected`（Spider.cpp:113-137）。
- 文件头第 2 行“撞墙即爬”与 `tick()` 一致：`setClimbing(horizontalCollision)` 仅在服务端执行。

## 工作表结论

| #   | C++ 函数                            | C++ 位置       | TS 方法               | TS 行 | 相似度 | 结论                                                                                                                                                                                                    |
| --- | ----------------------------------- | -------------- | --------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Spider(Level* level)`              | Spider.cpp:6   | `constructor`         | 23    | 0.71   | 一致：`super(level)` → `fireCheckTick = 0` → 渲染器 / 贴图 / `setSize(1.4f, 0.9f)` / `runSpeed = 0.5f` / `defineByte(16, 0)`；字面量逐个 `f()`；`defineByte` 对应 `define<TypeChar>`（signed char）     |
| 2   | `aiStep()`                          | Spider.cpp:19  | `aiStep`              | 33    | 1.00   | 一致：只 `super.aiStep()`（落到 `Monster::aiStep`）                                                                                                                                                     |
| 3   | `tick()`                            | Spider.cpp:23  | `tick`                | 37    | 0.98   | 一致：`super.tick()` 后 `!level.isClientSide` 才 `setClimbing(horizontalCollision)`；C++ 注释说明这是多人同步用，照抄                                                                                   |
| 4   | `getMaxHealth()`                    | Spider.cpp:33  | `getMaxHealth`        | 44    | 1.00   | 一致：返回 8（C++ 的 `// 12` 是注释，不生效）                                                                                                                                                           |
| 5   | `onLadder()`                        | Spider.cpp:37  | `onLadder`            | 48    | 1.00   | 怪癖保留：直接返回 `isClimbing()`，与附近有没有梯子无关（C++ 注释“always on a ladder”）                                                                                                                 |
| 6   | `makeStuckInWeb()`                  | Spider.cpp:41  | `makeStuckInWeb`      | 52    | 1.00   | 一致：空函数体（基类版本会置 `isStuckInWeb`、清 `fallDistance`，这里不调 `super`）                                                                                                                      |
| 7   | `getModelScale()`                   | Spider.cpp:45  | `getModelScale`       | 54    | 1.00   | 一致：返回 `1.0f` → `1.0`（float 字面量精确）；`public`（C++ 在 public 段，客户端 `SpiderRenderer.h:41` 调用）                                                                                          |
| 8   | `isClimbing()`                      | Spider.cpp:49  | `isClimbing`          | 58    | 0.83   | 一致：`entityData.getFlag<TypeChar>(16, 0)` → `getFlag(16, 0)`；`DataItem2<char>::getFlag` 读 bit 0，与 TS 的 `getFlag` 相同                                                                            |
| 9   | `setClimbing(bool value)`           | Spider.cpp:53  | `setClimbing`         | 62    | 0.81   | 一致（怪癖保留）：true → `setFlag(16, 0)`，false → `clearFlag(16, 0)`；C++ 两分支的 `return <void>` 无行为，TS 省略                                                                                     |
| 10  | `getEntityTypeId() const`           | Spider.cpp:60  | `getEntityTypeId`     | 67    | 1.00   | 一致：`MobTypes::Spider` = 35（`EntityTypes.h:52` ↔ `EntityTypes.ts:28`）                                                                                                                               |
| 11  | `makeStepSound()`                   | Spider.cpp:64  | `makeStepSoundMethod` | 72    | 1.00   | 怪癖保留：C++ 方法与基类字段同名、从不被调用；TS 按 R10 改名，返回 `false`，无调用点                                                                                                                    |
| 12  | `findAttackTarget()`                | Spider.cpp:68  | `findAttackTarget`    | 76    | 0.97   | 一致：`getBrightness(1) < 0.5f` 时 `level.getNearestPlayer(this, 16)`，否则 `NULL` / `null`；`protected`                                                                                                |
| 13  | `getAmbientSound()`                 | Spider.cpp:76  | `getAmbientSound`     | 84    | 1.00   | 一致：返回 `"mob.spider"`（`const char*` → `string \| null`）                                                                                                                                           |
| 14  | `getHurtSound()`                    | Spider.cpp:80  | `getHurtSound`        | 88    | 1.00   | 一致：`"mob.spider"`                                                                                                                                                                                    |
| 15  | `getDeathSound()`                   | Spider.cpp:84  | `getDeathSound`       | 92    | 1.00   | 一致：`"mob.spiderdeath"`                                                                                                                                                                               |
| 16  | `checkHurtTarget(Entity*, float d)` | Spider.cpp:88  | `checkHurtTarget`     | 96    | 0.87   | **已修 W36**：形参是 float，入口补 `d = f(d)`；亮处 `nextInt(100)==0` 清目标并返回，否则 `d > 2 && d < 6 && nextInt(10)==0` 且 `onGround` 时扑跳，其余走 `super`。随机数取用顺序与短路顺序均与 C++ 相同 |
| 17  | `getDeathLoot()`                    | Spider.cpp:109 | `getDeathLoot`        | 117   | 1.00   | 一致：`Item::string->id`；C++ `Item.h:213` 是 `id(256 + id)`，`Item::string` 用 31 → 287                                                                                                                |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复

**W36 `checkHurtTarget(Entity* target, float d)` 入口未舍入形参（清单第 2、3–7 条）。**
C++ 形参是 `float d`，实参在函数入口先转成 float，再参与 `d > 2`（int 提升成 float）和
`d < 6`（int 提升成 float）的比较。TS 原来直接拿 double 比较。
引擎内唯一调用方 `PathfinderMob::updateAi` 传的 `distanceTo()` 已经返回 float，
所以实际玩法路径不变；但按清单第 2 条的函数契约，入口必须舍入（与同批 W32 Creeper、W33 Monster 同类）。
修复：函数体第一行加 `d = f(d); // C++ 形参是 float，入口先舍入`。

先红后绿（`tests/unit/world/spider-audit.test.ts`）：

- 红：撤掉该行，`pnpm exec vitest run tests/unit/world/spider-audit.test.ts` 1 failed | 7 passed，
  `AssertionError: expected 0.4000000059604645 to be +0`——传入 `d = 5.999999999999999`
  （double 略小于 6，`f(d)` 正好是 6），未舍入时 `d < 6` 为真，蜘蛛扑跳（`yd = 0.4f`）；
  C++ 语义是 6.f 不小于 6，不扑跳。同一用例第二段用 `d = 2.0000000000000004`
  （double 略大于 2，`f(d)` 正好是 2）验证 `d > 2` 的另一侧。
- 绿：恢复该行后 8/8 通过。
- 测试里用固定种子让亮处的 `nextInt(100)` 与 `nextInt(10)` 满足条件（`findSeed` 扫 0–99999），
  避免依赖随机运气；`onGround = true`，目标放在 4 格外（x 方向），只验扑跳本身。

## ADAPTED / DEFERRED

- 无新增。文件头原有的两条“原样保留”说明（`makeStepSound` 字段遮蔽、空 `makeStuckInWeb`）核对无误；
  本次补了一条 `fireCheckTick` 从不被读取的说明（无行为变化，不涉及标记）。
- 既有代码在类外调用的是 `getEntityTypeId()`（`tests/unit/world/mobs.test.ts:77`）与
  `getMaxHealth()`（`packages/world/src/entity/MobFactory.ts:57`），二者在 C++ 里就是 `public`
  （`Mob.h:88`），没有需要放宽可见性的成员，因此没有 `ADAPTED(Cpp)`。

## 35 条清单核对要点

- 第 1–2 条：`fireCheckTick` 是 int；`DATA_FLAGS_ID` 是 int 常量。float 字段只有继承来的
  `runSpeed` / `xd` / `yd` / `zd` / `x` / `z` / `onGround` 相关量；本文件里所有 float 赋值都过 `f()`。
  `checkHurtTarget` 的 `d` 是 float 形参 → W36；`getBrightness(1)` 的实参 `1` 在 C++ 是 int→float 提升，
  精确，TS 直接传 `1` 一致。
- 第 3–7 条：`xdd` / `zdd` 是 `f(target.x - this.x)`（两操作数都是 float，double 算完一次舍入与 C++ 逐位相同）；
  `dd` = `f(Mth.sqrt(f(f(xdd*xdd) + f(zdd*zdd))))`，结合顺序 `(x²+z²)`、`Mth::sqrt` 先 `f(x)` 再 double `sqrt`
  再 `f()`（`Mth.cpp:20-24`）；`xd` 的 `((xdd/dd*0.5f)*0.8f) + xd*0.2f` 逐步左结合、字面量 `f(0.5)`/`f(0.8)`/`f(0.2)`；
  `yd = f(0.4)`；比较用的 `f(0.5)` 与 C++ 的 `0.5f` 一致。`d > 2` / `d < 6` 是 int 常量提升，TS 直接比较。
- 第 8 条：无整数除法（`divs.py` 只列出两处 float 除法，见上）；无 int 乘法 / 移位 / 回绕。
- 第 9–12 条：只用了 `Mth.sqrt`（float 版），没有裸 `sqrt` / `sin` / `cos`；无 long、无字符串格式化。
- 第 13–18 条：`aiStep` / `tick` / `checkHurtTarget` 的 `super` 都落到 C++ 指定的那一层
  （`Monster` 有 `aiStep` / `tick` / `checkHurtTarget`，与 `typedef Monster super` 一致）；全部重写都写了 `override`；
  无重载、默认参数；`makeStepSound` 的字段遮蔽按 R10 处理（PITFALLS #33）。
- 第 19 条：唯一自有成员 `fireCheckTick`，声明与初始化列表顺序一致。
- 第 20 条：`public` / `protected` 与 `Spider.h` 逐项一致（见 C++ 侧要点）；`getModelScale` 在 C++ 是 public，
  TS 也是 public；`makeStepSoundMethod` 在 C++ protected 段，TS 同样 protected。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：随机源是 `Mob::random`（C++ `Mob.h:204` 的成员 `Random random`）；
  `checkHurtTarget` 的取数顺序 = 书写顺序：先 `nextInt(100)`，条件不成立才 `nextInt(10)`；
  `&&` 短路顺序与 C++ 相同（`br > 0.5f` 不成立时**不取** `nextInt(100)`）；被注释掉的代码里没有随机数调用
  （`dropDeathLoot` 的 `nextInt` 整块是注释，不复制）。
- 第 30–33 条：字符串均为 ASCII 字面量；`(DataFlagIdType) 0` 是 signed char 的 0，`defineByte` 按 signed char 存；
  无 bool→int / int→bool 的隐式转换；无日志。
- 第 34 条：本文件没有 DEFERRED / OMIT 标记；文件头两条怪癖说明仍成立。
- 第 35 条：文件头核对无误（“撞墙即爬”“暗处才找玩家”“2–6 格扑跳”都与代码一致）；
  本次补了 `fireCheckTick` 说明；C++ 注释行号引用（`Spider.cpp:113-137` 的被注释代码）核对无误。

## 验证

- `pnpm exec vitest run tests/unit/world/spider-audit.test.ts`：8/8 通过（红绿对照见上）。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check packages/world/src/entity/monster/Spider.ts tests/unit/world/spider-audit.test.ts`：通过。
- `node tools/ledger.mjs`：共 173 条；Spider.ts 本次只改一行实现 + 一行注释，没有新增/删除任何
  DEFERRED / OMIT / ADAPTED 标记，台账条数不变。
