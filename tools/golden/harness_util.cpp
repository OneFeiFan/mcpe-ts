// 黄金样本：参考源码 util/PerfTimer.cpp 与 util/StringUtils.cpp。输出 fixtures/golden/util.json
// PerfTimer 用一个可控的假时钟驱动：按脚本 push/pop，再读 getLog 的结果（percentage 以 float 位记录）。
#include <cstdio>
#include <cstring>
#include <cstdint>
#include <string>
#include <vector>
#include "util/PerfTimer.h"
#include "util/StringUtils.h"

static float g_now = 0;
float getTimeS() { return g_now; }            // PerfTimer.cpp 只用到这一个时间函数
int getTimeMs() { return (int)(g_now * 1000.0f); }

static uint32_t fb(float f) { uint32_t u; std::memcpy(&u, &f, 4); return u; }
static void jsonStr(FILE* o, const std::string& s) {
  std::fputc('"', o);
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') std::fprintf(o, "\\%c", c);
    else if (c < 0x20) std::fprintf(o, "\\u%04x", c);
    else std::fputc(c, o);                     // UTF-8 原样输出
  }
  std::fputc('"', o);
}

// 脚本：op 为 'u'(push) 'o'(pop) 'p'(popPush)；t 为执行该操作前把时钟设成的值
struct Step { char op; const char* name; float t; };
static const Step FRAME[] = {
  {'u', "root", 0.0f},
  {'u', "tick", 0.001f},
  {'p', "level", 0.004f},
  {'o', "", 0.0065f},
  {'u', "render", 0.007f},
  {'u', "terrain", 0.0161f},
  {'o', "", 0.0200f},
  {'u', "sky", 0.0203f},
  {'o', "", 0.02071f},
  {'o', "", 0.0210f},
  {'o', "", 0.0230f},
};

static void runFrames(int frames, float base) {
  for (int k = 0; k < frames; k++) {
    const float off = base + k * 0.05f;
    for (const Step& s : FRAME) {
      g_now = off + s.t;
      if (s.op == 'u') PerfTimer::push(s.name);
      else if (s.op == 'o') PerfTimer::pop();
      else PerfTimer::popPush(s.name);
    }
  }
}

static void dumpLog(FILE* o, const char* path) {
  std::vector<PerfTimer::ResultField> r = PerfTimer::getLog(path);
  std::fprintf(o, "{\"path\":"); jsonStr(o, path); std::fprintf(o, ",\"fields\":[");
  for (size_t i = 0; i < r.size(); i++) {
    std::fprintf(o, "%s{\"name\":", i ? "," : "");
    jsonStr(o, r[i].name);
    std::fprintf(o, ",\"pct\":%u,\"gpct\":%u,\"color\":%d}", fb(r[i].percentage), fb(r[i].globalPercentage), r[i].getColor());
  }
  std::fprintf(o, "]}");
}

