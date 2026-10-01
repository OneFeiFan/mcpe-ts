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
echo "黄金样本已写入 $OUT"
