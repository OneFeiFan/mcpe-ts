# PigZombie（src/world/entity/monster/PigZombie.h / .cpp ↔ packages/world/src/entity/monster/PigZombie.ts）

第 2 批（world/entity/monster）。工作表 19 行全部有结论。C++ `.h` 37 行 + `.cpp` 138 行，
TS 审核前 164 行、审核后 169 行。新增编号 **W34**；新增 1 处 `DEFERRED(待确认)`、
0 处 `ADAPTED`（既有文件头注释不变）。

C++ 侧要点：

- 自有成员：`int angerTime`、`int playAngrySoundIn`、`int stunedTime`、`ItemInstance weapon`
  （全部 `private`）。构造函数初始化列表 `angerTime(0), playAngrySoundIn(0), weapon(Item::sword_gold),
stunedTime(SharedConstants::TicksPerSecond * 3)`（书写顺序与声明顺序不同，但互相无依赖，
  TS 在 `super()` 后按列表赋值，行为一致；`weapon` 用 `ItemInstance(const Item*)` 重载 → count=1）。
- 可见性（PigZombie.h）：`public` 段 = 构造函数、`useNewAi`、`tick`、`getTexture`、`canSpawn`、
  `addAdditodalSaveData`、`readAdditionalSaveData`、`hurt`、`interact`、`getEntityTypeId`、
  `getAttackTime`、`getCarriedItem`；`protected` 段 = `findAttackTarget`、`getAmbientSound`、
  `getHurtSound`、`getDeathSound`、`dropDeathLoot`、`getDeathLoot`；`private` = `alert`。
  注意两个"放宽"：`useNewAi`（基类 `Mob.h:163` / `Zombie.h:38` 均为 protected virtual）与
  `getAttackTime`（基类 `Monster.h:50` 为 protected virtual）在 PigZombie.h 里重新声明进 public 段
  —— C++ 派生类允许放宽可见性，见 W34。
- `getAttackTime` 的 `virtual` 在 PigZombie.h 里显式写了（基类 Monster 里也是 virtual）；
  其余函数继承基类的 virtual 属性，声明处不再写。
- 渲染器：C++ 构造函数没改 `entityRendererId`，沿用 Zombie 构造时设置的 `ER_ZOMBIE_RENDERER`。

## 工作表结论

