// 黄金样本 G-D3：爆炸（`Explosion::explode` / `finalizeExplosion`）。
//
// 为什么要做这个：先只写了单测，断言是"炸出一个坑、方块数变少" —— 然后拿 6 处扰动去试，
// **5 处都照样绿**（改步长 0.3→0.5、改能量系数 0.7f→0.5f、去掉"只走立方体表面"、
// toBlow 不再判 remainingPower>0、能量衰减 0.75f→0.5f）。也就是说那种断言只判"有没有坑"、
// 不判"坑长什么样"。爆炸是纯数值计算（射线步进 + 浮点累加），本来就该按第一档钉死。
//
// 做法与 harness_collision 相同：C++ 真实 Level + 空区块源（EmptyDimension），
// 在 y = F 一带垒一块 16×16×13 的实心石头，跑 `Explosion` 并把
//   - `toBlow` 的**全部内容与遍历顺序**（std::set 按 TilePos::operator< 即 hashCode 排序）
//   - 跑完 `finalizeExplosion()` 之后同一片区域的方块 id
// 一起 dump 出来。TS 一侧照同样的种子、同样的场地复现。
//
// 【为什么不走 `Level::explode`】那个包装里最后一句是 `raknetInstance->send(packet)`，
// 而 harness 里 `raknetInstance` 是 NULL —— 会崩。所以直接建 `Explosion`（网络那句在 TS 侧是 DEFERRED）。
#include <cstdio>
#include <cstring>
#include <map>
#include "SharedConstants.h"
#include "world/level/material/Material.h"
#include "world/level/tile/Tile.h"
#include "world/item/Item.h"
#include "world/entity/MobCategory.h"
#include "world/level/biome/Biome.h"
#include "world/level/tile/entity/TileEntity.h"
#include "world/level/Level.h"
#include "world/level/LevelSettings.h"
#include "world/level/storage/MemoryLevelStorage.h"
#include "world/level/Explosion.h"
#include "world/level/dimension/Dimension.h"
#include "world/level/chunk/ChunkSource.h"
#include "world/level/chunk/LevelChunk.h"
#include "world/level/LevelConstants.h"

static const int F = 115; // 场地的**顶面** y（石头从 F-12 铺到 F）

/** 空世界的区块源：区块全是空气，场地几何完全由 buildArena 决定（TS 一侧同理） */
struct EmptySource : public ChunkSource {
  Level* level;
  std::map<long long, LevelChunk*> chunks;
  explicit EmptySource(Level* l) : level(l) {}
  bool hasChunk(int, int) override { return true; }
  LevelChunk* getChunk(int x, int z) override {
    long long k = ((long long)x << 32) ^ (unsigned)z;
    auto it = chunks.find(k);
    if (it != chunks.end()) return it->second;
    unsigned char* blocks = new unsigned char[16 * 16 * 128];
    std::memset(blocks, 0, 16 * 16 * 128);
    LevelChunk* c = new LevelChunk(level, blocks, x, z);
    c->recalcHeightmap();
    chunks[k] = c;
    return c;
  }
  LevelChunk* create(int x, int z) override { return getChunk(x, z); }
  void postProcess(ChunkSource*, int, int) override {}
  bool tick() override { return false; }
  bool shouldSave() override { return false; }
  Biome::MobList getMobsAt(const MobCategory&, int, int, int) override { return Biome::MobList(); }
  std::string gatherStats() override { return ""; }
};

struct EmptyDimension : public Dimension {
  ChunkSource* createRandomLevelSource() override { return new EmptySource(level); }
};

/** C++ 的 MemoryLevelStorage 没实现纯虚的 loadPlayer/savePlayer（参考源码里也没被实例化过） */
struct GoldenStorage : public MemoryLevelStorage {
  bool loadPlayer(Player&) override { return false; }
  void savePlayer(Player&) override {}
};

/**
 * 一块 16×16×13 的分层场地，顶面在 F（y 从 F-12 到 F）：
 *
 *   F-12 .. F-10  石头     （`setExplodeable(10)` → 抗性 6.0，r=3.1 的爆炸几乎打不动）
 *   F-9  .. F-2   泥土     （只 `setDestroyTime(0.5f)` → 抗性 0.5，炸得出像样的坑）
 *   F-1  .. F     沙子/沙砾（抗性 0.5/0.6）
 *
 * 中间还有一块 4×3×4 的黑曜石（`setExplodeable(2000)` → 抗性 1200，一步就停）。
 *
 * 【为什么这么分层 —— 第一版全是石头，结果 toBlow 只有 1 格】查下来是原版行为：
 * `Tile::setExplodeable(x)` 存的是 `x * 3`，`getExplosionResistance()` 再除以 5；
 * 石头是 `setExplodeable(10)` → 6.0，每走一步要吃掉 `(6.0+0.3)*0.3 + 0.3*0.75 ≈ 2.1`，
 * 而 r=3.1 的初始能量只有 `3.1*(0.7~1.3)` = 2.2~4.0 —— **这个版本的 TNT 对石头基本无能为力**。
 * 所以场地里必须放软材料，不然夹具什么也测不出来。
 */
