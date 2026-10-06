#!/usr/bin/env bash
# 用参考 C++ 源码生成黄金样本。需要 x86-64 + g++/clang++（Linux、WSL、MSYS2 均可）。
#
# 用法：
#   REF=<参考源码根> bash tools/golden/build.sh                 # 生成全部夹具
#   REF=<参考源码根> bash tools/golden/build.sh leveldata       # 只生成这一节
#   REF=<参考源码根> bash tools/golden/build.sh --list          # 列出节名
#   节名就是夹具的主文件名；可以给多个。并行度用 JOBS=N 覆盖（默认 CPU 核数）。
#
# 【为什么是并行的】这份脚本要编 150 多个源文件（S11 的 30 个 + S12 的 121 个）。
# 最初是一路串行 —— 在 16 核的机器上要十几分钟，改成 xargs -P 之后是分钟级。
# 每个源文件编成各自独立的目标文件，先后顺序不影响结果，所以并行是安全的。
#
# 【节与公共目标文件的对应】给节名时只会编它真正需要的那组公共目标文件：
#   $REG（30 个方块/物品/数据类） ← registry nbt i18n inventory entity font
#   $LVL（121 个 world+nbt+locale+util）← collision leveldata playerdata saveleveldata chunk entities
#   raknet 的 7 个源文件 ← leveldata playerdata saveleveldata chunk entities
# 其余节各自单独编译，不依赖任何公共目标文件。
set -euo pipefail

REF="${REF:?请设置 REF=参考源码根目录（含 src/）}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/fixtures/golden"; TMP="$(mktemp -d)"; mkdir -p "$OUT"
CXX="${CXX:-g++}"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 4)}"

# ---- 选择性生成：不给节名就全生成，给了就只生成这几节 ----
ALL_SECTIONS=(random mth util s4 synth biomesource optionsfile registry nbt i18n inventory entity collision explosion font regionfile leveldata playerdata saveleveldata chunk entities randomlevelsource model pathfinder mobai)
SECTIONS=("$@")
if [ "${#SECTIONS[@]}" -gt 0 ] && [ "${SECTIONS[0]}" = "--list" ]; then
    printf '%s\n' "${ALL_SECTIONS[@]}"
    exit 0
fi
if [ "${#SECTIONS[@]}" -gt 0 ]; then
    for s in "${SECTIONS[@]}"; do
        known=0
        for a in "${ALL_SECTIONS[@]}"; do [ "$s" = "$a" ] && known=1; done
        if [ "$known" = 0 ]; then
            printf '未知的节名：%s\n可用：%s\n' "$s" "${ALL_SECTIONS[*]}" >&2
            exit 1
        fi
    done
fi
want() {
    [ "${#SECTIONS[@]}" -eq 0 ] && return 0
    local s
    for s in "${SECTIONS[@]}"; do [ "$s" = "$1" ] && return 0; done
    return 1
}
any_want() {
    local s
    for s in "$@"; do want "$s" && return 0; done
    return 1
}

# 参考源码的通用编译参数。client 头文件要的 GL 类型由 stub/glad/glad.h 提供。
#
# 【-DOPENGL_ES 是网页版构建的真实定义，别去掉】CMakeLists.txt:383 写着
# `target_compile_definitions(... PUBLIC "OPENGL_ES" "NO_EGL" ${PLATFORM})`，
# 而 CMakeLists.txt:379 给 emscripten 另加 `__EMSCRIPTEN__ NO_SOUND NO_NETWORK`。
# 这里只补 OPENGL_ES 与 NO_EGL：`__EMSCRIPTEN__` **不能**定义，否则 gles.h 的
# include 链会走 `#import <GLES/gl.h>`（Linux 上没有这个头），就用不上 stub 了。
#
# 加它之前先查过影响面：全树带 `OPENGL_ES` 分支的只有 9 个文件
# （ModelPart.cpp、LevelRenderer.cpp、gles.cpp/h、main_{android,glfw,rpi,win32}.h、EglConfigPrinter.h），
# 其中**没有任何一个被已有的节编译**，所以补上是零风险的；不加的话
# ModelPart::draw 会走 glCallList 那条（显示列表）分支，和网页版真实行为相反。
CF=(-O0 -std=c++17 -w -fpermissive -DPLATFORM_WEB -DOPENGL_ES -DNO_EGL -I"$REF/src" -I"$ROOT/tools/golden/stub")

