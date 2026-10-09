#!/bin/bash
# 在 Xvfb 里跑编好的原版，等若干秒后截下游戏窗口（854×480，原版默认窗口大小）。
# 用法：REF=… bash tools/original/run.sh <秒数> <截图.png> [构建目录]
# 原版从当前目录的 data/ 读素材，所以在临时目录里建一个指向 $REF/data 的链接再启动。
# 输入可以用 xdotool 发给窗口（xdotool search --name "Minecraft PE"）。
set -euo pipefail
: "${REF:?需要 REF=参考源码目录}"
SECS="$1"; SHOT="$(realpath -m "$2")"; BIN="${3:-/tmp/refbuild}/MinecraftPE"
WORK="$(mktemp -d)"; ln -s "$REF/data" "$WORK/data"
xvfb-run -a -s "-screen 0 1280x800x24" bash -c "
  cd '$WORK'; export LIBGL_ALWAYS_SOFTWARE=1
  '$BIN' > '$WORK/game.log' 2>&1 & PID=\$!
  sleep $SECS
  W=\$(xdotool search --name 'Minecraft PE' | head -1)
  import -window \"\$W\" '$SHOT'
  kill \$PID; sleep 1; kill -9 \$PID 2>/dev/null || true"
echo "截图：$SHOT；日志：$WORK/game.log"
