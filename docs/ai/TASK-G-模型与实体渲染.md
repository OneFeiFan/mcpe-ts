# 任务单 G：模型系统与实体渲染

把 `src/client/model/`（含 `geom/`）搬过来，再补上 5 个实体渲染器 ——
让**鸡、TNT、画、三脚架相机、玩家**从"逻辑全对但画面上什么都没有"变成看得见。

> **这一份和任务单 D/E/F 的区别：这批东西是纯几何，没有游戏状态可以比对。**
> 粒子能断言"生成了几个、颜色多少"，声音能断言"播放调用记录"，
> 模型只有一个东西能验：**顶点和 UV**。所以这批**必须**有一节黄金样本
> （`fixtures/golden/model.json`，用户 2026-10-04 拍板），
> 否则"对不对"就只能靠肉眼看截图，而 UV 抄歪一点点是看不出错的。

---

## G0 范围（用户 2026-10-04 拍板）

### 两个已定的事

1. **范围只做"画面上真看得见的 5 个"** —— 猪 / 牛 / 羊 / 僵尸 / 骷髅 / 蜘蛛 / 苦力怕这 7 只
   **实体类本身还没移植**（见下），做出来也永远看不到，记 `OMIT(Entity)` 留给后面。
2. **模型几何要写黄金样本** —— 新开一节 `model`，从参考 C++ 生成夹具。

### 做什么

| 层 | 内容 |
|---|---|
| 几何层 | `Model`、`ModelPart`、`Cube`、`PolygonQuad`、`VertexPT`、`ModelInclude` |
| 渲染器基类 | `MobRenderer`、`HumanoidMobRenderer` |
| 模型 | `HumanoidModel`、`ChickenModel` |
| 渲染器 | `ChickenRenderer`、`TntRenderer`、`PaintingRenderer`、`TripodCameraRenderer`、`PlayerRenderer` |
| 接线 | `EntityRenderDispatcher` 那 8 行 `assign` + `setModernSkin`、`ItemInHandRenderer` 的空手手臂 |
| 夹具 | `tools/golden/harness_model.cpp` + `fixtures/golden/model.json` |

### 不做什么（明确留下，不是忘了）

| 不做 | 为什么 |
|---|---|
| 猪 / 牛 / 羊 / 僵尸 / 骷髅 / 蜘蛛 / 苦力怕 的模型与渲染器 | **它们的实体类没有移植**（`packages/world/src/entity/` 里只有 `Chicken` 一个动物）。实体的创建走 `MobFactory::CreateMob`，那条整条 `OMIT(Entity)`（`EntityFactory.ts:39`）。做了**三个判据一个都用不上**：C++ 里能跑但 TS 里没有实体、黄金样本只覆盖几何、浏览器里看不见。等 MobFactory / MobAI 落地时一起补 |
| `SignModel` / `ChestModel` | 只被 `renderer/tileentity/`（告示牌、箱子）用，那是另一个系统（`DEFERRED(TileEntityRender)`，4 条），不在这批 |
| 僵尸猪人 / 水生物 / 飞行生物 | 同上，实体类不存在 |
| `EntityTileRenderer` | 方块的"实体形态"（箱子），属 TileEntity 那一摊 |

---

## G0.5 依赖清单（实测，不是估的）

### C++ 侧规模（`wc -l` 实测）

| 目录 | 行数 |
|---|---|
| `src/client/model/` 全部（6 个头 + 6 个 cpp + `geom/` 5 个文件） | **1890** |
| `src/client/renderer/entity/` 缺的那 11 个渲染器 | **1256** |
| 合计 | **约 3146** |

缺的渲染器逐个（`wc -l`）：

| 文件 | 行数 | 本任务单做不做 |
|---|---|---|
| `MobRenderer` | 301 | ✅ |
| `HumanoidMobRenderer` | 254 | ✅ |
| `PlayerRenderer` | 160 | ✅ |
| `PaintingRenderer` | 109 | ✅ |
| `TripodCameraRenderer` | 104 | ✅ |
| `CreeperRenderer` | 94 | ❌ 实体没有 |
| `TntRenderer` | 65 | ✅ |
| `SheepRenderer` | 49 | ❌ 实体没有 |
| `SpiderRenderer` | 46 | ❌ 实体没有 |
| `ChickenRenderer` | 45 | ✅ |
| `PigRenderer` | 29 | ❌ 实体没有 |

模型侧（`wc -l`）：`HumanoidModel` 322、`ModelPart` 377、`QuadrupedModel` 150、
`ChickenModel` 124、`CreeperModel` 82、`Cube` 103、`SpiderModel` 168、
`SheepModel`+`SheepFurModel` 128、`ZombieModel`+`SkeletonModel` 83、
`PigModel`+`CowModel` 68、`Model` 48、`Polygon` 96、`Vertex` 40、`ModelInclude` 17。
**本任务单只做 `HumanoidModel` + `ChickenModel`**，其余 5 只的模型也一起记 `OMIT`。

### 谁在等这批东西（接线点，都是现成的 `DEFERRED` 行）

| 位置 | 现在写的是什么 |
|---|---|
| `EntityRenderDispatcher.ts:60` | `DEFERRED(EntityRender)`：11 个渲染器的注册 |
| `EntityRenderDispatcher.ts:156` | `OMIT(EntityRender)`：`setModernSkin` |
| `ItemInHandRenderer.ts:358` | `DEFERRED(Model)`：空手时画玩家手臂 |

台账基线（`pnpm ledger` 实测）：**222 条**。其中
`DEFERRED(EntityRender)` **2**、`OMIT(EntityRender)` **2**、`DEFERRED(Model)` **1**。
（`FallingTileRenderer.ts:32` 那条 `OMIT(EntityRender)` 是析构函数，本任务单不会动它。）

### 已经在等粒子的那 5 个实体（实测 `packages/world/src/entity/` 全 30 个文件）

| 实体 | 类 | `entityRendererId` | 缺的渲染器 |
|---|---|---|---|
| `Chicken` | ✅ `animal/Chicken.ts` | `ER_CHICKEN_RENDERER` | `ChickenRenderer` + `ChickenModel` + `MobRenderer` |
| `PrimedTnt` | ✅ `item/PrimedTnt.ts` | `ER_TNT_RENDERER` | `TntRenderer` |
| `Painting` | ✅ `Painting.ts` | `ER_PAINTING_RENDERER` | `PaintingRenderer` |
| `TripodCamera` | ✅ `item/TripodCamera.ts` | `ER_TRIPODCAMERA_RENDERER` | `TripodCameraRenderer`（要 `ModelPart`） |
| `Player` | ✅ `player/Player.ts` | `ER_PLAYER_RENDERER` | `PlayerRenderer` + `HumanoidMobRenderer` + `HumanoidModel` |

### 地基全都现成（逐条实测过）

| 要用的东西 | 状态 |
|---|---|
| VBO 层：`glGenBuffers2` / `Tesselator.end(useMine, bufferId)` / `drawArrayVTN_NoState` / `RenderChunk` | ✅ `ItemInHandRenderer`、`Gui`、`LevelRenderer` 已经在用 |
| `Mob`：`isBaby` `getTexture` `getAttackAnim` `walkAnimSpeed(O)` `walkAnimPos` `heightOffset` `yBodyRot(O)` `isSneaking` `getCarriedItem` `getUseItemDuration` `getCapeTexture` `getCapeX/Y/Z` `getCapePrevX/Y/Z`（后 6 个在 `Mob.ts:145-168`） | ✅ 全在 |
| `EntityRenderer`：`renderShadow` `renderTileShadow` `renderFlame` `postRender` `getFont` `getLevel` `onGraphicsReset` | ✅ S13 阶段 C 已移植 |
| `Motive`（画的内容表） | ✅ D7 移的 |
| `TileRenderer.renderTile / canRender / tesselateCrossTexture` | ✅ S13 阶段 A/B |
| `Font.width / draw`、`Textures.loadAndBindTexture / loadTexture / getTemporaryTextureData / isTextureIdValid` | ✅ |
| `Material.plant`、`Tile` 的 `(id, tex, material)` 构造函数 | ✅ |
| `ItemInstance.isArmorItem`、`ArmorItem.modelIndex` | ✅ |
| 贴图：`mob/chicken.png`、`char.png`、`art/kz.png`、`item/camera.png`、`misc/shadow.png`、`armor/*_1/_2.png` | ✅ 全在 `imageManifest.ts`（全表 54 条） |
| 黄金样本 harness 的"陷阱替身"机制（`build_with_stubs`） | ✅ `build.sh` 里有，未定义符号自动生成 ud2 桩 |

