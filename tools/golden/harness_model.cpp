// 黄金样本 G1：模型几何。
//
// 【为什么这一节存在】模型是纯几何，没有游戏状态可以断言。粒子能断言"生成了几个"、
// 声音能断言"播放调用记录"，模型只剩两个东西能验：**顶点**和 **UV**。
// 而 `Cube` 那套 UV 公式最容易抄错又最难看出来 —— 抄歪一点点，画面只是贴图偏一两像素。
//
// 【记什么】每个 Cube 的两份数据，都按 float 逐位记：
//   1. `vertices[8]` —— 8 个角的位置 + 各自的 (u,v)（构造时给的是 0/8 那套占位值）；
//   2. `polygons[6].vertices[4]` —— 6 个面各自的 4 个角，这里才是 `PolygonQuad`
//      用 u0v0u1v1 重算出来的真 UV（带 `-0.002f/texW` 那点内缩，四行的符号还各不相同）。
// 另外把 `x0..z1` 那 6 个成员也记下来：它们**写入之后全文无人读**（见 Cube.cpp 的形参遮蔽），
// 记下来是为了防止以后有人"顺手清理"掉。
//
// 【覆盖面】三类形状，凑齐所有分支：
//   - g=0 / g=0.5（外扩）        → Cube 构造里 `x0 -= g` 那条路径
//   - mirror = false / true      → 外扩**之后**才交换 x0/x1（顺序错了夹具就变）
//   - texOffs 非 0、texSize 64×32 与 64×64（现代皮肤）
// 再整体扫一遍 `HumanoidModel`（两种贴图尺寸）与 `ChickenModel` 的**每一个部件**，
// 这样"模型表抄错一个数字"也会被夹具抓住。
//
// 【只提供一个 GL 替身】`ModelPart::_init` 会调 `glGenBuffers2(1, &vboId)`，
// 也就是 `anGenBuffers`。它在 gles.cpp 里，连着整个 GL 栈 —— 这里给一个只会发号的定义，
// harness 全程只构造模型、不渲染，不会碰到任何真正的 GL 调用。
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#include <sstream>
#include <map>
#include <set>
#include <list>
#include <algorithm>
#include <memory>
#include <cmath>
#include <climits>
#include <functional>

#define private public
#define protected public
#include "client/model/geom/Cube.h"
#include "client/model/geom/ModelPart.h"
#include "client/model/HumanoidModel.h"
#include "client/model/ChickenModel.h"
#include "client/model/ChestModel.h"
#include "client/model/SignModel.h"
#include "client/model/PigModel.h"
#include "client/model/CowModel.h"
#include "client/model/SheepModel.h"
#include "client/model/SheepFurModel.h"
#include "client/model/ZombieModel.h"
#include "client/model/SkeletonModel.h"
#include "client/model/CreeperModel.h"
#include "client/model/SpiderModel.h"
#undef private
#undef protected

// ---- GL 替身：只发号，不做事 ----
static GLuint g_nextBuffer = 1;
void anGenBuffers(GLsizei n, GLuint* buffer) {
  for (GLsizei i = 0; i < n; i++) buffer[i] = g_nextBuffer++;
}

// ---- 浮点打印 ----
// %.9g 是 float32 的往返精度（FLT_DECIMAL_DIG = 9），读回来逐位等于原值。
// ±0 统一成正 0：printf 的 %g 会把 -0.0f 打成 "-0"，而 TS 那边算出来是 0，
// 用 Object.is 比较（vitest 的 toBe）会假红。
static void pv(FILE* o, float v) {
  if (v == 0.0f) v = 0.0f;
  std::fprintf(o, "%.9g", (double)v);
}
static void pvArray(FILE* o, const float* a, int n) {
  std::fprintf(o, "[");
  for (int i = 0; i < n; i++) {
    if (i) std::fprintf(o, ",");
    pv(o, a[i]);
  }
  std::fprintf(o, "]");
}
// 一个 VertexPT → [x,y,z,u,v]
static void pVertex(FILE* o, const VertexPT& v) {
  float a[5] = {v.pos.x, v.pos.y, v.pos.z, v.u, v.v};
  pvArray(o, a, 5);
}

// ---- 一个 Cube ----
static void pCube(FILE* o, const Cube* c) {
  std::fprintf(o, "{\"bounds\":");
  float b[6] = {c->x0, c->y0, c->z0, c->x1, c->y1, c->z1};
  pvArray(o, b, 6);
  std::fprintf(o, ",\"vertices\":[");
  for (int i = 0; i < 8; i++) {
    if (i) std::fprintf(o, ",");
    pVertex(o, c->vertices[i]);
  }
  std::fprintf(o, "],\"polygons\":[");
  for (int j = 0; j < 6; j++) {
    if (j) std::fprintf(o, ",");
    std::fprintf(o, "{\"flip\":%s,\"vertices\":[", c->polygons[j]._flipNormal ? "true" : "false");
    for (int k = 0; k < 4; k++) {
      if (k) std::fprintf(o, ",");
      pVertex(o, c->polygons[j].vertices[k]);
    }
    std::fprintf(o, "]}");
  }
  std::fprintf(o, "]}");
}

