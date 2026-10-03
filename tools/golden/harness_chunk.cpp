// G14-5：区块存进 chunks.dat 的载荷格式（ExternalFileLevelStorage::save / load）。
//
// 【记什么】save 把五个数组首尾相接写进去，**没有长度前缀也没有版本号**：
//     CHUNK_BLOCK_COUNT    方块 id
//     CHUNK_BLOCK_COUNT/2  数据层
//     CHUNK_BLOCK_COUNT/2  天空光
//     CHUNK_BLOCK_COUNT/2  方块光
//     CHUNK_COLUMNS        updateMap
// 所以夹具记的是 RegionFile::readChunk 读回来的**那一段载荷**的十六进制。
// 容器本身（4096 字节头、扇区分配）已经由 G14-1 逐字节钉过，这里不重复。
//
// 【为什么载荷的字节必须来自参考实现】save 和 load 是同一份代码里的两个函数 ——
// 万一两边都把顺序写错了，**它们自己是一致的**（往返测试照样通过）。只有拿参考实现产出的
// 字节去比才能发现。这正是这个样本存在的理由。
//
// 【两个用例的差别只在 load】save 不看 loadedStorageVersion，两个目录存出来的载荷一模一样，
// 所以只记一份。差别在读回来的那一刻：
//   - current：目录里没有 level.dat → 构造函数的 loadedStorageVersion 保持 SharedConstants::StorageVersion
//   - legacy ：先放一份 storageVersion=1 的 level.dat → 构造函数把它读成 1
// 后者在读的时候会多跑 v1_ClothIdToClothData（把 101..115 的老羊毛换成"羊毛方块 + 颜色数据"）。
//
// 【一个要原样保留的坑】load 里那两行是这么写的：
//     if (loadedStorageVersion == 1)
//       changed |= LevelConverters::v1_ClothIdToClothData(levelChunk);
//       changed |= LevelConverters::ReplaceUnavailableBlocks(levelChunk);
// 没有花括号 —— if 只管第一条语句，所以 **ReplaceUnavailableBlocks 每次都跑**。
// 为了让这一条可观测，区块里特意埋了注册表里不存在的 id（200、250）。注意老羊毛 id
// （101..115）本身也没注册，所以在 current 用例里它们同样会被 ReplaceUnavailableBlocks 换成
// info_updateGame2，只是**换成的不是羊毛** —— 两个用例的差异正好落在这一点上。
#include "raknet/RakNetTime.h" // ExternalFileLevelStorage.h 用了 RakNet::TimeMS 却没自己 include（老问题）

#include "SharedConstants.h"
#include "world/level/material/Material.h"
#include "world/level/tile/Tile.h"
#include "world/item/Item.h"
#include "world/entity/MobCategory.h"
#include "world/level/biome/Biome.h"
#include "world/level/tile/entity/TileEntity.h"
#include "world/level/Level.h"
#include "world/level/LevelSettings.h"
#include "world/level/LevelConstants.h"
#include "world/level/chunk/ChunkSource.h"
#include "world/level/chunk/LevelChunk.h"
#include "world/level/dimension/Dimension.h"
#include "world/level/storage/ExternalFileLevelStorage.h"
#include "world/level/storage/LevelData.h"
#include "world/level/storage/MemoryLevelStorage.h"
#include "world/level/storage/RegionFile.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <unistd.h>

static const int CX = 3, CZ = 5;

/** 空世界的区块源：不生成地形（与 harness_collision 同一套做法） */
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

/** C++ 的 MemoryLevelStorage 没实现纯虚的 loadPlayer/savePlayer，这里补上（与 harness_collision 同） */
struct GoldenStorage : public MemoryLevelStorage {
    bool loadPlayer(Player&) override { return false; }
    void savePlayer(Player&) override {}
};

// ---- 要写进区块的内容 ----
// 用 (下标, 值) 列表给出，TS 那边照着同一张表重放 —— 免得"造输入"这一步两边就不一样。
struct Op { int index; int value; };

// 方块：0 是空气。1/3/2 是注册过的（石头、泥土、草）。
// 下标必须 < CHUNK_BLOCK_COUNT（=32768）—— 这里踩过：一开始写成了 50000/60000，越界写到
// 了堆上的别的内存，读回来是垃圾值，看着像"转换器把 id 换成了 240 / 255"。现在下面有 checkOps 兜着。
// 200/250 没注册 → ReplaceUnavailableBlocks 会换掉。
// 101/115 是老羊毛 id，本身也没注册 → current 里被 ReplaceUnavailableBlocks 换掉；
// legacy 里先被 v1_ClothIdToClothData 换成羊毛(35)+颜色数据，于是 ReplaceUnavailableBlocks 就认它了。
static const Op BLOCK_OPS[] = {
    {0, 1}, {1, 3}, {2, 2}, {1000, 1}, {32767, 3},
    {100, 200}, {101, 250},
    {200, 101}, {201, 115},
};
static const Op DATA_OPS[]      = {{0, 1}, {5, 15}, {8191, 7}, {16383, 9}};
static const Op SKY_OPS[]       = {{0, 15}, {4096, 8}, {16383, 3}};
static const Op BLKLIGHT_OPS[]  = {{0, 0}, {77, 12}, {16383, 4}};
static const Op UPDATE_OPS[]    = {{0, 255}, {17, 3}, {255, 128}};

