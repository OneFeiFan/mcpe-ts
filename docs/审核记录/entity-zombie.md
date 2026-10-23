# Zombie（src/world/entity/monster/Zombie.h / .cpp ↔ packages/world/src/entity/monster/Zombie.ts）

第 2 批（world/entity/monster）。工作表 14 行全部有结论（另加析构函数 1 行，共 15 项）。
C++ `.h` 44 行 + `.cpp` 129 行，TS 审核前 143 行、审核后 152 行。新增编号 **W37**；
新增 1 处 `DEFERRED(待确认)`、1 处 `ADAPTED(Cpp)`、1 处 `OMIT`（析构函数原先漏登记）。

C++ 侧要点：

- 自有成员：`int fireCheckTick`、`bool _useNewAi`（都在 `protected` 段）。
  构造函数初始化列表：`super(level), fireCheckTick(0), _useNewAi(false)`，没有未初始化成员。
- 可见性（`Zombie.h`）：`public` 段 = 构造函数、析构函数、`getMaxHealth`、`aiStep`、
  `getEntityTypeId`、`setUseNewAi`、`die`、`getAttackDamage`；`protected` 段 = `getArmorValue`、
  `getAmbientSound`、`getHurtSound`、`getDeathSound`、`getDeathLoot`、`useNewAi`。
- `getArmorValue` 在 C++ 里是**收窄**（基类 `Mob.h:92` 的 `virtual int getArmorValue()` 在 `public` 段，
  `Zombie.h:29` 重新声明进 `protected`）；`useNewAi`、`getEntityTypeId`、`die`、`getAttackDamage`
  显式写了 `virtual`，其余继承基类的 virtual 属性。
- 构造函数体顺序：`entityRendererId` → `textureName` → `runSpeed = 0.5f` → `attackDamage = 4` →
  `targetSelector`（两个 goal）→ `goalSelector`（两个 goal）→ `moveControl` → `jumpControl`。
- `aiStep` 的怪癖：`(++fireCheckTick & 1)` 隔刻检查；`getBrightness(1)` 的实参 1 在 C++ 里被转成
  float 但函数体没用；阳光燃烧的 5 个粒子坐标里各有一个 `nextFloat()`。
- `die` 的怪癖：`random.nextInt(1) + 1` 恒为 1（原文如此），掉的是 `Item::feather`。
- 渲染器 `ER_ZOMBIE_RENDERER` 由本类设置，`PigZombie` 沿用。

## 工作表结论

