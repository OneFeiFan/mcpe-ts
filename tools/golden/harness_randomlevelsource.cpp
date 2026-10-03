// 黄金样本 G15-1：普通维度的地形生成（参考源码 src/world/level/levelgen/RandomLevelSource.cpp）。
//
// 【为什么这个样本必须分段】`getChunk` 是一整块出来的：高度场 → 插值成方块 → 铺表层
// → 挖洞穴 → 挖峡谷。如果只记最终那 32768 个方块，**中间任何一步错了都只能看到"最后不一样"，
// 不知道错在哪**。所以这个 harness 要记四份快照，每份对应移植的一小步：
//
//     1. heights             getHeights 出来的高度场（float 场，2×17×2 = 68 个）
//     2. afterPrepareHeights prepareHeights 之后（石头/水/冰）
//     3. afterBuildSurfaces  buildSurfaces 之后（草/沙/沙岩/砾石/冰 + 基岩）
//     4. afterFeatures       洞穴 + 峡谷之后
//
// 五份快照：高度场 / prepareHeights 后 / buildSurfaces 后 / **洞穴后** / 洞穴+峡谷后。
// （洞穴单独一段是给 C-4 用的：拿最后的 afterFeatures 当判据会把峡谷一起算进去。）
//
// 另外还从**真的 `getChunk`** 取一份结果跟 `afterFeatures` 逐字节比 —— 这是 harness 自己的体检，
// 对不上说明上面那条"重放"路径没有忠实还原 getChunk，整份快照就不能当判据。
// **那份结果只写成一个布尔，不存进夹具**：自检成立时它按构造等于 `afterFeatures`，
// 存两份纯属重复（要占整个夹具的四分之一）。
//
// 【区块是扫出来的，不是随手挑的】地形在有些区域整片都在海平面以上，那样的区块里
// 水、冰、沙、砾石、沙岩一个都不会出现 —— 拿它当判据，C-3 把这几条分支全写错也测不出来。
// 所以用 `--scan N` 扫一片 N×N 的区块，看谁覆盖了哪些方块 id，再按覆盖面挑。
// 扫描用的是同一份重放代码（computeChunk），所以扫出来的结论和夹具是同一条路径。
//
// 【用真实的 Level，不做替身】曾经想给 Level 做个只有 getSeed/getBiomeSource 的替身，
// 后来发现没必要：`harness_collision.cpp` 那只用一个 `GoldenStorage : MemoryLevelStorage`
// 就能把真 Level 建起来（构造函数会自己 `dimension->init(this)` → `new BiomeSource(level)`）。
// 真 Level 的好处是**没有"替身是不是够忠实"这类风险**，`getBiomeSource()` 出来的
// temperatures / downfalls 就是真货。维度也不指定 fixedDimension，让 `DimensionFactory`
// 走真路拿到 `NormalDayCycleDimension`。
//
// 【怎么拿到 private 的 getHeights】`prepareHeights` / `buildSurfaces` 本来就是 public，
// 只有 `getHeights` 是 private。用 `#define private public` 把它撬开 —— **只影响这个编译单元，
// 参考源码一个字不改**。为了让这个宏不误伤别的库，先在前面把所有传递依赖 include 完，
// 这样轮到 RandomLevelSource.h 时它的 include 全是空操作，只有类体吃到宏。
//
// 【浮点一律按位记录】高度场是 float，直接用 memcpy 取 4 字节的位模式，不写十进制 ——
// 十进制会引入格式化误差，那就不是在比对了。
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <set>
#include <string>

#include "SharedConstants.h"
#include "util/Random.h"
#include "world/level/Level.h"
#include "world/level/LevelConstants.h"
#include "world/level/LevelSettings.h"
#include "world/level/storage/MemoryLevelStorage.h"
#include "world/level/dimension/Dimension.h"
#include "world/level/chunk/ChunkSource.h"
#include "world/level/chunk/LevelChunk.h"
#include "world/level/biome/Biome.h"
#include "world/level/biome/BiomeSource.h"
#include "world/level/levelgen/LargeCaveFeature.h"
#include "world/level/levelgen/CanyonFeature.h"
#include "world/level/tile/Tile.h"
#include "world/level/material/Material.h"
#include "world/item/Item.h"
#include "world/entity/MobCategory.h"

#define private public
#include "world/level/levelgen/RandomLevelSource.h"
#undef private

/** C++ 的 MemoryLevelStorage 没有实现纯虚的 loadPlayer、savePlayer（参考源码里也没有被实例化过），这里补上。
 *  与 harness_collision.cpp 用的是同一个做法。 */
