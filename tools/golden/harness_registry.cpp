// 黄金样本 G11-1、G11-2：方块注册表与物品注册表快照（参考源码 Tile::initTiles、Item::initItems 之后逐项输出）。
// 编译方式见 build.sh：编译参考源码里全部方块类、物品类与 Material，用 --unresolved-symbols=ignore-all 链接——
// 只在运行时会被调用的符号必须真实存在；initTiles、initItems 与这里读取的 getter 都不调用 Level、Entity、网络等函数。
// client 头文件要的 GL 类型由 tools/golden/stub/glad/glad.h 提供（只有类型与两个常量）。
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <typeinfo>
#include <cxxabi.h>
#include <cstdlib>
#include <sstream>
#include <map>
#include <set>
#include <list>
#include <iostream>
#include <fstream>
#include <algorithm>
#include <memory>
#include <cmath>
#include <climits>
#include <functional>
#include <utility>
#include <cstdarg>
#include <ctime>
#define private public
#define protected public
#include "world/level/material/Material.h"
#include "world/level/tile/Tile.h"
#include "world/item/Item.h"
#include "world/Facing.h"
#include "world/item/TileItem.h"
#undef private
#undef protected

static uint32_t fb(float f) { uint32_t u; std::memcpy(&u, &f, 4); return u; }
static std::string cls(const void* p, const std::type_info& ti) {
  int st = 0; char* d = abi::__cxa_demangle(ti.name(), 0, 0, &st);
  std::string s = d ? d : ti.name(); std::free(d); (void)p; return s;
}
static std::string esc(const std::string& s) {
  std::string o; for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; } return o;
}
static const char* matName(const Material* m) {
  struct { const Material* m; const char* n; } t[] = {
    {Material::air, "air"}, {Material::dirt, "dirt"}, {Material::wood, "wood"}, {Material::stone, "stone"}, {Material::metal, "metal"},
    {Material::water, "water"}, {Material::lava, "lava"}, {Material::leaves, "leaves"}, {Material::plant, "plant"},
    {Material::replaceable_plant, "replaceable_plant"}, {Material::sponge, "sponge"}, {Material::cloth, "cloth"}, {Material::fire, "fire"},
    {Material::sand, "sand"}, {Material::decoration, "decoration"}, {Material::glass, "glass"}, {Material::explosive, "explosive"},
    {Material::coral, "coral"}, {Material::ice, "ice"}, {Material::topSnow, "topSnow"}, {Material::snow, "snow"}, {Material::cactus, "cactus"},
    {Material::clay, "clay"}, {Material::vegetable, "vegetable"}, {Material::portal, "portal"}, {Material::cake, "cake"}, {Material::web, "web"}};
  for (auto& e : t) if (e.m == m) return e.n;
  return "?";
}

int main(int argc, char** argv) {
  FILE* o = std::fopen(argv[1], "w");
  Material::initMaterials();
  Tile::initTiles();
  Item::initItems();
  std::fprintf(o, "{\"tiles\":[");
  for (int id = 0; id < 256; id++) {
    if (id) std::fprintf(o, ",");
    Tile* t = Tile::tiles[id];
    if (!t) { std::fprintf(o, "null"); continue; }
    std::fprintf(o, "{\"id\":%d,\"cls\":\"%s\",\"desc\":\"%s\",\"tex\":%d,\"mat\":\"%s\",\"destroy\":%u,\"resist\":%u,\"light\":%d,\"lightBlock\":%d,"
                 "\"tick\":%d,\"translucent\":%d,\"entity\":%d,\"solidRender\":%d,\"cube\":%d,\"shape\":%d,\"layer\":%d,\"category\":%d,"
                 "\"friction\":%u,\"gravity\":%u,\"sound\":[\"%s\",\"%s\",%u,%u],\"bounds\":[%u,%u,%u,%u,%u,%u],\"tex6\":[",
                 id, esc(cls(t, typeid(*t))).c_str(), esc(t->getDescriptionId()).c_str(), t->tex, matName(t->material), fb(t->destroySpeed),
                 fb(t->explosionResistance), Tile::lightEmission[id], Tile::lightBlock[id], (int)Tile::shouldTick[id], (int)Tile::translucent[id],
                 (int)Tile::isEntityTile[id], (int)t->isSolidRender(), (int)t->isCubeShaped(), t->getRenderShape(), t->getRenderLayer(), t->category,
                 fb(t->friction), fb(t->gravity), esc(t->soundType->getStepSound()).c_str(), esc(t->soundType->getBreakSound()).c_str(),
                 fb(t->soundType->getVolume()), fb(t->soundType->getPitch()), fb(t->xx0), fb(t->yy0), fb(t->zz0), fb(t->xx1), fb(t->yy1), fb(t->zz1));
    for (int f = 0; f < 6; f++) std::fprintf(o, "%s%d", f ? "," : "", t->getTexture(f));
    std::fprintf(o, "],\"texData\":[");
    for (int d = 0; d < 16; d++) std::fprintf(o, "%s%d", d ? "," : "", t->getTexture(2, d));
    std::fprintf(o, "]}");
  }
  std::fprintf(o, "],\"items\":[");
  bool first = true;
  for (int id = 256; id < 512; id++) {
    Item* it = Item::items[id];
    if (!first) std::fprintf(o, ",");
    first = false;
    if (!it) { std::fprintf(o, "null"); continue; }
    TileItem* ti = dynamic_cast<TileItem*>(it);
    std::fprintf(o, "{\"id\":%d,\"cls\":\"%s\",\"desc\":\"%s\",\"icon\":%d,\"maxStack\":%d,\"maxDamage\":%d,\"category\":%d,\"hand\":%d,"
                 "\"stacked\":%d,\"food\":%d,\"armor\":%d,\"tileId\":%d,\"iconAux\":[",
                 id, esc(cls(it, typeid(*it))).c_str(), esc(it->getDescriptionId()).c_str(), it->icon, it->getMaxStackSize(), it->getMaxDamage(),
                 it->category, (int)it->isHandEquipped(), (int)it->isStackedByData(), (int)it->isFood(), (int)it->isArmor(), ti ? ti->getTileId() : -1);
    for (int d = 0; d < 16; d++) std::fprintf(o, "%s%d", d ? "," : "", it->getIcon(d));
    std::fprintf(o, "]}");
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
