// G14-3：player.dat 的裸结构体转储格式（ExternalFileLevelStorage::readPlayerData）。
//
// 【为什么单独一个样本】这个函数用
//     fread(&dest.playerData, 1, sizeof(dest.playerData), fp)
// 把结构体的**内存镜像**整个读进来 —— 字节布局完全由编译器的字段顺序与对齐填充决定。
// TS 没有结构体布局，只能按固定偏移逐字段解码，所以那些偏移必须由参考编译器**量出来**，
// 不能推算：推算错一个字节，后面所有字段就全错位，而错位的结果往往还是个"看着挺像"的
// 浮点数，不会自己暴露出来。所以这个 harness 的第一件事就是把
// sizeof(PlayerData) 与每个成员的 offsetof 打出来。
//
// 【这个文件谁写】本版本的 savePlayer 写的是 NBT（players/<名字>.dat），**不写 player.dat**——
// 也就是说 player.dat 是只读的遗留格式。harness 只能自己按结构体布局造一个文件喂给它。
//
// 【一个要原样保留的怪癖】fread 是**先把 sizeof 个字节写进结构体、再拿返回值去比 size**：
//     if (fread(&dest.playerData, 1, sizeof(dest.playerData), fp) != size) break;
// 所以文件头里的 size 与 sizeof 不一致时，结构体其实**已经被覆盖了**，
// 只是跳过了后面的 clamp 和 playerDataVersion 赋值（于是版本停在初值 -1）。
// `size-mismatch` 那个用例就是钉这一条 —— 别当成"没读到"。
//
// 【clamp 用的是哪一套】readPlayerData 用的是**自己的**一套（x/z 夹到 [0.5, LEVEL_?-0.5]，
// y<0 时给 64），跟 PlayerData.h 里 loadPlayer 用的 clampXZ/clampY/clampRot 不是一回事。
// 后者属于 loadPlayer，本函数完全不碰。
// ExternalFileLevelStorage.h 里用了 RakNet::TimeMS，但它自己没 include 那个头
// （平时是靠别的头间接带进来的）。这里先把它带进来 —— 与 harness_leveldata.cpp 同样处理。
#include "raknet/RakNetTime.h"

#include "world/level/storage/ExternalFileLevelStorage.h"
#include "world/level/storage/LevelData.h"
#include "world/level/storage/PlayerData.h"
#include "world/level/LevelConstants.h"

#include <cstddef>
#include <cstdio>
#include <cstring>
#include <string>
#include <unistd.h>
#include <vector>

struct Ctx {
    std::string dir;
    std::string path;      // player.dat 的完整路径
    int version = 1;
    int size = 0;          // 写进文件头的 size 字段
    std::vector<unsigned char> payload;  // 结构体的内存镜像；长度可以小于 sizeof，用来造截断
    bool skipWrite = false;              // 造"文件不存在"的用例
};

/**
 * 把 PlayerData 的每个字段显式清 0。
 *
 * 【为什么必须这么做】PlayerData 的 xRot / yRot / fallDistance / onFire / airSupply /
 * inventorySlots 都**没有初值**，所以一个默认构造的 PlayerData 里它们是未初始化内存。
 * 正常用例会被 fread 整个覆盖掉，看不出来；但 version-2（根本不读）和 truncated（只读一半）
 * 这两个用例会把没写到的字段原样留下 —— 那就是随机的，夹具每次生成都不一样，
 * "重新生成后应当一字节未变"这条验证会失效（registry 当初的 MALLOC_PERTURB_ 是同一类问题）。
 *
 * 先清零之后，这几个用例记录的就不再是"复刻未定义内存"，而是**确定的**"这条路径不写这些字段"。
 * 这也符合 PITFALLS 第 20 条：UB 不复刻，只复刻确定的行为。
 */
static void zeroPlayerData(PlayerData& pd) {
    pd.pos.set(0, 0, 0);
    pd.motion.set(0, 0, 0);
    pd.xRot = 0;
    pd.yRot = 0;
    pd.fallDistance = 0;
    pd.onFire = 0;
    pd.airSupply = 0;
    pd.onGround = false;
    for (int i = 0; i < Inventory::MAX_SELECTION_SIZE; i++) pd.inventorySlots[i] = 0;
}