struct GoldenStorage : public MemoryLevelStorage {
  bool loadPlayer(Player&) override { return false; }
  void savePlayer(Player&) override {}
};

/** 一个区块跑完全流程之后的五份结果（全是十六进制字符串，浮点按位） */
struct Stages {
  std::string heights;
  std::string afterPrepareHeights;
  std::string afterBuildSurfaces;
  std::string afterCaves;
  std::string afterFeatures;
  bool replayMatchesGetChunk;
};

static void jsonStr(FILE* o, const std::string& s) {
  std::fputc('"', o);
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') std::fprintf(o, "\\%c", c);
    else if (c < 0x20) std::fprintf(o, "\\u%04x", c);
    else std::fputc(c, o);
  }
  std::fputc('"', o);
}

/** 字节（含 float 的位模式）一律报十六进制 —— 逐字节可比，没有格式化误差 */
static std::string hexOf(const void* data, size_t n) {
  static const char* D = "0123456789abcdef";
  const unsigned char* p = (const unsigned char*)data;
  std::string out;
  out.reserve(n * 2);
  for (size_t i = 0; i < n; i++) {
    out.push_back(D[p[i] >> 4]);
    out.push_back(D[p[i] & 15]);
  }
  return out;
}

/**
 * 重放一遍 `getChunk` 里那几个阶段，每段结束 dump 一次。
 *
 * 【逐句对齐 getChunk（.cpp:540-567）】重放只有在与 getChunk 同序同参时才作数，
 * 所以这里每一步都按参考源码那一句写，包括 `getBiomeBlock` 必须排在读 temperatures 之前。
 *
 * 【为什么另起一个实例】`getChunk` 把区块塞进 `chunkMap` 缓存，第二次调同一个坐标会直接返回缓存。
 * 重放用一个新实例，保证每个阶段都是从零开始算的。
 */
static Stages computeChunk(Level* level, int version, int cx, int cz) {
  const int xChunks = 16 / LevelConstants::CHUNK_WIDTH; // = 1
  const int xSize = xChunks + 1;
  const int ySize = 128 / RandomLevelSource::CHUNK_HEIGHT + 1; // = 17
  const int zSize = xChunks + 1;

  // getChunk 传的是一块**没有初始化**的内存（LevelChunk 的构造函数不清零），这里先清零只是为了让
  // harness 自身确定 —— 不影响结果：prepareHeights 的三重循环把 16×16×128 每个下标都写了一遍
  // （xChunks=1 时 offs = x<<11 | z<<7 | y，正好铺满 0..32767，已逐句核过）。
  unsigned char* blocks = new unsigned char[LevelChunk::ChunkBlockCount];
  memset(blocks, 0, LevelChunk::ChunkBlockCount);

  RandomLevelSource src(level, level->getSeed(), version, /*spawnMobs=*/false);
  LevelChunk* lc = new LevelChunk(level, blocks, cx, cz);
  // 与 getChunk 里同一句：按区块坐标重置随机流
  src.random.setSeed((long)(cx * 341872712l + cz * 132899541l));

  Biome** biomes = level->getBiomeSource()->getBiomeBlock(cx * 16, cz * 16, 16, 16);
  float* temperatures = level->getBiomeSource()->temperatures;

  Stages st;

  // ---- 1) 高度场 ----
  // getHeights 不消耗 random（只调各噪声的 getRegion，噪声表是构造时建好的），
  // 所以这里多调一次不会打乱后面的随机流。这一点是重放能成立的前提。
  float* heights = new float[xSize * ySize * zSize];
  src.getHeights(heights, cx * xChunks, 0, cz * xChunks, xSize, ySize, zSize);
  st.heights = hexOf(heights, sizeof(float) * xSize * ySize * zSize);

  // ---- 2) prepareHeights（getChunk 里传的 biomes 参数就是 0）----
  src.prepareHeights(cx, cz, blocks, 0, temperatures);
  st.afterPrepareHeights = hexOf(blocks, LevelChunk::ChunkBlockCount);

  // ---- 3) buildSurfaces ----
  src.buildSurfaces(cx, cz, blocks, biomes);
  st.afterBuildSurfaces = hexOf(blocks, LevelChunk::ChunkBlockCount);

  // ---- 4) 洞穴 ----
  // 洞穴与峡谷分开记：C-4 只做洞穴，拿 afterFeatures 当判据的话会连带峡谷一起算进去。
  src.caveFeature.apply(&src, level, cx, cz, blocks, LevelChunk::ChunkBlockCount);
  st.afterCaves = hexOf(blocks, LevelChunk::ChunkBlockCount);

  // ---- 5) 峡谷 ----
  src.canyonFeature.apply(&src, level, cx, cz, blocks, LevelChunk::ChunkBlockCount);
  st.afterFeatures = hexOf(blocks, LevelChunk::ChunkBlockCount);

  // ---- 体检：真的 getChunk 应当与上面重放的结果一致 ----
  RandomLevelSource src2(level, level->getSeed(), version, false);
  LevelChunk* viaGetChunk = src2.getChunk(cx, cz);
  // `LevelChunk::blocks` 是 protected，走公开的 getBlockData()（同一个指针）
  // 真 getChunk 的结果**只用来做自检，不写进夹具**：自检成立时它按构造等于 afterFeatures，
  // 存两份纯属重复（占整个夹具的四分之一）。自检不成立的话这个夹具本来就不该用。
  const std::string fromGetChunk = hexOf(viaGetChunk->getBlockData(), LevelChunk::ChunkBlockCount);
  st.replayMatchesGetChunk = (st.afterFeatures == fromGetChunk);

  delete[] heights;
  delete lc;
  delete viaGetChunk;
  return st;
}