# ---- 并行编译 ----
# 单文件编译脚本。写成独立文件而不是用 export -f：$CF 是数组，没法跟着函数导出；
# 而且出问题时可以直接读这个脚本，看实际执行的命令是什么。
{
    echo '#!/usr/bin/env bash'
    echo 'set -e'
    echo 'cd "$CXX_ROOT"'
    printf 'exec'
    printf ' %q' "$CXX"
    printf ' %q' "${CF[@]}"
    # 目标名由调用方给（有的地方用全路径拍平，有的地方只取文件名），这里只把扩展名换成 .o
    echo ' -c "$1" -o "$OBJ_DIR/${2%.*}.o"'
} > "$TMP/compile-one.sh"
chmod +x "$TMP/compile-one.sh"

# 用法: compile_many <输出目录> <源文件> <目标名> [<源文件> <目标名> ...]
# 源文件路径相对于 $REF/src；目标名不含扩展名以外的处理（compile-one.sh 负责换成 .o）。
compile_many() {
    local outdir="$1"; shift
    [ "$#" -eq 0 ] && return 0
    printf '%s\0' "$@" | xargs -0 -P "$JOBS" -n 2 env CXX_ROOT="$REF/src" OBJ_DIR="$outdir" "$TMP/compile-one.sh"
}

if want random; then
    "$CXX" -O0 -std=c++17 -I"$REF/src" -o "$TMP/harness_random" "$ROOT/tools/golden/harness_random.cpp"
    "$TMP/harness_random" > "$OUT/random.json"
fi
if want mth; then
    "$CXX" -O0 -std=c++17 -I"$REF/src" -o "$TMP/harness_mth" "$ROOT/tools/golden/harness_mth.cpp" "$REF/src/util/Mth.cpp"
    "$TMP/harness_mth" "$OUT/mth_sin_table.f32" "$OUT/mth.json"
fi
if want util; then
    "$CXX" -O0 -std=c++17 -I"$REF/src" -o "$TMP/harness_util" "$ROOT/tools/golden/harness_util.cpp" "$REF/src/util/PerfTimer.cpp" "$REF/src/util/StringUtils.cpp"
    "$TMP/harness_util" "$OUT/util.json"
fi
if want optionsfile; then
    # 只用到自身的源文件 + log.h 桩（LOGI 在 harness 里不需要出声）。
    # CF 带上 -DPLATFORM_WEB 与 stub 目录，log.h 才走得到桩。
    "$CXX" "${CF[@]}" -o "$TMP/harness_optionsfile" "$ROOT/tools/golden/harness_optionsfile.cpp" "$REF/src/client/OptionsFile.cpp"
    "$TMP/harness_optionsfile" "$OUT/optionsfile.json"
fi
if want s4; then
    "$CXX" -O0 -std=c++17 -fwrapv -I"$REF/src" -o "$TMP/harness_s4" "$ROOT/tools/golden/harness_s4.cpp"
    "$TMP/harness_s4" "$OUT/s4.json"
fi
S="$REF/src/world/level/levelgen/synth"
if want synth; then
    "$CXX" -O0 -std=c++17 -fwrapv -I"$REF/src" -o "$TMP/harness_synth" "$ROOT/tools/golden/harness_synth.cpp" "$S/ImprovedNoise.cpp" "$S/PerlinNoise.cpp" "$S/Synth.cpp"
    "$TMP/harness_synth" "$OUT/synth.json"
fi
if want biomesource; then
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
fi

# 诊断用：撞到 ud2 陷阱桩时打印地址。放在 $TMP 而不是 $REG —— 因为 collision 与 leveldata
# 只需要这一个文件，不需要 $REG 那 30 个方块/物品类，放 $REG 会白编一大堆。
if any_want registry nbt i18n inventory entity collision explosion font leveldata playerdata saveleveldata chunk entities randomlevelsource model pathfinder mobai; then
    "$CXX" -c "$ROOT/tools/golden/stub/sigill_diag.cpp" -o "$TMP/sigill_diag.oo"
fi

