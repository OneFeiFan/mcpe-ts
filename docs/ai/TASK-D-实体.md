# 任务单 D：手册阻塞清单里的「独立实体」那一批

目标：**把 `docs/MCPE-TS后续清单-S11-S13.html` 里"堵在独立小实体类"那 8 条解开** ——
世界里多出会掉的沙子、会炸的 TNT、能射的箭、能扔的雪球和蛋、挂得上的画、用得上的三脚架相机。

现状（任务单 C 收尾时）：地形生成通了、界面齐了、存档通了。
`packages/world/src/entity/` 下**只有一个非玩家实体**（`ItemEntity`），
`FallingTile` / `TripodCamera` 是 6 行的前向声明，其余 5 个连文件都没有。
方块侧早就留好了钩子（`HeavyTile.falling`、`TntTile.wasExploded` 等的 `DEFERRED(Entity)`），
一直没人接。

原则不变：1:1 移植 C++；浏览器差异照旧集中在 ADAPTED(Web) 那层。

**一次只做一个步骤。** 每步结束：`pnpm typecheck && pnpm test` 通过、提交，并记下 `pnpm ledger` 的变化。

> ⚠ **这批没有黄金样本。** 它们是行为/画面，属 golden-sample 技能的**第三档**——
> "不比较数值，只做截图核对"。判据是：**无头真 Level 单测** + **浏览器场景（数字断言）+ 截图**。
> 见下面「每一步的详细验收」。

---

## D0 范围（用户 2026-10-04 拍板）

### 做什么

第三类那 8 条：`FallingTile`、`PrimedTnt`、`TripodCamera`、`HangingEntity`+`Painting`、
`Snowball`、`ThrownEgg`、`Arrow`。

### 不做什么（明确留下，不是忘了）

| 不做的 | 为什么 | 留成什么 |
| --- | --- | --- |
| `Sheep` / `DyePowderItem` | Sheep 是 Mob，要先把生物 AI 那一整套做出来 | 归第四类路线图；`DyePowderItem.ts:148` 那条 `DEFERRED(Entity)` 继续留着 |
| `MobAI`（`MoveControl`/`PathNavigation`/`GoalSelector`/…） | 自成一大块，跟这批没关系 | `DEFERRED(MobAI)` 14 条不动 |
| 所有实体**渲染器** | `EntityRenderDispatcher` 拿不到渲染器就跳过，实体照常 tick/碰撞/存档 | 做完这批再单开一轮；`EntityRendererId` 里七种 id 都已就位 |
| 网络包 | 网页单机版没有网络 | `DEFERRED(Network)` 照旧 |

### ⚠ 规划时实测出来的：这一批不是一样轻

原以为 8 条都是"照抄一个几十到几百行的独立类"。**实际有 3 条各自拖着一个没算进去的依赖**：

| 条目 | 自己 | 拖着谁 |
| --- | --- | --- |
| `FallingTile` | 157 | **无** |
| `Arrow` | 403 | **无**（干净但最大） |
| `TripodCamera` | 120 | `Level.takePicture`（4 行） |
| `HangingEntity` + `Painting` | 269 + 103 | `Motive`（136，画尺寸表） |
| `Snowball` | 50 | **`Throwable`（323）** |
| `ThrownEgg` | 63 | `Throwable`（共享）+ **`Chicken`（293，含 `Animal`）** |
| `PrimedTnt` | 127 | **`Explosion`（202）+ `Level.explode`（12）** |

所以第一批实际是 **341 行不是 127 行**。下面把它拆成 3 步。

---

## D0.5 依赖清单（实测，不是估的）

### 已经就位的（不用动）

- **`Entity` 基类完整**：`Entity.ts` 全文 `grep DEFERRED|OMIT` **零命中**。契约是
  `getEntityTypeId()` / `readAdditionalSaveData` / `addAdditonalSaveData`（`Entity.ts:127,130,133`），
  构造器里 `this.entityId = ++Entity.entityCounter`（`Entity.ts:120`）。
- **tick 链路通**：`Minecraft.tick` → `Level.tickEntities`（`Level.ts:1134`）→
  `Level.tickEntity`（`:1232`）→ `Entity.tick`（`Entity.ts:502`）。
- **`Level.addEntity`/`removeEntity`/`getEntities`/`mayPlace`/`setTileAndData`/`clip`** 都在。
- **`EntityTypes` 七个 id**、**`EntityRendererId` 七个枚举**、**`ParticleType`**（crit/smoke/explode/
  snowballpoof/bubble）、**`Direction`**（含 `DIRECTION_OPPOSITE`）、**`Mth`/`Random`/`AABB`/`Vec3`/`HitResult`**
  全都已有。
