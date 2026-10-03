// G9-1：OptionsFile 的读写（参考源码 src/client/OptionsFile.cpp）。
//
// 【为什么要有这个样本】这个类本身很短，但它读文件靠的是 `fgets` + `strlen` + `strchr` 这套
// C 的字符串函数，规则一堆而且互相咬：
//   - `fgets(lineBuff, 128, f)` **最多读 127 字节**，读满或碰到 '\n' 就停
//     → **超过 127 字节的行会被切成好几段，后面那些段自己当成一行参与后面的判断**
//   - `strlen` 撞到第一个 '\0' 为止
//   - 尾部连续的 '\n' / '\r' 全剥掉（只剥尾部）
//   - 剥完**短于 3 字节的整行丢掉**
//   - `strchr` 找**第一个** ':'，没有就跳过
// 这五条里任何一条理解偏了，TS 那边都会"看着挺对但对不上"。所以边界行必须由参考 C++ 真跑出来，
// 不能推算 —— 尤其是"127 字节切哪一刀"这件事。
//
// 【怎么造输入】save 那批用例走真的 `OptionsFile::save`（连 mkdir 那段一起）；
// read 那批**故意不走 save** —— 要的是畸形内容（短行、没冒号、超长行、嵌入 '\0'），
// 直接 fwrite 原始字节喂给 `getOptionStrings`。
//
// 【字节一律用十六进制报】文件内容里可能有 '\0'、'\r' 这类不好放进 JSON 字符串的字节，
// 所以输入输出的**文件字节**都按 hex 报；解析出来的**字符串**才用 JSON 字符串（都是合法 UTF-8）。
//
// 【一个刻意不放进样本的用例】超长行的那一刀如果正好切在一个多字节 UTF-8 字符中间，
// 参考实现留下的是**非法的半个字符**（std::string 里就是几个裸字节），
// 这既没法用合法 JSON 表示，也没法用 JS 字符串无损表示。这一条在 TS 那边是已知差异，
// 写在 OptionsFile.ts 的注释里，这里不假装它不存在、也不拿它当通过标准。
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <unistd.h>

#include "client/OptionsFile.h"

static std::string hexOf(const std::string& bytes) {
  static const char* D = "0123456789abcdef";
  std::string out;
  out.reserve(bytes.size() * 2);
  for (unsigned char c : bytes) {
    out.push_back(D[c >> 4]);
    out.push_back(D[c & 15]);
  }
  return out;
}

/** 读回整个文件的原始字节（跑完 save 之后用） */
static std::string slurp(const std::string& path) {
  FILE* f = fopen(path.c_str(), "rb");
  if (!f) return std::string();
  std::string out;
  char buf[4096];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
  fclose(f);
  return out;
}

static void writeRaw(const std::string& path, const std::string& bytes) {
  FILE* f = fopen(path.c_str(), "wb");
  if (!f) { fprintf(stderr, "写不进 %s\n", path.c_str()); exit(1); }
  if (!bytes.empty()) fwrite(bytes.data(), 1, bytes.size(), f);
  fclose(f);
}

static void jsonStr(FILE* o, const std::string& s) {
  std::fputc('"', o);
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') std::fprintf(o, "\\%c", c);
    else if (c < 0x20) std::fprintf(o, "\\u%04x", c);
    else std::fputc(c, o);
  }
  std::fputc('"', o);
}

/** 把 getOptionStrings 的结果原样报出来（空表也要报成 []，才能区分"没读到"和"读成空串"） */
static void emitVector(FILE* o, const std::vector<std::string>& v) {
  std::fputc('[', o);
  for (size_t i = 0; i < v.size(); i++) {
    if (i) std::fputc(',', o);
    jsonStr(o, v[i]);
  }
  std::fputc(']', o);
}

