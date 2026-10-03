# 任务单 C：世界生成（`RandomLevelSource`）

目标：**把普通维度地形生成出来，让起始菜单点进一个世界真的能进去**。

现状（`docs/ai/TASK-B-存档.md` 收尾时）：界面齐了、存档通了，但菜单点任何世界都会抛 ——
`Minecraft.selectLevel` 要建普通维度，而 `Dimension.createRandomLevelSource()` 是个 throw
（`DEFERRED(Levelgen)`）。这份任务单就是把这个 throw 换成真东西。

原则不变：1:1 移植 C++；浏览器差异照旧集中在 VirtualFS / ADAPTED(Web) 那层。

**一次只做一个步骤。** 每步结束：`pnpm typecheck && pnpm test` 通过、提交，并记下 `pnpm ledger` 的变化。
步骤里写了"黄金样本"的，样本通过才算完成。

> ⚠ **"台账条数不升"这条只适用于"把已有 DEFERRED 换成真实调用"的步骤**（B 那一串就是那样）。
> C-2 / C-4 / C-5 都是**新起一个类**，没移植完的函数按 R3 留 DEFERRED，条数必然上升 ——
> C-2 实测是 +10。要紧的是**每条新增都对得上具体哪句 C++**，而不是数字本身。
> 会下降的是 C-3（`prepareHeights`/`buildSurfaces` 转正）和 C-7（`postProcess` 的账要结清）。

---

## C0 范围（用户 2026-10-03 拍板）

### 做什么

`RandomLevelSource` 的**地形部分**：高度场 → 石头/水/冰 → 表层 + 基岩 → 洞穴 → 峡谷。

### 不做什么（明确留下，不是忘了）

| 不做的                                                    | 为什么                                              | 留成什么                                 |
| --------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| `postProcess`（湖、矿、树、花草、泉、积雪）               | 用户选择"这一轮只做地形"                            | `DEFERRED(LevelgenFeature)`，原句保留    |
| 地物系统（`levelgen/feature/` 15 个类，约 1300 行头文件） | 只有 `postProcess` 用得到                           | 整个目录不移植                           |
| `Biome::getTreeFeature`                                   | 只有 `postProcess` 的树那段用得到                   | **TS 里现在就是 `OMIT`，这一轮继续留着** |
| `MobSpawner::postProcessSpawnMobs`                        | 用户选"先 DEFERRED"；只影响刷怪，**不影响地形字节** | `DEFERRED(MobSpawner)`                   |

### 做完之后世界是什么样

有山、有水、有洞、有峡谷、有草和沙的表层 —— **但挖不到矿、没有树、没有花草、没有湖**。

### ⚠ 一个必须知道的后果

`postProcess` 被 DEFERRED 之后，生成的区块照样会被标成 `terrainPopulated = true` 存进存档。
**等以后补上地物，这些老区块不会追溯补上矿和树。** 开发期间测过的世界得删掉重新生成。
这不是 bug，是存档机制的正常行为。

---

## C0.5 依赖清单（实测，不是估的）

### 好消息：几乎全在

**要改的接线只有一行** —— `packages/world/src/level/dimension/Dimension.ts:54`：

```ts
createRandomLevelSource(): ChunkSource {
  // DEFERRED(Levelgen): return new RandomLevelSource(level, level->getSeed(), level->getLevelData()->getGeneratorVersion(), !level->isClientSide && level->getLevelData()->getSpawnMobs());
  throw new Error('RandomLevelSource 尚未移植（世界生成）。demo 用 FlatDimension，它重写了 createRandomLevelSource');
}
```

`Level` / `ChunkCache` / `LevelChunk` / `BiomeSource` / `Random` / `Tile` / `Material` 全部就绪。
`levelgen/synth/`（`ImprovedNoise` / `PerlinNoise` / `Synth`）已经有了，**而且有黄金样本**
（`fixtures/golden/synth.json`，里面测的正好是主噪声那套 4 层/16 层参数）。

取区块那条链也已经通：`Level.createChunkSource`（Level.ts:179）→ `ChunkCache.getChunk`
（ChunkCache.ts:97 那句 `this.source.getChunk(x, z)`）→ `LevelChunk`。

### 要新写的

| 内容                                | C++                                                            | 估算行数                            |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| `RandomLevelSource` 本体            | `levelgen/RandomLevelSource.{h,cpp}`（128 + 777）              | ≈ 900（不含 postProcess 那 315 行） |
| `LargeFeature` + `LargeCaveFeature` | `levelgen/LargeFeature.*`、`LargeCaveFeature.h`（180，全内联） | ≈ 230                               |
| `CanyonFeature`                     | `levelgen/CanyonFeature.{h,cpp}`（23 + 169）                   | ≈ 190                               |

### 一个必须先说清楚的类关系

