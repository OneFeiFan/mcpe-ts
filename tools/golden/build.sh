#!/usr/bin/env bash
# 用参考 C++ 源码生成黄金样本。需要 x86-64 + g++/clang++（Linux、WSL、MSYS2 均可）。
# 用法：REF=/path/to/minecraft-pe-reference ./tools/golden/build.sh
set -euo pipefail
REF="${REF:?请设置 REF=参考源码根目录（含 src/）}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/fixtures/golden"; TMP="$(mktemp -d)"; mkdir -p "$OUT"
CXX="${CXX:-g++}"
"$CXX" -O0 -std=c++17 -I"$REF/src" -o "$TMP/harness_random" "$ROOT/tools/golden/harness_random.cpp"
"$TMP/harness_random" > "$OUT/random.json"
"$CXX" -O0 -std=c++17 -I"$REF/src" -o "$TMP/harness_mth" "$ROOT/tools/golden/harness_mth.cpp" "$REF/src/util/Mth.cpp"
"$TMP/harness_mth" "$OUT/mth_sin_table.f32" "$OUT/mth.json"
"$CXX" -O0 -std=c++17 -I"$REF/src" -o "$TMP/harness_util" "$ROOT/tools/golden/harness_util.cpp" "$REF/src/util/PerfTimer.cpp" "$REF/src/util/StringUtils.cpp"
"$TMP/harness_util" "$OUT/util.json"
"$CXX" -O0 -std=c++17 -fwrapv -I"$REF/src" -o "$TMP/harness_s4" "$ROOT/tools/golden/harness_s4.cpp"
"$TMP/harness_s4" "$OUT/s4.json"
S="$REF/src/world/level/levelgen/synth"
"$CXX" -O0 -std=c++17 -fwrapv -I"$REF/src" -o "$TMP/harness_synth" "$ROOT/tools/golden/harness_synth.cpp" "$S/ImprovedNoise.cpp" "$S/PerlinNoise.cpp" "$S/Synth.cpp"
"$TMP/harness_synth" "$OUT/synth.json"
# BiomeSource：用替身 Level、Biome、ChunkPos 头文件单独编译（只换这三个头文件，其余照用参考源码）
BS="$TMP/bsg"; mkdir -p "$BS/world/level/biome"
cp "$REF/src/world/level/biome/BiomeSource.h" "$REF/src/world/level/biome/BiomeSource.cpp" "$BS/world/level/biome/"
ln -s "$REF/src/world/level/levelgen" "$BS/world/level/levelgen"; ln -s "$REF/src/util" "$BS/util"; ln -s "$REF/src/platform" "$BS/platform"
printf '#pragma once\nclass Biome { public: static Biome* getBiome(float temperature, float downfall); };\n' > "$BS/world/level/biome/Biome.h"
printf '#pragma once\nclass Level { public: long seed = 0; long getSeed() { return seed; } };\n' > "$BS/world/level/Level.h"
printf '#pragma once\nclass ChunkPos { public: int x, z; };\n' > "$BS/world/level/ChunkPos.h"
"$CXX" -O0 -std=c++17 -fwrapv -I"$BS" -o "$TMP/harness_biomesource" "$ROOT/tools/golden/harness_biomesource.cpp" "$BS/world/level/biome/BiomeSource.cpp" \
  "$S/ImprovedNoise.cpp" "$S/PerlinNoise.cpp" "$S/Synth.cpp"