| #   | C++ 函数                          | C++ 位置       | TS 方法           | TS 行 | 相似度 | 结论                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------- | -------------- | ----------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Zombie(Level* level)`            | Zombie.cpp:15  | `constructor`     | 29    | 0.93   | 一致：初始化列表两项 + 构造体 9 步顺序逐一核对；`runSpeed = f(0.5)`、`attackDamage = 4`；四个 AI 组件按 C++ 顺序创建，goal 的优先级/参数与 C++ 相同                                                                                                                                            |
| 2   | `~Zombie()`                       | Zombie.cpp:41  | **（无）**        | —     | —      | OMIT：函数体只 `delete` 四个 AI 组件，JS 由 GC 接管（R3）。审核前漏登记，本次补 `// OMIT(Zombie)` 一行                                                                                                                                                                                         |
| 3   | `getMaxHealth()`                  | Zombie.cpp:49  | `getMaxHealth`    | 51    | 1.00   | 一致：返回 12；`Mob` 构造函数里用 `Mob.prototype.getMaxHealth.call` 取到 10，`MobFactory` 创建后再按虚函数取 12（与 C++ 相同）                                                                                                                                                                 |
| 4   | `aiStep()`                        | Zombie.cpp:53  | `aiStep`          | 55    | 0.83   | **已修 W37**：粒子 x/y/z 坐标改为 C++ 的逐步 float（`f(f(x + f((r*bbWidth)*2)) - bbWidth)` 等）；其余（`++fireCheckTick & 1`、`isDay`、`!isClientSide`、`br > 0.5f`、`canSeeSky(Mth.floor…)`、燃烧条件、xa/ya/za、`setOnFire(8)`、`super.aiStep()`）一致；多 nextFloat 顺序见 DEFERRED(待确认) |
| 5   | `getEntityTypeId() const`         | Zombie.cpp:74  | `getEntityTypeId` | 100   | 1.00   | 一致：`MobTypes::Zombie`（C++ EntityTypes.h:49 = 32；TS EntityTypes.ts:25 = 32）                                                                                                                                                                                                               |
| 6   | `setUseNewAi(bool use)`           | Zombie.cpp:78  | `setUseNewAi`     | 104   | 1.00   | 一致：只写 `_useNewAi`；public 两侧相同                                                                                                                                                                                                                                                        |
| 7   | `getArmorValue()`                 | Zombie.cpp:82  | `getArmorValue`   | 110   | 1.00   | ADAPTED(Cpp)：C++ 在 protected 段（基类 public），TS 不能收窄（实测 TS2322），保持 public 并标注释                                                                                                                                                                                             |
| 8   | `getAmbientSound()`               | Zombie.cpp:88  | `getAmbientSound` | 117   | 1.00   | 一致：`mob.zombie`；两侧都 protected；C++ 返回 `const char*`，TS 返回 `string \| null`                                                                                                                                                                                                         |
| 9   | `getHurtSound()`                  | Zombie.cpp:92  | `getHurtSound`    | 121   | 1.00   | 一致：`mob.zombiehurt`；protected                                                                                                                                                                                                                                                              |
| 10  | `getDeathSound()`                 | Zombie.cpp:96  | `getDeathSound`   | 125   | 1.00   | 一致：`mob.zombiedeath`；protected                                                                                                                                                                                                                                                             |
| 11  | `getDeathLoot()`                  | Zombie.cpp:100 | `getDeathLoot`    | 129   | 1.00   | 一致：返回 0（C++ 有 `//@todo` 注释，不复制）；protected                                                                                                                                                                                                                                       |
| 12  | `useNewAi()`                      | Zombie.cpp:105 | `useNewAi`        | 133   | 1.00   | 一致：返回 `_useNewAi`；protected 两侧相同                                                                                                                                                                                                                                                     |
| 13  | `die(Entity* source)`             | Zombie.cpp:109 | `die`             | 137   | 0.99   | 一致：`super.die` 先执行（落到 `Mob::die`），`!isClientSide` 下 `nextInt(4) == 0` 掉 `feather`，数量 `nextInt(1) + 1`（恒为 1 的怪癖保留）                                                                                                                                                     |
| 14  | `getAttackDamage(Entity* target)` | Zombie.cpp:118 | `getAttackDamage` | 146   | 0.94   | 一致：`getCarriedItem()` 非 null 时 `damage += weapon->getAttackDamage(this)`；`target` 在 C++ 里也没用（TS 写 `_target`）                                                                                                                                                                     |

C++ 有、TS 没有的方法：仅析构函数（已按 R3 登记 OMIT）。TS 有、C++ 没有的方法：无。

## 修复

**W37 `aiStep` 阳光燃烧粒子的坐标没有按 float 逐步舍入（清单第 3–4 条）。**

C++ 原句（Zombie.cpp:71）：

```cpp
level->addParticle(PARTICLETYPE(explode), x + random.nextFloat() * bbWidth * 2 - bbWidth, y + random.nextFloat() * bbHeight, z + random.nextFloat() * bbWidth * 2 - bbWidth, xa, ya, za);
```

