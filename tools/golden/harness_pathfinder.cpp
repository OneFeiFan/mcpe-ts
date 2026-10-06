// 黄金样本 G16-1（任务单 H2）：寻路。C++ 的真实 Level（空世界区块源，照 harness_collision.cpp），在 y = 100 搭场地，
// 用一只鸡当寻路主体，对一组目标调用 Level::findPath（两个重载），输出每条路径的节点序列。
// 场地：石头地面；x = 10 一堵两格高的墙（z = 5 处留缺口，z = 12 处是关着的木门）；(14, F+1, 3) 一级台阶；
// x = 14、z = 10..12 一段栅栏；(4..6, 16..18) 一池水；(18..19, 18..19) 两格深的坑；(20, 4) 一格岩浆。
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
#include "world/entity/animal/Chicken.h"
#include "world/level/pathfinder/Path.h"
#include "world/level/pathfinder/Node.h"
#include "world/level/dimension/Dimension.h"
#include "world/level/chunk/ChunkSource.h"
#include "world/level/chunk/LevelChunk.h"
#include "world/level/LevelConstants.h"
#include <cstring>
#include <map>

static const int F = 100; // 场地地面的 y（TS 一侧用平坦世界，地表在 63，这里远高于它）

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

static void buildArena(Level* L) {
  for (int x = -2; x < 26; x++)
    for (int z = -2; z < 26; z++) {
      for (int y = F - 3; y < F + 8; y++) L->setTileNoUpdate(x, y, z, 0);
      L->setTileNoUpdate(x, F, z, Tile::rock->id);
      L->setTileNoUpdate(x, F - 1, z, Tile::rock->id);
      L->setTileNoUpdate(x, F - 2, z, Tile::rock->id);
    }
  for (int z = 0; z < 16; z++) {
    if (z == 5 || z == 12) continue;
    L->setTileNoUpdate(10, F + 1, z, Tile::rock->id);
    L->setTileNoUpdate(10, F + 2, z, Tile::rock->id);
  }
  L->setTileAndDataNoUpdate(10, F + 1, 12, Tile::door_wood->id, 0);
  L->setTileAndDataNoUpdate(10, F + 2, 12, Tile::door_wood->id, 8);
  L->setTileNoUpdate(14, F + 1, 3, Tile::rock->id);
  for (int z = 10; z <= 12; z++) L->setTileNoUpdate(14, F + 1, z, Tile::fence->id);
  for (int x = 4; x <= 6; x++) for (int z = 16; z <= 18; z++) L->setTileNoUpdate(x, F, z, Tile::calmWater->id);
  for (int x = 18; x <= 19; x++) for (int z = 18; z <= 19; z++) { L->setTileNoUpdate(x, F, z, 0); L->setTileNoUpdate(x, F - 1, z, 0); }
  L->setTileNoUpdate(20, F, 4, Tile::lava->id);
}

struct Case { const char* name; float sx, sy, sz; int tx, ty, tz; float maxDist; bool doors, water; bool toEntity; };

static void dumpPath(FILE* o, const char* name, bool ok, Path& p) {
  std::fprintf(o, "{\"name\":\"%s\",\"ok\":%s,\"size\":%d,\"nodes\":[", name, ok ? "true" : "false", p.getSize());
  for (int i = 0; i < p.getSize(); i++) {
    Node* n = p.get(i);
    std::fprintf(o, "%s[%d,%d,%d]", i ? "," : "", n->x, n->y, n->z);
  }
  std::fprintf(o, "]}");
}

int main(int argc, char** argv) {
  Material::initMaterials();
  MobCategory::initMobCategories();
  Tile::initTiles();
  Item::initItems();
  Biome::initBiomes();
  TileEntity::initTileEntities();
  LevelChunk::ChunkBlockCount = LevelConstants::CHUNK_BLOCK_COUNT;
  Level* level = new Level(new GoldenStorage(), "golden", LevelSettings(12345, GameType::Creative), SharedConstants::GeneratorVersion, new EmptyDimension());
  buildArena(level);
  Case cases[] = {
    {"open_ground", 2.5f, F + 1.0f, 2.5f, 7, F + 1, 7, 16, false, false, false},
    {"through_gap", 2.5f, F + 1.0f, 2.5f, 18, F + 1, 5, 24, false, false, false},
    {"closed_door_blocked", 8.5f, F + 1.0f, 12.5f, 13, F + 1, 12, 16, false, false, false},
    {"door_can_open", 8.5f, F + 1.0f, 12.5f, 13, F + 1, 12, 16, true, false, false},
    {"onto_step", 12.5f, F + 1.0f, 3.5f, 14, F + 2, 3, 16, false, false, false},
    {"around_fence", 12.5f, F + 1.0f, 11.5f, 16, F + 1, 11, 16, false, false, false},
    {"into_water", 2.5f, F + 1.0f, 14.5f, 5, F + 1, 17, 16, false, false, false},
    {"avoid_water", 2.5f, F + 1.0f, 14.5f, 8, F + 1, 20, 16, false, true, false},
    {"into_pit", 16.5f, F + 1.0f, 18.5f, 18, F - 1, 18, 16, false, false, false},
    {"near_lava", 18.5f, F + 1.0f, 2.5f, 22, F + 1, 6, 16, false, false, false},
    {"too_far", 2.5f, F + 1.0f, 2.5f, 22, F + 1, 22, 8, false, false, false},
    {"to_entity", 2.5f, F + 1.0f, 20.5f, 16, F + 1, 20, 24, false, false, true},
  };
  FILE* o = std::fopen(argv[1], "w");
  std::fprintf(o, "{\"floor\":%d,\"cases\":[", F);
  for (unsigned k = 0; k < sizeof(cases) / sizeof(cases[0]); k++) {
    const Case& c = cases[k];
    Chicken* mob = new Chicken(level);
    mob->moveTo(c.sx, c.sy, c.sz, 0, 0);
    Path path;
    bool ok;
    if (c.toEntity) {
      Chicken* target = new Chicken(level);
      target->moveTo(c.tx + 0.5f, (float)c.ty, c.tz + 0.5f, 0, 0);
      ok = level->findPath(&path, mob, target, c.maxDist, c.doors, c.water);
      delete target;
    } else {
      ok = level->findPath(&path, mob, c.tx, c.ty, c.tz, c.maxDist, c.doors, c.water);
    }
    if (k) std::fprintf(o, ",");
    dumpPath(o, c.name, ok, path);
    delete mob;
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
