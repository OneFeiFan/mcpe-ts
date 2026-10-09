#!/bin/bash
cd $(cd "$(dirname "$0")/../../.." && pwd)/apps/web && npx vite --port 5173 --strictPort --host 127.0.0.1 > /home/claude/vite.log 2>&1 &
VP=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:5173/ && break; sleep 1; done
for s in "$@"; do bash $(cd "$(dirname "$0")/../../.." && pwd)/tools/original/compare/run_scene.sh $s /home/claude/scene_$s > /home/claude/scene_$s.log 2>&1; done
kill $VP
echo done > /home/claude/run_all.done