// ---- 一个 ModelPart ----
static void pPart(FILE* o, const char* name, const ModelPart& p) {
  std::fprintf(o, "{\"name\":\"%s\",\"pos\":", name);
  float pos[3] = {p.x, p.y, p.z};
  pvArray(o, pos, 3);
  std::fprintf(o, ",\"rot\":");
  float rot[3] = {p.xRot, p.yRot, p.zRot};
  pvArray(o, rot, 3);
  std::fprintf(o, ",\"texSize\":");
  float ts[2] = {p.xTexSize, p.yTexSize};
  pvArray(o, ts, 2);
  std::fprintf(o, ",\"mirror\":%s,\"visible\":%s,\"cubes\":[",
               p.mirror ? "true" : "false", p.visible ? "true" : "false");
  for (unsigned i = 0; i < p.cubes.size(); i++) {
    if (i) std::fprintf(o, ",");
    pCube(o, p.cubes[i]);
  }
  std::fprintf(o, "]}");
}

static int g_totalCubes = 0;
static void pPartCounted(FILE* o, const char* name, const ModelPart& p, bool first) {
  if (!first) std::fprintf(o, ",");
  g_totalCubes += (int)p.cubes.size();
  pPart(o, name, p);
}

// ---- 合成形状：专门用来打全 Cube 的分支 ----
// 写成普通函数而不是宏：宏的续行反斜杠太脆（第一版就是把一条续行改断了才编不过）。
static void pShape(FILE* o, const char* label, int xo, int yo, bool mirror, int tsw, int tsh,
                   float x0, float y0, float z0, int w, int h, int d, float g, bool first) {
  ModelPart mp(xo, yo);
  mp.setTexSize(tsw, tsh);
  mp.mirror = mirror;
  mp.addBox(x0, y0, z0, w, h, d, g);  // 7 参重载（void addBox(..., float g)）
  g_totalCubes += (int)mp.cubes.size();

  std::fprintf(o, "%s{\"label\":\"%s\",\"box\":", first ? "" : ",", label);
  float box[7] = {x0, y0, z0, (float)w, (float)h, (float)d, g};
  pvArray(o, box, 7);
  std::fprintf(o, ",\"texOffs\":[%d,%d],\"mirror\":%s,\"texSize\":[%d,%d],\"cubes\":[",
               xo, yo, mirror ? "true" : "false", tsw, tsh);
  for (unsigned i = 0; i < mp.cubes.size(); i++) {
    if (i) std::fprintf(o, ",");
    pCube(o, mp.cubes[i]);
  }
  std::fprintf(o, "]}");
}

static void writeShapes(FILE* o) {
  std::fprintf(o, "{\"shapes\":[");
  // 人头：立方体、无外扩、默认贴图尺寸
  pShape(o, "head", 0, 0, false, 64, 32, -4, -8, -4, 8, 8, 8, 0.0f, true);
  // 手臂：非立方体 + 0.5 外扩（成员存的是没外扩的，顶点是外扩过的 —— 夹具把两者都记下来）
  pShape(o, "arm_inflated", 40, 16, false, 64, 32, -3, -2, -2, 4, 12, 4, 0.5f, false);
  // 镜像的手臂（arm1）：mirror 的交换发生在外扩**之后**
  pShape(o, "arm_mirror", 40, 16, true, 64, 32, -1, -2, -2, 4, 12, 4, 0.0f, false);
  // 身体：64×64 现代皮肤那套外扩
  pShape(o, "body_modern", 16, 32, false, 64, 64, -4, 0, -2, 8, 12, 4, 0.5f, false);
  // 瘦长条：w/h/d 各不相同的极端比例（1×16×1）
  pShape(o, "thin", 24, 0, false, 64, 32, 0, 0, 0, 1, 16, 1, 0.0f, false);
  // 宽扁：把 w/h/d 反过来
  pShape(o, "flat", 0, 16, false, 64, 32, 0, 0, 0, 16, 1, 12, 0.0f, false);
  std::fprintf(o, "],\"models\":[");
}

// ---- 两个模型：把每个部件的每个 cube 都扫一遍 ----
static void writeHumanoid(FILE* o, const char* label, int texW, int texH, bool first) {
  HumanoidModel m(0.0f, 0.0f, texW, texH);
  if (!first) std::fprintf(o, ",");
  std::fprintf(o, "{\"model\":\"%s\",\"texWidth\":%d,\"texHeight\":%d,\"parts\":[",
               label, m.texWidth, m.texHeight);
  pPartCounted(o, "head", m.head, true);
  pPartCounted(o, "hair", m.hair, false);
  pPartCounted(o, "body", m.body, false);
  pPartCounted(o, "arm0", m.arm0, false);
  pPartCounted(o, "arm1", m.arm1, false);
  pPartCounted(o, "leg0", m.leg0, false);
  pPartCounted(o, "leg1", m.leg1, false);
  std::fprintf(o, "]}");
}