"$TMP/harness_biomesource" "$OUT/biomesource.json"
# ---- S11：方块、物品注册表（G11-1、G11-2），NBT 与 ItemInstance（G11-3、G11-4），本地化（G11-5）
# 编译全部方块类、物品类与少量数据类；client 头文件要的 GL 类型由 stub/glad/glad.h 提供。
# 这些源码引用了很多不在此处链接的函数（Level、Entity、网络……）。链接前先收集未定义符号，生成“陷阱替身”：
# 被调用就执行 ud2（SIGILL），从而暴露真正需要的依赖；RakNet 的构造函数在静态初始化里被调用，替身直接返回。
REG="$TMP/reg"; mkdir -p "$REG"
RSRC=(world/level/material/Material.cpp world/level/tile/*.cpp world/item/*.cpp locale/I18n.cpp nbt/Tag.cpp util/Mth.cpp util/StringUtils.cpp
      util/DataIO.cpp world/Direction.cpp world/level/LightLayer.cpp world/level/GrassColor.cpp world/level/FoliageColor.cpp
      world/level/LevelConstants.cpp world/phys/HitResult.cpp platform/time.cpp world/inventory/FillingContainer.cpp
      world/entity/player/Inventory.cpp world/item/crafting/Recipe.cpp world/entity/Entity.cpp world/entity/item/ItemEntity.cpp)
CF=(-O0 -std=c++17 -w -fpermissive -DPLATFORM_WEB -DNO_EGL -I"$REF/src" -I"$ROOT/tools/golden/stub")
( cd "$REF/src" && for f in ${RSRC[@]}; do "$CXX" "${CF[@]}" -c "$f" -o "$REG/$(basename "$f" .cpp).o"; done )
"$CXX" -c "$ROOT/tools/golden/stub/sigill_diag.cpp" -o "$REG/sigill_diag.oo"
build_with_stubs() { # $1 = harness 名
  "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/$1.cpp" -o "$REG/$1.oo"
  { "$CXX" -o /dev/null "$REG/$1.oo" "$REG"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
    | sed "s/undefined reference to \`//; s/'$//" | sort -u \
    | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$REG/$1.stubs.s"
  "$CXX" -c "$REG/$1.stubs.s" -o "$REG/$1.stubs.oo"
  "$CXX" -no-pie -o "$REG/$1" "$REG/$1.oo" "$REG"/*.o "$REG/$1.stubs.oo" "$REG/sigill_diag.oo"
}
build_with_stubs harness_registry
"$REG/harness_registry" "$TMP/registry_a.json" 2>/dev/null
MALLOC_PERTURB_=165 "$REG/harness_registry" "$TMP/registry_b.json" 2>/dev/null
node "$ROOT/tools/golden/merge-uninit.mjs" "$TMP/registry_a.json" "$TMP/registry_b.json" "$OUT/registry.json"
build_with_stubs harness_nbt
"$REG/harness_nbt" "$OUT/nbt.json" 2>/dev/null
build_with_stubs harness_i18n
"$REG/harness_i18n" "$OUT/i18n.json" "$REF/data" 2>/dev/null
# ---- S12：物品栏（G12-3）
build_with_stubs harness_inventory
"$REG/harness_inventory" "$OUT/inventory.json" 2>/dev/null
# ---- S12：实体存档格式（G12-1）
build_with_stubs harness_entity
"$REG/harness_entity" "$OUT/entity.json" 2>/dev/null
# ---- S12：碰撞轨迹（G12-2）。要用真实的 Level：world、nbt、locale、util 下的全部源码另建一组目标文件
LVL="$TMP/lvl"; mkdir -p "$LVL"
( cd "$REF/src" && for f in $(find world nbt locale util -name '*.cpp' ! -name 'PerfRenderer.cpp') platform/time.cpp; do
    "$CXX" "${CF[@]}" -c "$f" -o "$LVL/$(echo "$f" | tr '/' '_' | sed 's/\.cpp$/.o/')"; done )
"$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_collision.cpp" -o "$LVL/harness_collision.oo"
{ "$CXX" -o /dev/null "$LVL/harness_collision.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
  | sed "s/undefined reference to \`//; s/'$//" | sort -u \
  | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/stubs.s"
"$CXX" -c "$LVL/stubs.s" -o "$LVL/stubs.oo"
"$CXX" -no-pie -o "$LVL/harness_collision" "$LVL/harness_collision.oo" "$LVL"/*.o "$LVL/stubs.oo" "$REG/sigill_diag.oo"
"$LVL/harness_collision" "$OUT/collision.json" 2>/dev/null
# ---- S13：字体字宽（G13-1）
( cd "$REF/src" && "$CXX" "${CF[@]}" -c client/gui/Font.cpp -o "$REG/Font.oo" )
"$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_font.cpp" -o "$REG/harness_font.oo"
{ "$CXX" -o /dev/null "$REG/harness_font.oo" "$REG/Font.oo" "$REG"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
  | sed "s/undefined reference to \`//; s/'$//" | sort -u \
  | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$REG/font.stubs.s"
"$CXX" -c "$REG/font.stubs.s" -o "$REG/font.stubs.oo"
"$CXX" -no-pie -o "$REG/harness_font" "$REG/harness_font.oo" "$REG/Font.oo" "$REG"/*.o "$REG/font.stubs.oo" "$REG/sigill_diag.oo"
"$REG/harness_font" "$OUT/font.json" "$ROOT/tools/golden/inputs/default8.rgba"
# ---- S-B3：区块存档文件格式（G14-1）。
# 只换两个头文件（raknet/BitStream.h、platform/log.h 用 tools/golden/stub 下的替身），
# RegionFile.h/.cpp 照用参考源码原样编译 —— 与上面 BiomeSource 那一段同样的做法。
# 替身只提供 RegionFile 真正用到的成员，理由写在替身文件头部。
RF="$TMP/rf"; mkdir -p "$RF/world/level/storage" "$RF/raknet" "$RF/platform"
cp "$REF/src/world/level/storage/RegionFile.h" "$REF/src/world/level/storage/RegionFile.cpp" "$RF/world/level/storage/"
cp "$ROOT/tools/golden/stub/raknet/BitStream.h" "$RF/raknet/"
cp "$ROOT/tools/golden/stub/platform/log.h" "$RF/platform/"
"$CXX" -O0 -std=c++17 -I"$RF" -o "$TMP/harness_regionfile" \
  "$ROOT/tools/golden/harness_regionfile.cpp" "$RF/world/level/storage/RegionFile.cpp"
"$TMP/harness_regionfile" "$OUT/regionfile.json"
# ---- S-B4：level.dat 的文件格式（G14-2）。
# 与 G14-1 不同，这里用**真实的** RakNet::BitStream —— NBT 载荷就是它写出来的，用替身就没意义了。
# 复用上面碰撞样本那一组 $LVL 目标文件（注意 *.o 不会匹配到 .oo 结尾的 harness 与桩）。
#
# 【必须编下面这一整组，不能只编 BitStream + RakString】这是踩过的坑：上面的桩规则按
# `/RakNet/` 匹配才给 `ret`，而 RakString 用到的内存分配器是 `rakMalloc_Ex` / `rakFree_Ex` /
# `rakRealloc_Ex` / `notifyOutOfMemory` —— 全是小写 rak 开头、**不含 "RakNet" 字样**，
# 于是被打成 ud2 陷阱。RakString 有静态初始化，程序还没进 main 就踩上去，表现为段错误
# （或者说是 SIGILL），而且 level.dat 已经 fopen 出来了、留个 0 字节空文件，很误导人。
# 解法是老老实实把这组源文件编进来，别指望桩。
for f in BitStream RakString RakMemoryOverride SimpleMutex GetTime RakNetTypes StringCompressor; do
    ( cd "$REF/src" && "$CXX" "${CF[@]}" -c "raknet/$f.cpp" -o "$LVL/raknet_$f.o" )
done
"$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_leveldata.cpp" -o "$LVL/harness_leveldata.oo"
{ "$CXX" -o /dev/null "$LVL/harness_leveldata.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
  | sed "s/undefined reference to \`//; s/'$//" | sort -u \
  | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/ld.stubs.s"
"$CXX" -c "$LVL/ld.stubs.s" -o "$LVL/ld.stubs.oo"
"$CXX" -no-pie -o "$LVL/harness_leveldata" "$LVL/harness_leveldata.oo" "$LVL"/*.o "$LVL/ld.stubs.oo" "$REG/sigill_diag.oo"
"$LVL/harness_leveldata" "$OUT/leveldata.json"
echo "黄金样本已写入 $OUT"
