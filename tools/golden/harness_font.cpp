// 黄金样本 G13-1：字体字宽。调用参考源码的 Font 构造函数（Font::init 从字体图片逐列扫描得到 charWidths），
// 输出 256 个字宽与几串文字的 Font::width。
// Font 只用到 Textures 的 loadTexture、getTemporaryTextureData 两个成员：这里给出它们的定义（不链接 Textures.cpp，
// 免得牵出 GL），返回 tools/golden/inputs/default8.rgba——由 default8.png 解码出的 RGBA8888（前 4 字节是宽、高，各 16 位大端）。
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
#include "client/gui/Font.h"
#include "client/renderer/Textures.h"
#include "client/renderer/TextureData.h"
#include "client/Options.h"
#undef private
#undef protected

static TextureData g_tex;
TextureId Textures::loadTexture(const std::string&, bool) { return 1; }
const TextureData* Textures::getTemporaryTextureData(TextureId) { return &g_tex; }

int main(int argc, char** argv) {
  FILE* f = std::fopen(argv[2], "rb");
  unsigned char hdr[4];
  if (std::fread(hdr, 1, 4, f) != 4) return 1;
  g_tex.w = (hdr[0] << 8) | hdr[1];
  g_tex.h = (hdr[2] << 8) | hdr[3];
  g_tex.numBytes = g_tex.w * g_tex.h * 4;
  g_tex.data = new unsigned char[g_tex.numBytes];
  if ((int)std::fread(g_tex.data, 1, g_tex.numBytes, f) != g_tex.numBytes) return 1;
  std::fclose(f);
  Font font(NULL, "font/default8.png", (Textures*)NULL + 0);
  FILE* o = std::fopen(argv[1], "w");
  std::fprintf(o, "{\"charWidths\":[");
  for (int i = 0; i < 256; i++) std::fprintf(o, "%s%d", i ? "," : "", font.charWidths[i]);
  const char* samples[] = {"Stone", "Hello, World!", "Minecraft Pocket Edition", "0123456789", "i l I . , ; : ! |", "WWWW mmmm", ""};
  std::fprintf(o, "],\"widths\":[");
  for (unsigned k = 0; k < sizeof(samples) / sizeof(samples[0]); k++)
    std::fprintf(o, "%s[\"%s\",%d]", k ? "," : "", samples[k], font.width(samples[k]));
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
