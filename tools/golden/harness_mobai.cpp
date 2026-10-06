// 黄金样本 G16-2（任务单 H3）：旧 AI（PathfinderMob::updateAi）——三只鸡在场地里自由活动 400 刻，逐刻记录状态。
// 随机数：Mth::random 由本文件给出的强定义替换（链接前用 objcopy 把 util_Mth.o 里的两个 Mth::random 变成弱符号），
// 用一个可设种子的 Random；每只鸡的 random.setSeed(固定值)，构造函数里用随机数初始化的字段（ambientSoundTime、eggTime、rotA、timeOffs）
// 构造之后全部改成固定值。TS 一侧做同样的事（_mthRand.setSeed、实体 random.setSeed、同样的字段值）。
#include <cstdio>
#include <string>
#include <vector>
#include <sstream>
#include <map>
#include <set>
#include <list>
#include <algorithm>
#include <memory>
#include <cmath>
#include <climits>
#include <functional>
#define private public
#define protected public
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
#include "util/Random.h"
#include "network/Packet.h"
#include "network/RakNetInstance.h"
#include "util/Mth.h"
#undef private
#undef protected
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


static Random g_mthRand(0);

// Mob::tick 在服务器端会构造并发送 MoveEntityPacket / SetEntityMotionPacket（不影响生物自身的状态）。
// 网络库不链接：这里给出 Packet 的构造函数（照 Packet.cpp:8），发送用 IRakNetInstance 的默认空实现。
Packet::Packet() : priority(HIGH_PRIORITY), reliability(RELIABLE) {}
namespace Mth {
  float random() { return g_mthRand.nextFloat(); }
  int random(int n) { return g_mthRand.nextInt(n); }
}

static void buildArena(Level* L) {
  for (int x = -2; x < 26; x++)
    for (int z = -2; z < 26; z++) {
      for (int y = F - 3; y < F + 8; y++) L->setTileNoUpdate(x, y, z, 0);
      L->setTileNoUpdate(x, F, z, Tile::grass->id);
      L->setTileNoUpdate(x, F - 1, z, Tile::dirt->id);
      L->setTileNoUpdate(x, F - 2, z, Tile::rock->id);
    }
  // 围栏圈住场地（鸡飞不出去），中间一堵石墙和一级台阶
  for (int i = -2; i < 26; i++) {
    L->setTileNoUpdate(i, F + 1, -2, Tile::fence->id); L->setTileNoUpdate(i, F + 1, 25, Tile::fence->id);
    L->setTileNoUpdate(-2, F + 1, i, Tile::fence->id); L->setTileNoUpdate(25, F + 1, i, Tile::fence->id);
  }
  for (int z = 4; z < 18; z++) L->setTileNoUpdate(12, F + 1, z, Tile::rock->id);
  L->setTileNoUpdate(6, F + 1, 6, Tile::rock->id);
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
  level->raknetInstance = new IRakNetInstance();
  const int N = 3;
  float pos[N][3] = {{4.5f, F + 1.0f, 4.5f}, {18.5f, F + 1.0f, 8.5f}, {8.5f, F + 1.0f, 20.5f}};
  Chicken* mobs[N];
  for (int i = 0; i < N; i++) {
    mobs[i] = new Chicken(level);
    mobs[i]->moveTo(pos[i][0], pos[i][1], pos[i][2], 90.0f * i, 0);
    mobs[i]->random.setSeed(1000 + i);
    mobs[i]->ambientSoundTime = -40;
    mobs[i]->eggTime = 6000;
    mobs[i]->rotA = 0.015f;
    mobs[i]->timeOffs = 100.0f * i;
    // 不 addEntity：Level::addEntity 会构造网络包（Packet）；单只生物的 tick 不需要它在实体表里
  }
  g_mthRand.setSeed(4242);
  FILE* o = std::fopen(argv[1], "w");
  std::fprintf(o, "{\"floor\":%d,\"mobs\":[", F);
  const int T = 400;
  std::vector<std::string> rows[N];
  for (int t = 0; t < T; t++) {
    for (int i = 0; i < N; i++) {
      Chicken* m = mobs[i];
      m->tick();
      char buf[256];
      std::snprintf(buf, sizeof buf, "[%.9g,%.9g,%.9g,%.9g,%d,%d]", m->x, m->y, m->z, m->yRot, (int)m->onGround, (int)m->isPathFinding());
      rows[i].push_back(buf);
    }
  }
  for (int i = 0; i < N; i++) {
    std::fprintf(o, "%s{\"start\":[%.9g,%.9g,%.9g,%.9g],\"seed\":%d,\"ticks\":[", i ? "," : "", pos[i][0], pos[i][1], pos[i][2], 90.0f * i, 1000 + i);
    for (int t = 0; t < T; t++) std::fprintf(o, "%s%s", t ? "," : "", rows[i][t].c_str());
    std::fprintf(o, "]}");
  }
  std::fprintf(o, "],\"mthSeed\":4242}\n");
  std::fclose(o);
  return 0;
}
