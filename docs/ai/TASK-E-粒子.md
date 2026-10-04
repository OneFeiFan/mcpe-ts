# 任务单 E：粒子系统

把 `$REF/src/client/particle/` 整个搬过来并接上线。

**目标**：世界里会冒烟、会溅碎屑、爆炸有火光、箭有暴击星 —— 而且这些粒子是**真实游戏事件**发出来的，
不是我们手动撒的。

上一份 `docs/ai/TASK-D-实体.md`（实体）已完成，D0–D12 全部走完，台账 252 → 236。
**下一份** `docs/ai/TASK-F-声音.md`（声音）在本任务单做完后另开。

---

## E0 范围（用户 2026-10-04 拍板）

### 做什么

`Particle` 基类 + 10 个活的粒子子类 + `ParticleEngine` + 接住 `Level.addParticle` 的分派，
以及客户端那 7 处 `DEFERRED(Particle)` 的接线。

### 不做什么（明确留下，不是忘了）

| 不做 | 为什么 |
| --- | --- |
| `SplashParticle` | 它的基类 `WaterDropParticle.h` 在参考树里**根本不存在**（`ls $REF/src/client/particle/` 没有这个文件），也不在 `ParticleInclude.h` 里，网页版构建编译不到 → 记 `OMIT(Particle)` |
| `HugeExplosionParticle` / `HugeExplosionSeedParticle` | 唯一的 `new` 点在 `LevelRenderer.cpp:1471-1472` **整段被注释掉**，字符串分派里也没有 `largeexplode`/`hugeexplosion` 的 case；它还要 `misc/explosion.png`，而这张图在 `apps/web/public/images/` 和 `imageManifest.ts` 里都没有 → 搬过来就是「缺资源 + 永不执行」→ 记 `OMIT(Particle)` |
| TS 的「枚举版 `addParticle` 重载」 | C++ 里就是死代码（见下）—— TS 保持「一个实现 + 入口归一化」 |
| 51 处 `level->addParticle` 里还没移植的调用方 | 那是 `LevelRenderer` **之外**的方块 tick（`TorchTile`/`FurnaceTile`/`LiquidTile`/`ObsidianTile`/`RedStoneOreTile` 等）。本任务单只管**接住**，不管**谁来发**。火把冒烟要等那些方块自己接上 |
| `misc/explosion.png` | 见上。`ParticleEngine.render` 的主循环只跑前 3 档（MISC/TERRAIN/ITEM），第 4 档走 `renderLit` 而 `renderLit` 自己不 bind 纹理 —— 唯一会请求这张图的是已 OMIT 的 `HugeExplosionParticle`，所以**不补图也不会花屏** |

---

## E0.5 依赖清单（实测，不是估的）

### 已经就位的（不用动）

| 需要的东西 | 在哪 | 状态 |
| --- | --- | --- |
| `Tesselator`（3D，GL_QUADS） | `packages/client/src/renderer/Tesselator.ts` | `static readonly instance`（`:58`）；`color(r,g,b)` 是**浮点版**（`:170-193`）；`vertexUV(x,y,z,u,v)`（`:220`） |
| `Textures.loadAndBindTexture` | `Textures.ts:91` | 加载失败返回 `InvalidId = -1`，`bind` 只打日志 |
| `Tile.xx0/xx1/…/zz1`、`gravity`、`getTexture`、`getColor` | `Tile.ts:1002-1007, 1009, 1107-1112, 1376` | 全齐（`TerrainParticle` / `crack` 要用） |
| `Mth.cos/sin/PI/DEGRAD`、`Random`、`Entity.sharedRandom` | `util/Mth.ts`、`util/Random.ts`、`Entity.ts:49` | 齐 |
| `Entity` 基类 | `Entity.ts` | `move/removed/getBrightness/heightOffset/setSize/setPos` 全有，零标记 |
| `Level.addParticle` + `LevelListener.addParticle` | `Level.ts:888-901`、`LevelListener.ts` | **已经是真实现、正在转发**（只是没人接） |
| `particles.png` | `apps/web/public/images/`、`imageManifest.ts:54` | 文件在、manifest 在，**但不在 `assets.ts` 的 PRELOAD 里** → E8 必须补，否则第一次画粒子是花屏（PITFALLS 第 25 条） |

