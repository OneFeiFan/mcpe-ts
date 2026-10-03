// G14-2：level.dat 的文件格式与字节。
//
// 两条路都测：
//   storageVersion == 1 → writeLevelData 走 v1_write 的裸字节
//   其它（默认 3）      → 走 LevelData::createTag() + NbtIo::write
//
// 与 G14-1 不同，这里**用真实的 RakNet::BitStream**（B2 的时候量过，raknet/BitStream.cpp 和
// RakString.cpp 在本机 WSL 上能干净编译）。NBT 载荷的字节就是这个位流写出来的，用替身就没意义了。
//
// 【时间戳怎么处理】setTagData 里的 LastPlayed 和 v1_write 里的第 7 项都写 getEpochTimeS()，
// 是**实时时钟**，两次运行不可能一样。所以：
//   - harness 自己在产物里把时间戳那几个字节**清零**再输出
//   - TS 测试用夹具里记下的偏移量做同样的清零
//   这样比对的是"除时间戳外的全部字节"，而那种"两边布局错位"的问题照样会被抓出来
//   （偏移量对不上，后面所有字节就全对不上了）。
// 【为什么不把读到的时钟值也写进夹具】那样这个夹具每次重新生成都必产生一行 diff，
//   其它 14 个夹具都是完全可复现的，"重生成后应当一字节未变"那条验证对它就失效了。
// ExternalFileLevelStorage.h 里用了 RakNet::TimeMS，但它自己没 include 那个头
// （平时是靠别的头间接带进来的）。这里先把它带进来。
#include "raknet/RakNetTime.h"

#include "world/level/storage/ExternalFileLevelStorage.h"
#include "world/level/storage/LevelData.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <unistd.h>
#include <vector>

// ---- 读取整个文件 ----
static bool readFile(const std::string& path, std::vector<unsigned char>& out) {
    FILE* f = fopen(path.c_str(), "rb");
    if (!f) return false;
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    out.resize((size_t)n);
    if (n > 0 && fread(out.data(), 1, (size_t)n, f) != (size_t)n) {
        fclose(f);
        return false;
    }
    fclose(f);
    return true;
}

static void printHex(FILE* o, const std::vector<unsigned char>& v) {
    for (size_t i = 0; i < v.size(); i++) fprintf(o, "%02x", v[i]);
}

/**
 * 把时间戳的 len 个字节清零，返回其偏移；找不到返回 -1。
 *
 * 【为什么两种字节序都找】参考实现里两条路的字节序不一样（详见 B2 的 BitStream 文件头）：
 *   - v1 路径走模板 `Write<int>` → 端序交换开着 → **大端**
 *   - NBT 路径走 RakDataOutput::writeBytes → WriteBits → 原样 → 小端
 * 所以两个方向都试一遍。反正这是个只在测试装置里用的搜索，宽一点没坏处。
 */
static int zeroTimestamp(std::vector<unsigned char>& buf, unsigned int ts, int len) {
    for (size_t i = 0; i + (size_t)len <= buf.size(); i++) {
        unsigned long long le = 0, be = 0;
        for (int k = 0; k < len; k++) {
            le |= ((unsigned long long)buf[i + k]) << (8 * k);
            be = (be << 8) | (unsigned long long)buf[i + k];
        }
        if (le == (unsigned long long)ts || be == (unsigned long long)ts) {
            for (int k = 0; k < len; k++) buf[i + k] = 0;
            return (int)i;
        }
    }
    return -1;
}

struct Result {
    int version = 0;
    int size = 0;
    int tsOffset = -1;
    int tsLen = 0;
    std::vector<unsigned char> bytes;
};