static void buildArena(Level* level) {
  for (int x = 0; x < 16; x++)
    for (int z = 0; z < 16; z++) {
      for (int y = F - 12; y <= F - 10; y++) level->setTileNoUpdate(x, y, z, Tile::rock->id);
      for (int y = F - 9; y <= F - 2; y++) level->setTileNoUpdate(x, y, z, Tile::dirt->id);
      for (int y = F - 1; y <= F; y++) level->setTileNoUpdate(x, y, z, Tile::sand->id);
    }
  // 一条沙砾带 + 一块黑曜石，覆盖"抗性各不相同"这条路径
  for (int z = 0; z < 16; z++) level->setTileNoUpdate(0, F, z, Tile::gravel->id);
  for (int x = 6; x < 10; x++)
    for (int y = F - 6; y <= F - 4; y++)
      for (int z = 6; z < 10; z++) level->setTileNoUpdate(x, y, z, Tile::obsidian->id);
}

/** 把一片区域的方块 id 打成一个数组（x 外层、y 中层、z 内层；顺序与 TS 侧一致） */
static void dumpRegion(FILE* o, Level* level, int x0, int y0, int z0, int x1, int y1, int z1) {
  std::fprintf(o, "[");
  int n = 0;
  for (int x = x0; x <= x1; x++)
    for (int y = y0; y <= y1; y++)
      for (int z = z0; z <= z1; z++)
        std::fprintf(o, "%s%d", n++ ? "," : "", level->getTile(x, y, z));
  std::fprintf(o, "]");
}

struct Case {
  const char* name;
  float x, y, z, r;
  int seed;
  bool fire;
};

int main(int argc, char** argv) {
  Material::initMaterials();
  MobCategory::initMobCategories();
  Tile::initTiles();
  Item::initItems();
  Biome::initBiomes();
  TileEntity::initTileEntities();
  LevelChunk::ChunkBlockCount = LevelConstants::CHUNK_BLOCK_COUNT;

  FILE* o = std::fopen(argv[1], "w");
  Case cases[] = {
    {"r3.1_dirt",       8.5f,  F - 7.5f, 8.5f, 3.1f, 12345, false}, // 软土里，炸得出坑
    {"r1_dirt",         8.5f,  F - 7.5f, 8.5f, 1.0f, 12345, false}, // 小半径
    {"r4_from_edge",    1.5f,  F - 6.5f, 1.5f, 4.0f, 777,   false}, // 贴着角落，一半在界外
    {"r2_above_ground", 8.5f,  F + 2.5f, 8.5f, 2.0f, 999,   false}, // 悬空炸，纯空气路径
    {"r3.1_obsidian",   8.5f,  F - 5.5f, 8.5f, 3.1f, 4242,  false}, // 正对黑曜石，抗性 1200
    {"r3.1_fire",       8.5f,  F - 7.5f, 8.5f, 3.1f, 12345, true},  // fire=true（原版里放的火随后被自己清掉）
  };
  const unsigned NC = sizeof(cases) / sizeof(cases[0]);

  std::fprintf(o, "{\"floor\":%d,\"arena\":[%d,%d,%d,%d,%d,%d],\"cases\":[",
               F, 0, F - 12, 0, 15, F, 15);
  for (unsigned k = 0; k < NC; k++) {
    const Case& c = cases[k];
    // ⚠ 每个 case 都要一块**全新**的场地：爆炸是破坏性的，共用场地的话后面的 case 起点就变了
    Level* level = new Level(new GoldenStorage(), "golden",
                             LevelSettings(12345, GameType::Creative),
                             SharedConstants::GeneratorVersion, new EmptyDimension());
    buildArena(level);
    level->random.setSeed(c.seed); // ⚠ 必须显式 seed：C++ 的 Level::random 是默认构造的

    Explosion e(level, NULL, c.x, c.y, c.z, c.r);
    e.fire = c.fire;
    e.explode();

    std::fprintf(o, "%s{\"name\":\"%s\",\"at\":[%.9g,%.9g,%.9g],\"r\":%.9g,\"seed\":%d,\"fire\":%d,",
                 k ? "," : "", c.name, c.x, c.y, c.z, c.r, c.seed, (int)c.fire);

    // toBlow 的**内容与顺序**（std::set 按 hashCode 升序遍历）
    std::fprintf(o, "\"toBlow\":[");
    int n = 0;
    for (TilePosSet::const_iterator it = e.toBlow.begin(); it != e.toBlow.end(); ++it, ++n)
      std::fprintf(o, "%s[%d,%d,%d]", n ? "," : "", it->x, it->y, it->z);
    std::fprintf(o, "],\"toBlowSize\":%d,", (int)e.toBlow.size());

    e.finalizeExplosion();
    std::fprintf(o, "\"after\":");
    dumpRegion(o, level, 0, F - 12, 0, 15, F, 15);
    std::fprintf(o, "}");
    delete level;
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