---

## ⚠ 规划时实测出来的六个坑（决定了怎么写）

### 一、`ModelPart::compile` 白干 6 倍活，而 `draw()` 的顶点数正好抵消

```cpp
void ModelPart::compile(float scale) {
  t.begin();
  for (int i = 0; i < 6; i++) {              // ← 外面这层跑 6 遍
    for (unsigned int i = 0; i < cubes.size(); ++i)   // ← 内层 i 把外层 i 遮蔽了
      cubes[i]->compile(t, scale);
  }
  t.end(true, vboId);
}
void ModelPart::draw() {
  drawArrayVTN_NoState(vboId, cubes.size() * 2 * 3 * 6, 36);   // ← 硬编码 36×N
}
```

每个 `Cube::compile` 画 **6 个面 = 24 个顶点**，所以缓冲里其实有 `6 遍 × 6 面 × N 个方块`
= 144N 个顶点；而 `draw()` 只画 **36N** 个 = `9N` 个面 = **第 1 遍的全部（6N）+ 第 2 遍的前一半**。
第 2 遍画的是一模一样的东西，所以**画面结果是对的**，只是白干了 6 倍活。

**这个原样保留**，注释里写明"是原样的怪癖，不是 bug 修复点"。谁要是"优化"成跑 1 遍，
`draw()` 的顶点数就要跟着改成 `cubes.size() * 6 * 4`，那就不是 1:1 了。

### 二、`Cube` 构造函数里成员被形参遮蔽 —— 那 6 个成员存进去之后就没人读了

```cpp
Cube::Cube(ModelPart* modelPart, ..., float x0, float y0, float z0, int w, int h, int d, float g)
: x0(x0), y0(y0), z0(z0), x1(x0 + w), y1(y0 + h), z1(z0 + d)   // ← 成员 = 没外扩的
{
    float x1 = this->x1;    // ← 局部变量，把成员遮住
    x0 -= g; y0 -= g; z0 -= g;   // ← 改的是**形参**
    ...
    if (modelPart->mirror) { swap(x1, x0); }   // ← 改的是**局部**
    vertices[0] = VertexPT(x0, y0, z0, 0, 0);  // ← 用的是局部（加了 g 的）
```

所以：成员的 `x0..z1` 是**没外扩 `g` 的值**，而且全文没有一处读它们（`Cube` 只有 `vertices` 和
`polygons` 被外面用）。TS 里照抄：**成员留着（照抄），但注明"写入后无人读"**。

⚠ 还有一点：`mirror` 的交换发生在**外扩之后**，顺序不能挪。

### 三、`Cube` 六个面的 UV 参数和 Java 版**不一样** —— 原样保留

`PolygonQuad` 用的是 R10 那种"四个角 + u0v0u1v1"的构造。六个面的参数抄下来是：

| # | 面 | 四个角 | u/v 参数 |
|---|---|---|---|
| 0 | +x | l1,u1,u2,l2 | `d+w, d, d+w+d, d+h` |
| 1 | −x | u0,l0,l3,u3 | `0, d, d, d+h` |
| 2 | −y | l1,l0,u0,u1 | `d, 0, d+w, d` |
| 3 | +y | u2,u3,l3,l2 | `d+w, d, d+w+w, **0**` |
| 4 | −z | u1,u0,u3,u2 | `d, d, d+w, d+h` |
| 5 | +z | l0,l1,l2,l3 | `d+w+d, d, d+w+d+w, d+h` |

（`d/w/h` 都是**整数**，和 `xTexOffs/yTexOffs` 一样是 int，`/texW` 才是浮点。）

第 3 行（顶面）和第 6 行（+z 面）和 Java 的 `ModelBox` 对不上：Java 的顶面是
`(texU+d+w, texV+0, texU+d+w+w, texV+d)`，这里第 3 行把 v 写反了；第 6 行 u 从 `d+w+d`
开始，比 Java 的标准盒布局多跨了。

**这看着像笔误，但必须原样抄。** 这正是要黄金样本的原因 —— 夹具会把这 16 个 uv 数字钉死，
以后谁"顺手修一下"都会红。

### 四、`PolygonQuad` 的 UV 是**反着给**的，还有一点点内缩

```cpp
const float us = -0.002f / texW;     // 负的
const float vs = -0.002f / texH;
vertices[0] = v0->remap(uu1 / texW - us, vv0 / texH + vs);   // 第 0 个角拿的是 uu1
vertices[1] = v1->remap(uu0 / texW + us, vv0 / texH + vs);
vertices[2] = v2->remap(uu0 / texW + us, vv1 / texH - vs);
vertices[3] = v3->remap(uu1 / texW - us, vv1 / texH - vs);
```

`− us` = `+0.002/texW`（往里缩），`+ vs` = `−0.002/texH`（往另一个方向缩）。
**四行的符号不一样，抄错一个就是贴图边缘漏一条缝**。继续交给黄金样本。

### 五、`ModelPart` 的拷贝赋值 —— TS 里要用 `assign()`，不能换对象

三处构造里都有 `head = ModelPart(0, 0);`（`CowModel` / `SheepModel` / `SheepFurModel`）和
`arm0 = ModelPart(24 + 16, 16);`（`SkeletonModel`）。C++ 的 `operator=` 是**拷进现有对象**，
所以别的地方（`model->cubes` 里那个指针、`head` 这个名字）都还指着同一个东西。

TS 里直接写 `this.head = new ModelPart(0, 0)` 是**错的** —— 旧对象还留在 `model.cubes` 里，
新的又没登记。仓库已有先例：`RenderChunk.assign(rhs)`（"C++ 的拷贝赋值"）。照那个写
`head.assign(new ModelPart(0, 0))`。

`operator=` 的语义照抄：`clear()`（清 cubes + `setModel(null)` 把自己从旧 model 里摘掉）
→ 拷 id / texOffs / mirror → `setModel(rhs.model)` → `cubes.assign(...)` → `mimic(&rhs)`。

### 六、模型是**整个镜像**着画的 —— 排查画面问题时先想到这条

`MobRenderer::render` 里有：

```cpp
glScalef2(-1, -1, 1);
scale(mob, a);
glTranslatef2(0, -24 * ascale - 0.125f / 16.0f, 0);   // ascale = 1/16
```

X 和 Y 都乘 −1。所以模型坐标里 "+y 向上"在屏幕上是**向下**，
`QuadrupedModel` 的幼体分支那个 `glTranslatef(0, yHeadOffs * scale, ...)` 也是**往下**挪。
另外 `MobRenderer` 用的是 `glPushMatrix2` / `glDisable2(GL_CULL_FACE)`，**没有** `glScalef(1,1,-1)`
之类；和别的渲染器（`ArrowRenderer`、`ItemRenderer`）比一眼能看出差异 —— 别照自己的直觉改。

### 七、`ModelPart::draw()` 走哪条分支，取决于 `OPENGL_ES`（G1 做的时候才发现的）

```cpp
void ModelPart::draw() {
#ifdef OPENGL_ES
	drawArrayVTN_NoState(vboId, cubes.size() * 2 * 3 * 6, 36);
#else
	glCallList(list);          // 显示列表
#endif
}
```

`CMakeLists.txt:383` 给网页版定义了 `OPENGL_ES`，所以**真实网页版走的是 VBO 那条**，
和 TS 已有的 `ItemInHandRenderer` / `Tesselator` 是同一条路。`list` 成员与 `glGenLists`
那一整段在网页版里是死代码（编译期就被 `#ifndef OPENGL_ES` 排掉了）。

⚠ 顺带一个给 G4 的提醒：**`build.sh` 原来的通用参数里没有 `-DOPENGL_ES`**，
G1 已经补上了（细节见 G1 那一节）。谁要是以后另外写编译命令，别忘了这个宏 ——
少了它 `draw()` 就变成显示列表，和网页版行为相反。

---

## 拆分（十二小步）

拆法：**几何层自下而上（G1→G4），渲染器由基类到子类（G5→G7），
然后每个"看得见的东西"一步（G8→G10）**。每步都稳在 300 行 / 5 文件以内。