**`RandomLevelSource` 不实现 `LevelSource`，它继承 `ChunkSource`**（`RandomLevelSource.h:32`）。
`LevelSource` 是另一个接口，只有 `Level` 和 `Region` 实现。
新代码要照的样板是 `FlatChunkSource.ts`（79 行，同样 `extends ChunkSource`）。

### 查出来的死代码（**不移植**）

下面每条都**自己 grep 核过**（不是只看别人给的清单）：

| 死物                                                                                              | 为什么                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DungeonFeature`（.h 23 + .cpp 176）                                                              | 整块被 `#if 0` 包住（`DungeonFeature.h:4`），全库无引用                                                       |
| `TownFeature`（.h 13）                                                                            | 头文件里写的是 **Java 语法**（`class TownFeature extends LargeFeature`），根本 include 不进来；全库也没有引用 |
| `calcWaterDepths`                                                                                 | 全库只有声明和定义，**没有任何调用点**                                                                        |
| `waterDepths` 字段（`RandomLevelSource.h:68` 写成 `int waterDepths[16+16][16+16]`，也就是 32×32） | 只在构造函数里被清零（`.cpp:37`），此后再没被用过                                                             |
| `PerformanceTestChunkSource`                                                                      | 同文件末尾，因为 `getMobsAt` 没实现而是抽象类，从没被实例化                                                   |

### ⚠ 陷阱：`CHUNK_WIDTH` 有两个不同的值

`RandomLevelSource.h:39` 写着 `static const int CHUNK_WIDTH = 4;`，
但 `.cpp` 里**用的全是 `LevelConstants::CHUNK_WIDTH`（= 16）** —— 那个类常量是死的。

TS 里 `LevelConstants.CHUNK_WIDTH` 恰好是对的（16，与 `LevelConstants.cpp:5` 一致）。
**移植时不要"顺手"把哪儿改成 4。** 证据：`.cpp:37` 的 `int xChunks = 16 / LevelConstants::CHUNK_WIDTH`
算出来是 1（原版行为），按 4 算就是 4。

---

## 拆分（八小步）

| 步骤     | 内容                                          | 验收                             |
| -------- | --------------------------------------------- | -------------------------------- |
| **C-1**  | **黄金样本先行**：`harness_randomlevelsource` | 夹具逐字节可复现                 |
| **C-2**  | 类骨架 + 构造函数 + `getHeights`              | 高度场那串 float 对上            |
| **C-3**  | `prepareHeights` + `buildSurfaces`            | 表层方块数组对上                 |
| **C-4**  | `LargeFeature` + `LargeCaveFeature`           | 洞穴部分对上                     |
| **C-5**  | `CanyonFeature`                               | **完整 `getChunk` 方块数组对上** |
| **C-6a** | 接线 `Dimension.ts` + 三个测试文件            | 生产路径出来的区块也对上夹具     |
| **C-6b** | 浏览器实测：新场景 + 翻转两条"将来会红"的断言 | **截图里真的有山有水** ✓         |
| **C-7**  | 收尾：`postProcess` 标 DEFERRED、文档、台账   | —                                |

> **C-6 为什么拆成两半**（2026-10-03）：原计划的 C-6 要动 9 个文件（`Dimension.ts`、4 个测试/辅助文件、
> 新场景、`startmenu.mjs`、外加 3 个写着"点 Create 会抛"的过时注释），超过 CLAUDE.md
> 「碰 5 个以上文件就停下拆细」的线。按性质切开：C-6a 是**接线 + 用黄金样本钉住它**，
> C-6b 才是**画面上的验收**。两半各有独立判据，谁都不依赖对方先做完。

### C-1 为什么放第一步

`getChunk` 是一整块出来的 —— 光比对最终结果的话，**中间任何一步错了都只能看到"最后不一样"，
不知道错在哪**。所以 harness 要分四次快照：

1. `getHeights` 出来的高度场（float 数组）
2. `prepareHeights` 之后的 blocks（石头/水/冰）
3. `buildSurfaces` 之后的 blocks（表层 + 基岩）
4. 完整 `getChunk` 之后的 blocks（含洞穴、峡谷）

这样 C-2 / C-3 / C-4 / C-5 每一步都有自己那一份判据。

**技术上的小手段**：这三个方法在 C++ 里是 `private`。harness 里先 `#define private public`
再 include 头文件即可 —— **只影响 harness 那个编译单元，参考源码一个字不改**。

**链接怎么办**：照 `harness_chunk.cpp` 的现成套路（`build.sh:283-287`）——
编译真实现 → 链接 → 收集未定义符号 → 自动生成 `ud2` 陷阱桩。
好处是**一旦运行到没提供的依赖就 SIGILL**，等于把缺的依赖一条条指出来。