### 已经在调、等着被接住的（**十几处**）

`FireTile.ts:189-221`（`'largesmoke'`）、`Explosion.ts:234/243`、`Mob.ts:577/610`、`Entity.ts:530`、
`Arrow.ts:285/313`、`Snowball.ts:46`、`ThrownEgg.ts:60`、`Throwable.ts:241`、`PrimedTnt.ts:90`、
`TripodCamera.ts:103-107`、`Player.ts:934`。

**所以做粒子不是「从零加一个系统」，而是「把已经举起来的手接上」。**

### 接线点

`Minecraft.ts` 7 处 `DEFERRED(Particle)`：`109`（字段）/ `188`（`new`）/ `405`（`setLevel(null)`）/
`587`（`tick`）/ `774`（`crack`）/ `870`（`setLevel`）/ `895`（`gatherStats3` 的粒子数）；
`GameRenderer.ts:283`（取 `cameraEntity`）与 `:360`（`render`）；`GameMode.ts:51`（`destroy`）；
`LocalPlayer.ts:324`（`TakeAnimationParticle`）；`Gui.ts:7`（F3 统计的注释）。

---

## ⚠ 规划时实测出来的四个坑（决定了怎么写）

### 一、粒子 id 有「数字 vs 字符串」的历史不一致，而且**已有测试钉住了数字**

- C++ 实际传的**永远是字符串**：`PARTICLETYPE(x)` 宏是逗号表达式 `(ParticleType::x, #x)`
  （`EntityTypes.h:74`），枚举那半被丢弃 → `LevelRenderer.cpp:1509` 那个枚举重载**整段在注释里**。
- TS 里混着两种写法：`Mob.ts:578` 传 `'bubble'`、`FireTile` 传 `'largesmoke'`、`Player.ts:935` 传 `'iconcrack'`；
  而 `Snowball.ts:46`、`Throwable.ts:241`、`Explosion.ts:235` 传的是 `ParticleType.bubble` 这类**数字**。
- **已有的四条断言钉的就是数字**：`snowball.test.ts:167`、`thrownegg.test.ts:147` 写
  `expect(p[0]).toBe(ParticleType.snowballpoof)`；`arrow.test.ts:291/388` 用
  `filter((p) => p[0] === ParticleType.bubble)`。按仓库规矩**不能改已有断言**。

**解法（本任务单采用）**：在唯一入口 `LevelRenderer.addParticle` 里做一次**数字 → 名字归一化**，
然后把 C++ 的字符串梯子逐字照抄。写成一句带注释的 `ADAPTED(Cpp)`，不藏。

### 二、`tex = 7 - age * 8 / lifetime` 是**整数除法**

C++ 里 `age`、`8`、`lifetime` 全是 `int`，`age * 8 / lifetime` 先乘后整除。
TS 写成 `/` 会得到小数 → UV 算出个非整数格 → 纹理错乱。**必须 `Math.trunc`**。
typecheck 抓不到，单测不专门写就漏，只能靠截图发现 —— 属于"看见才知道错了"的那类。

### 三、`CritParticle2` 构造里那句 `tick()` 调的**就是它自己**的覆盖版，不要"修"

`CritParticle2.h` 的构造函数最后一行是 `tick();`。C++ 的规则（`[class.cdtor]/4`）是：
**构造函数体内调虚函数，调的是「构造函数所在那一级」的 final overrider** ——
`CritParticle2` 自己声明了 `tick()`，所以调的是 `CritParticle2::tick`（会走 `yd -= 0.02f`、`gCol *= 0.96f` 那套）。
JS 的 `this.tick()` 行为一致，**照写即可**。