| 步 | 交付 | 新文件 | 改文件 | 判据 |
|---|---|---|---|---|
| **G0** | 任务单落盘 + `task_plan.md` 指向它 | — | 2 个 md | 无代码 |
| **G1** | **黄金样本**：`harness_model.cpp` + `fixtures/golden/model.json` + `tests/golden/model.golden.test.ts`（先只有夹具，测试等 G2 有实现再写） | 1 个 cpp + 1 个 json | `build.sh` | `REF=$REF bash tools/golden/build.sh model` 出夹具 |
| **G2** | `Vertex` + `Polygon`（`VertexPT` `PolygonQuad`） | 2 个 ts | — | 单测 ✅ |
| **G3** | `Model` + `Cube` + `ModelPart` 的**「造形状」那一半** | 3 个 ts | — | **黄金样本整份** |
| **G4** | `ModelPart` / `Cube` 的**渲染那一半**（`render` `renderRollable` `translateTo` `compile` `draw` `renderHorrible` `drawSlow`） | — | 2 个 ts | 单测（Tesselator 替身） |
| **G5** | `Model` 基类的默认值单测 + `ModelInclude` | 1 个 ts | — | 单测 |
| **G6** | `MobRenderer`（含 `renderName` / `renderNameTag` / 护甲层 / 受伤与染色叠加） | 1 个 ts | — | 单测 ✅ |
| **G7** | `HumanoidModel`（含 64×64 现代皮肤分支、`hair`、`renderHand` 要用的 `arm0`） | 1 个 ts | — | 单测 ✅ |
| **G8** | `HumanoidMobRenderer`（`additionalRendering`：手持物品 + 披风；`renderHand`） | 1 个 ts | — | 单测 ✅ |
| **G9** | **鸡**：`ChickenModel` + `ChickenRenderer` + 注册 → **第一只看得见的生物** | 2 个 ts | `EntityRenderDispatcher.ts` | 浏览器截图 |
| **G10** | **TNT / 画 / 三脚架相机**三个不用模型的 + 注册 | 3 个 ts | `EntityRenderDispatcher.ts` | 浏览器截图 |
| **G11** | **玩家**：`PlayerRenderer` + `setModernSkin` 接线 + `ItemInHandRenderer` 空手手臂 | 1 个 ts | `EntityRenderDispatcher.ts`、`ItemInHandRenderer.ts` | 浏览器截图（第三人称） |
| **G12** | 收尾：台账、手册、完成章节、7 只生物的 `OMIT(Entity)` 记录 | — | 文档 | `pnpm ledger` |

**里程碑**：G9 做完就是一个能交的节点 —— 世界里能看见鸡了。
G10 让 TNT / 画 / 相机看得见。G11 是玩家自己（要切第三人称）。G12 收尾。

依赖顺序：`Cube` 要 `PolygonQuad`（G3 依赖 G2）；`ModelPart` 要 `Cube`（G3 自带）；
`MobRenderer` 要 `Model`（G6 依赖 G3）；`HumanoidMobRenderer` 要 `MobRenderer` + `HumanoidModel`
（G8 依赖 G6、G7）；5 个渲染器都要 `MobRenderer` 或 `ModelPart`（G9~G11 依赖 G3~G8）。

### ⚠ 计划改过一次：原 G3/G4/G5 的切法拆不动

原计划是「G3 `Cube`」→「G4 `ModelPart`」→「G5 `Model` 基类」，**实际编不过**，因为这三个类
**互相引用**，单拆哪一半都不成立：

- `Cube` 的构造函数收 `ModelPart*`（要读它的 `mirror` / `xTexSize` / `yTexSize`）；
- `ModelPart::addBox` 又 `new Cube(this, …)`；
- `ModelPart::setModel` 收 `Model*`（读 `texWidth` / `texHeight`，往 `model.cubes` 里塞自己）。

改成按**「造形状」/「把形状画出来」**切 —— 这条线是真的能切开的：

- **G3**：`Model` + `Cube` + `ModelPart` 里所有**不碰 GL** 的部分。
  判据是**黄金样本整份**（33 个 cube 逐位比对）—— 只要「构造 + addBox + setModel」就能生成全部夹具。
- **G4**：`ModelPart` 的 `render` / `renderRollable` / `translateTo` / `compile` / `draw` /
  `renderHorrible` / `drawSlow`，以及 `Cube::compile`。这些在 G3 里标 `DEFERRED(Model)`。

顺带两条要照抄的 C++ 写法：

- ⚠ `Cube` 的 `polygons` 在 C++ 里是 `private` + `friend class ModelPart`。TS 没有 friend，
  按仓库先例（`TouchSelectWorldScreen.ts:82`「被外层用到的就放宽为 public」）**放宽为 public** 并注明。
  黄金测试读 `vertices` / `bound` 那几项仍然用 `as unknown as {…}` 掏（测试里掏私有有先例）。
- ⚠ `Cube` 的 `x0..z1` 是 **`const` 成员**，TS 里写 `readonly`；它们只被 C++ 的 `friend` 和夹具读到。

---

## 每一步的详细验收

### G1 — 黄金样本（**先做，后面两步都靠它**）✅ 已完成

新写 `tools/golden/harness_model.cpp`，把 `Cube` 的顶点和 UV 打出来：

- 造几个形状覆盖全部分支：`(0,0,0,8,8,8,g=0)`（人头）、`(0,0,0,4,12,4,g=0.5)`（手臂，带外扩）、
  `mirror = true` 的那一组（`arm1` / `leg1`）、以及 `xTexOffs/yTexOffs` 非 0 的
  （`arm0(40,16)` 那种）；再把 `HumanoidModel`（64×32 与 64×64 各一遍）与 `ChickenModel` 里
  每个 `ModelPart` 的全部 cube 也扫一遍 —— **这样模型表本身就是夹具**，谁改错参数立刻红。
- 每个 cube 输出：6 个成员 `x0..z1`、8 个 `VertexPT` 的 `x/y/z/u/v`，
  以及 6 个 `PolygonQuad` 的 4 个角各自的 `x/y/z/u/v`（外带 `_flipNormal`）。

**做这步时挖出来的三件事（都已处理）**：

1. ⚠ **`build.sh` 的通用参数少了一个 `-DOPENGL_ES`。** `CMakeLists.txt:383` 写着
   `target_compile_definitions(... PUBLIC "OPENGL_ES" "NO_EGL" ${PLATFORM})` —— 网页版**是**定义它的。
   少这个宏，`ModelPart::draw()` 会走 `#else glCallList(list)` 那条**显示列表**分支
   （`ModelPart.cpp:203-209`），和网页版真实行为相反。已补进 `CF`，并在注释里写清
   为什么**不能**同时补 `__EMSCRIPTEN__`（会让 `gles.h` 去 `#import <GLES/gl.h>`，Linux 上没有）。
   补之前查过影响面：全树带 `OPENGL_ES` 分支的只有 9 个文件，**没有一个被已有的节编译**；
   实测重生成 `mth` 节，工作树无变化。
2. `stub/glad/glad.h` 原来只声明了 5 个 GL 函数，模型文件要 `glRotatef`（`ModelPart::render`）
   与 `glScalef`（`ChickenModel::render`）。已补声明（只声明不定义 —— harness 只构造模型、不渲染）。
3. `harness_model.cpp` 自己给了一个 `anGenBuffers` 的空实现（只会发号）：`ModelPart::_init`
   构造时就会调它，不给自己会踩上陷阱桩的 `ud2`。

**夹具**：`fixtures/golden/model.json`，**42,611 字节**，6 个合成形状 + 3 个模型（33 个 cube）。
自检脚本 `tools/golden/check-model-fixture.mjs`（人工看一眼用，不进测试套件）。

怎么验证：

```bash
REF=$REF bash tools/golden/build.sh model     # 出夹具
node tools/golden/check-model-fixture.mjs     # 结构自检
```

**实测结果**：连跑两遍**逐字节相同**；`arm_inflated` 的成员 `[-3,-2,-2,1,10,2]`（没外扩）
对顶点 `[-3.5,-2.5,-2.5,…]`（外扩过）—— 坑二那条形参遮蔽在夹具里看得见；
`arm_mirror` 的顶点从 `x=3` 起、不镜像的从 `x=-3.5` 起 —— mirror 交换生效。

### G2 — `Vertex` + `Polygon` ✅ 已完成

新建 `packages/client/src/model/geom/Vertex.ts`、`Polygon.ts`。
`VertexPT.remap(u, v)` 是**返回新对象**（C++ 是值返回），别写成改自己。
`PolygonQuad` 三个构造函数（4 角、带纹理参数的 int 版、float 版）+ `mirror()` + `render()` + `flipNormal()`。

⚠ `PolygonQuad::render` 里的法线是 `v1.cross(v0).normalized()`（**v1 叉 v0，不是 v0 叉 v1**），
顺序错了整个模型的光照就反了。`Vec3.cross/normalized` 用 `@mcpe/world` 现成的。

**做这步时定的两条（和原计划的差别）**：