| #   | C++ 函数                      | C++ 位置          | TS 方法                  | TS 行 | 相似度 | 结论                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------- | ----------------- | ------------------------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `PigZombie(Level* level)`     | PigZombie.cpp:7   | `constructor`            | 29    | 0.53   | 一致：初始化列表四项逐一核对（`weapon` count=1，见上）；构造体内 `textureName/runSpeed(0.7f)/fireImmune/attackDamage(5)` 与 C++ 顺序一致                                                                                                                                                                                                                                                          |
| 2   | `useNewAi()`                  | PigZombie.cpp:19  | `useNewAi`               | 42    | 1.00   | **已修 W34**：C++ 在 public 段（基类 Mob/Zombie 是 protected），TS 原为 `protected override`，已改 `public override`                                                                                                                                                                                                                                                                              |
| 3   | `tick()`                      | PigZombie.cpp:23  | `tick`                   | 46    | 0.92   | 一致：`stunedTime--`、`--playAngrySoundIn == 0` 前置自减、音量 `getSoundVolume()*2`、音高 `((f1-f2)*0.2f+1.0f)*1.8f` 逐步 `f()`；两个 `nextFloat()` 求值顺序标 DEFERRED(待确认)（同 Chicken W28 的处理）                                                                                                                                                                                          |
| 4   | `getTexture()`                | PigZombie.cpp:35  | `getTexture`             | 66    | 1.00   | 一致                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | `canSpawn()`                  | PigZombie.cpp:39  | `canSpawn`               | 70    | 0.90   | 一致：`difficulty > PEACEFUL && isUnobstructed(bb) && getCubes(this, bb).empty()`；`&&` 短路顺序相同                                                                                                                                                                                                                                                                                              |
| 6   | `addAdditodalSaveData(...)`   | PigZombie.cpp:43  | `addAdditodalSaveData`   | 78    | 0.82   | 一致：拼写 `Additodal`→实为 `addAdditonal`（C++ 原文笔误，两侧一致）；`(short)angerTime` → `(this.angerTime << 16) >> 16`，符号扩展正确                                                                                                                                                                                                                                                           |
| 7   | `readAdditionalSaveData(...)` | PigZombie.cpp:48  | `readAdditionalSaveData` | 83    | 1.00   | 一致：`getShort('Anger')`（带符号 short）                                                                                                                                                                                                                                                                                                                                                         |
| 8   | `findAttackTarget()`          | PigZombie.cpp:53  | `findAttackTarget`       | 88    | 0.95   | 一致：晕眩（`stunedTime != 0`）返回 null；`angerTime == 0` 时目标须在 `distanceTo(x,y,z) < 5` 内；否则不设限；两侧都 protected                                                                                                                                                                                                                                                                    |
| 9   | `hurt(Entity*, int)`          | PigZombie.cpp:66  | `hurt`                   | 100   | 0.83   | 一致（怪癖保留 ×3）：① `attacker->isPlayer()` 在箭主人查不到时空指针解引用 → TS `attacker!.isPlayer()` 同样抛错；② `getEntities(this, ...)` 把自己排除，自己不被 alert（但 `Monster::hurt` 仍会设自己的 `attackTargetId`）；③ `alert(sourceEntity)` 传的是攻击源实体（可能是箭）而不是 attacker。alert 分支在 `super.hurt` **之前**执行，invulnerable 导致 super.hurt 返回 false 时同类照样被激怒 |
| 10  | `alert(Entity*)`              | PigZombie.cpp:94  | `alert`                  | 124   | 1.00   | 一致：`attackTargetId = target->entityId; angerTime = 20*20*nextInt(400); playAngrySoundIn = nextInt(40)`；随机取用顺序、`nextInit` 两个实参的常量都一致；private                                                                                                                                                                                                                                 |
| 11  | `getAmbientSound()`           | PigZombie.cpp:100 | `getAmbientSound`        | 130   | 1.00   | 一致：`mob.zombiepig.zpig`                                                                                                                                                                                                                                                                                                                                                                        |
| 12  | `getHurtSound()`              | PigZombie.cpp:104 | `getHurtSound`           | 134   | 1.00   | 一致：`mob.zombiepig.zpighurt`                                                                                                                                                                                                                                                                                                                                                                    |
| 13  | `getDeathSound()`             | PigZombie.cpp:108 | `getDeathSound`          | 138   | 1.00   | 一致：`mob.zombiepig.zpigdeath`                                                                                                                                                                                                                                                                                                                                                                   |
| 14  | `dropDeathLoot()`             | PigZombie.cpp:112 | `dropDeathLoot`          | 142   | 1.00   | 一致：`nextInt(2)` 个 `goldIngot->id`，count=1；`spawnAtLocation` 前没有 `getDeathLoot()` 检查（C++ 原样：`getDeathLoot()` 返回 0 但 `dropDeathLoot` 是独立虚函数，死亡掉落走这里）                                                                                                                                                                                                               |
| 15  | `interact(Player*)`           | PigZombie.cpp:120 | `interact`               | 149   | 1.00   | 一致：恒 false                                                                                                                                                                                                                                                                                                                                                                                    |
| 16  | `getDeathLoot()`              | PigZombie.cpp:124 | `getDeathLoot`           | 153   | 1.00   | 一致：返回 0；protected                                                                                                                                                                                                                                                                                                                                                                           |
| 17  | `getCarriedItem()`            | PigZombie.cpp:128 | `getCarriedItem`         | 157   | 0.91   | 一致：返回 `&weapon`（C++ 返回成员指针，TS 返回同一引用，共享语义一致：外部改动会影响 `weapon`）                                                                                                                                                                                                                                                                                                  |
| 18  | `getEntityTypeId() const`     | PigZombie.cpp:132 | `getEntityTypeId`        | 161   | 1.00   | 一致：`MobTypes::PigZombie`（C++ EntityTypes.h:53 = 36；TS EntityTypes.ts:29 = 36）                                                                                                                                                                                                                                                                                                               |
| 19  | `getAttackTime()`             | PigZombie.cpp:136 | `getAttackTime`          | 166   | 1.00   | **已修 W34**：C++ 在 public 段（基类 Monster.h:50 是 protected virtual），TS 原为 `protected override`，已改 `public override`                                                                                                                                                                                                                                                                    |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。