- **方块侧钩子已留好**：`HeavyTile.falling(_entity)`（`HeavyTile.ts:47`）、`onLand` 都是空虚函数占位。

### 实体怎么"注册"

**没有注册表**，只有一张硬编码 switch：`EntityFactory.CreateEntity`
（`packages/world/src/entity/EntityFactory.ts:38-52`），6 个 case 现在是 `DEFERRED(Entity)` 注释。
（唯一的"注册"机制是 `registerItemEntityClass`，那是给 `ItemEntity` 绕 ES 模块循环用的，与本批无关。）

### 渲染器不注册会怎样

**不会崩、不报错。** `EntityRenderDispatcher.renderAt` 找不到渲染器直接跳过
（`EntityRenderDispatcher.ts:94-100`），实体照常 tick / 碰撞 / 存档，**只是画面上看不见**。
所以**先做实体逻辑 + 存档、完全不碰渲染器**，是可行的，而且这批大部分本来就要另开一轮做渲染。

### 要替换的前向声明

- `packages/world/src/entity/item/FallingTile.ts`（6 行空接口）
- `packages/world/src/entity/item/TripodCamera.ts`（6 行空接口）
- `packages/world/src/index.ts:95,113` 现在是 `export type { … }`，要改成值导出
  （导出顺序照 `ItemEntity` 那条注释的先例）
- `packages/world/src/item/HangingEntityItem.ts:12-15` 里有个只含 `survives()` 的**局部**
  `interface HangingEntity`，要删掉换成真类

### 现成模板

`packages/world/src/entity/item/ItemEntity.ts`（240 行）是唯一已移植的非玩家实体，
`entityRendererId` / `tick` / NBT 读写 / 两个构造重载的写法照它抄。

---

## 拆分（十二小步）

| 步骤 | 内容 | 验收 |
| --- | --- | --- |
| **D0** | 把计划落成这份任务单 | 文件在、`task_plan.md` 指过来 |
| **D1** | `FallingTile` 类本身 | 单测：下落 + 落地放回方块 |
| **D2** | `FallingTile` 接线（HeavyTile/SandTile/EntityFactory） | **截图里沙子真的落下来了** |
| **D3** | `Explosion` + `Level.explode` | 单测：炸出坑、方块数减少 |
| **D4** | `PrimedTnt` 类 + 接线 | 场景：TNT 炸掉周围方块 |
| **D5** | `TripodCamera` 类 + `Level.takePicture` | 单测：生成后 tick 不崩 |
| **D6** | `HangingEntity` 基类 | 单测：`survives()` 的挂墙判定 |
| **D7** | `Motive` + `Painting` + 接线 | 场景：挂上一幅画 |
| **D8** | `Throwable` 基类 | 单测：最小子类飞行 + 落地 |
| **D9** | `Snowball` + 接线 | 场景：扔出去、飞、消失 |
| **D10** | `Chicken` + `ThrownEgg` + 接线 | 场景：扔蛋孵出鸡 |
| **D11** | `Arrow` + 接线 | 场景：射出去、插住 |
| **D12** | 收尾：台账、手册、文档 | — |

**每步 ≤300 行、≤5 文件。** 「移植一个类」和「把它接上线」分成两步 —— 各有独立判据
（类本身靠单测，接线靠场景），也把改动量压在线内。

### 每一步的详细验收

- **D1**：`tick()` **不调 `super.tick()`**（所以没有 `baseTick` 的着火/入水逻辑）。
  落地那两段 `if/else-if` 在原版里是**空块**（作者把放置逻辑掏空了、只留下判断的副作用）——
  照抄，别"顺手补上"。NBT 用 `putByte` 存 int，读回时**没有 `& 0xff`**（与 Arrow/Throwable 不一致，原样保留）。
- **D2**：⚠ `SandTile` 那条写法**和 `HeavyTile` 不一样**：没有 `!isClientSide` 守卫、不传 data、
  不调 `falling()`。别照 HeavyTile 抄。
- **D3**：`Level.explode` 里 `ExplodePacket` 那句照旧 `DEFERRED(Network)`。
- **D4**：`TntTile.ts:38-40` 的 `wasExploded` **连着一条随机数调用**
  （`level.random.nextInt(primed.life/4) + primed.life/8`），必须一起还原，不然随机流会错位。
  那几个函数的形参现在叫 `_level/_x/_y/_z`，接线时要改回 `level/x/y/z`。
