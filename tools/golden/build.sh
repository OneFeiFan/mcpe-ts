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
echo "黄金样本已写入 $OUT"