template <size_t N, typename F>
static void applyOps(const Op (&ops)[N], F f) {
    for (size_t i = 0; i < N; i++) f(ops[i].index, ops[i].value);
}

/**
 * 下标越界就当场报错退出。
 * 不检查的话会静默写到别的内存上 —— 表现是"读回来的值莫名其妙"，很难往越界上想。
 */
template <size_t N>
static void checkOps(const char* what, const Op (&ops)[N], int limit) {
    for (size_t i = 0; i < N; i++) {
        if (ops[i].index < 0 || ops[i].index >= limit) {
            fprintf(stderr, "%s 的下标 %d 越界（上限 %d）\n", what, ops[i].index, limit);
            exit(1);
        }
    }
}

template <size_t N>
static void emitOps(FILE* o, const Op (&ops)[N]) {
    for (size_t i = 0; i < N; i++) fprintf(o, "%s[%d,%d]", i ? "," : "", ops[i].index, ops[i].value);
}

/** 按上面的表造一个区块出来（五个数组都填） */
static LevelChunk* buildChunk(Level* level) {
    unsigned char* blocks = new unsigned char[LevelConstants::CHUNK_BLOCK_COUNT];
    memset(blocks, 0, LevelConstants::CHUNK_BLOCK_COUNT);
    applyOps(BLOCK_OPS, [&](int i, int v) { blocks[i] = (unsigned char)v; });

    LevelChunk* c = new LevelChunk(level, blocks, CX, CZ);
    applyOps(DATA_OPS, [&](int i, int v) { c->data.set(i, v); });
    applyOps(SKY_OPS, [&](int i, int v) { c->skyLight.set(i, v); });
    applyOps(BLKLIGHT_OPS, [&](int i, int v) { c->blockLight.set(i, v); });
    applyOps(UPDATE_OPS, [&](int i, int v) { c->updateMap[i] = (unsigned char)v; });
    return c;
}

/**
 * 跑一次 load，把结果打出来。
 *
 * 方块不记整个 32768 字节的数组，只记**埋进去的那几个位置**读回来是什么（`blockOps` 里
 * `[下标, 写进去的值, 读回来的值]`）：转换器只会动那几处，这样既小又直接 ——
 * 一眼能看出哪个 id 被换成了什么、哪个没被换。
 */
