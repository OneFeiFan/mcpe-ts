// 黄金样本 G12-1：实体的存档格式。用 ItemEntity（Entity::save → saveWithoutId → ItemEntity::addAdditonalSaveData）。
// level 传 NULL：Entity、ItemEntity 的构造函数与 save 都不访问 level。构造函数里的随机量（Mth::random）在构造后覆盖成固定值。
#include <cstdio>
#include <cstring>
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
#define private public // ItemEntity::health 是 private（只为在 harness 里设成固定值）
#define protected public
#include "world/level/material/Material.h"
#include "world/level/tile/Tile.h"
#include "world/item/Item.h"
#include "world/item/ItemInstance.h"
#include "world/entity/item/ItemEntity.h"
#include "nbt/NbtIo.h"
#include "nbt/CompoundTag.h"
#include "util/DataIO.h"
#undef private
#undef protected

struct VecOut : public BytesDataOutput {
  std::vector<unsigned char> b;
  void writeBytes(const void* data, int bytes) override { const unsigned char* p = (const unsigned char*)data; b.insert(b.end(), p, p + bytes); }
};
static std::string hex(const std::vector<unsigned char>& v) {
  static const char* h = "0123456789abcdef"; std::string s;
  for (unsigned char c : v) { s += h[c >> 4]; s += h[c & 15]; }
  return s;
}

int main(int argc, char** argv) {
  Material::initMaterials();
  Tile::initTiles();
  Item::initItems();
  FILE* o = std::fopen(argv[1], "w");
  std::fprintf(o, "{\"items\":[");
  struct Case { int id, count, aux; float x, y, z, xd, yd, zd, yRot, xRot, fall; int age, health; bool onGround; } cases[] = {
    {1, 3, 0, 128.5f, 65.125f, 129.75f, 0.05f, 0.2f, -0.03f, 123.4f, 0.0f, 0.0f, 0, 5, false},
    {35, 1, 14, -10.25f, 70.0f, 3.5f, 0.0f, 0.0f, 0.0f, 0.0f, 12.5f, 1.5f, 1234, 3, true},
  };
  for (unsigned k = 0; k < sizeof(cases) / sizeof(cases[0]); k++) {
    const Case& c = cases[k];
    ItemEntity e(NULL, c.x, c.y, c.z, ItemInstance(c.id, c.count, c.aux));
    e.xd = c.xd; e.yd = c.yd; e.zd = c.zd;
    e.yRot = c.yRot; e.xRot = c.xRot;
    e.fallDistance = c.fall;
    e.age = c.age; e.health = c.health;
    e.onGround = c.onGround;
    CompoundTag tag;
    e.save(&tag);
    VecOut w; NbtIo::write(&tag, &w);
    std::fprintf(o, "%s{\"id\":%d,\"count\":%d,\"aux\":%d,\"x\":%.9g,\"y\":%.9g,\"z\":%.9g,\"xd\":%.9g,\"yd\":%.9g,\"zd\":%.9g,\"yRot\":%.9g,\"xRot\":%.9g,\"fall\":%.9g,\"age\":%d,\"health\":%d,\"onGround\":%d,\"hex\":\"%s\"}",
                 k ? "," : "", c.id, c.count, c.aux, c.x, c.y, c.z, c.xd, c.yd, c.zd, c.yRot, c.xRot, c.fall, c.age, c.health, (int)c.onGround, hex(w.b).c_str());
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