/** 造一个由 repeat 个 ch 组成、后接 tail 的行 */
static std::string longLine(size_t repeat, char ch, const char* tail) {
  return std::string(repeat, ch) + tail;
}

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "用法：%s <输出 json>\n", argv[0]); return 1; }
  const std::string out = argv[1];

  // 在工作目录之外的临时目录里折腾，别往 fixtures/ 里丢垃圾
  char tmpl[] = "/tmp/mcpe_opts_XXXXXX";
  if (mkdtemp(tmpl) == NULL) { fprintf(stderr, "建不了临时目录\n"); return 1; }
  const std::string dir = tmpl;

  FILE* o = fopen(out.c_str(), "w");
  if (!o) { fprintf(stderr, "打不开输出文件\n"); return 1; }

  fprintf(o, "{\n  \"counterSize\": 128,\n");

  // ---------------- save：喂一组字符串，看写出来的字节 ----------------
  fprintf(o, "  \"save\": [");
  struct SaveCase { const char* name; std::vector<std::string> in; bool plantDir; };
  const std::vector<SaveCase> saves = {
    {"two-lines", {"options.a:1", "options.b:hello"}, false},
    {"empty", {}, false},
    {"value-has-newline", {"options.a:1\n2"}, false},           // %s 原样写，值里的 '\n' 会变成换行
    {"value-has-nul", {std::string("options.a:12\0 34", 16)}, false}, // %s 撞到 '\0' 就停
    {"empty-element", {""}, false},                              // 空字符串也写一行，就是一个 '\n'
    {"utf8-value", {"options.username:\xe5\xbc\xa0\xe4\xb8\x89"}, false},
    // 父目录要自己建出来（C++ 那段逐级 mkdir 的循环）—— 路径在下面单独拼
    {"creates-parents", {"options.a:1"}, true},
  };
  for (size_t i = 0; i < saves.size(); i++) {
    const SaveCase& c = saves[i];
    OptionsFile of;
    std::string path = c.plantDir ? (dir + "/a/b/c/options.txt") : (dir + "/save-case.txt");
    of.setOptionsPath(path);
    of.save(c.in);
    FILE* probe = fopen(path.c_str(), "rb");
    const bool created = probe != NULL;
    if (probe) fclose(probe);
    if (i) fprintf(o, ",");
    fprintf(o, "\n    {\"name\": ");
    jsonStr(o, c.name);
    fprintf(o, ", \"created\": %s, \"bytes\": ", created ? "true" : "false");
    jsonStr(o, hexOf(slurp(path)));
    fprintf(o, "}");
  }
  fprintf(o, "\n  ],\n");

  // ---------------- read：喂原始字节，看解析出来的键值对 ----------------
  fprintf(o, "  \"read\": [");
  struct ReadCase { const char* name; std::string bytes; };
  const std::string crlf = "options.a:1\r\noptions.b:2\r\n";
  // 长度写死 19：字面量是 12 + '\0' + 6 个字符。多写一个就会读过字面量末尾（UB）
  const std::string nulLine = std::string("options.a:12\0hidden", 19) + "\n";
  const std::vector<ReadCase> reads = {
    {"normal", "options.a:1\noptions.b:2\n"},
    {"crlf", crlf},
    {"lone-cr", "options.a:1\r"},
    {"empty-file", ""},
    {"only-newline", "\n"},
    {"blank-lines-between", "options.a:1\n\n\noptions.b:2\n"},
    {"one-byte-line", "a\noptions.a:1\n"},              // 1 字节 → 丢
    {"two-byte-line", "ab\noptions.a:1\n"},             // 2 字节 → 丢（3 字节才留）
    {"three-byte-line", "abc\noptions.a:1\n"},          // 3 字节、没冒号 → 丢（长度过了但没冒号）
    {"exactly-3-with-colon", "a:1\noptions.a:1\n"},     // 3 字节、有冒号 → 留
    {"no-colon", "options.a\noptions.b:2\n"},
    {"two-colons", "options.ip:1.2.3.4:8080\n"},
    {"empty-value", "options.a:\n"},
    {"leading-trailing-space", "   options.a : 1  \n"},
    {"no-trailing-newline", "options.a:1\noptions.b:2"},
    {"cr-in-middle", "options.a:1\r2\n"},               // 只剥尾部，中间的 '\r' 留着
    {"nul-in-line", nulLine},                           // strlen 停在这里 → 值被截断
    // ---- 127 字节那条线 ----
    {"line-125", longLine(125, 'x', ":1\n")},           // 含 \n 共 128 → 第一刀就到 '\n'
    {"line-126", longLine(126, 'x', ":1\n")},           // \n 在第 129 字节 → 第一段 127 字节、没有 '\n'
    {"line-127", longLine(127, 'x', ":1\n")},
    {"line-130", longLine(130, 'x', ":1\n")},
    {"line-126-no-newline", longLine(126, 'x', ":1")},  // 末尾没换行
  };
  for (size_t i = 0; i < reads.size(); i++) {
    const ReadCase& c = reads[i];
    const std::string path = dir + "/read-case.txt";
    writeRaw(path, c.bytes);
    OptionsFile of;
    of.setOptionsPath(path);
    std::vector<std::string> got = of.getOptionStrings();
    if (i) fprintf(o, ",");
    fprintf(o, "\n    {\"name\": ");
    jsonStr(o, c.name);
    fprintf(o, ", \"bytes\": ");
    jsonStr(o, hexOf(c.bytes));
    fprintf(o, ", \"out\": ");
    emitVector(o, got);
    fprintf(o, "}");
  }
  fprintf(o, "\n  ],\n");

  // ---------------- 文件不存在时 ----------------
  {
    OptionsFile of;
    of.setOptionsPath(dir + "/nope/options.txt"); // 目录不存在 → fopen 失败但不是"读到空"
    fprintf(o, "  \"missing\": ");
    emitVector(o, of.getOptionStrings());
    fprintf(o, ",\n");
    OptionsFile fresh;
    fprintf(o, "  \"defaultPath\": ");
    jsonStr(o, fresh.getOptionsPath());
    fprintf(o, "\n}\n");
  }
  fclose(o);

  // 收拾干净
  std::string cmd = "rm -rf '" + dir + "'";
  if (system(cmd.c_str()) != 0) { /* 清理失败无所谓，在 /tmp 里 */ }
  return 0;
}
