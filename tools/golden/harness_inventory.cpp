// 黄金样本 G12-3：物品栏。创造模式与生存模式的默认物品栏（Inventory 构造函数里的 setupDefault），
// 以及 FillingContainer::save(ListTag*) 写出的 NBT 字节（含链接槽的 MAGIX_VAL 记录）。
// 创造模式的 Inventory 传 NULL 作 player（构造函数与 setupDefault 不用它）；生存模式的添加用同尺寸的 FillingContainer（见 main）。
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "world/level/material/Material.h"
#include "world/level/tile/Tile.h"
#include "world/item/Item.h"
#include "world/item/ItemInstance.h"
#include "world/entity/player/Inventory.h"
#include "world/inventory/FillingContainer.h"
#include "nbt/NbtIo.h"
#include "nbt/CompoundTag.h"
#include "nbt/ListTag.h"
#include "util/DataIO.h"

struct VecOut : public BytesDataOutput {
  std::vector<unsigned char> b;
  void writeBytes(const void* data, int bytes) override { const unsigned char* p = (const unsigned char*)data; b.insert(b.end(), p, p + bytes); }
};
static std::string hex(const std::vector<unsigned char>& v) {
  static const char* h = "0123456789abcdef"; std::string s;
  for (unsigned char c : v) { s += h[c >> 4]; s += h[c & 15]; }
  return s;
}
static void dump(FILE* o, FillingContainer& inv) {
  std::fprintf(o, "{\"size\":%d,\"slots\":[", inv.getContainerSize());
  for (int i = 0; i < inv.getContainerSize(); i++) {
    ItemInstance* it = inv.getItem(i);
    if (i) std::fprintf(o, ",");
    if (it) std::fprintf(o, "[%d,%d,%d]", it->id, it->count, it->getAuxValue());
    else std::fprintf(o, "null");
  }
  std::fprintf(o, "],\"linked\":[");
  for (int i = 0; i < inv.getNumLinkedSlots(); i++) std::fprintf(o, "%s%d", i ? "," : "", inv.linkedSlots[i].inventorySlot);
  CompoundTag root;
  root.put("Inventory", inv.save(new ListTag()));
  VecOut w; NbtIo::write(&root, &w);
  std::fprintf(o, "],\"save\":\"%s\"}", hex(w.b).c_str());
}

int main(int argc, char** argv) {
  Material::initMaterials();
  Tile::initTiles();
  Item::initItems();
  FILE* o = std::fopen(argv[1], "w");
  Inventory creative(NULL, true);
  // 生存模式：Inventory::add 会读 player->hasFakeInventory，这里直接用同样尺寸的 FillingContainer
  FillingContainer survival(36 + Inventory::MAX_SELECTION_SIZE, Inventory::MAX_SELECTION_SIZE, ContainerType::INVENTORY, false);
  ItemInstance a(Tile::rock, 40, 0), b(Tile::rock, 40, 0), c(Item::coal, 3, 0), d(Tile::cloth, 5, 14);
  survival.add(&a);
  survival.add(&b);
  survival.add(&c);
  survival.add(&d);
  std::fprintf(o, "{\"creative\":");
  dump(o, creative);
  std::fprintf(o, ",\"survival\":");
  dump(o, survival);
  std::fprintf(o, "}\n");
  std::fclose(o);
  return 0;
}
