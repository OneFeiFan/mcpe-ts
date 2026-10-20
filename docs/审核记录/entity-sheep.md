# Sheep（src/world/entity/animal/Sheep.h / .cpp ↔ packages/world/src/entity/animal/Sheep.ts）

第 2 批（world/entity/animal）。工作表 23 行全部有结论（任务单写 24 行，`tools/audit/worksheet.py`
实际输出 23 行 = 构造函数 1 + 成员函数 22；静态成员 `COLOR` / `NumColors` 不占行，结论见下）。
C++ `.h` 91 行 + `.cpp` 253 行，TS 审核前 261 行、审核后 265 行。新增编号 **W31**。

C++ 侧要点：

- 唯一自有数据成员 `int eatAnimationTick`（`private`，初始化列表 `eatAnimationTick(0)`）；另有两个
  `private` 静态常量 `EAT_ANIMATION_TICKS`（= TicksPerSecond×2 = 40）、`DATA_WOOL_ID`（16），
  以及 `public` 静态 `COLOR`（16×3 的 float 表）与 `NumColors`。
- 可见性（Sheep.h 原文）：`public` 段 = 构造函数、`getMaxHealth`、`aiStep`、`handleEntityEvent`、
  `getHeadEatPositionScale`、`getHeadEatAngleScale`、`interact`、`addAdditonalSaveData`、
  `readAdditionalSaveData`、`getColor`、`setColor`、`getSheepColor`（static）、`isSheared`、
  `setSheared`、`getEntityTypeId`；`protected` 段 = `dropDeathLoot`、`getDeathLoot`、`jumpFromGround`、
  `updateAi`、`shouldHoldGround`、`getAmbientSound`、`getHurtSound`、`getDeathSound`。TS 与之逐一同侧
  （含两个 private 静态常量），没有 Chicken.getBreedOffspring 那类需要 ADAPTED(Cpp) 的可见性例外。
- 所有方法要么重写基类虚函数（`virtual` 可继承），要么是 Sheep 自有新函数；无重载、无默认参数、
  无字段/方法遮蔽；构造函数体内没有虚调用（`setSize` 在 Sheep 无重写，两侧同一函数）。
- Sheep.h:64-71 的 `getBreedOffspring` 整块被注释掉（Java 风格残留），按"被注释掉的代码不复制"
  不移植，TS 里也没有它（工作表两侧均无）。
- `NumColors = sizeof(COLOR) / sizeof(Sheep*)`：按"一行颜色"的大小该是 16，除以**指针**大小在
  64 位构建得 24；全参考源码**零读取方**（rg 复核：仅 .h 声明 + .cpp 定义，无任何调用点）。
  TS 取 24 并在文件头写明来历（怪癖保留）。

## 工作表结论

（TS 行号是审核前工作表生成的行号；W31 修复使 79 行起 +4。）