**兜底**：如果 `RandomLevelSource` 依赖的 `Level*` 太深、桩不住，退回
`harness_biomesource.cpp` 那种「只换几个头文件当替身」的做法（`build.sh:104-116` 有完整先例）。

### 每一步的详细验收

- **C-2**：构造函数建 8 个 `PerlinNoise`（16/16/8/4/4/10/16/8 层），层数写错后面全错。
  `getHeights` 里 9 张噪声的**调用顺序**是第一个高风险点。
- **C-3**：`prepareHeights` 的三线性插值是第二个高风险点（float 语义极敏感）。
  `buildSurfaces` 里的 `runDepth` 逻辑照着抄。
- **C-4**：洞穴递归里每层 `new Random(random.nextLong())` —— 随机流分叉，错一步整片洞错位。
- **C-5**：峡谷的 `yScale = 5`、`y < 10` 限界别写错。
- **C-6a**：`Dimension.ts:54` 的 throw 换成真调用；`FlatDimension` 不受影响（它 override 了）。
  **接线本身也要有判据** —— 之前所有黄金样本都是**手工** `new RandomLevelSource`，
  而菜单进世界走的是 `Dimension.createRandomLevelSource()`。补一条不传 `fixedDimension`、
  走 `DimensionFactory` 真路的测试，跟夹具逐字节比。
  顺带修 `tests/unit/world/dimension.test.ts` 里那条断言"调用即抛"的旧测试（它是钉 DEFERRED 的，现在该换了）。
  动的文件：`Dimension.ts`、`randomlevelsource.golden.test.ts`、`dimension.test.ts`、`helpers/fakeLevel.ts`。
- **C-6b**：浏览器实测。新场景 `tools/verify/scenarios/worldgen.mjs` 走**真菜单**
  （开始游戏 → Create new → 填种子 → Create），不看后门。
  `startmenu.mjs` 里那两条写着"将来会红"的断言（`点 Create 会抛` / `进世界会抛`）**就是为这一刻留的**，
  现在已经翻成"真的进得去"（两个入口各一条）。另外 3 处注释（`Minecraft.selectLevel`、
  `NinecraftApp.startDemoWorld`、`SimpleChooseLevelScreen`）写着"会抛"，一并改掉。

  **实测撞出来的事，三条都值得记住**：

  1. **`postProcess` 之前是个 `throw`，不是空实现。** `ChunkCache.getChunk` 每凑齐 2×2 个区块就调它一次，
     每个区块都会走到 —— 接完 `Dimension` 那条线，菜单路卡在这儿。改成空实现（决策见下面的"已知后果"）。
  2. **这个世界只有 256×256。** `ChunkCache::fits` 写死区块 `0 <= x,z < 16`，范围外返回
     `EmptyLevelChunk`（整块 `invisible_bedrock` 95、`heightmap` 恒 0）。连带：
     `Level.getHeightmap` 对没生成的区块返回 0 且不触发生成；出生点从世界中心 **(128,128)** 起步，不是 (0,0)。
  3. **夹具的覆盖盲点**：G15-1 那 5 个区块全在真实世界之外。它们仍是有效判据
     （生成器对坐标没有"世界边界"概念），但游戏真正会生成的 256×256 里一个都没比过。
     补法：往 harness 的 `CHUNKS` 里加一个落在 `0..15` 的区块再重新生成夹具。**本轮没做，记在这里。**

  场景本身也踩了两个坑，都写在 `worldgen.mjs` 的注释里：起伏那段的 `if (top < 0) top = y`
  记的是**最低**非空气格（于是"最高减最低"恒为 0，断言永远为假）；以及先把相机放在最高点朝低处看，
  方向反了 —— 种子 777 是"大片低地 + 东北角一片高地"，得**站在低处朝高地看**。
- **C-7**：`postProcess` 原句留成 `DEFERRED(LevelgenFeature)`。

---

## 已知的最大风险

**`postProcess` 占了 `RandomLevelSource.cpp` 的 40%（约 315 行），而且按固定顺序消耗同一个
`random` 流**（湖 → 矿 → 树 → 花草 → 泉）。任何一个地物顺序错了或漏了，整章地形全错位，
而且**从结果上看不出来是哪儿错**。

这一轮不做它，所以这个风险这一轮不触发。但**以后补它的时候，顺序是唯一要紧的事**，
要先把地物系统做齐再写 `postProcess`。这条写在这里，是给那时的自己看的。

---

## 每一步提交前的自检

- [ ] `PITFALLS.md` 逐条过了一遍（特别是 A 节数值、D 节容器顺序）
- [ ] `divs.py`、`shadow.py` 跑过
- [ ] 新增的 DEFERRED 都写了系统名和 C++ 原句
- [ ] `pnpm typecheck`、`pnpm test` 通过；黄金样本通过
- [ ] 有画面的：跑了场景，**打开截图看过**
