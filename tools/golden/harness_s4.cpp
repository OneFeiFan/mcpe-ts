// 黄金样本（S4）：输出 fixtures/golden/s4.json
//  - biome：Biome::_getBiome / getBiome / recalc 的选择结果。三个函数的代码照 Biome.cpp 原样复制（Biome.cpp 依赖方块与地物，
//    整体编译太重），只把返回值换成群系序号；要验证的是 float 语义（参数、乘法、与 float 常量比较）。
//  - dimension：Dimension::updateLightRamp 与 NormalDayCycleDimension::getTimeOfDay 的原样代码（float 语义、C 库 cos）。
//  - chunkRandom：LevelChunk::getRandom 的表达式照原样复制（C++ 的 int 回绕与 long 运算），再用参考 Random 取前 3 个 nextInt()。
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include "util/Random.h"
int getTimeMs() { return 0; }

enum { rainForest, swampland, seasonalForest, forest, savanna, shrubland, taiga, desert, plains, iceDesert, tundra };

static int _getBiome(float temperature, float downfall) {  // Biome.cpp 原样
  downfall *= (temperature);
  if (temperature < 0.10f) {
    return tundra;
  } else if (downfall < 0.20f) {
    if (temperature < 0.50f) {
      return tundra;
    } else if (temperature < 0.95f) {
      return savanna;
    } else {
      return desert;
    }
  } else if (downfall > 0.5f && temperature < 0.7f) {
    return swampland;
  } else if (temperature < 0.50f) {
    return taiga;
  } else if (temperature < 0.97f) {
    if (downfall < 0.35f) {
      return shrubland;
    } else {
      return forest;
    }
  } else {
    if (downfall < 0.45f) {
      return plains;
    } else if (downfall < 0.90f) {
      return seasonalForest;
    } else {
      return rainForest;
    }
  }
}
static int biomeMap[64 * 64];
static void recalc() {  // Biome.cpp 原样（去掉沙子那两行）
  for (int a = 0; a < 64; a++)
    for (int b = 0; b < 64; b++)
      biomeMap[a + b * 64] = _getBiome(a / 63.0f, b / 63.0f);
}
static int getBiome(float temperature, float downfall) {  // Biome.cpp 原样
  int a = (int) (temperature * 63);
  int b = (int) (downfall * 63);
  return biomeMap[a + b * 64];
}
static uint32_t fb(float f) { uint32_t u; std::memcpy(&u, &f, 4); return u; }

int main(int argc, char** argv) {
  FILE* o = std::fopen(argv[1], "w");
  recalc();
  std::fprintf(o, "{\"map\":[");
  for (int i = 0; i < 64 * 64; i++) std::fprintf(o, "%s%d", i ? "," : "", biomeMap[i]);
  // 边界取样：每个比较常量本身、以及它上下相邻的 float
  const float cs[] = {0.10f, 0.20f, 0.50f, 0.95f, 0.5f, 0.7f, 0.97f, 0.35f, 0.45f, 0.90f};
  std::fprintf(o, "],\"edges\":[");
  int n = 0;
  for (float t : cs) for (float d : cs) for (int dt = -1; dt <= 1; dt++) for (int dd = -1; dd <= 1; dd++) {
    float tt = dt < 0 ? std::nextafterf(t, 0) : dt > 0 ? std::nextafterf(t, 1) : t;
    float d0 = d / (tt > 0 ? tt : 1);  // 让 downfall*temperature 落在常量附近
    float ddv = dd < 0 ? std::nextafterf(d0, 0) : dd > 0 ? std::nextafterf(d0, 2) : d0;
    std::fprintf(o, "%s[%u,%u,%d]", n++ ? "," : "", fb(tt), fb(ddv), _getBiome(tt, ddv));
  }
  Random r(20260926);
  std::fprintf(o, "],\"random\":[");
  for (int i = 0; i < 3000; i++) {
    float t = r.nextFloat(), d = r.nextFloat();
    std::fprintf(o, "%s[%u,%u,%d,%d]", i ? "," : "", fb(t), fb(d), _getBiome(t, d), getBiome(t, d));
  }
  // LevelChunk::getRandom：(level->getSeed() + x * x * 4987142 + x * 5947611 + z * z * 4392871l + z * 389711) ^ l
  std::fprintf(o, "],\"chunkRandom\":[");
  const long seeds[] = {0, 1, -1, 123456789, 2147483647L, -2147483647L - 1, 987654321987L};
  const int xs[] = {0, 7, 8, 9, 15, -3, 1000, 46341, -46341};
  const long ls[] = {0, 1, 987234911L, -1};
  n = 0;
  for (long seed : seeds) for (int x : xs) for (int z : xs) for (long l : ls) {
    Random rr((seed + x * x * 4987142 + x * 5947611 + z * z * 4392871l + z * 389711) ^ l);
    int a = rr.nextInt(), b = rr.nextInt(), c = rr.nextInt();
    std::fprintf(o, "%s[\"%ld\",%d,%d,\"%ld\",%d,%d,%d]", n++ ? "," : "", seed, x, z, l, a, b, c);
  }
  // Dimension::updateLightRamp（Dimension.cpp 原样）
  std::fprintf(o, "],\"brightnessRamp\":[");
  {
    float brightnessRamp[16];
    float ambientLight = 0.05f;
    for (int i = 0; i <= 15; i++) {
      float v = (1 - i / (float) (16));
      brightnessRamp[i] = ((1 - v) / (v * 3 + 1)) * (1 - ambientLight) + ambientLight * 3;
    }
    for (int i = 0; i < 16; i++) std::fprintf(o, "%s%u", i ? "," : "", fb(brightnessRamp[i]));
  }
  // NormalDayCycleDimension::getTimeOfDay（NormalDayCycleDimension.h 原样；Mth::PI 是 float 常量，cos 是 C 库函数）
  std::fprintf(o, "],\"timeOfDay\":[");
  {
    const float PI = 3.1415926535897932384626433832795028841971f;
    const int TICKS_PER_DAY = 20 * 60 * 16;
    auto getTimeOfDay = [&](long time, float a) -> float {
      int dayStep = (int) (time % TICKS_PER_DAY);
      float td = (dayStep + a) / TICKS_PER_DAY - 0.25f;
      if (td < 0) td += 1;
      if (td > 1) td -= 1;
      float tdo = td;
      td = 1 - (cos(td * PI) + 1) * 0.5f;
      return tdo + (td - tdo) / 3.0f;
    };
    const long times[] = {0, 1, 2400, 4800, 7200, 9600, 12000, 14400, 16800, 19199, 19200, 123456, 987654321L};
    const float as[] = {0.0f, 0.25f, 0.5f, 0.999f};
    int k = 0;
    for (long t : times) for (float a : as) std::fprintf(o, "%s[%ld,%u,%u]", k++ ? "," : "", t, fb(a), fb(getTimeOfDay(t, a)));
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
}