> ⚠ **反例，别照 PITFALLS 第 7 条硬套**：那一说的是「**基类**构造期间只调到基类自己的版本」。
> 这里不是基类构造，是子类自己的构造。写成 `Particle.prototype.tick.call(this)`
> 会把**基类**的 tick 接上去（少了 `yd -= 0.02f`），**是个移植 bug**。规划时子代理就是这么建议的，已核对 C++ 规则否掉。

### 四、`ParticleEngine.render` **自己不设任何 GL 状态**

它依赖 `renderEntities` 之后残留的状态（alpha test / blend / 深度）。所以那行必须严格待在
`GameRenderer.ts` 现在的位置：**`renderEntities(...)` 之后、`Lighting.turnOff()` 之前**
（和 C++ `GameRenderer.cpp:346` 同位置）。位置错一格就是「粒子透明/黑块/被深度剔除」，
而第三档只能靠截图发现。

---

## 拆分（十二小步）

拆分原则：按**同一套公式的归一组**切，每步都稳在 200 行上下 / 3 个文件以内（仓库规矩是 ≤300 行、≤5 文件）。

| 步 | 交付 | 文件 | 判据 |
| --- | --- | --- | --- |
| **E0** | 本文件 + `task_plan.md` 指向它 | 2 个 md | 无代码 |
| **E1** | `Particle` 基类（C++ 46+99 行） | 新建 `packages/client/src/particle/Particle.ts` + 测试 | 单测 |
| **E2** | **「动画帧三兄弟」**：`SmokeParticle` `ExplodeParticle` `RedDustParticle`（共用 `tex = 7 - age*8/lifetime`） | 3 新 + 1 测试 | 单测 |
| **E3** | **「不靠 Tile 的三个」**：`FlameParticle` `CritParticle2` `BubbleParticle` | 3 新 + 1 测试 | 单测 |
| **E4** | **「要读 Tile/Item 的三个」**：`LavaParticle` `TerrainParticle` `BreakingItemParticle` | 3 新 + 1 测试 | 单测 |
| **E5** | `ParticleEngine`（C++ 54+157 行，含 `destroy`/`crack`，要用 E4 的 `TerrainParticle`） | 新建 `ParticleEngine.ts` + 测试 | 单测 |
| **E6** | `LevelRenderer.addParticle` 字符串分派 + **数字→名字归一化** | `LevelRenderer.ts` + 新测试 | 单测 |
| **E7** | 客户端接线：`Minecraft.ts` 7 处 + `GameRenderer.ts` 2 处 + `Gui.ts` 统计 | 3 个文件 | 默认场景不崩 |
| **E8** | `crack` / `destroy` 接线 + `particles.png` 进 PRELOAD + 浏览器场景 | `Minecraft.ts`、`GameMode.ts`、`assets.ts`、新场景 | **截图必须打开看** |
| **E9** | `TakeAnimationParticle`（捡东西）+ `LocalPlayer.ts:324` | 新 1 + 改 1 + 测试 | 场景；做不动就 `OMIT` |
| **E10** | 死代码 OMIT 标记、`docs/ai/TASK-F-声音.md` 开工（可选） | 代码注释 | `pnpm ledger` |
| **E11** | 手册、台账、完成章节 | 文档 | `pnpm ledger` |

依赖顺序：`LavaParticle` 要撒 smoke（E2 先有 `SmokeParticle`）；`ParticleEngine.destroy/crack` 要用
`TerrainParticle`（E4 先于 E5）；`LevelRenderer.addParticle` 运行时才需要 `mc.particleEngine` 存在，
所以 E6 在前不阻塞，但**场景验证要等 E7**。

---

## 每一步的详细验收

### E1 — `Particle` 基类