# ---- S11：方块、物品注册表（G11-1、G11-2），NBT 与 ItemInstance（G11-3、G11-4），本地化（G11-5）
# 编译全部方块类、物品类与少量数据类。这些源码引用了很多不在此处链接的函数（Level、Entity、网络……）。
# 链接前先收集未定义符号，生成"陷阱替身"：被调用就执行 ud2（SIGILL），从而暴露真正需要的依赖；
# RakNet 的构造函数在静态初始化里被调用，替身直接返回。
REG="$TMP/reg"
if any_want registry nbt i18n inventory entity font; then
    mkdir -p "$REG"
    RSRC=(world/level/material/Material.cpp world/level/tile/*.cpp world/item/*.cpp locale/I18n.cpp nbt/Tag.cpp util/Mth.cpp util/StringUtils.cpp
          util/DataIO.cpp world/Direction.cpp world/level/LightLayer.cpp world/level/GrassColor.cpp world/level/FoliageColor.cpp
          world/level/LevelConstants.cpp world/phys/HitResult.cpp platform/time.cpp world/inventory/FillingContainer.cpp
          world/entity/player/Inventory.cpp world/item/crafting/Recipe.cpp world/entity/Entity.cpp world/entity/item/ItemEntity.cpp)
    # 通配符要在 $REF/src 里展开（所以这里不能给 ${RSRC[@]} 加引号）；
    # $REG 的目标名用 basename，保持与串行版本一致，免得改动链接顺序。
    rsrc_pairs=()
    while IFS= read -r f; do rsrc_pairs+=("$f" "$(basename "$f")"); done < <(cd "$REF/src" && printf '%s\n' ${RSRC[@]})
    compile_many "$REG" "${rsrc_pairs[@]}"
fi
build_with_stubs() { # $1 = harness 名
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/$1.cpp" -o "$REG/$1.oo"
    { "$CXX" -o /dev/null "$REG/$1.oo" "$REG"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$REG/$1.stubs.s"
    "$CXX" -c "$REG/$1.stubs.s" -o "$REG/$1.stubs.oo"
    "$CXX" -no-pie -o "$REG/$1" "$REG/$1.oo" "$REG"/*.o "$REG/$1.stubs.oo" "$TMP/sigill_diag.oo"
}
if want registry; then
    build_with_stubs harness_registry
    "$REG/harness_registry" "$TMP/registry_a.json" 2>/dev/null
    MALLOC_PERTURB_=165 "$REG/harness_registry" "$TMP/registry_b.json" 2>/dev/null
    node "$ROOT/tools/golden/merge-uninit.mjs" "$TMP/registry_a.json" "$TMP/registry_b.json" "$OUT/registry.json"
fi
if want nbt; then
    build_with_stubs harness_nbt
    "$REG/harness_nbt" "$OUT/nbt.json" 2>/dev/null
fi
if want i18n; then
    build_with_stubs harness_i18n
    "$REG/harness_i18n" "$OUT/i18n.json" "$REF/data" 2>/dev/null
fi
# ---- S12：物品栏（G12-3）
if want inventory; then
    build_with_stubs harness_inventory
    "$REG/harness_inventory" "$OUT/inventory.json" 2>/dev/null
fi
# ---- S12：实体存档格式（G12-1）
if want entity; then
    build_with_stubs harness_entity
    "$REG/harness_entity" "$OUT/entity.json" 2>/dev/null
fi

# ---- S12：碰撞轨迹（G12-2）。要用真实的 Level：world、nbt、locale、util 下的全部源码另建一组目标文件
LVL="$TMP/lvl"
if any_want collision explosion leveldata playerdata saveleveldata chunk entities randomlevelsource pathfinder mobai; then
    mkdir -p "$LVL"
    lvl_pairs=()
    while IFS= read -r f; do lvl_pairs+=("$f" "${f//\//_}"); done < <(cd "$REF/src" && { find world nbt locale util -name '*.cpp' ! -name 'PerfRenderer.cpp'; echo platform/time.cpp; })
    compile_many "$LVL" "${lvl_pairs[@]}"
fi
if want collision; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_collision.cpp" -o "$LVL/harness_collision.oo"
    { "$CXX" -o /dev/null "$LVL/harness_collision.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/stubs.s"
    "$CXX" -c "$LVL/stubs.s" -o "$LVL/stubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_collision" "$LVL/harness_collision.oo" "$LVL"/*.o "$LVL/stubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_collision" "$OUT/collision.json" 2>/dev/null
fi

# ---- 任务单 H2：寻路（G16-1）。和 collision 同一组 $LVL 目标文件
if want pathfinder; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_pathfinder.cpp" -o "$LVL/harness_pathfinder.oo"
    { "$CXX" -o /dev/null "$LVL/harness_pathfinder.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/pfstubs.s"
    "$CXX" -c "$LVL/pfstubs.s" -o "$LVL/pfstubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_pathfinder" "$LVL/harness_pathfinder.oo" "$LVL"/*.o "$LVL/pfstubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_pathfinder" "$OUT/pathfinder.json" 2>/dev/null
fi

# ---- 任务单 H3：旧 AI 的行为轨迹（G16-2）。Mth::random 换成 harness 里可设种子的版本：
#      把 util_Mth.o 复制一份、用 objcopy 把两个 Mth::random 变成弱符号，harness 的强定义就会生效
if want mobai; then
    MAI="$TMP/mai"; mkdir -p "$MAI"
    for o in "$LVL"/*.o; do cp "$o" "$MAI/"; done
    objcopy --weaken-symbol=_ZN3Mth6randomEv --weaken-symbol=_ZN3Mth6randomEi "$MAI/util_Mth.o"
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_mobai.cpp" -o "$MAI/harness_mobai.oo"
    { "$CXX" -o /dev/null "$MAI/harness_mobai.oo" "$MAI"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$MAI/stubs.s"
    "$CXX" -c "$MAI/stubs.s" -o "$MAI/stubs.oo"
    "$CXX" -no-pie -o "$MAI/harness_mobai" "$MAI/harness_mobai.oo" "$MAI"/*.o "$MAI/stubs.oo" "$TMP/sigill_diag.oo"
    "$MAI/harness_mobai" "$OUT/mobai.json" 2>/dev/null
fi

# ---- S-D3：爆炸。和 collision 同一组 $LVL 目标文件（同样要用真实 Level）
if want explosion; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_explosion.cpp" -o "$LVL/harness_explosion.oo"
    { "$CXX" -o /dev/null "$LVL/harness_explosion.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/expstubs.s"
    "$CXX" -c "$LVL/expstubs.s" -o "$LVL/expstubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_explosion" "$LVL/harness_explosion.oo" "$LVL"/*.o "$LVL/expstubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_explosion" "$OUT/explosion.json" 2>/dev/null
fi

# ---- S13：字体字宽（G13-1）
if want font; then
    ( cd "$REF/src" && "$CXX" "${CF[@]}" -c client/gui/Font.cpp -o "$REG/Font.oo" )
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_font.cpp" -o "$REG/harness_font.oo"
    { "$CXX" -o /dev/null "$REG/harness_font.oo" "$REG/Font.oo" "$REG"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$REG/font.stubs.s"
    "$CXX" -c "$REG/font.stubs.s" -o "$REG/font.stubs.oo"
    "$CXX" -no-pie -o "$REG/harness_font" "$REG/harness_font.oo" "$REG/Font.oo" "$REG"/*.o "$REG/font.stubs.oo" "$TMP/sigill_diag.oo"
    "$REG/harness_font" "$OUT/font.json" "$ROOT/tools/golden/inputs/default8.rgba"
fi

# ---- S-B3：区块存档文件格式（G14-1）。
# 只换两个头文件（raknet/BitStream.h、platform/log.h 用 tools/golden/stub 下的替身），
# RegionFile.h/.cpp 照用参考源码原样编译 —— 与上面 BiomeSource 那一段同样的做法。
# 替身只提供 RegionFile 真正用到的成员，理由写在替身文件头部。
if want regionfile; then
    RF="$TMP/rf"; mkdir -p "$RF/world/level/storage" "$RF/raknet" "$RF/platform"
    cp "$REF/src/world/level/storage/RegionFile.h" "$REF/src/world/level/storage/RegionFile.cpp" "$RF/world/level/storage/"
    cp "$ROOT/tools/golden/stub/raknet/BitStream.h" "$RF/raknet/"
    cp "$ROOT/tools/golden/stub/platform/log.h" "$RF/platform/"
    "$CXX" -O0 -std=c++17 -I"$RF" -o "$TMP/harness_regionfile" \
      "$ROOT/tools/golden/harness_regionfile.cpp" "$RF/world/level/storage/RegionFile.cpp"
    "$TMP/harness_regionfile" "$OUT/regionfile.json"
fi

# ---- S-B4：level.dat 的文件格式（G14-2）。
# 与 G14-1 不同，这里用**真实的** RakNet::BitStream —— NBT 载荷就是它写出来的，用替身就没意义了。
# 复用上面碰撞样本那一组 $LVL 目标文件（注意 $LVL/*.o 不会匹配到 .oo 结尾的 harness 与桩）。
#
# 【必须编下面这一整组，不能只编 BitStream + RakString】这是踩过的坑：上面的桩规则按
# `/RakNet/` 匹配才给 `ret`，而 RakString 用到的内存分配器是 `rakMalloc_Ex` / `rakFree_Ex` /
# `rakRealloc_Ex` / `notifyOutOfMemory` —— 全是小写 rak 开头、**不含 "RakNet" 字样**，
# 于是被打成 ud2 陷阱。RakString 有静态初始化，程序还没进 main 就踩上去，表现为段错误
# （或者说是 SIGILL），而且 level.dat 已经 fopen 出来了、留个 0 字节空文件，很误导人。
# 解法是老老实实把这组源文件编进来，别指望桩。
#
# 【位置有讲究】这组必须放在 collision **之后**才编进 $LVL：collision 的桩文件是按它链接
# 当时的未定义符号生成的，提前把 raknet 的定义带进 $LVL，那些符号就不再未定义，
# collision 的链接结果会变，夹具就可能跟着变。
if any_want leveldata playerdata saveleveldata chunk entities; then
    raknet_pairs=()
    for f in BitStream RakString RakMemoryOverride SimpleMutex GetTime RakNetTypes StringCompressor; do
        raknet_pairs+=("raknet/$f.cpp" "raknet_$f")
    done
    compile_many "$LVL" "${raknet_pairs[@]}"
fi
if want leveldata; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_leveldata.cpp" -o "$LVL/harness_leveldata.oo"
    { "$CXX" -o /dev/null "$LVL/harness_leveldata.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/ld.stubs.s"
    "$CXX" -c "$LVL/ld.stubs.s" -o "$LVL/ld.stubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_leveldata" "$LVL/harness_leveldata.oo" "$LVL"/*.o "$LVL/ld.stubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_leveldata" "$OUT/leveldata.json"
fi

# ---- S-B4：player.dat 的裸结构体转储（G14-3）。与 G14-2 同一组 $LVL 目标文件。
# 这个格式的字节布局取决于编译器的对齐填充，所以夹具里记的是**量出来的** sizeof 与各字段偏移，
# 不能推算 —— 理由写在 harness_playerdata.cpp 头部。
if want playerdata; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_playerdata.cpp" -o "$LVL/harness_playerdata.oo"
    { "$CXX" -o /dev/null "$LVL/harness_playerdata.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/pd.stubs.s"
    "$CXX" -c "$LVL/pd.stubs.s" -o "$LVL/pd.stubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_playerdata" "$LVL/harness_playerdata.oo" "$LVL"/*.o "$LVL/pd.stubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_playerdata" "$OUT/playerdata.json"
fi

# ---- S-B5：saveLevelData 的"写临时文件 → 挪旧的 → 改名"流程（G14-4）。与 G14-3 同一组 $LVL 目标文件。
# 这个函数的可观测结果全在文件系统上，所以夹具记的是每次调用后**目录里的文件清单与各自字节**。
if want saveleveldata; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_saveleveldata.cpp" -o "$LVL/harness_saveleveldata.oo"
    { "$CXX" -o /dev/null "$LVL/harness_saveleveldata.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/sld.stubs.s"
    "$CXX" -c "$LVL/sld.stubs.s" -o "$LVL/sld.stubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_saveleveldata" "$LVL/harness_saveleveldata.oo" "$LVL"/*.o "$LVL/sld.stubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_saveleveldata" "$OUT/saveleveldata.json"
fi

# ---- S-B5：区块载荷（G14-5）。与 G14-4 同一组 $LVL 目标文件。
# save/load 是同一份代码里的两个函数，两边一起写错的话往返测试照样通过 —— 所以这里记的是
# 参考实现产出的载荷字节本身。
if want chunk; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_chunk.cpp" -o "$LVL/harness_chunk.oo"
    { "$CXX" -o /dev/null "$LVL/harness_chunk.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/chk.stubs.s"
    "$CXX" -c "$LVL/chk.stubs.s" -o "$LVL/chk.stubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_chunk" "$LVL/harness_chunk.oo" "$LVL"/*.o "$LVL/chk.stubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_chunk" "$OUT/chunk.json"
fi

# ---- S-B5：实体文件（G14-6）。与 G14-4/G14-5 同一组 $LVL 目标文件。
# entities.dat **不是 RegionFile**，是 "ENT\0" + 两个 int32 + NBT 的平文件。
# 有意思的地方在于同一个文件里有两套端序路径：那两个 int32 是 fwrite 直接倒内存（小端），
# 后面的 NBT 走 BitStream（大端）。所以夹具记整个文件的十六进制。
if want entities; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_entities.cpp" -o "$LVL/harness_entities.oo"
    { "$CXX" -o /dev/null "$LVL/harness_entities.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/ent.stubs.s"
    "$CXX" -c "$LVL/ent.stubs.s" -o "$LVL/ent.stubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_entities" "$LVL/harness_entities.oo" "$LVL"/*.o "$LVL/ent.stubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_entities" "$OUT/entities.json"
fi

# ---- C-1：普通维度的地形生成（G15-1）。与 G14-4/5/6 同一组 $LVL 目标文件。
#
# 这一段与别的 $LVL 节只差一件事：**它不需要任何替身**。
# RandomLevelSource 要的 Level 是真的 —— harness 里用一个 `GoldenStorage : MemoryLevelStorage`
# 就能建起来（Level 的构造函数会自己 `dimension->init(this)`，BiomeSource 跟着出来），
# 做法与 harness_collision.cpp 完全一样。所以 `world/level/levelgen/*.cpp` 直接吃 $LVL
# 那份按真 Level.h 编出来的目标文件就行，不必另编一组、也不必排除什么。
#
# 夹具记四份快照（高度场 / prepareHeights 后 / buildSurfaces 后 / 洞穴峡谷后），
# 外加一份自检：真 `getChunk` 的结果与上面那条重放路径逐字节比对，对不上就说明重放不忠实。
if want randomlevelsource; then
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_randomlevelsource.cpp" -o "$LVL/harness_rls.oo"
    { "$CXX" -o /dev/null "$LVL/harness_rls.oo" "$LVL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$LVL/rls.stubs.s"
    "$CXX" -c "$LVL/rls.stubs.s" -o "$LVL/rls.stubs.oo"
    "$CXX" -no-pie -o "$LVL/harness_randomlevelsource" "$LVL/harness_rls.oo" "$LVL"/*.o "$LVL/rls.stubs.oo" "$TMP/sigill_diag.oo"
    "$LVL/harness_randomlevelsource" "$OUT/randomlevelsource.json"
fi

# ---- S13-G1：模型几何（Cube 的顶点与 UV）。
#
# 自成一节、只编 5 个模型源文件 —— 别塞进 $REG（那组是 30 个方块/物品类，白编）。
# harness 只构造模型、不渲染，所以除了 `anGenBuffers`（harness 自己给了个发号的定义）
# 之外的 GL 调用全都用不着；真需要的符号由这里的陷阱桩兜底。
if want model; then
    MDL="$TMP/mdl"; mkdir -p "$MDL"
    compile_many "$MDL" \
        client/model/geom/Cube.cpp Cube \
        client/model/geom/Polygon.cpp Polygon \
        client/model/geom/ModelPart.cpp ModelPart \
        client/model/ChickenModel.cpp ChickenModel \
        client/model/HumanoidModel.cpp HumanoidModel \
        client/model/QuadrupedModel.cpp QuadrupedModel \
        client/model/PigModel.cpp PigModel \
        client/model/CowModel.cpp CowModel \
        client/model/SheepModel.cpp SheepModel \
        client/model/SheepFurModel.cpp SheepFurModel
    "$CXX" "${CF[@]}" -c "$ROOT/tools/golden/harness_model.cpp" -o "$MDL/harness_model.oo"
    { "$CXX" -o /dev/null "$MDL/harness_model.oo" "$MDL"/*.o -Wl,--no-demangle 2>&1 || true; } | grep -oE "undefined reference to \`[^']+'" \
      | sed "s/undefined reference to \`//; s/'$//" | sort -u \
      | awk 'BEGIN{print ".section .note.GNU-stack,\"\",@progbits"; print ".text"} {b = ($0 ~ /RakNet/) ? "ret" : "ud2"; printf ".globl %s\n.type %s,@function\n%s:\n  %s\n", $0, $0, $0, b}' > "$MDL/mdl.stubs.s"
    "$CXX" -c "$MDL/mdl.stubs.s" -o "$MDL/mdl.stubs.oo"
    "$CXX" -no-pie -o "$MDL/harness_model" "$MDL/harness_model.oo" "$MDL"/*.o "$MDL/mdl.stubs.oo" "$TMP/sigill_diag.oo"
    "$MDL/harness_model" "$OUT/model.json"
fi

if [ "${#SECTIONS[@]}" -eq 0 ]; then
    echo "黄金样本已写入 $OUT"
else
    echo "已生成：${SECTIONS[*]}"
fi
