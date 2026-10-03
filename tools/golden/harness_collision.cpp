// 黄金样本 G12-2：碰撞与运动轨迹。C++ 的真实 Level，但区块源是空世界（EmptyDimension），在 y = 115 处
// 搭一块测试场地，让掉落物实体（ItemEntity）逐 tick 运动，记录每 tick 的位置、速度与 onGround、horizontalCollision。
// TS 一侧用平坦世界、在同样高度摆同样的方块，局部几何相同。容差 1e-4（第二档）。
#include <cstdio>
#include "SharedConstants.h"
#include "world/level/material/Material.h"
#include "world/level/tile/Tile.h"
#include "world/item/Item.h"
#include "world/item/ItemInstance.h"
#include "world/entity/MobCategory.h"
#include "world/level/biome/Biome.h"
#include "world/level/tile/entity/TileEntity.h"
#include "world/level/Level.h"
#include "world/level/LevelSettings.h"
#include "world/level/storage/MemoryLevelStorage.h"
#include "world/entity/item/ItemEntity.h"
#include "world/level/dimension/Dimension.h"
#include "world/level/chunk/ChunkSource.h"
#include "world/level/chunk/LevelChunk.h"
#include "world/level/LevelConstants.h"
#include <cstring>
#include <map>

static const int F = 115; // 场地地面的 y

/** 空世界的区块源：每个区块都是空气（不生成地形，场地的几何完全由 buildArena 决定；TS 一侧同理） */
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

/** C++ 的 MemoryLevelStorage 没有实现纯虚的 loadPlayer、savePlayer（参考源码里也没有被实例化过），这里补上 */
struct GoldenStorage : public MemoryLevelStorage {
  bool loadPlayer(Player&) override { return false; }
  void savePlayer(Player&) override {}
};

static void buildArena(Level* level) {
  for (int x = 0; x < 16; x++)
    for (int z = 0; z < 16; z++) {
      for (int y = F; y < F + 12; y++) level->setTileNoUpdate(x, y, z, 0);
      level->setTileNoUpdate(x, F, z, Tile::rock->id);
    }
  for (int x = 0; x < 4; x++)
    for (int z = 8; z < 12; z++) level->setTileNoUpdate(x, F, z, Tile::ice->id);      // 冰面
  for (int z = 0; z < 16; z++) { level->setTileNoUpdate(10, F + 1, z, Tile::rock->id); level->setTileNoUpdate(10, F + 2, z, Tile::rock->id); } // 墙
  level->setTileAndDataNoUpdate(4, F + 1, 4, Tile::stoneSlabHalf->id, 0);            // 半砖
  level->setTileAndDataNoUpdate(7, F + 1, 3, Tile::stairs_wood->id, 0);              // 楼梯
  level->setTileNoUpdate(12, F + 1, 12, Tile::fence->id);                            // 栅栏
  for (int x = 2; x < 4; x++) for (int z = 2; z < 4; z++) level->setTileNoUpdate(x, F + 1, z, Tile::calmWater->id); // 水
  level->setTileNoUpdate(6, F + 1, 12, Tile::web->id);                               // 蜘蛛网
}

struct Case { const char* name; float x, y, z, xd, yd, zd; int ticks; };

int main(int argc, char** argv) {
  Material::initMaterials();
  MobCategory::initMobCategories();
  Tile::initTiles();
  Item::initItems();
  Biome::initBiomes();
  TileEntity::initTileEntities();
  LevelChunk::ChunkBlockCount = LevelConstants::CHUNK_BLOCK_COUNT; // 与 Minecraft::init（Minecraft.cpp:1166）相同
  Level* level = new Level(new GoldenStorage(), "golden", LevelSettings(12345, GameType::Creative), SharedConstants::GeneratorVersion, new EmptyDimension());
  buildArena(level);
  FILE* o = std::fopen(argv[1], "w");
  Case cases[] = {
    {"drop_on_slab", 4.5f, F + 8.0f, 4.5f, 0.0f, 0.0f, 0.0f, 80},
    {"slide_on_ice", 1.5f, F + 1.2f, 9.5f, 0.35f, 0.0f, 0.02f, 80},
    {"into_wall", 8.5f, F + 1.2f, 6.5f, 0.5f, 0.1f, 0.0f, 40},
    {"into_water", 2.5f, F + 6.0f, 2.5f, 0.0f, 0.0f, 0.0f, 80},
    {"onto_stairs", 7.5f, F + 6.0f, 3.5f, 0.05f, 0.0f, 0.0f, 60},
    {"onto_fence", 12.5f, F + 6.0f, 12.5f, 0.0f, 0.0f, 0.0f, 60},
    {"into_web", 6.5f, F + 4.0f, 12.5f, 0.0f, 0.0f, 0.0f, 60},
    {"diagonal_wall_corner", 9.2f, F + 1.5f, 1.0f, 0.4f, 0.3f, -0.4f, 40},
  };
  std::fprintf(o, "{\"floor\":%d,\"cases\":[", F);
  for (unsigned k = 0; k < sizeof(cases) / sizeof(cases[0]); k++) {
    const Case& c = cases[k];
    ItemEntity* e = new ItemEntity(level, c.x, c.y, c.z, ItemInstance(Tile::rock->id, 1, 0));
    e->xd = c.xd; e->yd = c.yd; e->zd = c.zd;
    std::fprintf(o, "%s{\"name\":\"%s\",\"start\":[%.9g,%.9g,%.9g,%.9g,%.9g,%.9g],\"ticks\":[", k ? "," : "", c.name, c.x, c.y, c.z, c.xd, c.yd, c.zd);
    for (int t = 0; t < c.ticks; t++) {
      e->tick();
      std::fprintf(o, "%s[%.9g,%.9g,%.9g,%.9g,%.9g,%.9g,%d,%d]", t ? "," : "", e->x, e->y, e->z, e->xd, e->yd, e->zd, (int)e->onGround, (int)e->horizontalCollision);
    }
    std::fprintf(o, "]}");
    delete e;
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