## 修复

**W34 `useNewAi` / `getAttackTime` 可见性与 C++ 不一致（清单第 20 条）。**
C++ `PigZombie.h:12` 把 `bool useNewAi()`、`PigZombie.h:19` 把 `virtual int getAttackTime()` 写在
`public` 段，而它们的基类声明（`Mob.h:163`、`Zombie.h:38`、`Monster.h:50`）都在 `protected` 段 ——
C++ 派生类重声明时放宽了可见性。TS 原先两处都写成 `protected override`，类外无法以 `PigZombie`
类型调用，类型契约与 C++ 不一致。修复：改为 `public override`，方法注释写明 C++ 段位与基类的差异
（同批次的 W27 Animal.removeWhenFarAway、既有 ADAPTED(Cpp) getWalkTargetValue 是同一类问题的三种形态）。

先红后绿（用 `npx tsc -p tests/tsconfig.json --noEmit` 锁定；vitest 转译后看不到可见性差异）：

- 红：临时把两个方法改回 `protected`，`npx tsc -p tests/tsconfig.json --noEmit` 退出码 2，两条
  `error TS2445: Property 'useNewAi'/'getAttackTime' is protected and only accessible within class 'PigZombie' and its subclasses.`
  （pigzombie-audit.test.ts 70:15 / 71:15）。
- 绿：恢复 `public` 后同一命令退出码 0、0 错误。
- 行为断言：`pigzombie-audit.test.ts` 从类外以 `PigZombie` 类型调用
  `useNewAi() === false`、`getAttackTime() === 40`。

## DEFERRED(待确认)：tick 里两个 nextFloat() 的求值顺序

```cpp
level->playSound(x, y, z, "mob.zombiepig.zpigangry", getSoundVolume() * 2,
                 ((random.nextFloat() - random.nextFloat()) * 0.2f + 1.0f) * 1.8f);
```

音高实参里两个 `random.nextFloat()` 的求值顺序在 C++ 里未指定（函数实参求值顺序未指定，清单第 28 条）。
本机不走 WSL、不生成新黄金样本；按项目先例（Entity/Mob/ItemEntity/Player/Chicken W28）取从左到右，
在调用处上方标 `// DEFERRED(待确认): <C++ 原句>` 并写明理由。测试里锁定的是 TS 的既定取舍
（前两次 nextFloat 给定 0.25/0.75，断言音高 = `f(f(f(f(0.25-0.75)*f(0.2))+f(1.0))*f(1.8))`）。

## 35 条清单核对要点

- 第 1–2 条：四个自有成员全是 int；无 float 字段。`hurt` 的 `dmg` 是 int 形参（调用链上层
  `Mob::hurt` 已按 int 处理），本文件没有 float 形参。
- 第 3–7 条：`runSpeed = 0.7f` → `f(0.7)`；`getSoundVolume() * 2`（1*2=2 精确）与音高表达式
  每步 `f()`、结合顺序 `((f1-f2)*0.2f+1.0f)*1.8f` 逐层核对；`stunedTime = TicksPerSecond*3 = 60`、
  `angerTime = 20*20*nextInt(400)`、`playAngrySoundIn = nextInt(40)`、`20*20*20` 类整数乘法
  无溢出；`distanceTo(x,y,z) < 5`（无后缀，5 精确）；无整数除法（divs.py 语义核对：唯一 `/` 是
  `invulnerableDuration / 2.0`，在上层 Mob.ts 里，不在本文件）。
