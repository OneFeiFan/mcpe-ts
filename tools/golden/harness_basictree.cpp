// 黄金样本 G17-2（大树 BasicTree）：在 G17-1 同样生成的世界上，用固定种子放几棵 BasicTree，输出每棵的返回值与周围方块的哈希。
// BasicTree 在这一版里没有任何调用点（Biome / Sapling 里 new BasicTree 的语句都被注释掉了），这里直接调用它。
// （以下沿用 G17-1 的说明）RandomLevelSource::postProcess 的结果。
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
#include "util/Random.h"
#define private public
#include "world/level/levelgen/feature/BasicTree.h"
#undef private

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
  std::fprintf(o, "{\"seed\":%ld,\"order\":[3,9],\"trees\":[", SEED);
  const int spots[][3] = {{88, 0, 88}, {100, 0, 96}, {112, 0, 84}, {92, 0, 110}, {120, 0, 120}, {104, 0, 104}};
  for (int k = 0; k < 6; k++) {
    int x = spots[k][0], z = spots[k][2];
    int y = level->getHeightmap(x, z);
    BasicTree tree(false);
    tree.init(k % 2 ? 1.0f : 0.6f, 1.0f, k % 3 == 0 ? 1.5f : 1.0f);
    Random r(1000 + k);
    bool ok = tree.place(level, &r, x, y, z);
    unsigned int h = 2166136261u;
    int logs = 0, leaves = 0;
    for (int xx = x - 12; xx <= x + 12; xx++)
      for (int zz = z - 12; zz <= z + 12; zz++)
        for (int yy = 0; yy < 128; yy++) {
          int t = level->getTile(xx, yy, zz), d = level->getData(xx, yy, zz);
          h = fnv(h, (unsigned char)t);
          h = fnv(h, (unsigned char)d);
          if (t == Tile::treeTrunk->id) logs++;
          if (t == Tile::leaves->id) leaves++;
        }
    std::fprintf(o, "%s{\"x\":%d,\"y\":%d,\"z\":%d,\"ok\":%s,\"hash\":%u,\"logs\":%d,\"leaves\":%d}", k ? "," : "", x, y, z, ok ? "true" : "false", h, logs, leaves);
  }
  // treeShape 逐个高度、逐个 y 的值（float 位模式）：abs 用哪个重载在这里能分辨出来（奇数高度时 adjacent 带 .5）
  std::fprintf(o, "],\"shape\":[");
  bool firstS = true;
  for (int hgt = 5; hgt <= 20; hgt++) {
    BasicTree bt(false);
    bt.height = hgt;
    for (int yy = 0; yy <= hgt; yy++) {
      float v = bt.treeShape(yy);
      unsigned int bits; std::memcpy(&bits, &v, 4);
      std::fprintf(o, "%s[%d,%d,%u]", firstS ? "" : ",", hgt, yy, bits);
      firstS = false;
    }
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