- 三个 static 偏移 `xOff/yOff/zOff`；`setPower`/`scale` **返回 `this`**（C++ 是 `Particle*`，链式调用 `->init()->setPower()->scale()`）。
- ⚠ **两个随机源不能合并**：初速度抖动用 `Mth::random()`（模块级），`uo/vo/size/lifetime` 用 `sharedRandom.nextFloat()`。
- ⚠ `tick()` **不调 `super.tick()`**（和 `FallingTile`/`PrimedTnt` 一样）；碰撞靠 `move()`。
- `getEntityTypeId()` 硬编码返回 0；两个 NBT 方法是**空函数体**（C++ 就是空的）。
- 单测：用 `sharedRandom.setSeed(...)` 固定 + `vi.spyOn(Math, 'random')` 固定抖动，
  逐条验 `xd = xa + (r*2-1)*0.4f`、`mul = 0.4f*speed/dd`、`yd = yd*mul + 0.1f`；
  tick 的 `yd -= 0.04f*gravity`、`age++ >= lifetime → remove()`、`onGround` 时 `*0.7f`；
  render 用 `Tesselator` 实例核对 4 个顶点顺序 + UV 的 `(tex%16)/16` 与 `0.999f/16`。

### E2 / E3 / E4 — 十个活子类

每个类各钉一条关键句：

- `SmokeParticle`：`scale = 1` 默认形参（`largesmoke` 传 `2.5f`）；`tex = 7 - age*8/lifetime`（**整除**）。
- `ExplodeParticle`：同上公式；`yd += .004f`；拖拽 `.9`。
- `RedDustParticle`：构造是 **3 个颜色分量**，但字符串分派只传 `xa, ya, za` —— 语义容易抄错；
  `y == yo` 时 `xd/zd *= 1.1f`。
- `FlameParticle`：无重力；`noPhysics = true`；`getBrightness = 1`；render 里尺寸收缩。
- `CritParticle2`：构造里 `super(level,x,y,z,0,0,0)`（**速度传 0**）再自己算；`tex = 16*4+1`；
  末尾 `this.tick()`（见上文坑三）；render 里 `size = oSize * l` 且 `l` 夹在 [0,1]。
- `BubbleParticle`：`yd += 0.002f`；**材质不是水就 remove**；`lifetime--`。
- `LavaParticle`：按 `odds = age/lifetime` 概率撒 smoke；`yd -= 0.03f`；拖拽 `.999`。
- `TerrainParticle`：`tex = tile.getTexture(2, data)`；`gravity = tile.gravity`；
  `init()` 里乘 `tile.getColor` 三通道 `/255`，**草方块除外**。
- `BreakingItemParticle`：`tex = item.getIcon(0)`（**`getIcon` 有 `aux` 参数**）；`gravity = Tile.snow.gravity`；`size /= 2`。

### E5 — `ParticleEngine`

- 4 档纹理（`MISC/TERRAIN/ITEM/ENTITY_PARTICLE`），`add` 按 `getParticleTexture()` 分档。
- ⚠ `tick()` 是**边遍历边删**（C++ `list.erase(list.begin() + (i--))`）—— TS 里 `splice(i,1); i--`，
  顺序错了会漏 tick 粒子。
- `render`：只跑前 3 档；**空档 `continue`（不 bind 也不 begin/draw）**；每档 `t.begin()` → 逐个 `p.render` → `t.draw()`。
- `renderLit`：只跑第 4 档，**不 bind 也不 begin/draw**（它只逐个调 `p.render`）。
- ⚠ `crack` 用的是引擎**自己的** `Random random` 成员，不是 `sharedRandom`。
- 单测：分档、删完后的存活顺序、`countParticles`、`setLevel` 清空、
  render 时 `loadAndBindTexture` 的**调用序列**（用记录型假 `Textures`）、`destroy` 撒 18 个、`crack` 的 6 个 face 分支。

### E6 — `LevelRenderer.addParticle`

- 先 16 格平方剔除（`cameraTargetPlayer` 为空时整个不执行，照 C++）。
- 数字 → 名字归一化（见上文坑一），然后逐字照抄 `LevelRenderer.cpp:1487-1498` 的梯子：
  `bubble`/`crit`/`smoke`/`explode`/`flame`/`lava`/`largesmoke`/`reddust`/`iconcrack`/`snowballpoof`。
- C++ 里被注释掉的 `note`/`splash`/`slime`/`heart` 分支**保留为注释**并注明出处。
- `LevelRenderer.ts:913-914` 那两条 OMIT：字符串那条换成实现；`ParticleType::Id` 那条**继续 OMIT**并注明「C++ 该重载整段在注释里」。

