// 黄金样本：参考源码 world/level/biome/BiomeSource.cpp，输出 fixtures/golden/biomesource.json
// 用替身 Level（只有 getSeed）、替身 Biome（getBiome 返回 NULL）、替身 ChunkPos（只有 x、z）编译 BiomeSource.cpp；
// 核对的是温度、降水数组（群系选择 Biome::getBiome 已由 s4.json 单独核对）。构建方法见 build.sh。
#include <cstdio>
#include <cstdint>
#include <cstring>
#include "world/level/biome/BiomeSource.h"
#include "world/level/biome/Biome.h"
#include "world/level/Level.h"
int getTimeMs() { return 0; }
Biome* Biome::getBiome(float, float) { return nullptr; }

static uint32_t fb(float f) { uint32_t u; std::memcpy(&u, &f, 4); return u; }
static FILE* o;
static void arr(const char* name, const float* v, int n) {
  std::fprintf(o, ",\"%s\":[", name);
  for (int i = 0; i < n; i++) std::fprintf(o, "%s%u", i ? "," : "", fb(v[i]));
  std::fprintf(o, "]");
}

int main(int argc, char** argv) {
  o = std::fopen(argv[1], "w");
  const long seeds[] = {0, 12345, -98765, 987654321987L};
  std::fprintf(o, "[");
  for (int s = 0; s < 4; s++) {
    Level level; level.seed = seeds[s];
    BiomeSource bs(&level);
    std::fprintf(o, "%s{\"seed\":\"%ld\"", s ? "," : "", seeds[s]);
    bs.getBiomeBlock(7 * 16, 7 * 16, 16, 16);          // demo 平台所在区块；第一次就是 16×16
    arr("blockA_t", bs.temperatures, 256); arr("blockA_d", bs.downfalls, 256);
    bs.getBiomeBlock(-37, 1000, 16, 16);
    arr("blockB_t", bs.temperatures, 256); arr("blockB_d", bs.downfalls, 256);
    float t = bs.getTemperature(100, -50);             // Level::getSkyColor 每帧调用的那个
    arr("rawTemp", &t, 1);
    float* tb = bs.getTemperatureBlock(NULL, 0, 0, 16, 16);
    arr("tempBlock", tb, 256);
    float* db = bs.getDownfallBlock(NULL, 5, 5, 16, 16);
    arr("downBlock", db, 256);
    std::fprintf(o, "}");
  }
  std::fprintf(o, "]\n");
  std::fclose(o);
}
