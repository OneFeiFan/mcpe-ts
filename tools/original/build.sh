#!/bin/bash
# 把参考 C++ 编成 Linux 桌面版（GLFW + X11），用来和 TS 版并排对照行为与画面。
# 用法：REF=/path/to/minecraft-pe-reference bash tools/original/build.sh [构建目录，默认 /tmp/refbuild]
# 需要：g++、cmake、ninja（pip install cmake ninja）、X11/GL 开发包（libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev
#       libgl-dev libgles-dev libegl-dev libxkbcommon-dev）；第一次会从 GitHub 拉 zlib、libpng、glfw、openal-soft。
# 实测（2026-10-09，Ubuntu 24.04、g++ 13.3）：845 个目标全部编过，约 17 分钟（openal-soft 占大头）。
set -euo pipefail
: "${REF:?需要 REF=参考源码目录}"
OUT="${1:-/tmp/refbuild}"
cmake -S "$REF" -B "$OUT" -G Ninja -DPLATFORM=Desktop -DCMAKE_BUILD_TYPE=Release \
  -DCPM_SOURCE_CACHE="${CPM_SOURCE_CACHE:-/tmp/cpmcache}" -DGLFW_BUILD_WAYLAND=OFF   # Xvfb 只有 X11；Wayland 需要 wayland-scanner
ninja -C "$OUT" MinecraftPE
echo "可执行文件：$OUT/MinecraftPE"