/** 按 Ctx 造一个 player.dat 出来 */
static void writeFile(const Ctx& c) {
    if (c.skipWrite) return;
    FILE* f = fopen(c.path.c_str(), "wb");
    if (!f) {
        fprintf(stderr, "造不出 %s\n", c.path.c_str());
        exit(1);
    }
    fwrite(&c.version, 4, 1, f);
    fwrite(&c.size, 4, 1, f);
    if (!c.payload.empty()) fwrite(c.payload.data(), 1, c.payload.size(), f);
    fclose(f);
}

static void hexTo(FILE* o, const std::vector<unsigned char>& v) {
    for (size_t i = 0; i < v.size(); i++) fprintf(o, "%02x", v[i]);
}

/** 把 PlayerData 的内存镜像拷出来 */
static std::vector<unsigned char> imageOf(const PlayerData& pd) {
    std::vector<unsigned char> v(sizeof(PlayerData));
    memcpy(v.data(), &pd, sizeof(PlayerData));
    return v;
}

/** 把读回来的 PlayerData 各字段打出来 */
static void emitFields(FILE* o, const PlayerData& pd) {
    fprintf(o, "{\"pos\":[%.9g,%.9g,%.9g],\"motion\":[%.9g,%.9g,%.9g],"
               "\"xRot\":%.9g,\"yRot\":%.9g,\"fallDistance\":%.9g,"
               "\"onFire\":%d,\"airSupply\":%d,\"onGround\":%d,\"inventorySlots\":[",
            pd.pos.x, pd.pos.y, pd.pos.z, pd.motion.x, pd.motion.y, pd.motion.z,
            pd.xRot, pd.yRot, pd.fallDistance, (int)pd.onFire, (int)pd.airSupply,
            pd.onGround ? 1 : 0);
    for (int i = 0; i < Inventory::MAX_SELECTION_SIZE; i++) {
        fprintf(o, "%s%d", i ? "," : "", pd.inventorySlots[i]);
    }
    fprintf(o, "]}");
}

