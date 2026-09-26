// 黄金样本：参考源码 levelgen/synth（ImprovedNoise、PerlinNoise、Synth），输出 fixtures/golden/synth.json
// 输入、输出一律按 float 的位模式记录。
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cmath>
#include "util/Random.h"
#include "world/level/levelgen/synth/ImprovedNoise.h"
#include "world/level/levelgen/synth/PerlinNoise.h"
int getTimeMs() { return 0; }

static uint32_t fb(float f) { uint32_t u; std::memcpy(&u, &f, 4); return u; }
static FILE* o;
static void arr(const char* name, const float* v, int n, bool first = false) {
  std::fprintf(o, "%s\"%s\":[", first ? "" : ",", name);
  for (int i = 0; i < n; i++) std::fprintf(o, "%s%u", i ? "," : "", fb(v[i]));
  std::fprintf(o, "]");
}

int main(int argc, char** argv) {
  o = std::fopen(argv[1], "w");
  std::fprintf(o, "{");
  // 1. ImprovedNoise(Random(12345))：置换表、偏移、hashCode、noise
  {
    Random r(12345);
    ImprovedNoise n(&r);
    float off[3] = {n.xo, n.yo, n.zo};
    arr("improvedOffsets", off, 3, true);
    std::fprintf(o, ",\"improvedHash\":%d", n.hashCode());
    // 取样点：随机点 + 边界点（整数、半整数、负数、正好让 x + xo 跨过整数、很大的值、超出 int 的值、-0）
    Random pr(777);
    std::fprintf(o, ",\"noise\":[");
    int k = 0;
    auto emit = [&](float x, float y, float z) { std::fprintf(o, "%s[%u,%u,%u,%u]", k++ ? "," : "", fb(x), fb(y), fb(z), fb(n.noise(x, y, z))); };
    for (int i = 0; i < 300; i++) { float x = (pr.nextFloat() * 2 - 1) * 2000, y = (pr.nextFloat() * 2 - 1) * 200, z = (pr.nextFloat() * 2 - 1) * 2000; emit(x, y, z); }
    const float sp[] = {0.0f, -0.0f, 1.0f, -1.0f, 0.5f, -0.5f, 255.0f, 256.0f, -256.0f, 1e6f, -1e6f, 3e7f, -3e7f, 1e10f, -1e10f, 12.75f, -12.75f};
    for (float a : sp) for (float b : {0.0f, -3.25f, 7.5f}) emit(a, b, a * 0.5f);
    const float cross[] = {std::floor(n.xo) + 1.0f - n.xo, std::nextafterf(std::floor(n.xo) + 1.0f - n.xo, 0.0f)};
    for (float c : cross) emit(c, c, c);
    std::fprintf(o, "],\"noise2d\":[");
    k = 0;
    for (int i = 0; i < 50; i++) { float x = (pr.nextFloat() * 2 - 1) * 500, y = (pr.nextFloat() * 2 - 1) * 500; std::fprintf(o, "%s[%u,%u,%u]", k++ ? "," : "", fb(x), fb(y), fb(n.getValue(x, y))); }
    std::fprintf(o, "]");
  }
  // 2. 默认构造（内部 Random(1)）
  {
    ImprovedNoise n;
    float v[4] = {n.xo, n.yo, n.zo, n.noise(1.5f, -2.25f, 3.125f)};
    arr("improvedDefault", v, 4);
    std::fprintf(o, ",\"improvedDefaultHash\":%d", n.hashCode());
  }
  // 3. PerlinNoise(Random(42), 4)：二维、三维取值与 hashCode（BiomeSource 的温度噪声就是 4 层）
  {
    Random r(42);
    PerlinNoise pn(&r, 4);
    Random pr(99);
    std::fprintf(o, ",\"perlin2d\":[");
    for (int i = 0; i < 100; i++) { float x = (pr.nextFloat() * 2 - 1) * 400 * 0.025f, y = (pr.nextFloat() * 2 - 1) * 400 * 0.025f; std::fprintf(o, "%s[%u,%u,%u]", i ? "," : "", fb(x), fb(y), fb(pn.getValue(x, y))); }
    std::fprintf(o, "],\"perlin3d\":[");
    for (int i = 0; i < 100; i++) { float x = (pr.nextFloat() * 2 - 1) * 300, y = pr.nextFloat() * 128, z = (pr.nextFloat() * 2 - 1) * 300; std::fprintf(o, "%s[%u,%u,%u,%u]", i ? "," : "", fb(x), fb(y), fb(z), fb(pn.getValue(x, y, z))); }
    std::fprintf(o, "],\"perlinHash\":%d", pn.hashCode());
  }
  // 4. PerlinNoise(Random(9001), 16).getRegion 三维（RandomLevelSource 主噪声的典型参数）
  {
    Random r(9001);
    PerlinNoise pn(&r, 16);
    float* a = pn.getRegion(NULL, 16.0f, 0.0f, -32.0f, 5, 17, 5, 684.412f, 684.412f, 684.412f);
    arr("region3dA", a, 5 * 17 * 5);
    float* b = pn.getRegion(NULL, -48.0f, 0.0f, 80.0f, 5, 17, 5, 684.412f / 80, 684.412f / 160, 684.412f / 80);
    arr("region3dB", b, 5 * 17 * 5);
    delete[] a; delete[] b;
  }
  // 5. PerlinNoise(Random(4), 8).getRegion 二维重载（走 ySize == 1 的分支，用到 grad2）
  {
    Random r(4);
    PerlinNoise pn(&r, 8);
    float* a = pn.getRegion(NULL, 128, -64, 16, 16, 0.025f, 0.025f, 0.25f);
    arr("region2dA", a, 256);
    float* b = pn.getRegion(NULL, -7, 3, 5, 5, 1.121f, 1.121f, 0.5f);
    arr("region2dB", b, 25);
    delete[] a; delete[] b;
  }
  // 6. Synth::create 与 getDataSize
  {
    Random r(5);
    PerlinNoise pn(&r, 2);
    float res[12];
    pn.create(4, 3, res);
    arr("synthCreate", res, 12);
    std::fprintf(o, ",\"dataSize\":%d", pn.getDataSize(4, 3));
  }
  std::fprintf(o, "}\n");
  std::fclose(o);
}