1. **判据改了**：原计划 G2 就用黄金样本，实际改成本步用**单测**（期望值从夹具里抄），
   完整的黄金样本比对放到 G3 —— 因为夹具面那 6 个面的 `(uu0,vv0,uu1,vv1)` 是从
   `Cube` 的盒子参数推出来的，没有 `Cube` 就没法按夹具喂输入。G3 里一起做才是完整的。
2. ⚠ **这一类不适用「第三档渲染代码不逐步 fround」那条豁免**，`Polygon.ts` 头注释里写明了理由：
   它的输出被夹具**逐位**钉住，而 `us = -0.002f / texW` 不是 float32 能精确表示的数 ——
   少包一层 `f()`，`0.375031263` 就变样了。**这不是理论担忧**：G1 生成夹具时，
   head 那个面的 UV 正是因为这个才定在 `0.375031263`。

**浮点怎么比对**：夹具里是 `%.9g` 打印的十进制，读回来要**先 `fround`** 才是原来那个 float32
（9 位有效数字正好是 float32 的往返精度）。`expect(u).toBe(f(0.375031263))`；
直接 `toBe(0.375031263)` 会红 —— 那个字面量是 double，和 float32 差一点点。

**两处 C++ 死代码记了 `OMIT(Model)`**（都是零调用方，且在 TS 里只差参数类型、无法用重载区分）：
`VertexPT(const Vec3&, float, float)`（`Vertex.h:33`）、
`PolygonQuad(v0..v3, float u0,v0,u1,v1)`（`Polygon.h:15`）。

验收：`tests/unit/client/model-geom.test.ts`（15 条）；
新增工具 `tools/verify/mutate.mjs`（改坏源码 → 跑测试 → 看是否变红 → 还原）；
**10 个变异 10 个红**，没有等价变异要记。

台账：**222 → 224**（+2 条 `OMIT(Model)`）。`pnpm typecheck` 0；`pnpm test` **96 文件 / 1075 条全过**。

（顺带又栽了一次 PITFALLS 里记过的那条：`vv0` 少写一个 `!`，vitest 全绿而 `tsc` 报错 ——
**vitest 不做类型检查，两边都要跑**。）

### G3 — `Model` + `Cube` + `ModelPart` 的「造形状」那一半 ✅ 已完成

新建 `packages/client/src/model/Model.ts`、`geom/Cube.ts`、`geom/ModelPart.ts`。

**判据 = 黄金样本整份的 `shapes` 一节**（6 个合成形状，逐位比对 bounds / 8 个顶点 / 6 个面 × 4 个角）。
`fixtures/golden/model.json` 里的 `models` 一节要等 G7 / G9 把 `HumanoidModel` / `ChickenModel`
写出来才比得上 —— **测试文件头注释里专门标了"别把这一节忘了"**。

**两处 C++ 怪癖都照抄了，夹具把两条都钉住**：

- `Cube` 的成员 `x0..z1` 存**没外扩**的值（形参遮蔽），而顶点用的是外扩过的局部值；
  那 6 个成员全文无人读。变异 M6（"顺手把成员也加上 g"）被夹具抓住。
- 六个面的 UV 参数和 Java 版对不上（第 3 行顶面 v 反了、第 6 行 +z 面 u 多跨一格）。
  变异 **M1 就是"有人把那个看着像笔误的改『对』"—— 黄金样本抓住了它**。

**两条 TS 化的说明**：

- `Cube.polygons` C++ 是 `private` + `friend class ModelPart`，TS 没有 friend，
  按仓库先例（`TouchSelectWorldScreen.ts:82`）**放宽为 public** 并注明。
- `ModelPart::operator=` → `assign(rhs)`（`RenderChunk.assign` 那套先例）。
  变异 M12（忘了 clear）/ M13（深拷 cube）都被抓住。

**`addTexBox` 记 `OMIT(Model)`**：C++ 里**只有声明，实现整段被注释掉了**（`ModelPart.cpp:85-87`），
零调用方，根本链不上。

验收：`tests/golden/model.golden.test.ts`（7 条：1 条夹具结构自检 + 6 个形状）+
`tests/unit/client/model-part.test.ts`（19 条，盖住黄金样本盖不到的那一半：
`setModel` 登记/摘除、`addBox` 三个重载、`mimic`、`clear`、`assign`）。

**反向验证：16 个变异 16 个红**，没有等价变异。
（`tools/verify/mutate.mjs` 这步扩了一下，支持一次给多个测试文件。）

台账：**224 → 233**（`DEFERRED(Model)` 1 → 9 —— G4 要填的那 8 个渲染函数；
`OMIT(Model)` 2 → 3）。`pnpm typecheck` 0；`pnpm test` **98 文件 / 1101 条全过**。

（这步又踩了一次语法坑：`const [a,b,c,d] = arr as [A,A,A,A, ...]` 里那个 `...` 不是合法元组语法，
vite 直接 PARSE_ERROR —— 改成逐下标取就对了。）

### G4 — `ModelPart` / `Cube` 的渲染那一半 ✅ 已完成

把 G3 里标 `DEFERRED(Model)` 的 8 个函数填上：`ModelPart` 的
`render` / `renderRollable` / `translateTo` / `compile` / `draw` / `renderHorrible` / `drawSlow`，
以及 `Cube::compile`。

**判据 = `tests/unit/client/model-part-render.test.ts`（21 条）**。这一半没有黄金样本可用，
所以换了个观察办法 —— 无头环境下有两层可观察的东西：

1. **`GLES1` 的矩阵操作**：写个 `SpyGL extends GLES1` 把 `push/pop/translate/rotate` 记下来，
   再 `glSetContext` 换成它。于是"哪个分支 push/pop、旋转是什么顺序"都能逐条断言。
2. **`Tesselator.instance` 的方法 + `GLES1.drawCalls`**（用 `vi.spyOn` 数次数）。
   顶点数是这里最硬的判据：`compile` 里那层跑 6 遍的循环会让每个面被写 6 次 ——
   1 个 cube 就是 `6 × 6 × 4 = 144` 个顶点，而 `draw()` 报的是 36 个。

**几条照抄下来、但很容易被"顺手统一"的差异**（都写进注释了）：

| 函数 | 和别人的不同 |
|---|---|
| `render` | 旋转顺序 **z → y → x**；只有旋转分支 push/pop，位移分支是"平移过去再平移回来" |
| `renderRollable` | 旋转顺序 **y → x → z**（反的）；**不递归子部件**；**无条件** push/pop。零调用方，照抄 |
| `translateTo` | **不 push/pop**（调用方自己 push 过了）；末尾是个空 `else {}` |
| `renderHorrible` | **没有** `if (!compiled) compile(scale)`；走 `drawSlow`；不递归子部件 |
| `compile` | 外面那层 **6 遍**的循环（见坑一） |
| `draw` | 顶点数**硬编码** `cubes.length * 2 * 3 * 6` |

⚠ **`t.color(255, 255, 255, 255)` 那个坑**：C++ 写的是 4 个 int，重载决议选中的是
`color(int r, int g, int b, int a)`；而 TS 的 `Tesselator.color(a,b,c,d)` 四参形式是**浮点**版
（内部 `(int)(x * 255)`）。照字面抄成 `t.color(255,…)` 会算出 `255*255` 再被钳回 255 ——
**看着也对，纯属侥幸**。这里必须写 `colorInt`。变异 M1 就是这一条。

**反向验证：15 个变异 15 个红。** 第一次跑时有 4 条被**跳过** —— `from` 在文件里出现了 2 次，
`mutate.mjs` 的守卫拦下了（改成带上下文的长串才唯一）。这道守卫是有用的，不是摆设。

台账：**233 → 225**（`DEFERRED(Model)` 9 → 1，剩的那条是 `ItemInHandRenderer.ts:358`
的空手手臂，属 G11）。`pnpm typecheck` 0；`pnpm test` **99 文件 / 1122 条全过**。

（又是同一个教训：写测试时我把 `Mth.RADDEG` 自己重算成 `f(180/Math.PI)` —— 而它是
`f(180/f(PI))`，差最后一位；还把方向说反了（它把**弧度转成度**，`glRotatef` 要的就是度）。
**期望值不要重算，直接用被测的那个常量。**）

### G5 — `Model` + `ModelInclude` ✅ 已完成