/** 跑一个用例：造文件 → 调参考实现 → 把结果打出来 */
static void runCase(FILE* o, const char* name, const Ctx& c, bool first) {
    writeFile(c);

    LevelData dest;                  // 每次都从干净的对象开始（playerDataVersion 初值 -1）
    zeroPlayerData(dest.playerData); // 未初始化字段先清 0，理由见 zeroPlayerData 上方注释
    bool ret = ExternalFileLevelStorage::readPlayerData(c.path, dest);

    fprintf(o, "%s{\"name\":\"%s\",\"header\":{\"version\":%d,\"size\":%d},"
               "\"payloadLen\":%d,\"bytes\":\"",
            first ? "" : ",", name, c.version, c.size, (int)c.payload.size());
    hexTo(o, c.payload);
    fprintf(o, "\",\"ret\":%d,\"version\":%d,\"got\":", ret ? 1 : 0, dest.playerDataVersion);
    emitFields(o, dest.playerData);
    fprintf(o, "}");
}

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "用法: %s <输出json>\n", argv[0]);
        return 1;
    }
    std::string out = argv[1];
    std::string dir = "/tmp/pd_golden_" + std::to_string((long)getpid());
    if (system(("mkdir -p " + dir).c_str()) != 0) {
        fprintf(stderr, "建目录失败\n");
        return 1;
    }

    // ---- 量布局 ----
    // 这些偏移就是 TS 那边要硬编码的数字。别推算，以这里量出来的为准。
    PlayerData probe;
    Ctx base;
    base.dir = dir;
    base.path = dir + "/player.dat";
    base.size = (int)sizeof(PlayerData);

    // 各字段放互不相同的值：TS 若把某个字段读错位置，值就对不上，不会碰巧蒙对。
    //
    // 【为什么要先 memset】imageOf() 是把整个结构体（**含对齐填充**）memcpy 进夹具的，
    // 而 PlayerData 里 onGround(bool) 之后有 3 字节填充（下一个成员 int 要 4 字节对齐）——
    // 那几个字节本身没有初值，于是夹具每次生成都不一样。这个坑是"连跑两次比对产物"
    // 抓出来的（第一次 1f0000、第二次 000000）。memset 把填充一起清 0 就确定了。
    // 填充的具体内容对 TS 没有意义：TS 只按偏移读命名字段。
    PlayerData normal;
    memset(&normal, 0, sizeof(normal));
    normal.pos.x = 10.5f; normal.pos.y = 70.25f; normal.pos.z = 20.75f;
    normal.motion.x = 0.5f; normal.motion.y = -0.25f; normal.motion.z = 0.125f;
    normal.xRot = 45.5f; normal.yRot = -30.25f;
    normal.fallDistance = 3.5f;
    // onFire / airSupply 取负值：这两个是 `short`，只有负值才能证明 TS 那边读的是**有符号**的
    // （读成无符号时 2 和 300 一样能过，-2 就会露馅）
    normal.onFire = -2; normal.airSupply = -300; normal.onGround = true;
    const int slots[Inventory::MAX_SELECTION_SIZE] = {101, -202, 303, -404, 505, -606, 707, -808, 909};
    for (int i = 0; i < Inventory::MAX_SELECTION_SIZE; i++) normal.inventorySlots[i] = slots[i];

    // 越界值：x/z 该被夹到 [0.5, LEVEL_?-0.5]，y 为负该变成 64
    PlayerData outOfRange;
    memset(&outOfRange, 0, sizeof(outOfRange)); // 同上：连填充一起清 0
    outOfRange.pos.x = -5.0f; outOfRange.pos.y = -10.0f; outOfRange.pos.z = 999.0f;
    outOfRange.motion.x = 1.5f;

    PlayerData normalImg = normal, rangeImg = outOfRange;

    FILE* o = fopen(out.c_str(), "w");
    if (!o) {
        fprintf(stderr, "打不开输出文件\n");
        return 1;
    }

    fprintf(o, "{\n  \"layout\": {\"sizeof\": %d, \"maxSelectionSize\": %d, "
               "\"levelWidth\": %d, \"levelDepth\": %d, "
               "\"pos\": %d, \"motion\": %d, \"xRot\": %d, \"yRot\": %d, "
               "\"fallDistance\": %d, \"onFire\": %d, \"airSupply\": %d, "
               "\"onGround\": %d, \"inventorySlots\": %d},\n",
            (int)sizeof(PlayerData), Inventory::MAX_SELECTION_SIZE,
            LevelConstants::LEVEL_WIDTH, LevelConstants::LEVEL_DEPTH,
            (int)offsetof(PlayerData, pos), (int)offsetof(PlayerData, motion),
            (int)offsetof(PlayerData, xRot), (int)offsetof(PlayerData, yRot),
            (int)offsetof(PlayerData, fallDistance), (int)offsetof(PlayerData, onFire),
            (int)offsetof(PlayerData, airSupply), (int)offsetof(PlayerData, onGround),
            (int)offsetof(PlayerData, inventorySlots));

    fprintf(o, "  \"cases\": [");

    // 1) 正常值：原样读回
    Ctx c1 = base; c1.payload = imageOf(normalImg);
    runCase(o, "normal", c1, true);

    // 2) 越界值：被 readPlayerData 自己的 clamp 修过
    Ctx c2 = base; c2.payload = imageOf(rangeImg);
    runCase(o, "out-of-range", c2, false);

    // 3) size 与 sizeof 不一致：结构体**已经被覆盖**，但跳过 clamp 与版本赋值
    Ctx c3 = base; c3.size = (int)sizeof(PlayerData) + 4; c3.payload = imageOf(rangeImg);
    runCase(o, "size-mismatch", c3, false);

    // 4) 版本不是 1：完全不读
    Ctx c4 = base; c4.version = 2; c4.payload = imageOf(normalImg);
    runCase(o, "version-2", c4, false);

    // 5) 载荷被截断：fread 读不满，返回值不等于 size
    Ctx c5 = base; c5.payload.resize(sizeof(PlayerData) - 8); memcpy(c5.payload.data(), &normalImg, c5.payload.size());
    runCase(o, "truncated", c5, false);

    // 6) 文件不存在：这个用例**不能**先把文件造出来，否则根本没测到 fopen 失败那条路
    Ctx c6 = base; c6.path = dir + "/nope.dat"; c6.skipWrite = true;
    runCase(o, "missing", c6, false);

    fprintf(o, "]\n}\n");
    fclose(o);

    if (system(("rm -rf " + dir).c_str()) != 0) {
        fprintf(stderr, "清理失败\n");
    }
    return 0;
}