`x`、`bbWidth`、`bbHeight` 都是 float，`random.nextFloat()` 返回 float，整条表达式按 float 逐步运算：
`((x + ((r * bbWidth) * 2)) - bbWidth)`，加、减各舍入一次。TS 以前写的是
`this.x + f(this.random.nextFloat() * this.bbWidth * 2) - this.bbWidth` —— 只对乘积舍入，
加法和减法在 double 里做完后直接传给 `addParticle`。当 `x = 130.5`、`bbWidth = 0.6`、`r = 0.00008` 时，
旧写法得 129.90009597616154，C++ 得 129.90008544921875；`y` 同理（`f(y + f(r * bbHeight))`）。
后果：粒子的生成位置与 C++ 相差 1 个 float ULP 左右，且 `LevelRenderer::addParticle` 会用这个坐标算与
玩家的距离（影响粒子是否显示、以及渲染位置）。

修复：三轴都改为 `f(f(this.x + f(f(r * this.bbWidth) * 2)) - this.bbWidth)`、`f(this.y + f(r * this.bbHeight))`、
`f(f(this.z + f(f(r * this.bbWidth) * 2)) - this.bbWidth)`，与 `Mob.ts` 死亡爆炸粒子的写法一致。

先红后绿：

- 红：`pnpm exec vitest run tests/unit/world/zombie-audit.test.ts` 退出码 1，
  `W37：粒子 x/y/z 按 C++ 逐步 float 舍入` 失败：
  `AssertionError: expected 129.90009597616154 to be 129.90008544921875`（1 failed | 5 passed）。
- 绿：改实现后同一命令退出码 0，6/6 通过。
- 测试用固定随机序列（燃烧条件 0.05、xa/ya/za 三对、粒子三轴各一个）钉住 x/y/z 与 xa/ya/za 的逐位值，
  并额外断言 xa 的乘积先舍入（不是整段 double 最后再舍入）。

## DEFERRED(待确认)：aiStep 里多个 nextFloat() 的求值顺序

`xa`/`ya`/`za` 三行各有两个 `random.nextFloat()`（乘法两个操作数），`addParticle` 那一句有三个
（x、y、z 三个实参）。C++ 里函数实参与二元运算符的操作数求值顺序都未指定（清单第 28 条），
本机不生成新黄金样本；按项目先例（Entity/Mob/ItemEntity/Player/Chicken W28/PigZombie W34）取从左到右，
在 `addParticle` 调用上方标 `// DEFERRED(待确认): <C++ 原句>` 并写明理由。测试锁定的是 TS 的既定取舍
（前两次 nextFloat 给 0.00008 / 0.99992，断言 xa = `f(f(-0.99984… * 0.99984…) * f(0.02))`）。

## ADAPTED(Cpp)：`getArmorValue` 保持 public

C++ `Zombie.h:29` 把 `int getArmorValue()` 重新声明进 `protected` 段，基类 `Mob.h:92` 的是 `public`。
TS 不允许把 public 的重写收窄成 protected，实测 `npx tsc -p packages/world --noEmit` 退出码 2：

```
packages/world/src/entity/MobFactory.ts(41,9): error TS2322: Type 'Zombie' is not assignable to type 'Mob'.
  Property 'getArmorValue' is protected in type 'Zombie' but public in type 'Mob'.
```

（同一处还会连带 `PigZombie`。）恢复 public 后退出码 0。运行行为不变（JS 没有编译期可见性），
方法上方已标 `ADAPTED(Cpp)` 与 C++ 段位。

## 注释修正（清单第 35 条）

文件头原写「`useNewAi()` … 唯一的调用点 `Level::setZombieAi` 在 Level.cpp:1429 被注释掉」。
核对 C++ 后发现不准确：`Level::tickEntities` 里每刻还会对每个僵尸调用
`((Zombie*)e)->setUseNewAi(false)`（Level.cpp:1388），`setZombieAi` 内部另有 Level.cpp:1512/1522 两处
`setUseNewAi(true)`。已把文件头改为「能让它为真的唯一调用点 `setZombieAi` 被注释掉；此外 `tickEntities`
每刻还会 `setUseNewAi(false)`」，结论（正常游戏恒为 false）不变。

## 35 条清单核对要点