- 第 8–12 条：无数学函数调用；无 long、无字符串格式化。
- 第 13–18 条：所有 override 重写的都是基类 virtual 函数；无重载分派（`ItemInstance(Item*)`
  单实参构造由 TS 的联合分派正确落到 `init(id, 1, 0)` 分支）；`super.tick`/`super.hurt`/
  `super.findAttackTarget` 的绑定层级逐个核对（PigZombie 的 super 是 Zombie：`Zombie` 没重写
  `hurt`，`super.hurt` 落到 `Monster::hurt`；`findAttackTarget` 落到 `Monster::findAttackTarget`
  的 16 格玩家查找）；无字段遮蔽、无默认参数。
- 第 19 条：构造函数体内没有虚调用；初始化列表与函数体赋值互不依赖。
- 第 20 条：`useNewAi` / `getAttackTime` 见 W34；`findAttackTarget`、声音三件套、`dropDeathLoot`、
  `getDeathLoot` 两侧都 protected；`alert` 两侧都 private；其余 public。
- 第 21–25 条：`bb.grow(12,12,12)` 返回新 AABB（AABB 按值语义，已核对 grow 不改原对象）；
  `EntityList` 遍历是数组 for-of，与 C++ 顺序一致；无 map/set/sort/哈希容器。
- 第 26–29 条：随机源全部是成员 `random`（`Mob.random`），alert 里两次取数顺序与 C++ 书写顺序一致；
  `tick` 的音高表达式顺序见 DEFERRED(待确认)；`canSpawn` 的 `&&` 短路顺序一致；无被注释掉但
  含随机数的条件。
- 第 30–33 条：字符串全是 ASCII 字面量；`addAdditodalSaveData` 的拼写笔误两侧一致；
  `(short)angerTime` → `<<16>>16` 符号扩展（0x1F123 → -3805，测试锁定）；无日志。
- 第 34 条：既有文件头两条"原样保留"（空指针解引用、alert 用 sourceEntity）核对仍成立，
  对应测试锁定（hurt 箭主人查不到时 toThrow；alert 目标是箭的 entityId）。
- 第 35 条：文件头注释与代码一致（渲染器沿用的说明与 mobs.test.ts 的断言互相印证）。

## 验证

- `pnpm exec vitest run tests/unit/world/pigzombie-audit.test.ts`：退出码 0，8/8 通过
  （W34 可见性、构造函数、tick 音效数值与晕眩计时、hurt→alert 群体激怒/箭主人/空指针怪癖、
  findAttackTarget 晕眩与 5 格限制、Anger short 存取）。
- `npx tsc -p packages/world --noEmit`：退出码 0，0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0，0 错误（W34 红绿对照见上）。
- `npx prettier --check packages/world/src/entity/monster/PigZombie.ts tests/unit/world/pigzombie-audit.test.ts`：
  通过（审核记录 .md 为中文文档，不在 prettier 检查范围）。
- 回归：`pnpm exec vitest run tests/unit/world/mobs.test.ts`（既有测试，含 PigZombie 的工厂
  类型/血量/渲染器断言）：退出码 0，15/15 通过。
- 台账：本文件新增 1 处 `DEFERRED(待确认)`（tick 音高求值顺序）、0 处 ADAPTED/OMIT。

## 环境备注

验证期间发现 `npx vitest` 在本机间歇性解析到错误的 vitest 副本，报
"Vitest failed to find the runner"，与本次改动无关（未改动任何文件时同样复现，空白探针文件亦然）。
`pnpm exec vitest` 不受影响，本文件的验证均以它为准。