`Model` 基类：5 个虚方法（`onGraphicsReset` `render` `renderHorrible` `setupAnim` `prepareMobModel`）
+ 5 个字段（`attackTime` `riding` `texWidth` `texHeight` `cubes` `young`，默认 0/false/64/32/[]/**true**）。
⚠ `young` 默认是 **`true`**（C++ 的初始化列表写的是 `young(true)`）—— 不设的话幼体分支会走错。

⚠️ **"`ModelInclude.h` 在 C++ 里是空的"这句是错的**（G0 写下的，G5 实测推翻）：
`wc -c` = 407 字节，`grep -c include` = **9 条** `#include`。当初之所以看着像空的，是因为用
`clean.py` 读的 —— 它会把 `#include` 这类预处理行整行删掉，输出里就只剩一行 `##### ModelInclude.h` 标题。
（见 `PITFALLS.md` 新条目；**clean.py 的输出不能用来判断"这个文件有什么"**。）

9 条 include 的去向：2 条要搬（`HumanoidModel` G7、`ChickenModel` G9），
6 条**不搬**（牛/猪/羊/羊毛/僵尸/骷髅 —— 实体类不存在，记 `OMIT(Entity)`），
1 条**挡住**（`SignModel` —— 唯一的用户是方块实体渲染器，记 `DEFERRED(TileEntityRender)`）。
⚠ 另外实测 `ChickenModel` 的父类是 **`Model` 而不是 `QuadrupedModel`**（`ChickenModel.h:9`），
所以 G9 不依赖那 4 只没搬的四足兽。

验收：单测（默认值那几条）。

**做完的情况（G5）**

`Model.ts` 本身**一行没改** —— G3 落盘时那 6 个字段和 5 个虚函数就抄对了，本步是**补测试把它钉住**。

- 新增 `tests/unit/client/model.test.ts`（7 条）：5 个字段默认值逐条对着 `Model.h:15-21` 核、
  ⚠ `young` 默认 `true`、`cubes` 每实例各一份、四个虚函数真的是空的（不改字段也不画东西）、
  `onGraphicsReset` 遍历**全部**部件（不是只看第一个）、不清空 `cubes`、
  以及**转发真的把部件打回未编译**（这条要等 G4 的 `compile` 落地才可观察，现在补上）。
  `ModelPart` 的 `onGraphicsReset` 效果靠 `Tesselator.begin` 的调用次数看：render 一次编译 1 次、
  再 render 不编译、`model.onGraphicsReset()` 之后又编译 1 次 —— 3 次调用钉死这条转发链。
- 新增 `packages/client/src/model/ModelInclude.ts`（**这个文件此刻没有真 export**，9 条
  `#include` 全是注释）：2 条 `DEFERRED(Model)`（G7/G9 落地时换成真 export）、
  6 条 `OMIT(Entity)`、1 条 `DEFERRED(TileEntityRender)`。

**踩到的两个坑**

1. `ModelInclude.ts` 一开始被 `tsc` 判 `error TS2306: File ... is not a module` —— 一个
   **既没有 import 也没有 export** 的 `.ts` 是"脚本"不是"模块"，`index.ts` 的
   `export * from` 就编不过。加一句空 `export {};` 解决（已在文件里写明为什么）。
2. 我顺手 `prettier --write` 了 `index.ts`，它把**整个文件**的行尾符改了 —— 全文件 diff。
   逐行一看才想起先核基线：`git show HEAD:packages/client/src/index.ts` 拿去 `prettier --check`
   **本来就不通过**（行尾符问题，与本次改动无关）。所以**回滚、不动它**：
   顺手格式化整个文件属于"改了完成任务必需之外的地方"。
   （教训：`--write` 之前先 `--check` 一遍**基线**，否则分不清是自己弄坏的还是本来就坏的。）

**反向验证：11 个变异 11 个红**（`tools/verify/mutations-g5.json`）——
5 个字段默认值各一个、`cubes` 变成实例共享的一份、`onGraphicsReset` 只遍历第一个 /
转发错方法 / 顺手清空 `cubes`、基类 `render` 和 `setupAnim` 不再是空的。

台账：**225 → 234**（`DEFERRED(Model)` 1→3、`DEFERRED(TileEntityRender)` 4→5、
`OMIT(Entity)` 2→8）。`pnpm typecheck` 0；`pnpm test` **100 文件 / 1129 条全过**。

### G6 — `MobRenderer` ✅ 已完成

`packages/client/src/renderer/entity/MobRenderer.ts`。301 行 C++，是这批里最大的一块。要点：

- `render` 的顺序：`glPushMatrix2` → `glDisable2(GL_CULL_FACE)` → 设 `model` 的
  `attackTime/riding/young` → 算 `bodyRot/headRot/headRotx` → `setupPosition` →
  `getBob` → `setupRotations` → `glScalef2(-1,-1,1)` → `scale` → `glTranslatef2(0, -24*ascale - 0.125/16, 0)`
  → `bindTexture(mob.getTexture())` → `prepareMobModel` → `render` → 护甲循环 → `additionalRendering`
  → 受伤/染色叠加 → `glEnable2(GL_CULL_FACE)` → `glPopMatrix2` → `postRender` → `renderName`。
- ⚠ `wp = mob.walkAnimPos - mob.walkAnimSpeed * (1 - a)`，幼体时 `wp *= 3.0f`，然后 `if (ws > 1) ws = 1`
  —— **只夹 ws，不夹 wp**。
- ⚠ `float ascale = 1 / 16.0f` 是 float 除法（`f(1/16)`），但 `-24 * ascale - 0.125f/16.0f`
  里 `24` 是 int、`ascale` 是 float → **float 乘法**。三档数值规则按 float 走。
- `getOverlayColor` / `prepareArmor` / `getFlipDegrees` / `scale` / `additionalRendering` 全是**空实现**
  （基类返回 −1 / 0 / 90 / 什么都不做）。
- `renderName` 里 `ss << mob->entityId` 是 **stringstream 输出 int**，TS 里 `String(mob.entityId)`。
  只在 `OPTIONS_RENDER_DEBUG` 开着时调 `renderNameTag`。
- `renderNameTag` 里的 `glTranslatef2(x, y + (isPlayer() ? 1.0 : 2.3), z)`、`glScalef2(-s,-s,s)`、
  两次 `font.draw`（一次带 `glDepthMask(false)` 做阴影）—— 照抄。
  ⚠ `0x20ffffff` 那个颜色是**半透明**的（`>>> 0` 别搞成负数）。

验收：单测（`setupRotations` 的死亡翻滚角度、`getBob`、`renderNameTag` 的远近剔除）。

**做完的情况（G6）**

新增 `packages/client/src/renderer/entity/MobRenderer.ts`（**268 行**）+ `index.ts` 里一行 export
+ `tests/unit/client/mob-renderer.test.ts`（236 行 / **13 条**）。**一条 DEFERRED 都没有** ——
用到的 GL 函数、`Model`、`Font`、`Tesselator`、`OptionId` 在 TS 里都已存在。

三条 `ADAPTED(Cpp)`（都写在文件头）：析构里的 `delete model` 不写（TS 有 GC）；
`onGraphicsReset` 里的 `if (model)` 判空去掉（TS 的字段是必填）；
`renderNameTag` 的 `(float)x + 0` / `(float)z` 是无意义的强转，直接写 `x` / `z`。

单测钉了任务单点名的三项（死亡翻滚角度 / `getBob` / 远近剔除），另外顺手钉住四处**容易抄错、
一眼又看不出来**的地方：

- **两处除法不是同一种**：底板宽度 `int w = font->width(name) / 2` 是整数除法（字宽 9 → w=4，
  顶点 ±5），而文字位置 `(float)font->width(name) / -2` 是浮点除法（−4.5）。两个数在同一个
  用例里同时断言，抄混一个就红。
- **封顶在乘之前**：`√((deathTime+a-1)/20 × 1.6)` 先 `min(…, 1)` 再乘 `getFlipDegrees()`；
  `deathTime=20` 是 90 度而不是 113.8 度。乘数本身是虚函数，另用一个 `getFlipDegrees()=180`
  的子类证明它真的被调到了。
- **早退发生在取字体之前**（C++ 里那句 `return` 在 `Font* font = getFont();` 上两行）——
  被剔除的用例里 `getFont` 一次都不该被调到。
- **边界上不剔**：`dist` 正好等于 `maxDist²` 时**不**返回（C++ 是 `>` 不是 `>=`）。

**踩到的两个坑**

1. `vitest` 不做类型检查（`PITFALLS.md` F 节那条）：13 条测试先全绿，`pnpm typecheck` 却报
   **6 处** —— 全是 `noUncheckedIndexedAccess` 下的 `gl.ops[1]` / `font.draws[0]`
   （类型是 `string | undefined`）。
2. 测试里 `class StubModel extends Model` 要**值**导入 `Model`；写成 `import type { Model }`
   是 `PITFALLS.md` #17 那个坑，运行时报 `ReferenceError: Model is not defined`
   （`vitest` 只做转译，不做类型检查，所以这个错也是跑起来才暴露）。

**反向验证：7 个变异 7 个全红**（`tools/verify/mutations-g6.json`）—— `>=` 边界、封顶数值、
`getBob` 少一层 fround、整数除法、写死 90 度、两个抬高分支对调、y 旋转漏掉取负。

台账：**234 → 234**（这一步不新增也不消标记）。`pnpm typecheck` 0；
`pnpm test` **101 文件 / 1142 条全过**。

### G7 — `HumanoidModel`

`packages/client/src/model/HumanoidModel.ts`，322 行 C++。要点：

- 7 个 `ModelPart`：`head(0,0)` `hair(32,0)` `body(16,16)` `arm0(40,16)` `arm1(40,16)` `leg0(0,16)` `leg1(0,16)`。
  ⚠ `arm0`/`arm1` 的 texOffs 是 `24 + 16`（**写成表达式，不是 40** —— 原样抄）。
- `modernSkin = (texWidth == 64 && texHeight == 64)` 为真时：`arm1.texOffs(32,48)`、`leg1.texOffs(16,48)`，
  并且**再 addBox 一遍**（多一层 `g + 0.5` 的外壳），还改 `body/arm0/arm1/leg0/leg1` 的 texOffs。
- `render(Entity*, …)` 里那段"拿弓就举手"的判断：`mob.getUseItemDuration() > 0` 且
  `item.getUseAnimation() == UseAnim.bow` 才置 `bowAndArrow = true`；**方法末尾无条件清回 false**。
- `setupAnim` 里 `attackTime > -9990` 那一大段（挥手动画）、`sneaking` 分支（`leg.y` 9↔12、`head.y` 1↔0）、
  `bcos/bsin` 的呼吸抖动 —— 一串浮点，**每个运算都要 fround**。
- `render(HumanoidModel*, scale)` 这个重载**全参考源码零调用方**（死代码，照抄，注释写明）。
- `renderHorrible` 同样（死代码）。

⚠ 这里最容易出问题的是 fround 的密度 —— `Mth.sin/cos` 是查表的，返回的已经是 float，
但 `time * 0.6662f` 这种乘法、`tcos0 * 1.4f` 这种都要包。

验收：单测（`setupAnim` 在给定输入下的 7 个部件的角度/位置，逐位比）。

**做完的情况（G7）**

新增 `packages/client/src/model/HumanoidModel.ts`（**291 行**）+ `index.ts` 一行 export
+ `tests/unit/client/humanoid-model.test.ts`（**25 条**）。**一条 DEFERRED 都没有** ——
`Model` / `ModelPart` / `Mth` / `UseAnim` / `Mob` 在 TS 里都已存在。
另外把 `model/ModelInclude.ts` 里 `HumanoidModel` 那条 `DEFERRED(Model)` 换成了真再导出
（台账因此 **234 → 233**）。

三条 `ADAPTED(Cpp)`（都写在文件头）：构造函数里的 `0 + yOffset` 直接写 `yOffset`；
`* holdingLeftHand` 那个乘数省略（外层判定已经保证它是 1，TS 的 `boolean` 也没法参与乘法）；
`renderHorrible` 里 `hair` 那一行在 C++ 里本来就是注释掉的（`.cpp:164`），照抄不写。

单测按验收要求逐位比 7 个部件的角度/位置，覆盖：构造函数（顺序 / `mirror` / 位置 /
那个 `24 + 16` 的 texOffs / 只有 `hair` 多一圈 `g + 0.5f`）、64×64 现代皮肤那一支
（两层盒子 + **两处 texOffs 的覆盖关系**）、`setupAnim` 的基础姿态（`/ Mth.RADDEG`、
手腿交叉、`riding`、两个 `holdingXHand` 开关、`sneaking` 全套）、挥击块（含 `> -9990` 的边界）、
`bowAndArrow` 的三道门与帧末清回、以及四个"调用顺序"怪癖（`render` 先抄 hair 再画、
`renderHorrible` **不画 hair**、`renderHumanoid` **不抄 `head.zRot`**、`onGraphicsReset` 里 hair 排最后）。

**踩到的坑：`Mth.sin/cos` 没初始化时全是 0。** 第一版 25 条里挂了 5 条，症状很怪 ——
`-cos(0)*5` 算出 `-0`、`bcos` 从 0.1f 变成 0.05f。根因是 `Mth` 的 65536 项表在模块加载时
**全零**，必须显式调 `Mth.initMth()`（`NinecraftApp::init` 第一行就是它）——
`tests/unit/util/mth-preinit.test.ts` 正是在钉"初始化前就是 0"这件事，这个文件忘了调。
已写进文件头，`beforeAll` 里补上。

**反向验证：9 个变异 9 个全红**（`tools/verify/mutations-g7.json`）—— 手腿交叉抄反、
腿跟着错、`hair` 的 0.5f、度数没转弧度、拉弓第一道门、`> -9990` 边界、`bcos` 少那个 `+ 0.05f`、
`renderHorrible` 顺手画 hair、`arm1` 忘了 `mirror`。

台账：**234 → 233**。`pnpm typecheck` 0；`pnpm test` **102 文件 / 1167 条全过**。

### G8 — `HumanoidMobRenderer`

`packages/client/src/renderer/entity/HumanoidMobRenderer.ts`，254 行 C++。要点：

- `render`：先按 `mob.getCarriedItem() != null` 设 `humanoidModel.holdingRightHand`，
  再设 `sneaking`，调 `super.render`，**最后把 `holdingRightHand` 清回 false**。
- `renderHand()`：`attackTime = 0` → `setupAnim(0,0,0,0,0,1/16)` → 开 `GL_VERTEX_ARRAY`/`GL_TEXTURE_COORD_ARRAY`
  → `arm0.render(1/16)` → 关掉。**只画一条手臂**。
- `additionalRendering` 的三段：**(1) 手持物品**（按 方块 / 弓 / 手持有型物品 / 其它 四路走不同的
  `glTranslate + glRotate + glScale`，最后 `itemInHandRenderer.renderItem(mob, item)`）；
  **(2) 披风**（`Player::asPlayer(mob)` 拿到才画，一长串披风摆动公式 + 24 个顶点的手写 UV 四边形）；
  **(3) 没了**。
- ⚠ 披风那 24 个顶点用的是 `t.tex(u,v)` + `t.vertex(x,y,z)`（**不是 `vertexUV`**），
  和 `Particle.render` 是同一套写法 —— `Tesselator.tex` 在 TS 里有（`Tesselator.ts:160`）。
- ⚠ 披风第一段 `t.begin()` 之前**没有 `t.color(...)`**，用的是上一次留下的颜色。照抄。

验收：单测（四路手持物品的变换矩阵链条太长，改成断言"调用了 renderItem 且变换调用次数对"）。

**做完的情况（G8）**

新增 `packages/client/src/renderer/entity/HumanoidMobRenderer.ts`（**236 行**）+ `index.ts` 一行 export
+ `tests/unit/client/humanoid-mob-renderer.test.ts`（**16 条**）+ `tools/verify/mutations-g8.json`。
**一条 DEFERRED 都没有** —— `Player` 的披风 API、`Item.items`、`Tile.tiles`、`Tesselator.tex`、
`ModelPart.translateTo` 在 TS 里都齐。

台账 **233 → 233**（没有新增标记）。唯一动过的标记是 `ItemInHandRenderer.ts` 空手分支那条
`DEFERRED(PlayerRender)` —— G8 之前它写的理由是"缺玩家模型"，G8 落地后已过时，实测
`ItemInHandRenderer.cpp:425-432` 真正缺的是 `PlayerRenderer` 与 `EntityRenderDispatcher.setModernSkin`
（两条都在 G11），理由改正、**条数不变**。

验收比任务单要求的更严一点：任务单说"断言调用了 `renderItem` 且变换调用次数对"，实际用 `SpyGL`
把每一步 `push/pop/translate/rotate/scale/enable/disable` 记成字符串**逐条对**（四路各 8~9 条），
所以 `-20` 抄成 `20`、`(s,-s,s)` 抄成 `(s,s,s)` 这种都跑不掉。披风的 **24 个顶点也全列出来逐条对**
（手抄 UV 表最容易错一个）。

单测覆盖：构造函数（模型是同一个对象 / 两个披风角度从 0 起）、`renderHand`（`attackTime` 清零、
`setupAnim` 的六个参数、只画 `arm0`、两组开关的顺序）、四路手持物品（含 `count = 0` 不画）、
披风（非玩家不画 / 空贴图不画 / 第一帧平滑到 `(6-0)*0.3` / **角度有记忆**（第二帧从上一次的值再往 6 靠，
两帧值不等）/ `lift` 上下限 / `forward` 负值夹 0 / 24 顶点走 `tex`+`vertex` 不走 `vertexUV`、
`begin` 之前没有 `color`）、`render` 的标志生命周期（拿东西时画的那一瞬间是 true、画完清回 false；
没拿东西时**不重置**遗留值）。

**踩到的坑：`t.draw()` 自己会开关两组客户端数组。** 披风那条测试第一版挂了 —— 期望的 op 数组里
少了 4 条 `enable:32888, enable:32884, disable:32884, disable:32888`。这 4 条不是披风代码发的，
是 `Tesselator.draw()`（`drawArrayVTN`）自己发的。已写进注释。

⚠ 两处多留了心的地方：披风那段 C++ 是 **double/float 混着**的（`capeX/px/dx` 是 double 不包 `f()`，
`bodyYaw/forward/lift/walk/capeXRot` 是 float 要包），文件头写明了；`render()` 里清
`holdingRightHand` 那句 C++ **无条件**执行，照抄（单测特意做了"连续两次 render"来钉这件事 ——
只测一次的话，"不设置"和"总是设置"分不出来）。

没做的一件事：**没有**在 `EntityRenderDispatcher` 里注册 `ER_HUMANOID` —— TS 里目前没有任何实体用这个
渲染器（猪/牛/僵尸实体都还没移植），注册给谁用不知道；等 G9/G11 有真调用方时再按 C++ 的位置补。

**反向验证：15 个变异 15 个全红**（含"少判一次 `count > 0`""手心 y 偏移符号反""披风第 3 个顶点 x 符号反"
"`renderHand` 两个 enable 顺序反""结尾清了反"）。

台账：**233 → 233**。`pnpm typecheck` 0；`pnpm test` **103 文件 / 1183 条全过**。

### G9 — 鸡（第一个看得见的）

`ChickenModel`（124 行）+ `ChickenRenderer`（45 行）+ `EntityRenderDispatcher` 注册。

- `ChickenModel`：8 个部件，`yo = 16` 那个局部变量；`setupAnim` 里 `head.xRot` 是**负的**
  （`-(xRot / (180/PI))`，和别的模型反号）；`wing0.zRot = bob`、`wing1.zRot = -bob`。
- `ChickenRenderer.getBob`：`(Mth.sin(flap) + 1) * flapSpeed`，flap/flapSpeed 都要插值。
  ✅ 实测 `Chicken.ts:31-35`（字段）+ `:42-46`（初始化）已经有 `flap` / `oFlap` /
  `flapSpeed` / `oFlapSpeed` / `flapping` 五个字段，本步不用动实体。
- 注册那一行照 C++ 的位置摆：`assign(ER_CHICKEN_RENDERER, new ChickenRenderer(new ChickenModel(), 0.3))`。

验收：**浏览器场景** `tools/verify/scenarios/entity-model.mjs` —— 在玩家脚下 3 格放一只鸡
（`level.addEntity(new Chicken(...))` 或走 `EntityFactory`），截图**必须打开看**：
能看到白色鸡身 + 橙色喙。再截一张"模型转 90°"的（改 `yRot`）确认不是碰巧。

**做完的情况（G9）**

新增 `packages/client/src/model/ChickenModel.ts`（**149 行**）与
`packages/client/src/renderer/entity/ChickenRenderer.ts`（**39 行**）+ `index.ts` 两行 export
+ `tests/unit/client/chicken-model.test.ts`（**14 条**）+ `tools/verify/mutations-g9.json`
+ 场景 `tools/verify/scenarios/entity-model.mjs`。**一条 DEFERRED 都没有**。

接线四处：`EntityRenderDispatcher` 注册 `ER_CHICKEN_RENDERER`（`f(0.3)`，见 PITFALLS 第 3 条）；
`ModelInclude.ts` 里 `ChickenModel` 那条 `DEFERRED(Model)` 换成真再导出；
`apps/web/src/assets.ts` 预加载 `mob/chicken.png`（漏了不报错，鸡会画成上一张绑定的贴图）；
`Chicken.ts` / `ThrownEgg.ts` 文件头"看不见"的旧注释改成"已接线"（纯注释）。

台账 **233 → 233**（净零）：消化 `DEFERRED(Model)` 一条 = −1，`ChickenModel.ts:75` 新增一条
`ADAPTED(Cpp)`（`0 + (float)yo` 的冗余加法直接写 `yo`）= +1。用 `git stash -u` 对 HEAD 与
工作区各跑一次 `pnpm ledger` 实测核对过。

**场景没走任务单建议的 `level.addEntity(new Chicken(...))`** —— 场景脚本跑在页面里，
`Chicken` 类不在 `window` 上，`MobFactory::CreateMob` 又整条 `OMIT(Entity)`，没有"造鸡后门"。
改走**真实链路**：一帧扔 160 个蛋，每个 1/8 概率孵一只（`(7/8)^160 ≈ 5e-10` 一只都不孵，
可忽略）；孵化后把一只 `moveTo` 到镜头前约 3.5 格、正对镜头（`yRot=180`），定格前把
`xo/yo/zo、yRotO、xRotO、yBodyRot、yBodyRotO` 全同步成当前值（渲染读的是插值字段，见 F 节
"改 `xRot` 之后要连 `xRotO` 一起改"）。**11 条断言全过**；两张截图都打开看过：
00 白色鸡身 + 橙色喙 + 红冠 + 黄腿正对镜头（远处一群孵出来的鸡也画出来了），
01 原地转 90° 后侧身、喙转向一侧。

**踩到的两个新坑（都补进 PITFALLS F 节）**：
1. **测试里建 `EntityRenderDispatcher` 之前要先铺 GL 上下文** —— G9 起它的构造函数会
   `new ChickenModel()`，而 `ModelPart` 的构造要 `glGenBuffers`（无上下文时 `gles.ts:153` 抛）。
   一次连带伤了 21 条旧测试（3 个 SpyGL 文件 9 条 + `particle-take` 的假 GL 12 条）。
   修的是**测试环境**：3 个文件 `beforeAll` 补 `glSetContext(new GLES1(null))`、
   `RecordingGL` 补一个 `genBuffers`；**断言一个没动**。真机里 GL 上下文一定先于分派器存在，
   没有为迁就测试动生产代码。
2. **`initItems()` 之前必须先注册方块（`initTiles`）** —— `initItems` 会读 `Tile.grass.id`
   （未注册时访问 `.id` 直接抛），真机初始化顺序就是 `initTiles → initItems`；
   新测试文件的 `beforeAll` 用 `createFlatLevel()`（= initHeadless 链）补这个顺序。

**反向验证：19 个变异 19 个全红**（`tools/verify/mutations-g9.json`）—— 头 `xRot` 负号丢 /
嘴 `xRot` 清零 / 冠 `yRot` 清零 / 身体 90°→180° / 两条腿同号 / 两只翅膀同号 / `yo` 16→15 /
腿 x 位置 -2→2 / 幼年 `1/ss`→`ss` / 幼年头组漏 `beak` / 幼年身组漏 `wing1` / 成年头喙对调 /
`hair` 登记进 `cubes` / 身体盒深 6→5 / `getBob` 的 flap 不插值 / flapSpeed 不插值 /
丢 `(sin+1)` 的 `+1` / 注册 id 换成猪 / shadow 0.3→0.4。

台账：**233 → 233**。`pnpm typecheck` 0；`pnpm test` **104 文件 / 1197 条全过**。

### G10 — TNT / 画 / 三脚架相机

三个都不依赖模型系统（相机只用一个 `ModelPart`）：

- `TntRenderer`：`life` 最后 10 tick 的膨胀（`g` 平方两次）、`(life/5)&1 == 0` 时的加色闪烁，
  用 `tileRenderer.renderTile(Tile.tnt, 0)`。
- `PaintingRenderer`：`motive.w/h/uo/vo`，按 16×16 分块，每块 24 个顶点（正面 + 背面 + 4 个侧面），
  `glEnable(GL_RESCALE_NORMAL)`。
- `TripodCameraRenderer`：**构造一个 `Tile` 实例**（`new Tile(0, 15*16+3, Material.plant)`）+
  一个 `ModelPart cameraCube`（`addBox(-4,-4,-6,8,8,10)`，`y = 11`），
  ⚠ `cameraCube` 没有 `setModel` —— 它不属于任何 Model，所以 `onGraphicsReset` 传不到它。
  还要 `Mth.DEGRAD`（TS 有）。

验收：浏览器截图三张（摆一个 TNT 点燃、挂一幅画、放一个相机）。

**做完的情况（G10）**

新增三个渲染器：`packages/client/src/renderer/entity/TntRenderer.ts`（**81 行**）、
`PaintingRenderer.ts`（**116 行**）、`TripodCameraRenderer.ts`（**108 行**）
+ `packages/client/src/index.ts` 导出 + 三个测试文件（**24 条**：TNT 9 / 画 6 / 相机 9）
+ `tools/verify/mutations-g10.json`（23 条）+ 场景 `tools/verify/scenarios/g10-renderers.mjs`。
三个实现文件**一条 DEFERRED 都没有**。

接线：`EntityRenderDispatcher` 注册两行 —— `ER_TNT_RENDERER`（cpp:52）、`ER_PAINTING_RENDERER`（cpp:57）；
`assets.ts` 预加载 `art/kz.png`（画集）与 `item/camera.png`（相机方块贴图）。
⚠ **`TripodCameraRenderer` 照 C++ 不注册**：`EntityRenderDispatcher.h:55` 只有一行注释掉的成员
`//TripodCameraRenderer tripodCameraRenderer;`，assign 列表里没有它 —— 原版画面上相机实体就是
**隐形**的。单测第一条钉死这件事（`getRendererById(ER_TRIPODCAMERA_RENDERER)` 为 null、
`getRenderer(cam)` 也为 null）。三个旧测试（`arrowrenderer` / `fallingtile-renderer` /
`itemsprite-renderer`）里"拿一个没注册的 id 当对照"的例子换成 `ER_TRIPODCAMERA_RENDERER`
（`toBeNull()` 断言一个没动）。

**场景 `g10-renderers.mjs`：25 条断言全过**，4 张截图都打开看过 ——
00 打火石点着的 TNT 立在正前方约 6 格（life=75：不闪不鼓的正常态）；
01 引信拨到 0：明显鼓大一圈（`g = 0.9⁴ ≈ 0.656` → `1 + g*0.3` ≈ 1.2 倍）**加泛白**
（`(life/5)&1 == 0` 时关纹理、`color(1,1,1,br)` 叠半透明白光）；
02 石墙正中挂着一幅画（这轮随机到 2×2 的蜘蛛画，正好走多块循环的路径）；
03 相机实体挪到镜头正前方 4 格（断言 dz=4）、**画面上什么都没有** —— 没注册渲染器的视觉证据。
点燃走真实链路：打火石（`items[259]`）塞进热键 0 号槽 → `gameMode.useItemOn` →
`Tile.tiles[46].use` → `destroy(EXPLODE_BIT)` → 生成 `PrimedTnt`（断言 life=80、原方块被清空）。

**踩到的新坑（补进 PITFALLS F 节）**：**`app.pause = true` 之后才加进世界的实体，`xOld` 停在 0** ——
渲染插值读 `xOld`（`xOld + (x - xOld) * a`，C++ 照抄），而它只在 `_init` / `moveTo` / 存档 /
**每次 `Level::tick(Entity*)`** 里同步。画与相机是 pause 后 `addEntity` 的，一次 tick 都没跑过 →
渲染坐标漂在 0 与真实位置之间（画面上就是"墙上一片空"）。**实现与 C++ 完全一致，是场景自己造出的处境**
（断言 `xoldBefore === 0` 实测坐实根因）；药方是走原版路径 `level.tickEntity(e, false)`
（= C++ `Level::tick(e, false)`，只同步不 tick）或 `moveTo`（自带同步）。

**反向验证：23 个变异 23 个全红**（T1–T8 / P1–P6 / C1–C9）—— 鼓包边界 `< 10`→`<= 10` /
闪烁条件去掉 `& 1` / 周期 5→6 / `0.8f` 与 `0.3f` 丢 `f()` / 四次方少乘一次 / blendFunc 参数对调 /
TNT 注册行注释掉 / 画第一块板第一个顶点 y1→y0 / 背面 UV 对调 / `0.5/256` 写成 0 / `1/16`→`1/8` /
绕 y 转抄成绕 z / **相机 id 被注册（C++ 里没有这行）** / 朝向少 `xRot/2` / yRot 丢负号 /
`>= 8`→`> 8` / `Math.sin`→`Mth.sin` / 拾取比较取反 / `cameraCube.y` 11→10 / 木叉 `-0.5`→0 /
高亮支少颜色重置。

台账：**233 → 233**（三个新文件零标记；分派器那两条老 `DEFERRED(EntityRender)` /
`OMIT(EntityRender)` 没动）。`pnpm typecheck` 0；`pnpm test` **107 文件 / 1221 条全过**。

### G11 — 玩家 + 空手手臂

- `PlayerRenderer`：4 个 `HumanoidModel`（`playerModel64` / `playerModel32` / `armorParts1(g=1.0)` /
  `armorParts2(g=0.5)`），构造末尾把 `model` 和 `humanoidModel` **都换成 `playerModel32`**。
  `isModernPlayerSkin` 走 `textures.loadTexture` + `getTemporaryTextureData` 判 64×64。
  `prepareArmor` 里 `armorFilenames[modelIndex*2 + (layer==2 ? 1 : 0)]`。
- ⚠ `PlayerRenderer::render` 里先 `setModernSkin(mob)` 再调父类；
  `EntityRenderDispatcher.setModernSkin` 是**把 `getRenderer(player)` 硬转成 `PlayerRenderer`**
  —— 只在玩家身上调，照抄那个不安全转换（TS 里要显式判类型，写成 `as`）。
- `ItemInHandRenderer.ts:358` 那条 `DEFERRED(Model)` 换成真的调用：
  C++ 那段是 `getRenderer(mc->player)` → 转 `HumanoidMobRenderer` → `setModernSkin(player)` → `renderHand()`。

验收：场景里按 F5 切第三人称截一张图（能看到自己的头和身子），
再切回第一人称、清空手持物品截一张（能看到手臂）。

### G12 — 收尾

- 7 只没实体的生物的模型/渲染器：在 `docs/ai/TASK-G-*.md` 和 `ModelInclude.ts` /
  `EntityRenderDispatcher.ts` 里各记一条 `OMIT(Entity)` + 理由（**"实体类未移植，等 MobFactory/MobAI"**）。
- `PITFALLS.md` 补节：模型几何的坑（六次空转、成员遮蔽、UV 与 Java 版不同、assign 而非换对象）。
- 台账、完成章节、`task_plan.md` / `progress.md`。

---

## 怎么验证（三层里这批用两层，但层数和别人不一样）

| 层 | 这批怎么用 |
|---|---|
| `pnpm typecheck` + `pnpm test` | 每步都跑，**不解释** |
| **黄金样本** | G1 生成夹具，G2/G3 起逐位比对。这是这批**唯一的硬判据** |
| **浏览器实测** | G9 起每步截图。**截图必须用图片查看工具打开看**，不能只看 `ok: true` |
| fround 反向验证 | `Model.setupAnim` / `MobRenderer.render` 里的每个乘法都要扰动一遍 |

`tests/golden/model.golden.test.ts` 要比对的（逐位相等，不是近似）：
每个 cube 的 8 个顶点 `x/y/z`、8 个顶点的 `u/v`、6 个面 × 4 个角的 `u/v`。

---

## 每一步提交前的自检

1. `pnpm typecheck` 0；`pnpm test` 全绿；
2. `pnpm ledger` 条数**当场看**，和任务单里写的一致（记忆条目：写进产物的数字都要实测）；
3. 改动的文件数 ≤5、行数 ≤300；超了就停下拆步写回任务单；
4. 新写的每段浮点都过一遍 fround（`const f = Math.fround`）；
5. **反向验证**：把实现改坏一处，确认对应测试变红；改不红的写成"记录"测试；
6. 提交说明写清"移植了什么、暂缓了什么"。

---

## 已知缺口（本任务单不做，留给后面）

1. **7 只生物的模型与渲染器** —— 拦在实体的前面（`MobFactory` 整条 OMIT）。
2. **`renderer/tileentity/`**（箱子、告示牌）—— 另一摊，`DEFERRED(TileEntityRender)` 4 条。
3. **`EntityTileRenderer`** —— 方块的"实体形态"，`TileRenderer.ts:1731` 那条。
4. **`MobRenderer` 的护甲层在鸡/玩家以外没人调** —— 本任务单只有 `PlayerRenderer.prepareArmor` 是真的。
5. **`ModelPart` 的 `addTexBox`**（`ModelPart.h:46`）—— 全参考源码零调用方，照抄但要注明。