static void writeChicken(FILE* o, bool first) {
  ChickenModel m;
  if (!first) std::fprintf(o, ",");
  std::fprintf(o, "{\"model\":\"ChickenModel\",\"texWidth\":%d,\"texHeight\":%d,\"parts\":[",
               m.texWidth, m.texHeight);
  pPartCounted(o, "head", m.head, true);
  pPartCounted(o, "beak", m.beak, false);
  pPartCounted(o, "redThing", m.redThing, false);
  pPartCounted(o, "body", m.body, false);
  pPartCounted(o, "leg0", m.leg0, false);
  pPartCounted(o, "leg1", m.leg1, false);
  pPartCounted(o, "wing0", m.wing0, false);
  pPartCounted(o, "wing1", m.wing1, false);
  std::fprintf(o, "]}");
}

// ---- 方块实体的两个模型（箱子、告示牌）：只有头文件，构造函数里就是全部几何 ----
static void writeChest(FILE* o, bool first) {
  ChestModel m;
  if (!first) std::fprintf(o, ",");
  std::fprintf(o, "{\"model\":\"ChestModel\",\"texWidth\":%d,\"texHeight\":%d,\"parts\":[", m.texWidth, m.texHeight);
  pPartCounted(o, "lid", m.lid, true);
  pPartCounted(o, "bottom", m.bottom, false);
  pPartCounted(o, "lock", m.lock, false);
  std::fprintf(o, "]}");
}

static void writeSign(FILE* o, bool first) {
  SignModel m;
  if (!first) std::fprintf(o, ",");
  std::fprintf(o, "{\"model\":\"SignModel\",\"texWidth\":%d,\"texHeight\":%d,\"parts\":[", m.texWidth, m.texHeight);
  pPartCounted(o, "cube", m.cube, true);
  pPartCounted(o, "cube2", m.cube2, false);
  std::fprintf(o, "]}");
}

// ---- 任务单 H5–H8：生物模型（几何全在构造函数里）。部件名与 TS 字段名一一对应
#define PART(m, n, first) pPartCounted(o, #n, m.n, first)
static void beginModel(FILE* o, const char* name, Model& m, bool first) {
  if (!first) std::fprintf(o, ",");
  std::fprintf(o, "{\"model\":\"%s\",\"texWidth\":%d,\"texHeight\":%d,\"parts\":[", name, m.texWidth, m.texHeight);
}
template <class Q> static void writeQuad(FILE* o, const char* name, Q& m) {
  beginModel(o, name, m, false);
  PART(m, head, true); PART(m, body, false); PART(m, leg0, false); PART(m, leg1, false); PART(m, leg2, false); PART(m, leg3, false);
  std::fprintf(o, "]}");
}
static void writeMobs(FILE* o) {
  { PigModel m(0.5f); writeQuad(o, "PigModel", m); }
  { CowModel m; writeQuad(o, "CowModel", m); }
  { SheepModel m; writeQuad(o, "SheepModel", m); }
  { SheepFurModel m; writeQuad(o, "SheepFurModel", m); }
  { ZombieModel m; beginModel(o, "ZombieModel", m, false);
    PART(m, head, true); PART(m, hair, false); PART(m, body, false); PART(m, arm0, false); PART(m, arm1, false); PART(m, leg0, false); PART(m, leg1, false);
    std::fprintf(o, "]}"); }
  { SkeletonModel m; beginModel(o, "SkeletonModel", m, false);
    PART(m, head, true); PART(m, hair, false); PART(m, body, false); PART(m, arm0, false); PART(m, arm1, false); PART(m, leg0, false); PART(m, leg1, false);
    std::fprintf(o, "]}"); }
  { CreeperModel m; beginModel(o, "CreeperModel", m, false);
    PART(m, head, true); PART(m, body, false); PART(m, leg0, false); PART(m, leg1, false); PART(m, leg2, false); PART(m, leg3, false);
    std::fprintf(o, "]}"); }
  { SpiderModel m; beginModel(o, "SpiderModel", m, false);
    PART(m, head, true); PART(m, body0, false); PART(m, body1, false);
    PART(m, leg0, false); PART(m, leg1, false); PART(m, leg2, false); PART(m, leg3, false); PART(m, leg4, false); PART(m, leg5, false); PART(m, leg6, false); PART(m, leg7, false);
    std::fprintf(o, "]}"); }
}

int main(int argc, char** argv) {
  if (argc < 2) return 1;
  FILE* o = std::fopen(argv[1], "w");
  if (!o) return 1;

  writeShapes(o);
  writeHumanoid(o, "HumanoidModel32", 64, 32, true);
  writeHumanoid(o, "HumanoidModel64", 64, 64, false);
  writeChicken(o, false);
  writeChest(o, false);
  writeSign(o, false);
  writeMobs(o);
  std::fprintf(o, "],\"totalCubes\":%d}\n", g_totalCubes);

  std::fclose(o);
  return 0;
}
