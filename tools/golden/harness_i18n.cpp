// 黄金样本 G11-5：本地化。替身 AppPlatform 从参考源码的 data/ 目录读语言文件；
// 输出每个已注册方块、物品的 "<descriptionId>.name" 翻译与 I18n::getDescriptionString（aux 0；羊毛另取 aux 1），以及一个缺失键。
#include <cstdio>
#include <cstring>
#include <string>
#include <fstream>
#include <sstream>
#include "AppPlatform.h"
#include "locale/I18n.h"
#include "world/level/material/Material.h"
#include "world/level/tile/Tile.h"
#include "world/item/Item.h"
#include "world/item/ItemInstance.h"

struct FilePlatform : public AppPlatform {
  std::string dataDir;
  BinaryBlob readAssetFile(const std::string& filename) override {
    std::ifstream f(dataDir + "/" + filename, std::ios::binary);
    if (!f) return BinaryBlob();
    std::stringstream ss; ss << f.rdbuf(); std::string s = ss.str();
    unsigned char* d = new unsigned char[s.size()]; std::memcpy(d, s.data(), s.size());
    return BinaryBlob(d, (int)s.size());
  }
};
static std::string esc(const std::string& s) {
  std::string o;
  for (unsigned char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else if (c < 0x20) { char b[8]; std::snprintf(b, 8, "\\u%04x", c); o += b; } else o += c; }
  return o;
}

int main(int argc, char** argv) {
  Material::initMaterials();
  Tile::initTiles();
  Item::initItems();
  FilePlatform p; p.dataDir = argv[2];
  I18n::loadLanguage(&p, "en_US");
  FILE* o = std::fopen(argv[1], "w");
  std::fprintf(o, "{\"missing\":\"%s\",\"names\":[", esc(I18n::get("no.such.key")).c_str());
  bool first = true;
  for (int id = 1; id < 512; id++) {
    std::string desc;
    if (id < 256) { if (!Tile::tiles[id]) continue; desc = Tile::tiles[id]->getDescriptionId(); }
    else { if (!Item::items[id]) continue; desc = Item::items[id]->getDescriptionId(); }
    int auxes = (id == 35) ? 2 : 1;
    for (int aux = 0; aux < auxes; aux++) {
      ItemInstance it(id, 1, aux);
      std::fprintf(o, "%s{\"id\":%d,\"aux\":%d,\"name\":\"%s\",\"desc\":\"%s\"}", first ? "" : ",", id, aux,
                   esc(I18n::get(desc + ".name")).c_str(), esc(I18n::getDescriptionString(it)).c_str());
      first = false;
    }
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
