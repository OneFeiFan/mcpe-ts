// 黄金样本 G11-3、G11-4：NBT 字节级往返与 ItemInstance 存档格式。
// 与 harness_registry 一样链接全部方块、物品类（ItemInstance 要用注册表）与自动生成的陷阱替身。
// 结构（TS 测试按同样的顺序构造；CompoundTag 用 std::map 按名字排序写出）：见下方 build()。
#include <cstdio>
#include <cstring>
#include <climits>
#include <string>
#include <vector>
#include "world/level/material/Material.h"
#include "world/level/tile/Tile.h"
#include "world/item/Item.h"
#include "world/item/ItemInstance.h"
#include "nbt/NbtIo.h"
#include "nbt/CompoundTag.h"
#include "nbt/ListTag.h"
#include "nbt/IntTag.h"
#include "nbt/DoubleTag.h"
#include "util/DataIO.h"

struct VecOut : public BytesDataOutput {
  std::vector<unsigned char> b;
  void writeBytes(const void* data, int bytes) override { const unsigned char* p = (const unsigned char*)data; b.insert(b.end(), p, p + bytes); }
};
struct VecIn : public BytesDataInput {
  const std::vector<unsigned char>& b; size_t pos = 0;
  explicit VecIn(const std::vector<unsigned char>& v) : b(v) {}
  void readBytes(void* data, int bytes) override { std::memcpy(data, &b[pos], bytes); pos += bytes; }
};
static std::string hex(const std::vector<unsigned char>& v) {
  static const char* h = "0123456789abcdef"; std::string s;
  for (unsigned char c : v) { s += h[c >> 4]; s += h[c & 15]; }
  return s;
}
static unsigned char BYTES[5] = {1, 2, 3, 250, 0};

static CompoundTag* build() {
  CompoundTag* root = new CompoundTag();
  root->putByte("b_min", (char)-128);
  root->putByte("b_max", 127);
  root->putBoolean("bool", true);
  root->putShort("s_min", (short)-32768);
  root->putShort("s", 12345);
  root->putInt("i_min", INT_MIN);
  root->putInt("i", 123456789);
  root->putLong("l", 0x123456789ABCDEF0LL);
  root->putLong("l_neg", -1);
  root->putFloat("f", 3.14159f);
  root->putFloat("f_neg0", -0.0f);
  root->putDouble("d_from_float", 1.0f / 3.0f); // C++ 的 putDouble 参数是 float
  root->put("d_real", new DoubleTag("d_real", 1.0 / 3.0));
  root->putString("str", "hello");
  root->putString("empty", "");
  root->putString("utf8", "\xe4\xb8\xad\xe6\x96\x87");
  TagMemoryChunk mem; mem.data = BYTES; mem.len = 5;
  root->putByteArray("bytes", mem);
  ListTag* ints = new ListTag();
  ints->add(new IntTag("", 1)); ints->add(new IntTag("", 2)); ints->add(new IntTag("", 3));
  root->put("ints", ints);
  root->put("empty_list", new ListTag());
  ListTag* comps = new ListTag();
  for (int i = 0; i < 2; i++) { CompoundTag* c = new CompoundTag(); c->putString("name", i ? "b" : "a"); c->putShort("n", (short)i); comps->add(c); }
  root->put("comps", comps);
  CompoundTag* nested = new CompoundTag();
  nested->putInt("x", -5);
  CompoundTag* inner = new CompoundTag();
  inner->putString("deep", "yes");
  nested->putCompound("inner", inner);
  root->putCompound("nested", nested);
  return root;
}

int main(int argc, char** argv) {
  Material::initMaterials();
  Tile::initTiles();
  Item::initItems();
  FILE* o = std::fopen(argv[1], "w");
  VecOut w1; NbtIo::write(build(), &w1);
  VecIn r1(w1.b); CompoundTag* back = NbtIo::read(&r1);
  VecOut w2; NbtIo::write(back, &w2);
  std::fprintf(o, "{\"root\":\"%s\",\"reread\":\"%s\",\"items\":[", hex(w1.b).c_str(), hex(w2.b).c_str());
  int cases[][3] = {{1, 64, 0}, {35, 1, 14}, {256, 1, 250}, {5, 200, -1}, {351, 3, 4}, {0, 0, 0}};
  for (unsigned k = 0; k < sizeof(cases) / sizeof(cases[0]); k++) {
    ItemInstance it(cases[k][0], cases[k][1], cases[k][2]);
    CompoundTag* t = it.save(new CompoundTag());
    VecOut w; NbtIo::write(t, &w);
    VecIn r(w.b); CompoundTag* t2 = NbtIo::read(&r);
    ItemInstance* l = ItemInstance::fromTag(t2);
    std::fprintf(o, "%s{\"id\":%d,\"count\":%d,\"aux\":%d,\"hex\":\"%s\",\"back\":", k ? "," : "", cases[k][0], cases[k][1], cases[k][2], hex(w.b).c_str());
    if (l) std::fprintf(o, "[%d,%d,%d]}", l->id, l->count, l->getAuxValue());
    else std::fprintf(o, "null}");
  }
  std::fprintf(o, "]}\n");
  std::fclose(o);
  return 0;
}
