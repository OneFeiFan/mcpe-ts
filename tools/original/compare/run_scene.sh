#!/bin/bash
# 一个场景走一遍：TS 造存档 → 原版加载截图 → TS 加载截图 → 比较。
# 用法：bash run_scene.sh <场景> <输出目录>   （需要：TS 开发服务器在 TS_URL、原版可执行文件 ORIG_BIN、ORIG_WORK 下有 data 链接）
set -u
SCENE="$1"; OUT="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"; WORK="${ORIG_WORK:-/home/claude/orig}"
mkdir -p "$OUT"; rm -rf "$OUT/save" "$OUT/orig" "$OUT/ts" "$OUT/cmp"; mkdir -p "$OUT/orig" "$OUT/ts"
python3 "$HERE/ts_make_save.py" "$OUT/save" "$SCENE" > "$OUT/make.log" 2>&1 || { echo "造存档失败"; tail -3 "$OUT/make.log"; exit 1; }
rm -rf "$WORK/games" "$WORK/options.txt"; mkdir -p "$WORK/games/com.mojang/minecraftWorlds"
cp -r "$OUT/save" "$WORK/games/com.mojang/minecraftWorlds/tsworld"; rm -f "$WORK/games/com.mojang/minecraftWorlds/tsworld/made.json"
xvfb-run -a -s "-screen 0 1280x800x24" python3 "$HERE/drive_original.py" "$HERE/steps-load-first-world.json" "$OUT/orig" > /dev/null 2>&1
cp "$OUT/orig/l1_loaded.png" "$OUT/orig/$SCENE.png" 2>/dev/null
python3 "$HERE/ts_load_save.py" "$OUT/save" tsworld "$OUT/ts/$SCENE.png" 3 400 > "$OUT/load.log" 2>&1
mkdir -p "$OUT/o" "$OUT/t"; cp "$OUT/orig/$SCENE.png" "$OUT/o/" 2>/dev/null; cp "$OUT/ts/$SCENE.png" "$OUT/t/" 2>/dev/null
python3 "$HERE/cmp.py" "$OUT/o" "$OUT/t" "$OUT/cmp"