### E7 — 客户端接线

`Minecraft.ts`：`109` 字段类型从 `unknown` 收窄成 `ParticleEngine | null`、`188` `new`、`405` `setLevel(null)`、
`587` `tick`、`870` `setLevel`、`895` `'P: ' + countParticles()`；`GameRenderer.ts:283/360`；`Gui.ts:7` 的注释。
做完 `rg "DEFERRED\(Particle"` 数一遍。

### E8 — `crack`/`destroy` + 素材 + 场景

- `Minecraft.ts:774`（按住挖掘）与 `GameMode.ts:51`（破坏方块）。
- `apps/web/src/assets.ts` 的 `PRELOAD` 加 `'particles.png'`。**先加素材再画**，否则第一次就是花屏。
- 新建 `tools/verify/scenarios/particles.mjs`，两条腿都要有：
  **(a) 手动撒**（`level.addParticle('flame', …)` 若干，断言 `countParticles()` 增加；
  40 格外撒一个断言**不变**；传数字 `3` 断言增加，证明 shim 生效；`'iconcrack'` 带 `data` 证明取到物品）；
  **(b) 真实链路**（放 TNT 看爆炸烟+火光、射一箭看暴击星、按住挖方块看碎屑）。
  定格用 `app.pause = true`（渲染继续），截图用图片查看工具打开看。

### E9 — `TakeAnimationParticle`

第 4 档纹理，唯一不画 billboard 的：构造内部 `ItemEntity` 再走
`EntityRenderDispatcher.getInstance().renderAt(e, xx, yy, zz, e.yRot, a)`
（**不是 `render(entity, a)`** —— 那个会自己做插值，参数语义不同）；`e.item.count = 1`；
`glColor4f2(br, br, br, 1)` 照抄。做不动就 `OMIT(Particle)` + 说明，**它不是任何东西的阻塞项**。

#### E9 完成记录（2026-10-04）

做成了，没有降级成 `OMIT`。落地：

| 文件 | 做了什么 |
| --- | --- |
| `packages/client/src/particle/TakeAnimationParticle.ts` | 新类（C++ 头文件 63 行） |
| `packages/client/src/player/LocalPlayer.ts:322-334` | 换掉 `DEFERRED(Particle)`，真接上 |
| `packages/client/src/index.ts` | 导出 |
| `tests/unit/client/particle-take.test.ts` | 24 条单测 |
| `tools/verify/scenarios/particles.mjs` | 新增第 7 节（4 条断言 + 1 张截图） |

**台账 229 → 228**（`DEFERRED(Particle)` 全清；`OMIT(Particle)` 3 条留着，是 E10/E11 的死代码标记）。

反向验证跑了 **13 个源码变异，13 个全部变红**。两个**等价变异**（测不出来，写在测试里当记录）：
`this.e.x` ↔ `this.x`（两边永远相等，因为 `tick()` 不动任何一方）、`life === lifeTime` ↔ `life >= lifeTime`。

**踩到的两个坑**（都不是移植 bug，是测试/场景自己挖的）：

1. **`Entity` 是抽象类**，测试里不能 `new Entity(level)` 当"飞向的目标"。vitest 不做类型检查，
   所以测试照样全绿，只有 `pnpm typecheck` 会红 —— 补了个 `PlainEntity extends Entity` 最小子类。
2. **场景里那颗粒子一度"看不见"**：我把掉落物摁在了玩家**眼睛高度**上，于是
   起点 = 终点 = 相机原点，整颗卡在近裁剪面里 —— 脚本全绿、截图啥也没有。
   隔离验证（`_dbg-pickup.mjs` 把起点人为挪到前方 3 格，立刻显形）证明**渲染路径是好的**；
   改成摁在**脚下一格**（`Player.tick` 的拾取盒 `bb.grow(1, 0, 1)` 竖直方向不放大，
   玩家碰撞盒占 `y-1.62 … y+0.18`，照样捡得起来）之后就正常了。
   教训：**"看不见"先怀疑测试设定，再怀疑渲染**；而且必须用隔离实验把两者分开。