| #   | C++ 函数                               | C++ 位置      | TS 方法                   | TS 行 | 相似度 | 结论                                                                                                                                                                                                              |
| --- | -------------------------------------- | ------------- | ------------------------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Sheep(Level* level)`                  | Sheep.cpp:27  | `constructor`             | 51    | 0.68   | 一致：初始化列表 `eatAnimationTick(0)`；`setSize(0.9f, 1.3f)` 调用点 `f()`；`define(DATA_WOOL_ID, (TypeChar)0)` → `defineByte`（R10 具名法）                                                                      |
| 2   | `getMaxHealth()`                       | Sheep.cpp:40  | `getMaxHealth`            | 60    | 1.00   | 一致：返回 8                                                                                                                                                                                                      |
| 3   | `aiStep()`                             | Sheep.cpp:45  | `aiStep`                  | 64    | 1.00   | 一致：先 `super.aiStep()` 再递减                                                                                                                                                                                  |
| 4   | `handleEntityEvent(char id)`           | Sheep.cpp:54  | `handleEntityEvent`       | 71    | 0.96   | 一致：`EAT_GRASS = 10` 两侧同值                                                                                                                                                                                   |
| 5   | `getHeadEatPositionScale(float a)`     | Sheep.cpp:63  | `getHeadEatPositionScale` | 79    | 0.86   | **已修 W31**：形参 `a` 入口舍入；四分支边界（≤0 / [4,36] / <4 / 其余 37..40）与逐步舍入核对一致                                                                                                                   |
| 6   | `getHeadEatAngleScale(float a)`        | Sheep.cpp:77  | `getHeadEatAngleScale`    | 93    | 0.82   | **已修 W31**：同上；`scale`、`PI×.2f`、`(PI×.07f)×sin`、`xRot/(180/PI)` 的逐步舍入与结合顺序逐项一致                                                                                                              |
| 7   | `interact(Player* player)`             | Sheep.cpp:89  | `interact`                | 105   | 0.88   | 一致：条件顺序、`((Item*)Item::shears)->id`、随机数顺序（`nextInt(3)` → 每轮 `nextFloat`×1/×2/×2）、`item.hurt(1)` 在 isClientSide 块外；**新增 DEFERRED(待确认)**（两个 `nextFloat` 求值顺序，xd/zd 两句）       |
| 8   | `addAdditonalSaveData(CompoundTag*)`   | Sheep.cpp:109 | `addAdditonalSaveData`    | 123   | 0.89   | 一致：`(char)getColor()` → `(x<<24)>>24`（getColor 恒 0..15，实为恒等，照通用写法保留）                                                                                                                           |
| 9   | `readAdditionalSaveData(CompoundTag*)` | Sheep.cpp:116 | `readAdditionalSaveData`  | 129   | 1.00   | 一致                                                                                                                                                                                                              |
| 10  | `getColor() const`                     | Sheep.cpp:123 | `getColor`                | 135   | 0.87   | 一致：`& 0x0f`                                                                                                                                                                                                    |
| 11  | `setColor(int color)`                  | Sheep.cpp:128 | `setColor`                | 139   | 0.83   | 一致：`(current & 0xf0) \| (color & 0x0f)`；current 恒 0..31（位 5–7 没有写入路径），char 符号位不参与；`setByte` 的 wrap 即 `(TypeChar)` 转换                                                                    |
| 12  | `isSheared() const`                    | Sheep.cpp:134 | `isSheared`               | 144   | 0.89   | 一致：`& 0x10`                                                                                                                                                                                                    |
| 13  | `setSheared(bool value)`               | Sheep.cpp:139 | `setSheared`              | 148   | 0.78   | 一致：`~0x10` 的 int 提升两侧同                                                                                                                                                                                   |
| 14  | `getSheepColor(Random*)`（static）     | Sheep.cpp:149 | `getSheepColor`           | 157   | 1.00   | 一致：<5/<10/<15/<18 → `15 - 常数`；≥18 才抽 `nextInt(500)`；新增单测钉住阈值与短路                                                                                                                               |
| 15  | `getEntityTypeId() const`              | Sheep.cpp:167 | `getEntityTypeId`         | 167   | 1.00   | 一致：`MobTypes.Sheep`                                                                                                                                                                                            |
| 16  | `dropDeathLoot()`                      | Sheep.cpp:172 | `dropDeathLoot`           | 171   | 0.98   | 一致：未剪毛掉 1 个当前色羊毛（yOffs=0）                                                                                                                                                                          |
| 17  | `getDeathLoot()`                       | Sheep.cpp:180 | `getDeathLoot`            | 177   | 1.00   | 一致：`Tile.cloth.id`                                                                                                                                                                                             |
| 18  | `jumpFromGround()`                     | Sheep.cpp:185 | `jumpFromGround`          | 181   | 1.00   | 一致：动画进行中不跳                                                                                                                                                                                              |
| 19  | `updateAi()`                           | Sheep.cpp:192 | `updateAi`                | 187   | 0.97   | 一致：条件短路顺序（寻路中 / 动画中不抽随机；非 baby 不抽 `nextInt(50)`）；怪癖保留——啃方块挂在 `else if (eatAnimationTick == 4)`（随机判定不成立的那一支），吃到才 `setSheared(false)`、幼崽 `age + 1200` 封顶 0 |
| 20  | `shouldHoldGround()`                   | Sheep.cpp:235 | `shouldHoldGround`        | 246   | 1.00   | 一致                                                                                                                                                                                                              |
| 21  | `getAmbientSound()`                    | Sheep.cpp:240 | `getAmbientSound`         | 250   | 1.00   | 一致：`mob.sheep`                                                                                                                                                                                                 |
| 22  | `getHurtSound()`                       | Sheep.cpp:245 | `getHurtSound`            | 254   | 1.00   | 一致：`mob.sheep`                                                                                                                                                                                                 |
| 23  | `getDeathSound()`                      | Sheep.cpp:250 | `getDeathSound`           | 258   | 1.00   | 一致：`mob.sheep`                                                                                                                                                                                                 |

C++ 有、TS 没有的方法：无。TS 有、C++ 没有的方法：无。
静态成员：`COLOR` 一致（16×3 逐行核对，全部 `f()` 映射，常量带 `f` 后缀）；`NumColors` 怪癖保留
（= 24 ≠ 16，64 位构建，零读取方）。

## 修复

**W31 `getHeadEatPositionScale` / `getHeadEatAngleScale` 的 float 形参 `a` 没有在入口舍入（清单 5.1 第 2 条）。**

C++ 两个函数的签名都是 `(float a)`（Sheep.cpp:63、77）；调用方 `SheepModel` / `SheepFurModel` 的
`setupAnim` 传的是渲染插值 partial tick——任意 double，C++ 在**调用边界**就舍成 float。TS 原先直接
拿 double 参与 `(float)e - a` 的运算。修复：两个函数开头加 `a = f(a)`（与 W33
`Monster.checkHurtTarget` 同款写法）。其余的逐步舍入与结合顺序逐项核对本就一致：

- `((float) eatAnimationTick - a) / 4.f` → `f(f(e - a) / 4)`；
- `-((float)(e - EAT_ANIMATION_TICKS) - a) / 4.f`：括号里**先 int 减再转 float** →
  `f(-f(f(e - T) - a) / 4)`；
- `((float)(e - 4) - a) / (float)(EAT - 8)` → `f(f(f(e - 4) - a) / (T - 8))`；
- `Mth::PI * .20f + Mth::PI * .07f * Mth::sin(scale * 28.7f)` 是 `(PI×.07f)×sin`、`PI×.2f + …` →
  `f(f(PI*f(0.2)) + f(f(PI*f(0.07)) * Mth.sin(f(scale*f(28.7)))))`；
- 末分支 `xRot / (float)(180 / Mth::PI)` 是 float 除法 → `f(xRot / f(180 / Mth.PI))`。

后果实例：`eatAnimationTick = 2`、`a = 0.30000001564621925`（比 `f(a)` 大半个 ULP）时，
`f(f(2 - f(a)) / 4) = 0.42500001192092896`，而修复前 `f(f(2 - a) / 4) = 0.42499998211860657`；
角度分支差半个 ULP 还会让 `Mth.sin` 查表下标差 1。

先红后绿（`tests/unit/world/sheep-audit.test.ts`）：

- 判别值用穷举脚本找（2^-28 网格、精确复刻 `Mth.sin` 查表）：位置 (e=2, a=0.30000001564621925)、
  角度 (e=12, a=0.20000195875763893)，两条都能让「入口舍入」与「不舍入」得到不同的 float。
- 红：临时删掉两行 `a = f(a);`，`pnpm exec vitest run tests/unit/world/sheep-audit.test.ts`
  退出码 1，恰好两条 W31 用例失败：`expected 0.42499998211860657 to be 0.42500001192092896`、
  `expected 0.7720545530319214 to be 0.7720704674720764`（另 3 条不依赖修复，仍绿）。
- 绿：恢复后同一命令 5/5 通过，退出码 0。
- 测试经公有 API 驱动 private 的 `eatAnimationTick`：`handleEntityEvent(EAT_GRASS)` 置 40、
  `aiStep` 逐帧递减到目标刻；`AuditSheep` 子类关掉 `updateAi`（`Mob::aiStep` 先跑 `updateAi`，
  会抽随机数 / 啃方块，chicken-audit 同款做法）。

## ADAPTED / DEFERRED

- 新增 **DEFERRED(待确认) 1 处**：`interact` 里
  `ie->xd += (random.nextFloat() - random.nextFloat()) * 0.1f;`（zd 那句同款）。C++ 同一表达式里
  两个 `nextFloat()` 的求值顺序未指定（GCC 可能右到左）；TS 按从左到右，与
  Entity / Mob / ItemEntity / Player / Chicken(W28) 的先例一致。本机不走 WSL、不生成黄金样本，
  待确认。行为本身（剪毛、掉 1–3 个当前色羊毛、`item.hurt(1)`、`super.interact`）不变，
  仍由 mobs.test.ts 覆盖。
- 新增 ADAPTED：无。文件头原有的 NumColors 说明写在块注释里（不进台账），本次逐条复核属实。
- 审核前 Sheep.ts 没有任何 DEFERRED / OMIT / ADAPTED 台账标记；审核后 1 处（严格正则实测 0 → 1）。

## 35 条清单核对要点

- 第 1–2 条：本文件唯一的 float 形参就是两个 `getHeadEat*` 的 `a`（W31 已修）；
  `eatAnimationTick` / `EAT_ANIMATION_TICKS` / `DATA_WOOL_ID` / `NumColors` 都是 int。
- 第 3–7 条：逐步舍入与结合顺序见上；`ie->yd += …` 复合赋值先算右边再舍入；常量
  `0.05f / 0.1f / .20f / .07f / 28.7f / 0.9f / 1.3f` 全带 f 后缀 → TS `f()`；int→float 的
  `(float)e`、`(float)(e - T)` 均精确。
- 第 8 条：`divs.py` 列出 5 处除法逐条判过：`NumColors` 的 `(16*3*4)/8` 是 int 怪癖（=24 精确）；
  其余 4 处（`/4`、`/32`、`/f(180/PI)`）都是 float 语义。乘法均为小整数，无溢出。
- 第 9–12 条：`Mth.sin` / `Mth.floor` 用对；无 C 库数学函数、无 long、无字符串格式化、无 NaN 路径。
- 第 13–18 条：全部 `override`；`super::*` 的解析与 C++ `typedef Animal super` 一致（Animal 层没有
  `aiStep` / `handleEntityEvent` / `interact` / 存档函数 / `updateAi` / `jumpFromGround`，落到的都是
  Mob / Entity 的版本）；无重载、默认参数、遮蔽；构造函数无虚调用。
- 第 19 条：`eatAnimationTick` 声明即初始化，无顺序歧义。
- 第 20 条：可见性逐一同侧（含 private 静态常量与 public 的 COLOR / NumColors），无 ADAPTED 例外。
- 第 21–25 条：`new ItemInstance(…)` 按值新建；无容器 / 排序 / 哈希。
- 第 26–29 条：随机源全是 `this.random`（`getSheepColor` 用传入的 Random）；取数顺序逐句核对
  （`nextInt(3)` → 每轮 `nextFloat`×1 / ×2 / ×2；`updateAi` 条件短路：寻路中 / 动画中不抽随机，
  非 baby 不抽 `nextInt(50)`）；同表达式两个 `nextFloat` 的顺序未指定 → DEFERRED(待确认)；
  Sheep.h:64-71 被注释掉的 `getBreedOffspring` 未复制。
- 第 30–33 条：字符串全 ASCII（`mob.sheep`、`mob/sheep.png`、`Sheared`、`Color`）；
  `(char)getColor()` 与 `getByte` 的符号语义两侧一致；无 bool/int 转换、无日志。
- 第 34 条：见 ADAPTED / DEFERRED 节（0 → 1）。
- 第 35 条：文件头三处声明逐条复核：`DATA_WOOL_ID` 位布局（低 4 位颜色、0x10 剪毛）对；
  「NumColors 全参考源码零读取方」经 rg 复核属实；192/8 的来历正确。

## 验证

- `pnpm exec vitest run tests/unit/world/sheep-audit.test.ts`：**5/5 通过，退出码 0**
  （红绿对照见上：撤掉修复 = 2 失败 / 3 通过，退出码 1）。
  ⚠ 任务单原命令 `npx vitest run …` 在本机报 `Vitest failed to find the runner`，对仓库**既有**测试
  同样如此（chicken-audit.test.ts 实测同样失败）——是 npx 解析到错误 vitest 副本的环境问题；
  `pnpm exec vitest`（同一个本地 vitest 5.0.3）正常，以上数字以它为准。
- `npx tsc -p packages/world --noEmit`：**0 错误，退出码 0**。
- `npx tsc -p tests/tsconfig.json --noEmit`：**0 错误，退出码 0**（最终状态）。
  过程中曾报 3 处错误，全部位于 `tests/unit/world/pigzombie-audit.test.ts`——那是**并行进行的
  PigZombie 审核会话**的未提交工作（git 状态：`M packages/world/src/entity/monster/PigZombie.ts` +
  未跟踪的 `pigzombie-audit.test.ts`），与 Sheep 无关（把本次 Sheep.ts 改动 stash 掉重跑，同样是
  那 3 处）；该会话随后自行修好，重跑归零。本次新增 / 修改的两个 TS 文件始终 0 报错。
- `npx prettier --check packages/world/src/entity/animal/Sheep.ts tests/unit/world/sheep-audit.test.ts
docs/审核记录/entity-sheep.md`：三个文件全部通过（记录文件先 `--write` 规范了一次表格对齐）。
- 台账：Sheep.ts 的 DEFERRED / OMIT / ADAPTED 标记 0 → 1（`tools/ledger.mjs` 的严格正则实测）。
