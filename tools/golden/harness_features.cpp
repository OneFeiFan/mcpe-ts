// 黄金样本 G17-1（地物生成）：RandomLevelSource::postProcess 的结果。
// 用真实的 Level（普通维度，同 harness_randomlevelsource.cpp 的建法），按固定顺序取一片区块：
// ChunkCache::getChunk 在邻居齐了之后自己调 postProcess（湖、黏土、矿、树、花、草、甘蔗、仙人掌、泉、雪）。
// 输出中心 3×3 个区块的方块与数据：每个区块一个 FNV-1a 哈希 + 方块 id 直方图（对不上时看差在哪种方块）。
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>

#include "SharedConstants.h"
#include "world/level/Level.h"
#include "world/level/LevelConstants.h"
#include "world/level/LevelSettings.h"
#include "world/level/storage/MemoryLevelStorage.h"
#include "world/level/chunk/LevelChunk.h"
#include "world/level/biome/Biome.h"
#include "world/level/tile/Tile.h"
#include "world/level/tile/entity/TileEntity.h"
#include "world/level/material/Material.h"
#include "world/item/Item.h"
#include "world/entity/MobCategory.h"
#include "util/Mth.h"

struct GoldenStorage : public MemoryLevelStorage {
  bool loadPlayer(Player&) override { return false; }
  void savePlayer(Player&) override {}
};

static unsigned int fnv(unsigned int h, unsigned char b) { return (h ^ b) * 16777619u; }

int main(int argc, char** argv) {
  // 游戏里 NinecraftApp::init 第一行就是 Mth::initMth()（sin/cos 查表）。不调用时表全是 0，OreFeature 的 Mth::sin 恒为 0——那不是真实游戏
  Mth::initMth();
  Material::initMaterials();
  MobCategory::initMobCategories();
  Tile::initTiles();
  Item::initItems();
  Biome::initBiomes();
  TileEntity::initTileEntities();
  LevelChunk::ChunkBlockCount = LevelConstants::CHUNK_BLOCK_COUNT;
  const long SEED = 1234567890123L;
  Level* level = new Level(new GoldenStorage(), "golden", LevelSettings(SEED, GameType::Creative), SharedConstants::GeneratorVersion, NULL);
  // 固定的取区块顺序：x、z 从 3 到 9（含），邻居齐了的区块由 ChunkCache 自动 postProcess
  for (int cz = 3; cz <= 9; cz++)
    for (int cx = 3; cx <= 9; cx++) level->getChunk(cx, cz);
  FILE* o = std::fopen(argv[1], "w");
  std::fprintf(o, "{\"seed\":%ld,\"order\":[3,9],\"chunks\":[", SEED);
  bool first = true;
  for (int cz = 4; cz <= 8; cz++)
    for (int cx = 4; cx <= 8; cx++) {
      if (cx < 5 || cx > 7 || cz < 5 || cz > 7) continue;
      unsigned int h = 2166136261u;
      std::map<int, int> hist;
      for (int x = 0; x < 16; x++)
        for (int z = 0; z < 16; z++)
          for (int y = 0; y < 128; y++) {
            int wx = cx * 16 + x, wz = cz * 16 + z;
            int t = level->getTile(wx, y, wz);
            int d = level->getData(wx, y, wz);
            h = fnv(h, (unsigned char)t);
            h = fnv(h, (unsigned char)d);
            hist[t]++;
          }
      std::fprintf(o, "%s{\"x\":%d,\"z\":%d,\"hash\":%u,\"hist\":{", first ? "" : ",", cx, cz, h);
      bool f2 = true;
      for (auto& kv : hist) { std::fprintf(o, "%s\"%d\":%d", f2 ? "" : ",", kv.first, kv.second); f2 = false; }
      std::fprintf(o, "}}");
      first = false;
    }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