---

## 怎么验证（三层里这批用两层）

1. **单测**（`tests/unit/client/particle-*.test.ts`）：物理、UV、生命周期、分档、分派、`destroy`/`crack`。
   跑在 vitest 里，不需要 GL（`Tesselator._vertexForTest` 有先例）。
2. **浏览器场景**（第三档规则：不比较数值，截图核对）：
   `node tools/verify/smoke.mjs tools/verify/scenarios/particles.mjs`，
   **截图必须用图片查看工具打开看** —— 粒子是小方块而不是花屏、颜色透明度对、没有整屏黑块。
3. 这批**没有黄金样本**（画面类）。

---

## 每一步提交前的自检

- [ ] `pnpm typecheck` 与 `pnpm test` 绿
- [ ] 浮点字面量过 `f()`（`0.4f`/`0.1f`/`0.999f`/`0.7f`…），整数除法用 `Math.trunc`
- [ ] `t.color(...)` 用**浮点版**不是 `colorInt`
- [ ] `tick()` 没多写 `super.tick()`
- [ ] 没移植的语句留了 `DEFERRED`/`OMIT` 标记（不删）
- [ ] `pnpm ledger` 看条数变化
- [ ] 提交说明写清移植了什么、暂缓了什么

---

## 已知缺口（本任务单不做，留给后面）

1. **火把、熔炉、液体、黑曜石、红石矿这些方块的 `animate`/`tick` 还没发粒子** —— 粒子的"接住"端做好了，
   但"发出"端有一批方块自己还没移植。做那些方块时粒子会自动出现。
2. `misc/explosion.png` 没有 → `HugeExplosion*` 永远做不了（要补图 + manifest + PRELOAD 三处）。
3. 方向性/遮挡：C++ 粒子不透明度不随距离变，也没做遮挡剔除 —— 照抄，没优化。

---

## 任务单 E 完成（2026-10-04）

粒子系统整个搬过来了：10 个粒子类 + `ParticleEngine` + `LevelRenderer.addParticle` 的字符串分派
+ 客户端接线。提交从 `320d35e`（E0 任务单）到 `84eb926`（E9），一共 **9 个提交**。

规模：`packages/client/src/particle/` 现在 **1344 行 TS**（对应 C++ 侧 1176 行）；
任务单 E 全程 `1ddcf9d..84eb926` 是 32 文件 / +4252 行（其中一半是测试）。

### 台账（每个数字都是刚才用临时 worktree 逐个 checkout 实测的）

| 步 | 提交 | 台账 | 一句话 |
| --- | --- | --- | --- |
| 基线 | `1ddcf9d` | **236** | 任务单 D 收官后的数 |
| E0 | `320d35e` | 236 | 任务单落盘（纯文档） |
| E1 | `30f1369` | 236 | `Particle` 基类 |
| E2 | `ef460ab` | 236 | Smoke / Explode / RedDust |
| E3 | `3f61fbb` | 236 | Flame / Bubble / Crit |
| E4 | `53c27b2` | 236 | Lava / Terrain / BreakingItem |
| E5 | `03f6eb8` | **238** | `ParticleEngine`（+2 条 `OMIT(Particle)`：`textureIds[4]`、析构函数） |
| E6+E7 | `bbb6bd5` | **230** | `addParticle` 分派 + 客户端 7 处接线（−8） |
| E8 | `b0401b5` | **229** | `destroy` 接线 + 素材 + 场景（−1） |
| E9 | `84eb926` | **228** | `TakeAnimationParticle`（−1，`DEFERRED(Particle)` 清零） |
| E10 | 本次 | **231** | 三条死代码 `OMIT(Particle)` 落档（+3） |

**净变化：236 → 231。** `DEFERRED(Particle)` 从 **10 条降到 0 条**；
`OMIT(Particle)` 从 **2 条变成 6 条**，每一条都写了为什么（不是漏掉）。
（这两个数是按台账的同一条正则 `//\s*(DEFERRED|OMIT|…)(系统):` 数出来的，
不是随手 `grep` 字符串 —— 用宽松 grep 会把正文里提到"标 OMIT(Particle)"的地方也算进去，第一次就数错成 12 和 8。）

