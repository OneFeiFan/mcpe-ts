// 黄金样本：参考源码 util/Random.h（MT19937）。输出 fixtures/golden/random.json
// 构建见 tools/golden/README.md。只依赖 Random.h 与 platform/time.h 的声明。
#include <cstdio>
#include <cstring>
#include <cstdint>
#define private public   // 需要直接取 genrand_int32()
#include "util/Random.h"
#undef private
int getTimeMs() { return 0; }  // 仅默认构造会用到
static uint32_t fbits(float f) { uint32_t u; std::memcpy(&u, &f, 4); return u; }
int main() {
  const long long seeds[] = {0LL, 1LL, 12345LL, -1LL, 2147483647LL, 123456789012LL};
  const int N = 8;
  std::printf("[\n");
  for (int s = 0; s < 6; ++s) {
    const long seed = (long)seeds[s];  // 与 C++ 调用处一致：Random(long)；init_genrand 只取低 32 位
    Random a(seed), b(seed), c(seed), d(seed), e(seed), f(seed);
    std::printf("{\"seed\":\"%lld\",\"u32\":[", seeds[s]);
    for (int i = 0; i < N; i++) std::printf("%s%u", i ? "," : "", (unsigned)(a.genrand_int32() & 0xffffffffUL));
    std::printf("],\"nextInt\":[");
    for (int i = 0; i < N; i++) std::printf("%s%d", i ? "," : "", b.nextInt());
    std::printf("],\"nextInt100\":[");
    for (int i = 0; i < N; i++) std::printf("%s%d", i ? "," : "", c.nextInt(100));
    std::printf("],\"nextFloatBits\":[");
    for (int i = 0; i < N; i++) std::printf("%s%u", i ? "," : "", fbits(d.nextFloat()));
    std::printf("],\"nextGaussianBits\":[");
    for (int i = 0; i < N; i++) std::printf("%s%u", i ? "," : "", fbits(e.nextGaussian()));
    std::printf("],\"nextBoolean\":[");
    for (int i = 0; i < N; i++) std::printf("%s%s", i ? "," : "", f.nextBoolean() ? "true" : "false");
    std::printf("]}%s\n", s < 5 ? "," : "");
  }
  std::printf("]\n");
}