- **D5**：⚠ `TripodCamera` 继承的是 **`Mob` 不是 `Entity`**；但它 `tick()` 完全不调 super，
  所以 Mob 的 AI 空壳不影响它。`getEntityTypeId()` 硬编码返回 **0**（原样）。
- **D6**：构造函数收到的 `dir` 参数**被丢弃**（`init()` 里 `dir = 0`）；`survives()` 里检查重叠画的
  循环写在 `for (ss...)` **里面**；NBT 同时写 `"Direction"` 和 `"Dir"`，读时优先前者。
- **D7**：⚠ **`Motive::getAllMotivesAsList()` 的顺序和声明顺序不同**，而 `setRandomMotive` 的随机下标
  就建立在这个顺序上 —— **顺序错一处，随机画作分布就变了**。
- **D8**：`tick()` **调 `super.tick()`**（与 D1/D4 相反，这里容易抄错）。
  落地存活是 `life == 20*60`（硬编码，**不乘 `TicksPerSecond`**）；Arrow 那边是 `60*TicksPerSecond`。
- **D9/D10**：`ThrownEgg::onHit` 是 **protected**、`Snowball::onHit` 是 **public** ——
  同一个虚函数、可见性不一致，原样保留。
- **D11**：`tick()` 调 `super.tick()`；`int dmg = (int)ceil(pow * 2.0f)`；
  插地存活是 `++life == 60*TicksPerSecond` 的**等于**判断；三个构造里只有一个不设 `heightOffset`。

---

## 怎么验证（三层里这批用两层）

1. **单测**（`tests/unit/world/`）：用 `tests/helpers/headlessLevel.ts` 的
   `createFlatLevel()` + `prepareLevel()` 起一个**真 Level**，跑 `addEntity` → `tickEntities`
   → 断言实体状态/坐标/方块变化。现成范例 `tests/unit/world/s12-phaseA.test.ts:72-106`。
   测方块联动的（沙子上有东西、箱子被炸）用 `FakeLevel` 的 `scheduled` / `droppedEntities`。
2. **浏览器场景**（`tools/verify/scenarios/`）：抄 `default.mjs` 的公式化写法。
   ⚠ `h.state` 的 fn 会被 `toString()` 之后在页面里重新求值，**闭包全丢、只能写字面量**。
   **截图必须用图片查看工具打开看**——脚本通过不等于画面对。
3. 物理轨迹若与现有 `harness_collision.cpp` 范围重叠，可复用
   `tests/golden/collision.golden.test.ts` 那个二档（1e-4 容差）通道。

⚠ **每接完一个实体，`tests/unit/world/entity-factory.test.ts:45-57` 里对应的那条
"这个 id 应该返回 null"要改成 `toBeInstanceOf(...)`** —— 它同时就是"接线完成"的检查点。

---

## 第四类：路线图（本任务单不做，只记顺序）

| 块 | 解开什么 | 大致体量 |
| --- | --- | --- |
| **粒子 + 声音**（`ParticleEngine`/`SoundEngine`） | `GameMode`/`SurvivalMode`；一大片 `DEFERRED(Particle)`/`DEFERRED(Sound)` | 中，但画面观感变化最大 |
| **配方系统**（`FurnaceRecipes`/`Recipe` 家族） | `FurnaceTileEntity` | 中 |
| **界面若干屏**（聊天/控制台/物品选择 + 工作台/箱子/熔炉/切石机/床/告示牌/死亡） | `Gui`、`LocalPlayer` 的 `DEFERRED(Gui)` | 大 |
| **MobAI** | `Mob` 的 15 条；连带 `Sheep`→`DyePowderItem`、`MobFactory`→`NetherReactorTileEntity` | 大 |
| **地物系统**（8 个 feature 类 + 树 feature 家族） | `Sapling`，**以及地形地物的 `postProcess`** | 大；⚠ 顺序是唯一要紧的事 |

**建议顺序**：粒子+声音 → 配方 → 界面 → MobAI → 地物。

---

## 每一步提交前的自检

- [ ] `PITFALLS.md`（28 条）逐条过了
- [ ] `divs.py`、`shadow.py` 跑过
- [ ] 新增的 DEFERRED 都写了系统名和 C++ 原句
- [ ] `pnpm typecheck`、`pnpm test` 通过
- [ ] 有画面的：跑了场景，**打开截图看过**
- [ ] `pnpm ledger` 条数对得上（这一步该降几条）
