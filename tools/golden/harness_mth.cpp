// 黄金样本：参考源码 util/Mth.cpp。输出
//   fixtures/golden/mth_sin_table.f32   —— 65536 个 float（小端），即 Mth::sin 查表的全部取值
//   fixtures/golden/mth.json            —— 常量、各函数的取样（输入与输出都以 float 位或 int 记录）、亮度表
// 注意：越界 float→int 在 C++ 里是 UB；x86-64 上结果是 INT_MIN（取样里的 700000 就是这种情况）。
// 不取会产生 NaN 的输入：NaN 的位模式因平台而异，JS 也会把它规范化。
#include <cstdio>
#include <cstring>
#include <cstdint>
#include "util/Mth.h"
int getTimeMs() { return 0; }
static uint32_t fb(float f) { uint32_t u; std::memcpy(&u, &f, 4); return u; }
static uint32_t s = 12345u;
static uint32_t nextU() { s = s * 1664525u + 1013904223u; return s; }
static float nextF(float lo, float hi) { return lo + (hi - lo) * (float)((nextU() >> 8) & 0xffffff) / 16777216.0f; }
static int nextI(int lo, int hi) { return lo + (int)(nextU() % (uint32_t)(hi - lo + 1)); }

int main(int argc, char** argv) {
  if (argc < 3) { std::fprintf(stderr, "usage: harness_mth <sin_table.f32> <mth.json>\n"); return 2; }
  Mth::initMth();
  FILE* bin = std::fopen(argv[1], "wb");
  for (int i = 0; i < 65536; i++) { float x = Mth::sin(i / (65536.0f / (2.0f * Mth::PI))); std::fwrite(&x, 4, 1, bin); }
  std::fclose(bin);

  FILE* js = std::fopen(argv[2], "w");
  std::fprintf(js, "{\"constants\":{\"PI\":%u,\"TWO_PI\":%u,\"DEGRAD\":%u,\"RADDEG\":%u}", fb(Mth::PI), fb(Mth::TWO_PI), fb(Mth::DEGRAD), fb(Mth::RADDEG));

  const float xs[] = {0.0f, 0.5f, -0.5f, 1.0f, 3.14159f, -3.14159f, 6.2831855f, 100.25f, -100.25f, 12345.678f, 1e-7f, 7.0e5f};
  std::fprintf(js, ",\"probes\":[");
  for (int i = 0; i < 12; i++)
    std::fprintf(js, "%s{\"x\":%u,\"sin\":%u,\"cos\":%u,\"floor\":%d}", i ? "," : "", fb(xs[i]), fb(Mth::sin(xs[i])), fb(Mth::cos(xs[i])), Mth::floor(xs[i]));

  std::fprintf(js, "],\"trig\":[");   // 随机角度上的 sin/cos
  for (int i = 0; i < 2000; i++) { float x = nextF(-2000.0f, 2000.0f); std::fprintf(js, "%s[%u,%u,%u]", i ? "," : "", fb(x), fb(Mth::sin(x)), fb(Mth::cos(x))); }

  std::fprintf(js, "],\"invSqrt\":[");
  for (int i = 0; i < 2000; i++) { float x = nextF(0.001f, 4096.0f); std::fprintf(js, "%s[%u,%u]", i ? "," : "", fb(x), fb(Mth::invSqrt(x))); }

  std::fprintf(js, "],\"sqrt\":[");
  for (int i = 0; i < 500; i++) { float x = nextF(0.0f, 1.0e6f); std::fprintf(js, "%s[%u,%u]", i ? "," : "", fb(x), fb(Mth::sqrt(x))); }

  std::fprintf(js, "],\"atan\":[");
  for (int i = 0; i < 500; i++) { float x = nextF(-100.0f, 100.0f); std::fprintf(js, "%s[%u,%u]", i ? "," : "", fb(x), fb(Mth::atan(x))); }

  std::fprintf(js, "],\"atan2\":[");
  for (int i = 0; i < 500; i++) { float y = nextF(-100.0f, 100.0f), x = nextF(-100.0f, 100.0f); std::fprintf(js, "%s[%u,%u,%u]", i ? "," : "", fb(y), fb(x), fb(Mth::atan2(y, x))); }

  std::fprintf(js, "],\"floorF\":[");   // float 参数的 floor，含负数、整数边界、越界
  const float fl[] = {-2.5f, -2.0f, -1.0f, -0.5f, -0.0f, 0.0f, 0.5f, 1.0f, 2.999f, 16777215.0f, -16777215.5f, 2.2e9f, -2.2e9f, 3.0e10f};
  for (int i = 0; i < 14; i++) std::fprintf(js, "%s[%u,%d]", i ? "," : "", fb(fl[i]), Mth::floor(fl[i]));
  for (int i = 0; i < 500; i++) { float x = nextF(-1.0e6f, 1.0e6f); std::fprintf(js, ",[%u,%d]", fb(x), Mth::floor(x)); }
  double d1 = 0.99999999, d2 = 16777217.0, d3 = -0.000000001;   // double 实参被隐式转成 float
  std::fprintf(js, "],\"floorDouble\":[[%.17g,%d],[%.17g,%d],[%.17g,%d]]", d1, Mth::floor(d1), d2, Mth::floor(d2), d3, Mth::floor(d3));

  std::fprintf(js, ",\"lerp\":[");
  for (int i = 0; i < 500; i++) { float a = nextF(-1000, 1000), b = nextF(-1000, 1000), t = nextF(-0.5f, 1.5f); std::fprintf(js, "%s[%u,%u,%u,%u]", i ? "," : "", fb(a), fb(b), fb(t), fb(Mth::lerp(a, b, t))); }
  std::fprintf(js, "],\"lerpInt\":[");
  for (int i = 0; i < 500; i++) { int a = nextI(-100000, 100000), b = nextI(-100000, 100000); float t = nextF(-0.5f, 1.5f); std::fprintf(js, "%s[%d,%d,%u,%d]", i ? "," : "", a, b, fb(t), Mth::lerp(a, b, t)); }
  std::fprintf(js, "],\"absDecrease\":[");
  for (int i = 0; i < 500; i++) { float v = nextF(-10, 10), w = nextF(-3, 3), m = nextF(0, 2); std::fprintf(js, "%s[%u,%u,%u,%u]", i ? "," : "", fb(v), fb(w), fb(m), fb(Mth::absDecrease(v, w, m))); }
  std::fprintf(js, "],\"absMax\":[");
  for (int i = 0; i < 500; i++) { float a = nextF(-10, 10), b = nextF(-10, 10); std::fprintf(js, "%s[%u,%u,%u,%u]", i ? "," : "", fb(a), fb(b), fb(Mth::absMax(a, b)), fb(Mth::absMaxSigned(a, b))); }
  std::fprintf(js, "],\"intFloorDiv\":[");
  const int dv[][2] = {{-1,16},{-15,16},{-16,16},{-17,16},{-32,16},{-33,16},{0,16},{15,16},{16,16},{17,16},{-1,1},{-7,2},{7,2},{-2147483647,16}};
  for (int i = 0; i < 14; i++) std::fprintf(js, "%s[%d,%d,%d]", i ? "," : "", dv[i][0], dv[i][1], Mth::intFloorDiv(dv[i][0], dv[i][1]));
  for (int i = 0; i < 500; i++) { int a = nextI(-1000000, 1000000), b = nextI(1, 64); std::fprintf(js, ",[%d,%d,%d]", a, b, Mth::intFloorDiv(a, b)); }
  std::fprintf(js, "],\"intOps\":[");   // abs / Min / Max / clamp 的 int 重载
  for (int i = 0; i < 500; i++) { int a = nextI(-1000, 1000), b = nextI(-1000, 1000), lo = nextI(-500, 0), hi = nextI(0, 500);
    std::fprintf(js, "%s[%d,%d,%d,%d,%d,%d,%d,%d]", i ? "," : "", a, b, lo, hi, Mth::abs(a), Mth::Min(a, b), Mth::Max(a, b), Mth::clamp(a, lo, hi)); }
  std::fprintf(js, "],\"floatOps\":[");   // abs / Min / Max / clamp 的 float 重载
  for (int i = 0; i < 500; i++) { float a = nextF(-10, 10), b = nextF(-10, 10), lo = nextF(-5, 0), hi = nextF(0, 5);
    std::fprintf(js, "%s[%u,%u,%u,%u,%u,%u,%u,%u]", i ? "," : "", fb(a), fb(b), fb(lo), fb(hi), fb(Mth::abs(a)), fb(Mth::Min(a, b)), fb(Mth::Max(a, b)), fb(Mth::clamp(a, lo, hi))); }

  std::fprintf(js, "],\"brightnessRampBits\":[");   // 公式转写自 Dimension.cpp:67-75，S4 用
  const float ambientLight = 0.05f;
  for (int i = 0; i <= 15; i++) {
    float v = (1 - i / (float)16);
    float r = ((1 - v) / (v * 3 + 1)) * (1 - ambientLight) + ambientLight * 3;
    std::fprintf(js, "%s%u", i ? "," : "", fb(r));
  }
  std::fprintf(js, "]}\n");
  std::fclose(js);
}
