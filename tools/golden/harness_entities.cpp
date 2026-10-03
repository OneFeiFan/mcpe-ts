// G14-6：实体文件 entities.dat（ExternalFileLevelStorage::saveEntities）。
//
// 【这是什么文件】saveEntities 把 level->entities 与 level->tileEntities 各序列化成一串
// CompoundTag，装进两个**平级**的 ListTag（"Entities" / "TileEntities"），整棵树过一遍
// NbtIo::write，最后套一个 12 字节的头写成平文件 —— **不是 RegionFile**（任务单原文写的
// "RegionFile 的第二个实例"是错的：那个 entitiesFile 字段 C++ 里从没被用过）。
//
//     "ENT\0"     4 字节（字面量其实是 5 字节，fwrite 的第三个参数把写入截到 4 个）
//     int32       version   ← 写死 1，读的时候只拿去打日志
//     int32       numBytes  ← 后面 NBT 的字节数
//     byte[]      NBT
//
// 【为什么这个样本必须来自参考实现】头里那两个 int 走的是 `fwrite(&x, sizeof(int), 1, fp)`
// —— 直接倒内存，不经过 BitStream 那套端序交换；而紧跟其后的 NBT 内部走的就是 BitStream。
// **同一个文件里有两套端序路径**（B2 的 bug 就是把这俩弄混了，v1 载荷因此一直错着）。
// 夹具记的是整个文件的十六进制，哪一套错都会当场露馅。
//
// 【两个用例】
//   empty：什么都没放 —— 两个 ListTag 都是空的。这是**新世界第一次存档**的真实形状，
//          值得单独钉住：空 ListTag 的 NBT 编码里元素类型是 0，很容易被"优化"掉。
//   full ：2 个掉落物（第 2 个 removed=true → Entity::save 返回 false，应当被丢掉）
//          + 1 个告示牌方块实体。
// 两个用例按时间顺序在**同一个 Level 上**跑：先存空的，再放东西存第二次。
//
// 【为什么每个字段都显式写一遍】ItemEntity 的构造函数里有四处 Mth::random()
// （bobOffs / yRot / xd / zd）。两边只要在构造前消耗随机数的次数不一样，这几个值就会不同 ——
// 而其中 yRot / xd / zd 是**会被序列化**的。所以下面把每个会进 NBT 的字段都显式设死，
// 把构造函数带出来的随机值全覆盖掉。bobOffs 不进 NBT，随它去。
// 唯一设不了的是 health：C++ 里是 private，两边都靠构造函数给成 5。
#include "raknet/RakNetTime.h" // ExternalFileLevelStorage.h 用了 RakNet::TimeMS 却没自己 include（老问题）

#include "SharedConstants.h"
#include "world/entity/MobCategory.h"
#include "world/entity/item/ItemEntity.h"
#include "world/item/Item.h"
#include "world/item/ItemInstance.h"
#include "world/level/Level.h"
#include "world/level/LevelConstants.h"
#include "world/level/LevelSettings.h"
#include "world/level/biome/Biome.h"
#include "world/level/chunk/ChunkSource.h"
#include "world/level/chunk/LevelChunk.h"
#include "world/level/dimension/Dimension.h"
#include "world/level/material/Material.h"
#include "world/level/storage/ExternalFileLevelStorage.h"
#include "world/level/storage/MemoryLevelStorage.h"
#include "world/level/tile/Tile.h"
#include "world/level/tile/entity/SignTileEntity.h"
#include "world/level/tile/entity/TileEntity.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <unistd.h>

/** 空世界的区块源：不生成地形（与 harness_chunk 同一套做法）。saveEntities 根本不碰区块，
 *  但 Level 的构造函数要一个 Dimension。 */
struct EmptySource : public ChunkSource {
    Level* level;
    std::map<long long, LevelChunk*> chunks;
    explicit EmptySource(Level* l) : level(l) {}
    bool hasChunk(int, int) override { return true; }
    LevelChunk* getChunk(int x, int z) override {
        long long key = ((long long)x << 32) ^ (unsigned int)z;
        std::map<long long, LevelChunk*>::iterator it = chunks.find(key);
        if (it != chunks.end()) return it->second;
        LevelChunk* c = new LevelChunk(level, x, z);
        chunks[key] = c;
        return c;
    }
    LevelChunk* create(int x, int z) override { return getChunk(x, z); }
    void postProcess(ChunkSource*, int, int) override {}
    bool tick() override { return false; }
    bool shouldSave() override { return false; }
    Biome::MobList getMobsAt(const MobCategory&, int, int, int) override { return Biome::MobList(); }
    std::string gatherStats() override { return ""; }
};