int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: harness_util <util.json>\n"); return 2; }
  FILE* o = std::fopen(argv[1], "w");

  // ---------------- StringUtils
  const char* hs[] = {"", "root", "root.tick", "root.render.terrain", "Minecraft", "/r/Minecraft",
                      "\xe7\xa7\x8d\xe5\xad\x90", "h\xc3\xa9llo", "unspecified"};   // 种子、héllo（UTF-8）
  std::fprintf(o, "{\"hashCode\":[");
  for (int i = 0; i < 9; i++) { std::fprintf(o, "%s[", i ? "," : ""); jsonStr(o, hs[i]); std::fprintf(o, ",%d]", Util::hashCode(hs[i])); }

  std::fprintf(o, "],\"startsWith\":[");
  const char* sw[][2] = {{"root.tick", "root"}, {"root", "root.tick"}, {"abc", ""}, {"", ""}, {"abc", "abd"}, {"root.", "root."}};
  for (int i = 0; i < 6; i++) { std::fprintf(o, "%s[", i ? "," : ""); jsonStr(o, sw[i][0]); std::fprintf(o, ","); jsonStr(o, sw[i][1]); std::fprintf(o, ",%s]", Util::startsWith(sw[i][0], sw[i][1]) ? "true" : "false"); }

  std::fprintf(o, "],\"stringTrim\":[");
  const char* tr[] = {"  hi  ", "\t\n x \r", "", "abc", "   ", " a b "};
  for (int i = 0; i < 6; i++) { std::fprintf(o, "%s[", i ? "," : ""); jsonStr(o, tr[i]); std::fprintf(o, ","); jsonStr(o, Util::stringTrim(tr[i])); std::fprintf(o, "]"); }

  std::fprintf(o, "],\"stringTrimChars\":[");
  struct T4 { const char* s; const char* c; bool l, r; };
  const T4 t4[] = {{"xxhixx", "x", true, false}, {"xxhixx", "x", false, true}, {"xxhixx", "x", true, true},
                   {"xxhixx", "x", false, false}, {"hi", "", true, true}, {"xyxhiyx", "xy", true, true}, {"xxxx", "x", true, true}};
  for (int i = 0; i < 7; i++) {
    std::fprintf(o, "%s[", i ? "," : ""); jsonStr(o, t4[i].s); std::fprintf(o, ","); jsonStr(o, t4[i].c);
    std::fprintf(o, ",%s,%s,", t4[i].l ? "true" : "false", t4[i].r ? "true" : "false"); jsonStr(o, Util::stringTrim(t4[i].s, t4[i].c, t4[i].l, t4[i].r)); std::fprintf(o, "]");
  }

  std::fprintf(o, "],\"stringReplace\":[");
  struct R4 { const char* s; const char* a; const char* b; int n; };
  const R4 r4[] = {{"a-b-c", "-", "+", -1}, {"a-b-c", "-", "+", 1}, {"a-b-c", "-", "+", 2}, {"aaa", "a", "", -1}, {"x", "y", "z", -1}, {"a-b", "-", "--x", 3}};
  for (int i = 0; i < 6; i++) {
    std::string s = r4[i].s; Util::stringReplace(s, r4[i].a, r4[i].b, r4[i].n);
    std::fprintf(o, "%s[", i ? "," : ""); jsonStr(o, r4[i].s); std::fprintf(o, ","); jsonStr(o, r4[i].a); std::fprintf(o, ","); jsonStr(o, r4[i].b);
    std::fprintf(o, ",%d,", r4[i].n); jsonStr(o, s); std::fprintf(o, "]");
  }

  std::fprintf(o, "],\"removeAllString\":[");
  { const char* rep[] = {"_", "o"}; std::string s = "stone_brick_wood"; Util::removeAll(s, rep, 2);
    std::fprintf(o, "["); jsonStr(o, "stone_brick_wood"); std::fprintf(o, ",[\"_\",\"o\"],2,"); jsonStr(o, s); std::fprintf(o, "]"); }
  { const char* rep[] = {"ab", "b"}; std::string s = "aabbab"; Util::removeAll(s, rep, 1);
    std::fprintf(o, ",["); jsonStr(o, "aabbab"); std::fprintf(o, ",[\"ab\",\"b\"],1,"); jsonStr(o, s); std::fprintf(o, "]"); }

  // ---------------- PerfTimer
  std::fprintf(o, "],\"perfTimer\":{\"disabled\":");
  PerfTimer::enabled = false;
  runFrames(1, 0.0f);
  std::fprintf(o, "%d", (int)PerfTimer::getLog("root").size());   // 关闭时 getLog 返回空

  PerfTimer::enabled = true;
  PerfTimer::reset();
  runFrames(3, 1.0f);
  std::fprintf(o, ",\"logs\":[");
  dumpLog(o, "root"); std::fprintf(o, ",");
  dumpLog(o, "root.render"); std::fprintf(o, ",");
  dumpLog(o, ""); std::fprintf(o, ",");
  dumpLog(o, "root");                       // 第二次读：累计值已被 getLog 乘过 0.999
  runFrames(2, 5.0f);                       // 再跑两帧后再读
  std::fprintf(o, ",");
  dumpLog(o, "root");
  std::fprintf(o, "]}}\n");
  std::fclose(o);
}