static void emitLoaded(FILE* o, Level* level, ExternalFileLevelStorage& storage) {
    LevelChunk* got = storage.load(level, CX, CZ);
    if (!got) {
        fprintf(o, "null");
        return;
    }
    fprintf(o, "{\"unsaved\":%d,\"terrainPopulated\":%d,\"createdFromSave\":%d,\"blockOps\":[",
            got->unsaved ? 1 : 0, got->terrainPopulated ? 1 : 0, got->createdFromSave ? 1 : 0);
    unsigned char* blocks = got->getBlockData();
    bool first = true;
    for (size_t k = 0; k < sizeof(BLOCK_OPS) / sizeof(BLOCK_OPS[0]); k++) {
        int i = BLOCK_OPS[k].index;
        fprintf(o, "%s[%d,%d,%d]", first ? "" : ",", i, BLOCK_OPS[k].value, (int)blocks[i]);
        first = false;
    }
    fprintf(o, "]}");
}

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "用法: %s <输出json>\n", argv[0]);
        return 1;
    }
    std::string out = argv[1];
    std::string base = "/tmp/chk_golden_" + std::to_string((long)getpid());
    std::string dirCur = base + "/cur";
    std::string dirLeg = base + "/leg";
    if (system(("mkdir -p " + dirCur + " " + dirLeg).c_str()) != 0) {
        fprintf(stderr, "建目录失败\n");
        return 1;
    }

    checkOps("block", BLOCK_OPS, LevelConstants::CHUNK_BLOCK_COUNT);
    checkOps("data", DATA_OPS, LevelConstants::CHUNK_BLOCK_COUNT / 2);
    checkOps("sky", SKY_OPS, LevelConstants::CHUNK_BLOCK_COUNT / 2);
    checkOps("blockLight", BLKLIGHT_OPS, LevelConstants::CHUNK_BLOCK_COUNT / 2);
    checkOps("update", UPDATE_OPS, LevelConstants::CHUNK_COLUMNS);

    Material::initMaterials();
    MobCategory::initMobCategories();
    Tile::initTiles();
    Item::initItems();
    Biome::initBiomes();
    TileEntity::initTileEntities();
    LevelChunk::ChunkBlockCount = LevelConstants::CHUNK_BLOCK_COUNT;

    Level* level = new Level(new GoldenStorage(), "golden",
                             LevelSettings(12345, GameType::Creative),
                             SharedConstants::GeneratorVersion, new EmptyDimension());

    // legacy 目录先放一份 storageVersion=1 的 level.dat，构造函数会据此把 loadedStorageVersion 读成 1
    {
        LevelData ld;
        ld.setSeed(1);
        ld.setStorageVersion(1);
        if (!ExternalFileLevelStorage::writeLevelData(dirLeg + "/level.dat", ld, NULL)) {
            fprintf(stderr, "写 legacy 的 level.dat 失败\n");
            return 1;
        }
    }

    LevelChunk* chunk = buildChunk(level);
    {
        // 【为什么套一层作用域】写的时候用的是一个 ExternalFileLevelStorage，它内部的 RegionFile
        // 走的是 stdio —— 不析构就还在缓冲区里没落盘。下面要另起一个 RegionFile 把载荷读出来，
        // 读到同一个文件时会拿到"空"的头（第一次就是这么失败的）。析构会 delete regionFile →
        // fclose → 落盘，所以先让它出作用域。
        ExternalFileLevelStorage w1("w1", dirCur);
        w1.save(level, chunk);
        ExternalFileLevelStorage w2("w2", dirLeg);
        w2.save(level, chunk); // save 不看版本，两个目录存出来的一样
    }

    // ---- 把载荷读出来（另起一个 RegionFile，不动 storage 自己的那个）----
    RegionFile rf(dirCur);
    if (!rf.open()) {
        fprintf(stderr, "读回用的 RegionFile 打不开\n");
        return 1;
    }
    RakNet::BitStream* back = NULL;
    if (!rf.readChunk(CX, CZ, &back)) {
        fprintf(stderr, "readChunk 失败\n");
        return 1;
    }

    FILE* o = fopen(out.c_str(), "w");
    if (!o) {
        fprintf(stderr, "打不开输出文件\n");
        return 1;
    }

    fprintf(o, "{\n  \"constants\": {\"chunkBlockCount\": %d, \"chunkColumns\": %d, \"x\": %d, \"z\": %d},\n",
            LevelConstants::CHUNK_BLOCK_COUNT, LevelConstants::CHUNK_COLUMNS, CX, CZ);

    fprintf(o, "  \"ops\": {\"block\":[");
    emitOps(o, BLOCK_OPS);
    fprintf(o, "],\"data\":[");
    emitOps(o, DATA_OPS);
    fprintf(o, "],\"sky\":[");
    emitOps(o, SKY_OPS);
    fprintf(o, "],\"blockLight\":[");
    emitOps(o, BLKLIGHT_OPS);
    fprintf(o, "],\"update\":[");
    emitOps(o, UPDATE_OPS);
    fprintf(o, "]},\n");

    const unsigned char* p = (const unsigned char*)back->GetData();
    fprintf(o, "  \"payloadLen\": %d,\n  \"payloadHex\": \"", (int)back->GetNumberOfBytesUsed());
    for (int i = 0; i < (int)back->GetNumberOfBytesUsed(); i++) fprintf(o, "%02x", p[i]);
    fprintf(o, "\",\n");

    // 载荷的所有权是交给调用方的（C++ 那头 load 里也是这么 delete 的）
    delete[] back->GetData();
    delete back;
    // rf 自己不 close（RegionFile::close 是私有的）—— 析构时会关，跟参考实现的用法一致

    // 读的时候各用一个新的实例：它们会自己打开已经落盘的 chunks.dat，
    // loadedStorageVersion 也照构造函数的规矩来（cur 目录没有 level.dat，leg 目录有）
    ExternalFileLevelStorage cur("w1r", dirCur);
    ExternalFileLevelStorage leg("w2r", dirLeg);

    fprintf(o, "  \"cases\": [\n");
    fprintf(o, "    {\"name\": \"current\", \"loaded\": ");
    emitLoaded(o, level, cur);
    fprintf(o, "},\n    {\"name\": \"legacy\", \"loaded\": ");
    emitLoaded(o, level, leg);
    fprintf(o, "}\n  ]\n}\n");
    fclose(o);

    if (system(("rm -rf " + base).c_str()) != 0) {
        fprintf(stderr, "清理失败\n");
    }
    return 0;
}