struct EmptyDimension : public Dimension {
    ChunkSource* createRandomLevelSource() override { return new EmptySource(level); }
};

/** C++ 的 MemoryLevelStorage 没实现纯虚的 loadPlayer/savePlayer，这里补上（与 harness_chunk 同） */
struct GoldenStorage : public MemoryLevelStorage {
    bool loadPlayer(Player&) override { return false; }
    void savePlayer(Player&) override {}
};

// ---------------------------------------------------------------------------
// 要存下去的东西。用显式表格给出，TS 那边照着同一张表重放 —— 免得"造输入"这一步两边就不一样。
// ---------------------------------------------------------------------------

struct EntSpec {
    const char* name;
    float x, y, z;
    float xd, yd, zd;
    float yRot, xRot;
    float fallDistance;
    int onFire, airSupply, onGround;
    int age;
    int itemId, itemCount, itemAux;
    /** 1 → removed=true，Entity::save 返回 false，这一条不进 Entities（走 else 分支） */
    int removed;
};

struct TeSpec {
    const char* name;
    int x, y, z;
    const char* text[4];
};

static const EntSpec ENT_SPECS[] = {
    // name            x      y      z     xd     yd      zd     yRot    xRot  fall   fire air ground age itemId cnt aux removed
    {"stone",        10.5f, 64.0f, 20.25f, 0.5f, -0.25f, 0.125f,  90.0f, -12.5f, 1.5f,  40, 300, 0,  42,     1,  3,  0,      0},
    {"gone-planks",  33.0f, 70.0f,  5.0f, 0.25f,  0.0f, -0.5f,  -45.0f, 33.25f, 0.0f,   0, 299, 1,   7,     5,  1,  0,      1},
};

// const char* text[4] 是数组，可以整块用花括号初始化
static const TeSpec TE_SPECS[] = {
    {"sign", 7, 65, 9, {"Hello", "MCPE", "line3", "line4"}},
};

// ---------------------------------------------------------------------------
// 造对象
// ---------------------------------------------------------------------------

static ItemEntity* buildItemEntity(Level* level, const EntSpec& s) {
    ItemEntity* e = new ItemEntity(level);
    e->item = ItemInstance(s.itemId, s.itemCount, s.itemAux);
    e->age = s.age;
    e->setPos(s.x, s.y, s.z);
    e->xd = s.xd;
    e->yd = s.yd;
    e->zd = s.zd;
    e->yRot = s.yRot;
    e->xRot = s.xRot;
    e->fallDistance = s.fallDistance;
    e->onFire = s.onFire;
    e->airSupply = s.airSupply;
    e->onGround = (s.onGround != 0);
    e->removed = (s.removed != 0);
    return e;
}

