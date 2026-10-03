// G14-4：saveLevelData 的"写临时文件 → 挪旧的 → 改名"这套流程，以及它最终在目录里留下什么。
//
// 【为什么不比对某个函数的返回值】这个函数的可观测结果**全在文件系统上**：写出来的
// level.dat / level.dat_old 的字节、以及"什么时候会多出一个 level.dat_old"。所以夹具记的是
// 每次调用之后**目录里有哪些文件、各自什么字节**。
//
// 【两次保存的差别是重点】第一次保存时 level.dat 还不存在，第 4 步整段跳过；第二次保存时它存在，
// 于是上一份会被挪到 level.dat_old。所以夹具里两个 case 的文件清单**不一样** —— 这正是要钉住的。
//
// 【时间戳】writeLevelData 会写 LastPlayed = getEpochTimeS()，是实时时钟。和 G14-2 一样，
// harness 把产物里时间戳那几个字节清零再输出，并把偏移量记进夹具，TS 测试做同样的清零。
#include "raknet/RakNetTime.h"

#include "world/level/storage/ExternalFileLevelStorage.h"
#include "world/level/storage/LevelData.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <dirent.h>
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

/** 目录里有哪些文件（已排序、去掉 . 与 ..） */
static std::vector<std::string> listFiles(const std::string& dir) {
    std::vector<std::string> v;
    DIR* d = opendir(dir.c_str());
    if (!d) return v;
    struct dirent* e;
    while ((e = readdir(d)) != NULL) {
        std::string n = e->d_name;
        if (n == "." || n == "..") continue;
        v.push_back(n);
    }
    closedir(d);
    std::sort(v.begin(), v.end());
    return v;
}

static void printHex(FILE* o, const std::vector<unsigned char>& v) {
    for (size_t i = 0; i < v.size(); i++) fprintf(o, "%02x", v[i]);
}

/**
 * 把时间戳的 len 个字节清零，返回其偏移；找不到返回 -1。
 * 与 harness_leveldata.cpp 同一个做法：两种字节序都试（这儿的载荷是 NBT，走 writeBytes，原样 = 小端）。
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

static unsigned int g_ts = 0;

/** 把目录里每个文件的字节打出来（level.dat / level.dat_old 的时间戳先清零） */
static void emitDir(FILE* o, const std::string& dir) {
    std::vector<std::string> files = listFiles(dir);
    fprintf(o, "\"files\": [");
    for (size_t i = 0; i < files.size(); i++) {
        std::vector<unsigned char> bytes;
        std::string path = dir + "/" + files[i];
        if (!readFile(path, bytes)) {
            fprintf(stderr, "读不出 %s\n", path.c_str());
            exit(1);
        }
        int tsOffset = (files[i] == "level.dat" || files[i] == "level.dat_old")
                           ? zeroTimestamp(bytes, g_ts, 8) : -1;
        fprintf(o, "%s{\"name\":\"%s\",\"tsOffset\":%d,\"hex\":\"", i ? "," : "", files[i].c_str(), tsOffset);
        printHex(o, bytes);
        fprintf(o, "\"}");
    }
    fprintf(o, "]");
}

/** 造一个固定的 LevelData；saveNo 用来让两次保存的内容不一样（好分辨 level.dat_old 是哪一份） */
static void fill(LevelData& ld, int saveNo) {
    ld.setSeed(123456789L);
    ld.setSpawn(11, 22, 33);
    ld.setTime(1000000L + saveNo * 111111L);
    ld.setGameType(GameType::Creative);
    ld.setLevelName("GoldenWorld");
    ld.setSizeOnDisk(4096);
    ld.setAllowCheats(true);
    // 故意设一个"错"的版本：saveLevelData 会把它强制改成 SharedConstants::StorageVersion
    ld.setStorageVersion(1);
}

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "用法: %s <输出json>\n", argv[0]);
        return 1;
    }
    std::string out = argv[1];
    std::string base = "/tmp/sld_golden_" + std::to_string((long)getpid());
    std::string dir = base + "/w";
    if (system(("mkdir -p " + dir).c_str()) != 0) {
        fprintf(stderr, "建目录失败\n");
        return 1;
    }
    // writeLevelData 期间时钟最多跳 1 秒，多留一秒余量
    g_ts = (unsigned int)getEpochTimeS();

    FILE* o = fopen(out.c_str(), "w");
    if (!o) {
        fprintf(stderr, "打不开输出文件\n");
        return 1;
    }
    fprintf(o, "{\n  \"storageVersion\": %d,\n  \"cases\": [\n", SharedConstants::StorageVersion);

    // ---- 1) 第一次保存：目录是空的 ----
    {
        LevelData ld;
        fill(ld, 1);
        fprintf(o, "    {\"name\": \"first-save\", \"dirExisted\": 1, \"inputStorageVersion\": 1, ");
        ExternalFileLevelStorage::saveLevelData(dir, ld, NULL);
        fprintf(o, "\"afterStorageVersion\": %d, ", ld.getStorageVersion());
        emitDir(o, dir);
        fprintf(o, "}");
    }

    // ---- 2) 第二次保存：level.dat 已存在，上一份该被挪到 level.dat_old ----
    {
        LevelData ld;
        fill(ld, 2);
        fprintf(o, ",\n    {\"name\": \"second-save\", \"dirExisted\": 1, \"inputStorageVersion\": 1, ");
        ExternalFileLevelStorage::saveLevelData(dir, ld, NULL);
        fprintf(o, "\"afterStorageVersion\": %d, ", ld.getStorageVersion());
        emitDir(o, dir);
        fprintf(o, "}");
    }

    // ---- 3) 目录不存在：writeLevelData 打不开文件，整段应直接返回、什么都不留下 ----
    {
        LevelData ld;
        fill(ld, 3);
        std::string bad = base + "/nope/deeper";
        fprintf(o, ",\n    {\"name\": \"missing-dir\", \"dirExisted\": 0, \"inputStorageVersion\": 1, ");
        ExternalFileLevelStorage::saveLevelData(bad, ld, NULL);
        fprintf(o, "\"afterStorageVersion\": %d, ", ld.getStorageVersion());
        emitDir(o, bad);
        fprintf(o, "}");
    }

    fprintf(o, "\n  ]\n}\n");
    fclose(o);

    if (system(("rm -rf " + base).c_str()) != 0) {
        fprintf(stderr, "清理失败\n");
    }
    return 0;
}
