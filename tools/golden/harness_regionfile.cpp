// G14-1：RegionFile 写出的 chunks.dat 字节。
//
// 做法：照 build.sh 里 BiomeSource 那一段的先例 —— **只换两个头文件**，RegionFile.h/.cpp 用参考源码原样编译：
//   - raknet/BitStream.h → 替身。RegionFile 只用到 BitStream 的构造(data,length,false)、GetData()、
//     GetNumberOfBytesUsed() 三个成员，而整个 RakNet 会拖进网络头文件。替身的语义与 RakNet 一致
//     （借用外部缓冲区、不拷贝、GetData 返回缓冲区首址）。BitStream 本身的字节序另有 B2 的单元测试与
//     源码依据（WriteBits 的 memcpy 分支），不在这里重复验证。
//   - platform/log.h → 替身，把 LOGI 变成空操作。RegionFile 只拿它打诊断日志。
//
// 场景覆盖：新建文件、追加扇区、等长原地覆写、变长后重新分配扇区、写第二个区块。
// 输出：整个文件的十六进制，以及几次读回的内容。
#include "world/level/storage/RegionFile.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <unistd.h> // getpid
#include <vector>

// ---- 固定内容的构造 ----

static std::vector<unsigned char> makeChunk(int len, int seed) {
    std::vector<unsigned char> v(len);
    for (int i = 0; i < len; i++) v[i] = (unsigned char)((i * seed + seed * 7 + 11) & 0xff);
    return v;
}

static void printHex(FILE* o, const unsigned char* p, size_t n) {
    for (size_t i = 0; i < n; i++) fprintf(o, "%02x", p[i]);
}

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "用法: %s <输出json>\n", argv[0]);
        return 1;
    }
    std::string out = argv[1];
    std::string basePath = "/tmp/rf_golden_" + std::to_string((long)getpid());
    std::string datPath = basePath + "/chunks.dat";

    // RegionFile 不会自己建目录（C++ 的 fopen 也不会），所以外面先建好
    std::string mk = "mkdir -p " + basePath;
    if (system(mk.c_str()) != 0) {
        fprintf(stderr, "建目录失败: %s\n", basePath.c_str());
        return 1;
    }

    // 写入用的区块数据。BitStream 借用这块内存，生命周期要盖住 writeChunk。
    std::vector<unsigned char> a = makeChunk(100, 3);
    std::vector<unsigned char> b = makeChunk(200, 5);
    std::vector<unsigned char> a2 = makeChunk(100, 7);   // 与 a 等长，走原地覆写
    std::vector<unsigned char> big = makeChunk(10000, 11); // 变大，要重新分配扇区
    std::vector<unsigned char> c = makeChunk(50, 13);

    {
        RegionFile rf(basePath);
        if (!rf.open()) {
            fprintf(stderr, "open 失败\n");
            return 1;
        }

        RakNet::BitStream sa(a.data(), (unsigned int)a.size(), false);
        RakNet::BitStream sb(b.data(), (unsigned int)b.size(), false);
        RakNet::BitStream sa2(a2.data(), (unsigned int)a2.size(), false);
        RakNet::BitStream sbig(big.data(), (unsigned int)big.size(), false);
        RakNet::BitStream sc(c.data(), (unsigned int)c.size(), false);

        rf.writeChunk(0, 0, sa);    // 第一个区块：占 1 个扇区，文件被加长
        rf.writeChunk(1, 0, sb);    // 第二个区块
        rf.writeChunk(0, 0, sa2);   // 等长覆写：原地改写，扇区数不变
        rf.writeChunk(0, 0, sbig);  // 变长：要 3 个扇区，重新分配
        rf.writeChunk(5, 7, sc);    // 换个位置再写一个
        // 不显式 close()：C++ 里它是 private，靠析构函数调（作用域退出时发生）。
        // 这正是 TS 移植版把 close() 公开出来的原因 —— TS 没有析构函数。
    }

    // 读回来验证一遍（换个 RegionFile 实例，走真实的 open 流程）
    std::vector<std::string> readHex;
    std::vector<int> readOk;
    {
        RegionFile rf(basePath);
        if (!rf.open()) {
            fprintf(stderr, "第二次 open 失败\n");
            return 1;
        }
        int coords[4][2] = {{0, 0}, {1, 0}, {5, 7}, {2, 2}};
        for (int i = 0; i < 4; i++) {
            RakNet::BitStream* out = NULL;
            bool ok = rf.readChunk(coords[i][0], coords[i][1], &out);
            readOk.push_back(ok ? 1 : 0);
            if (ok && out) {
                // 把内容转成十六进制字符串
                unsigned char* d = out->GetData();
                unsigned int n = out->GetNumberOfBytesUsed();
                std::string s;
                char buf[3];
                for (unsigned int k = 0; k < n; k++) {
                    snprintf(buf, 3, "%02x", d[k]);
                    s += buf;
                }
                readHex.push_back(s);
                delete out;
            } else {
                readHex.push_back("");
            }
        }
        // 同样不显式 close()，靠析构
    }

    FILE* f = fopen(datPath.c_str(), "rb");
    if (!f) {
        fprintf(stderr, "读回 chunks.dat 失败\n");
        return 1;
    }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    std::vector<unsigned char> all((size_t)sz);
    if (sz > 0 && fread(all.data(), 1, (size_t)sz, f) != (size_t)sz) {
        fprintf(stderr, "读取 chunks.dat 不完整\n");
        fclose(f);
        return 1;
    }
    fclose(f);

    FILE* o = fopen(out.c_str(), "w");
    if (!o) {
        fprintf(stderr, "打不开输出文件\n");
        return 1;
    }
    fprintf(o, "{\n");
    fprintf(o, "  \"fileSize\": %ld,\n", sz);
    fprintf(o, "  \"hex\": \"");
    printHex(o, all.data(), all.size());
    fprintf(o, "\",\n");
    fprintf(o, "  \"reads\": [\n");
    for (size_t i = 0; i < readOk.size(); i++) {
        fprintf(o, "    {\"x\": %d, \"z\": %d, \"ok\": %d, \"hex\": \"%s\"}%s\n",
                (int)(i == 0 ? 0 : i == 1 ? 1 : i == 2 ? 5 : 2),
                (int)(i == 0 ? 0 : i == 1 ? 0 : i == 2 ? 7 : 2),
                readOk[i], readHex[i].c_str(), i + 1 < readOk.size() ? "," : "");
    }
    fprintf(o, "  ]\n");
    fprintf(o, "}\n");
    fclose(o);

    // 收尾：删掉临时目录
    std::string rm = "rm -rf " + basePath;
    if (system(rm.c_str()) != 0) {
        fprintf(stderr, "清理失败: %s\n", basePath.c_str());
    }
    return 0;
}