- 第 1–2 条：`fireCheckTick` 是 int、`_useNewAi` 是 bool；`runSpeed` / `x` / `y` / `z` / `bbWidth` /
  `bbHeight` / `getBrightness` 返回值都是 float（TS 分别 `f(0.5)`、`Float32Array` 元素、`f()`）。
  本文件没有 float 形参（`getAttackDamage` 的 target 是实体指针，`die` 的 source 同理）。
- 第 3–7 条：`br > f(0.5)`、`f(r * f(3.5)) < f(br - f(0.4))`、`(2.0f*r - 1.0f) * (2.0f*r - 1.0f) * 0.02f`
  的每一步 `f()`、结合顺序（`f(f(a*b)*f(0.02))`）与 C++ 一致；W37 修的是粒子坐标的加/减舍入。
  `++fireCheckTick & 1` 的优先级（`++` > `&` > `&&`）两侧相同；无整数除法（`divs.py` 无输出）。
- 第 8–12 条：`Mth.floor` 用于 `canSeeSky` 三个坐标（内部先 `f()` 再 `f2i`）；`setOnFire(8)` 里
  `8 * 20 = 160` 是整数乘法无溢出；无 long、无字符串格式化、无数学库调用。
- 第 13–18 条：`super.aiStep()` 落到 `Monster::aiStep`（C++ `typedef Monster super`），
  `super.die` 落到 `Mob::die`（`Monster` 没重写 `die`），`super.getArmorValue` 落到 `Mob::getArmorValue`，
  均与 C++ 相同；无重载、默认参数、字段遮蔽；构造函数体内没有虚调用
  （`NearestAttackableTargetGoal` 等只是被 `new`，不会回调本类方法）。
- 第 19 条：两个自有成员在 `super()` 后按声明/初始化列表顺序赋值；字段初始化器与构造函数重复赋 0/false，
  无依赖。
- 第 20 条：`getArmorValue` 见 ADAPTED(Cpp)；`getAmbientSound` / `getHurtSound` / `getDeathSound` /
  `getDeathLoot` / `useNewAi` 两侧都 protected；其余 public 两侧相同。
- 第 21–25 条：无按值对象、容器、排序、哈希容器。
- 第 26–29 条：随机源全部是成员 `random`（`Entity.random`，C++ `Mob`/`Entity` 的成员），
  未混用 `level.random`；燃烧条件先短路 `isDay`/`isClientSide`/`canSeeSky`，与 C++ `&&` 顺序一致；
  多个 `nextFloat()` 的顺序见 DEFERRED(待确认)；`die` 的 `nextInt(4)` → `nextInt(1)` 顺序与 C++ 一致。
  被注释掉的 C++（`//@todo`、构造函数里注释掉的 xpReward）没有随机数调用，未复制。
- 第 30–33 条：字符串全是 ASCII 字面量；`bool` 直接参与条件；无 char 转换、无日志。
- 第 34 条：原有 `ADAPTED(Cpp)`（无）；本次新增 OMIT（析构）、DEFERRED(待确认)（求值顺序）、
  ADAPTED(Cpp)（getArmorValue），逐条见上。
- 第 35 条：文件头的调用点说明已按上文修正；其余注释核对无误。

## 验证

- `pnpm exec vitest run tests/unit/world/zombie-audit.test.ts`：退出码 0，`Test Files 1 passed`，
  `Tests 6 passed`（构造状态与可见性、W37 粒子坐标、隔刻检查、die 掉羽毛 ×2）。
- `npx tsc -p packages/world --noEmit`：退出码 0（ADAPTED 的红绿对照见上）。
- `npx tsc -p tests/tsconfig.json --noEmit`：退出码 0。
- `npx prettier --check packages/world/src/entity/monster/Zombie.ts tests/unit/world/zombie-audit.test.ts`：
  退出码 0。
- 台账：审核前 173 条 → 审核后 176 条，新增 OMIT(Zombie) 1、DEFERRED(待确认) 1、ADAPTED(Cpp) 1。