### E10 为什么台账会 +3

`ParticleInclude.h`（粒子类的清单头）之前被整个跳过了。补上
`packages/client/src/particle/ParticleInclude.ts` 之后，三个"明确不搬"的类终于有了落档的地方：
`HugeExplosionParticle`、`HugeExplosionSeedParticle`、`SplashParticle`。
**台账涨不是退步** —— 是原来"没记下来的缺口"记下来了。

### 每一步的验证方式

- **单测**：任务单 E 新增 **7 个文件 / 146 条**（`particle` 23、`particle-anim` 18、
  `particle-misc` 19、`particle-terrain` 18、`particle-engine` 23、`levelrenderer-particle` 21、
  `particle-take` 24）。全仓库 **91 文件 / 1001 条全过**。
- **反向验证（扰动源码）**：一共 **95 个变异**（E1 10、E2 13、E3 17、E4 14、E5 18、E6+E7 10、E9 13），
  最终全部变红。其中 **9 个一开始没红 —— 全是我测试的漏洞**，逐个补了断言：
  E2 一条（`Math.random` 定成 0.5 会让所有速度变成 NaN，而 NaN 之间 `toBe` 相等 →
  断言静默失效）、E3 两条（速度为 0 时阻力变异不可见）、E5 四条（没有第 4 档的测试、
  `setPower`/`scale` 从没断言、`crack` 的面向分支从没断言）、E6 一条（用雪球 id 当 data，
  `Item.items[data]` 和 `Item.snowBall` 恰好是同一个对象）、E9 一条（挑的 `yy` 没跨过整数边界）。
- **浏览器场景**：`tools/verify/scenarios/particles.mjs`，**19 条断言全过 / 页面错误 0**，
  4 张截图逐张打开看过。隔离调试场景 `_dbg-particles.mjs`、`_dbg-pickup.mjs` 保留。
- **没有黄金样本** —— 粒子是画面类，第三档（不比较数值，只做截图核对）。

### E0 没算到的三件事

1. **`ParticleInclude.h` 被整个跳过了** —— 计划里只想到"写粒子类"，没想到 C++ 还有一份
   "哪些粒子类存在"的清单头。它是记死代码 `OMIT` 的天然位置，E10 补上。
2. **`LocalPlayer.take` 的接线必须用相对路径深引用才测得到** —— `LocalPlayer` 在
   `@mcpe/client` 的桶里是 `export type`（只有类型，运行时不导出），
   单测要拿构造函数只能 `import from '../../../packages/client/src/player/LocalPlayer'`
   （和 `confirm-screen.test.ts` 一个做法）。
3. **画面为空 ≠ 代码错** —— E8 结束时"粒子看不见"，我先怀疑了渲染链路，实际是
   无头截图/定格的时序 + 测试设定（把掉落物摁在眼睛高度）两个原因叠出来的。
   E9 用隔离实验（把起点人为挪到前方 3 格）把"设定问题"和"代码问题"分开了，
   这个手法值得留到下批。

### 已知缺口（没做，留给后面）

- **`HugeExplosionParticle` / `HugeExplosionSeedParticle`**：C++ 里唯一的 `new` 点被注释掉，
  且缺 `misc/explosion.png` 素材 → `OMIT(Particle)`，已落档在 `ParticleInclude.ts`。
- **`SplashParticle`**：基类 `WaterDropParticle.h` 在参考树里根本不存在 → `OMIT(Particle)`。
- **`misc/explosion.png` 没补**：`ParticleEngine.renderLit` 自己不 bind 纹理，
  唯一会请求这张图的就是上面那两个已 OMIT 的类 → 不补也不会花屏（已实测截图确认）。
- **51 处 `level->addParticle` 里还没移植的调用方**：本任务单只管"接住"，不管"谁来发"。
  少数方块的 tick（比如火把冒烟那类）等它们各自的方块类移植时自然接上。