/** 跑一次 writeLevelData 并把产物读回来（时间戳已清零） */
static Result runWrite(const std::string& dir, int storageVersion, unsigned int ts) {
    Result r;
    std::string path = dir + "/level.dat";

    LevelData ld;
    ld.setSeed(123456789L);
    ld.setSpawn(11, 22, 33);
    ld.setTime(987654321L);
    ld.setGameType(GameType::Creative);
    ld.setLevelName("GoldenWorld");
    ld.setSizeOnDisk(4096);
    ld.setAllowCheats(true);
    ld.setStorageVersion(storageVersion);

    if (!ExternalFileLevelStorage::writeLevelData(path, ld, NULL)) {
        fprintf(stderr, "writeLevelData 失败\n");
        exit(1);
    }
    if (!readFile(path, r.bytes)) {
        fprintf(stderr, "读回 level.dat 失败\n");
        exit(1);
    }

    memcpy(&r.version, r.bytes.data(), 4);
    memcpy(&r.size, r.bytes.data() + 4, 4);

    // v1 路径的时间戳是 int（4 字节），NBT 路径是 long（8 字节）
    r.tsLen = (storageVersion == 1) ? 4 : 8;
    r.tsOffset = zeroTimestamp(r.bytes, ts, r.tsLen);

    if (r.tsOffset < 0) {
        fprintf(stderr, "[debug] v%d 找不到时间戳 %u；文件前 64 字节：\n  ", storageVersion, ts);
        for (size_t i = 0; i < r.bytes.size() && i < 64; i++) fprintf(stderr, "%02x", r.bytes[i]);
        fprintf(stderr, "\n  期望的小端编码(前 4 字节): ");
        for (int k = 0; k < 4; k++) fprintf(stderr, "%02x", (ts >> (8 * k)) & 0xff);
        fprintf(stderr, "\n");
    }
    return r;
}

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "用法: %s <输出json>\n", argv[0]);
        return 1;
    }
    std::string out = argv[1];
    std::string basePath = "/tmp/ld_golden_" + std::to_string((long)getpid());
    if (system(("mkdir -p " + basePath).c_str()) != 0) {
        fprintf(stderr, "建目录失败\n");
        return 1;
    }

    // 取一个时间戳，多留一秒的余量：写文件期间时钟最多跳 1 秒
    unsigned int ts = (unsigned int)getEpochTimeS();

    Result v1 = runWrite(basePath, 1, ts);
    Result nbt = runWrite(basePath, 3, ts);

    // 用参考实现把它读回来，确认字段能从字节里还原
    LevelData back;
    bool readOk = ExternalFileLevelStorage::readLevelData(basePath, back);

    FILE* o = fopen(out.c_str(), "w");
    if (!o) {
        fprintf(stderr, "打不开输出文件\n");
        return 1;
    }
    fprintf(o, "{\n");
    fprintf(o, "  \"v1\": {\"version\": %d, \"size\": %d, \"tsOffset\": %d, \"tsLen\": %d, \"hex\": \"",
            v1.version, v1.size, v1.tsOffset, v1.tsLen);
    printHex(o, v1.bytes);
    fprintf(o, "\"},\n");
    fprintf(o, "  \"nbt\": {\"version\": %d, \"size\": %d, \"tsOffset\": %d, \"tsLen\": %d, \"hex\": \"",
            nbt.version, nbt.size, nbt.tsOffset, nbt.tsLen);
    printHex(o, nbt.bytes);
    fprintf(o, "\"},\n");
    fprintf(o, "  \"readBack\": {\"ok\": %d, \"seed\": %ld, \"xSpawn\": %d, \"ySpawn\": %d, \"zSpawn\": %d, "
               "\"time\": %ld, \"gameType\": %d, \"levelName\": \"%s\", \"sizeOnDisk\": %ld, "
               "\"storageVersion\": %d, \"allowCheats\": %d}\n",
            readOk ? 1 : 0, back.getSeed(), back.getXSpawn(), back.getYSpawn(), back.getZSpawn(),
            back.getTime(), back.getGameType(), back.getLevelName().c_str(), back.getSizeOnDisk(),
            back.getStorageVersion(), back.getAllowCheats() ? 1 : 0);
    fprintf(o, "}\n");
    fclose(o);

    if (system(("rm -rf " + basePath).c_str()) != 0) {
        fprintf(stderr, "清理失败\n");
    }
    return 0;
}