/** 把十六进制串里出现过的方块 id 收成集合 */
static std::set<int> idsIn(const std::string& hex) {
  std::set<int> ids;
  for (size_t i = 0; i + 1 < hex.size(); i += 2) {
    auto nib = [](char c) { return c <= '9' ? c - '0' : c - 'a' + 10; };
    ids.insert(nib(hex[i]) * 16 + nib(hex[i + 1]));
  }
  return ids;
}

static std::string idsToString(const std::set<int>& ids) {
  std::string s;
  char buf[16];
  for (int id : ids) {
    snprintf(buf, sizeof(buf), "%s%d", s.empty() ? "" : ",", id);
    s += buf;
  }
  return s;
}

/** 扫描模式：扫一片 n×n 的区块，只报覆盖面，不生成夹具。用来挑区块坐标。 */
static void scanChunks(Level* level, int version, int n) {
  std::set<int> allPrepare, allSurface, allFinal;
  for (int cz = 0; cz < n; cz++) {
    for (int cx = 0; cx < n; cx++) {
      Stages st = computeChunk(level, version, cx, cz);
      std::set<int> p = idsIn(st.afterPrepareHeights);
      std::set<int> s = idsIn(st.afterBuildSurfaces);
      std::set<int> f = idsIn(st.afterFeatures);
      allPrepare.insert(p.begin(), p.end());
      allSurface.insert(s.begin(), s.end());
      allFinal.insert(f.begin(), f.end());
      printf("(%2d,%2d) prepare=%-14s surface=%-20s final=%-20s replay=%s\n", cx, cz,
             idsToString(p).c_str(), idsToString(s).c_str(), idsToString(f).c_str(),
             st.replayMatchesGetChunk ? "ok" : "MISMATCH");
    }
  }
  printf("\n扫描 %d×%d 区块的合计覆盖面：\n", n, n);
  printf("  prepareHeights 后 : %s\n", idsToString(allPrepare).c_str());
  printf("  buildSurfaces 后  : %s\n", idsToString(allSurface).c_str());
  printf("  洞穴峡谷后        : %s\n", idsToString(allFinal).c_str());
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "用法：%s <输出 json>  |  %s --scan N\n", argv[0], argv[0]);
    return 1;
  }
  // 与 Minecraft::init 里那几句一样（Minecraft.cpp:1166 附近）
  Material::initMaterials();
  MobCategory::initMobCategories();
  Tile::initTiles();
  Item::initItems();
  Biome::initBiomes();
  LevelChunk::ChunkBlockCount = LevelConstants::CHUNK_BLOCK_COUNT;

  // 一个固定的种子。挑这个数没有讲究，只要**不是 0 也不是 1** ——
  // 那种"种子 0 时噪声退化成常数"的假通过会看不出来。
  const long SEED = 1234567890123L;
  const int VERSION = SharedConstants::GeneratorVersion;

  // fixedDimension 传 NULL → 走 DimensionFactory 的真路，拿到 NormalDayCycleDimension；
  // Level 的构造函数会自己调 dimension->init(this)，BiomeSource 就是在这里建出来的。
  Level* level = new Level(new GoldenStorage(), "golden", LevelSettings(SEED, GameType::Creative), VERSION, NULL);

  if (std::strcmp(argv[1], "--scan") == 0) {
    scanChunks(level, VERSION, argc > 2 ? atoi(argv[2]) : 8);
    return 0;
  }

  // 只看地形；spawnMobs 只影响 postProcess 里的刷怪（.cpp:507），而 postProcess 本轮不移植
  const bool SPAWN_MOBS = false;
  // ---- 区块坐标是挑出来的，不是随手写的。两个不同的理由 ----
  //
  // 【理由一：方块 id 的覆盖面】用 `--scan 24` 扫 576 个区块，按"每个阶段都要盖全"挑出前两个：
  //   (20, 0)  温带海岸：prepare={0,1,9} surface={+2,3,7,12,24} final={+10}
  //   (14,19)  寒带海岸：prepare={+79（冰）} surface={+3,7,12,24} final={+10}
  // 它们合起来把 10 个 id 全盖住。**别换回 (0,0)** —— 那是整片高地，prepare 只有 {0,1}，
  // 水/冰/沙/沙岩一条分支都盖不到。
  //
  // 【理由二：getHeights 里的分支覆盖面】上面两个区块的 `dr` 样本**全是负的**，
  // 于是 `else { if (depth > 1) depth = 1; depth = depth / 8; }` 那一段**一次都没走到** ——
  // 也就是说 `depth / 8` 就算被我写成 `depth * 8` 或漏了 fround，G15-1 也照样通过。
  // 第三个区块专门补这个：它的 dr 样本全是正的、而且都 > 8000，顺带把 `depth > 1` 那个 clamp 也打到。
  //   (C++ 那边 `depth = dr[pp] / 8000.0f`，所以 dr > 8000 就意味着 clamp 会触发。)
  //
  // 【理由三：buildSurfaces 里的分支覆盖面】审查又指出两条分支前三个区块一次都没走到，
  // 写错了也测不出来：
  //   砾石：`material = Tile::gravel` —— 夹具里一个砾石字节都没有过
  //   runDepth <= 0：它会把 top 清 0、material 换成石头，地表不再铺草土
  // 挑区块的办法：**直接跑一遍看输出**，别只看缓冲区阈值 ——
  // 一开始我按"gravelBuffer > 3 就一定出砾石"挑，结果挑中的 (-40,0) 一列砾石都没有：
  // 因为那段还套在 `y >= waterHeight-4 && y <= waterHeight+1` 的窗口里，
  // 陆地区块地表在水面之上，压根进不去那个窗口。**必要条件是阈值，充分条件还得看窗口。**
  //   (-37, 11)  输出里有 16 列砾石(13)
  //   (-40, 35)  71 列"水面之上顶着裸石(1)" —— runDepth<=0 把 top 清掉后的可见后果
  // 【注意 --scan 只能扫非负坐标】24×24 那轮一个砾石都没看到，是因为这些都在负坐标那一片。
  const int CHUNKS[][2] = {{20, 0}, {14, 19}, {-120, -113}, {-37, 11}, {-40, 35}};

  FILE* o = std::fopen(argv[1], "w");
  if (o == NULL) {
    std::fprintf(stderr, "打不开输出文件\n");
    return 1;
  }
  std::fprintf(o, "{\n  \"seed\": %ld,\n  \"generatorVersion\": %d,\n  \"spawnMobs\": %s,\n  \"chunkBlockCount\": %d,\n",
               level->getSeed(), VERSION, SPAWN_MOBS ? "true" : "false", LevelChunk::ChunkBlockCount);
  std::fprintf(o, "  \"chunks\": [");
  const int nChunks = (int)(sizeof(CHUNKS) / sizeof(CHUNKS[0]));
  for (int i = 0; i < nChunks; i++) {
    int cx = CHUNKS[i][0], cz = CHUNKS[i][1];
    Stages st = computeChunk(level, VERSION, cx, cz);
    if (i) std::fprintf(o, ",");
    std::fprintf(o, "\n    {\"x\": %d, \"z\": %d", cx, cz);
    std::fprintf(o, ", \"heights\": ");
    jsonStr(o, st.heights);
    std::fprintf(o, ", \"afterPrepareHeights\": ");
    jsonStr(o, st.afterPrepareHeights);
    std::fprintf(o, ", \"afterBuildSurfaces\": ");
    jsonStr(o, st.afterBuildSurfaces);
    std::fprintf(o, ", \"afterCaves\": ");
    jsonStr(o, st.afterCaves);
    std::fprintf(o, ", \"afterFeatures\": ");
    jsonStr(o, st.afterFeatures);
    std::fprintf(o, ", \"replayMatchesGetChunk\": %s}", st.replayMatchesGetChunk ? "true" : "false");
  }
  std::fprintf(o, "\n  ]\n}\n");
  std::fclose(o);
  return 0;
}