static SignTileEntity* buildSign(const TeSpec& s) {
    SignTileEntity* e = new SignTileEntity();
    e->x = s.x;
    e->y = s.y;
    e->z = s.z;
    for (int i = 0; i < SignTileEntity::NUM_LINES; i++) e->messages[i] = s.text[i];
    return e;
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

static void emitEntSpecs(FILE* o) {
    fprintf(o, "[");
    for (size_t i = 0; i < sizeof(ENT_SPECS) / sizeof(ENT_SPECS[0]); i++) {
        const EntSpec& s = ENT_SPECS[i];
        fprintf(o,
                "%s{\"name\":\"%s\",\"pos\":[%g,%g,%g],\"motion\":[%g,%g,%g],"
                "\"rot\":[%g,%g],\"fallDistance\":%g,\"onFire\":%d,\"airSupply\":%d,"
                "\"onGround\":%d,\"age\":%d,\"item\":[%d,%d,%d],\"removed\":%d}",
                i ? "," : "", s.name, s.x, s.y, s.z, s.xd, s.yd, s.zd, s.yRot, s.xRot,
                s.fallDistance, s.onFire, s.airSupply, s.onGround, s.age, s.itemId, s.itemCount,
                s.itemAux, s.removed);
    }
    fprintf(o, "]");
}

static void emitTeSpecs(FILE* o) {
    fprintf(o, "[");
    for (size_t i = 0; i < sizeof(TE_SPECS) / sizeof(TE_SPECS[0]); i++) {
        const TeSpec& s = TE_SPECS[i];
        fprintf(o, "%s{\"name\":\"%s\",\"pos\":[%d,%d,%d],\"text\":[\"%s\",\"%s\",\"%s\",\"%s\"]}",
                i ? "," : "", s.name, s.x, s.y, s.z, s.text[0], s.text[1], s.text[2], s.text[3]);
    }
    fprintf(o, "]");
}

/** 把一个目录下的 entities.dat 整个读出来，打成十六进制。顺带把头部三个字段单独报一遍 ——
 *  这样夹具本身就把"numBytes 是 NBT 的长度，不是文件长度"这件事写明白了。 */
static void emitFile(FILE* o, const std::string& dir, const char* name) {
    std::string path = dir + "/entities.dat";
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) {
        fprintf(stderr, "打不开 %s\n", path.c_str());
        exit(1);
    }
    static unsigned char buf[1 << 20];
    size_t n = fread(buf, 1, sizeof(buf), f);
    fclose(f);

    int version = 0, numBytes = 0;
    if (n >= 12) {
        memcpy(&version, buf + 4, 4);
        memcpy(&numBytes, buf + 8, 4);
    }
    fprintf(o, "    {\"name\": \"%s\", \"numBytes\": %d, \"version\": %d, \"bytesLen\": %d, \"bytesHex\": \"",
            name, numBytes, version, (int)n);
    for (size_t i = 0; i < n; i++) fprintf(o, "%02x", buf[i]);
    fprintf(o, "\"}");
}

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "用法: %s <输出json>\n", argv[0]);
        return 1;
    }
    std::string out = argv[1];
    std::string base = "/tmp/ent_golden_" + std::to_string((long)getpid());
    std::string dirEmpty = base + "/empty";
    std::string dirFull = base + "/full";
    if (system(("mkdir -p " + dirEmpty + " " + dirFull).c_str()) != 0) {
        fprintf(stderr, "建目录失败\n");
        return 1;
    }

    Material::initMaterials();
    MobCategory::initMobCategories();
    Tile::initTiles();
    Item::initItems();
    Biome::initBiomes();
    // SignTileEntity::save 转调 TileEntity::save，那里要查 classIdMap —— 不初始化的话
    // 它会打一句 "missing a mapping" 然后返回 false，整个方块实体都被悄悄丢掉
    TileEntity::initTileEntities();
    LevelChunk::ChunkBlockCount = LevelConstants::CHUNK_BLOCK_COUNT;

    Level* level = new Level(new GoldenStorage(), "golden",
                             LevelSettings(12345, GameType::Creative),
                             SharedConstants::GeneratorVersion, new EmptyDimension());

    // ---- 用例 1：空世界 ----
    // 【为什么要两个目录】saveEntities 写死的文件名是 entities.dat，两次存同一个目录会覆盖。
    // 两个目录各存一次，读的时候才是两份不同的东西。
    {
        ExternalFileLevelStorage st("w1", dirEmpty);
        st.saveEntities(level, NULL);
    }
    // C++ 的 saveEntities 用 fwrite 写，不析构就还在缓冲区里。上面那个 st 已经出作用域、
    // 文件落了盘，现在才轮到读它。

    // ---- 用例 2：放东西进去，再存一次 ----
    for (size_t i = 0; i < sizeof(ENT_SPECS) / sizeof(ENT_SPECS[0]); i++)
        level->entities.push_back(buildItemEntity(level, ENT_SPECS[i]));
    for (size_t i = 0; i < sizeof(TE_SPECS) / sizeof(TE_SPECS[0]); i++)
        level->tileEntities.push_back(buildSign(TE_SPECS[i]));

    {
        ExternalFileLevelStorage st("w2", dirFull);
        st.saveEntities(level, NULL);
    }

    FILE* o = fopen(out.c_str(), "w");
    if (!o) {
        fprintf(stderr, "打不开输出文件\n");
        return 1;
    }

    fprintf(o, "{\n  \"magicHex\": \"454e5400\",\n");
    fprintf(o, "  \"version\": 1,\n");
    fprintf(o, "  \"input\": {\"entities\": ");
    emitEntSpecs(o);
    fprintf(o, ",\n            \"tileEntities\": ");
    emitTeSpecs(o);
    fprintf(o, "},\n");
    fprintf(o, "  \"cases\": [\n");
    emitFile(o, dirEmpty, "empty");
    fprintf(o, ",\n");
    emitFile(o, dirFull, "full");
    fprintf(o, "\n  ]\n}\n");

    fclose(o);
    printf("已写出 %s\n", out.c_str());
    return 0;
}
