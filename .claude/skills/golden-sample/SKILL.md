---
name: golden-sample
description: 需要证明 TS 移植的计算结果与原版 C++ 一致时使用：随机数、世界生成、物理与碰撞、存档字节、NBT、字宽、物品栏格式等任何能精确比较的东西。说明如何写 C++ harness、生成夹具、写 TS 对照测试，以及三档比较规则。
---

# 黄金样本

## 原理

用参考 C++ 源码本身跑出“标准答案”，提交成夹具；TS 用同样的输入算一遍，逐项比较。夹具**只能由 harness 生成**，禁止手改（guard 钩子会拦）。

## 已有的样本（照着抄）

| 编号                         | harness                           | 夹具           | 测试                                 |
| ---------------------------- | --------------------------------- | -------------- | ------------------------------------ |
| G11-1/2 注册表               | tools/golden/harness_registry.cpp | registry.json  | tests/golden/registry.golden.test.ts |
| G11-3/4 NBT                  | harness_nbt.cpp                   | nbt.json       | nbt.golden.test.ts                   |
| G12-1 实体存档               | harness_entity.cpp                | entity.json    | entity.golden.test.ts                |
| G12-2 碰撞轨迹（真实 Level） | harness_collision.cpp             | collision.json | collision.golden.test.ts             |
| G12-3 物品栏                 | harness_inventory.cpp             | inventory.json | inventory.golden.test.ts             |
| G13-1 字宽                   | harness_font.cpp                  | font.json      | font.golden.test.ts                  |

## 写一个新样本

1. **harness**（`tools/golden/harness_xxx.cpp`）：`#include` 参考源码的头文件；初始化顺序照 NinecraftApp：`Material::initMaterials(); MobCategory::initMobCategories(); Tile::initTiles(); Item::initItems(); Biome::initBiomes(); TileEntity::initTileEntities();`，要用区块时还要 `LevelChunk::ChunkBlockCount = LevelConstants::CHUNK_BLOCK_COUNT;`。
   - 用固定输入调用被测函数，把结果写成 JSON（浮点用 `%.9g`，字节写十六进制字符串）。
   - 访问 private 成员：在 include 之前 `#define private public`（先 include 好标准库头）。
   - 需要一个 Level：照 harness_collision.cpp 用 `GoldenStorage`（补 loadPlayer/savePlayer）+ `EmptyDimension`（空区块源），避免地形生成。
   - 只用到一个类的少数外部成员（如 Font 只用 Textures 的两个函数）：在 harness 里直接给出这几个成员的定义，不链接整个 .cpp。
2. **build.sh**：照已有段落加一段（编译、自动生成未定义符号的陷阱桩 `ud2`、运行）。运行时触发桩会 SIGILL，说明走到了不该走的路径。
3. 生成：`REF=$REF bash tools/golden/build.sh <节名>`（Linux 或 WSL；g++ -O0 -fwrapv）。节名就是夹具主文件名（`--list` 可查），只生成这一节能省掉其它节；不给节名则全生成（约 1 分钟）。检查 `git diff fixtures/golden`：**旧夹具不应该变**，变了先查原因。
4. **测试**（`tests/golden/xxx.golden.test.ts`）：读夹具，用同样输入调用 TS，比较。

## 三档比较规则

| 档  | 比较                         | 适用                                      |
| --- | ---------------------------- | ----------------------------------------- |
| 一  | 完全相等（整数、字节、布尔） | 随机数、NBT、存档、注册表、字宽、碰撞标志 |
| 二  | 容差 1e-4                    | 物理轨迹、浮点坐标                        |
| 三  | 不比较数值，只做截图核对     | 界面动画、渲染                            |

## 常见失败的含义

- 只差最后几位：漏了 `Math.fround`。
- 差一个整数：整数除法、取整方向、`(char)` 截断。
- 顺序不同：`std::map` 遍历、`std::sort` 不稳定。
- harness 运行 SIGILL：调到了陷阱桩，说明这条路径需要更多源文件或者初始化少了一步。
