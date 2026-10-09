"""在 Xvfb 里驱动原版：按步骤发送点击、键入、按键，并截图。用法：python3 drive.py steps.json outdir
（由 xvfb-run 包着跑；原版从当前目录的 data/ 读素材）"""
import json, subprocess, sys, time, os
steps = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
env = dict(os.environ, LIBGL_ALWAYS_SOFTWARE='1')
os.chdir(os.environ.get("ORIG_WORK", "/tmp/origrun"))
p = subprocess.Popen([os.environ.get('ORIG_BIN', '/tmp/refbuild/MinecraftPE')], stdout=open(out + '/game.log', 'w'), stderr=subprocess.STDOUT, env=env)
time.sleep(6)
W = subprocess.run(['xdotool', 'search', '--name', 'Minecraft PE'], capture_output=True, text=True).stdout.split()[0]
def x(*a): subprocess.run(['xdotool', *a])
for st in steps:
    k = st[0]
    if k == 'wait': time.sleep(st[1])
    elif k == 'click':
        x('mousemove', '--window', W, str(st[1]), str(st[2])); time.sleep(0.2)
        x('mousedown', '--window', W, '1'); time.sleep(0.15); x('mouseup', '--window', W, '1'); time.sleep(0.5)
    elif k == 'type': x('type', '--window', W, '--delay', '80', st[1]); time.sleep(0.3)
    elif k == 'key': x('key', '--window', W, st[1]); time.sleep(0.3)
    elif k == 'shot': subprocess.run(['import', '-window', W, f'{out}/{st[1]}.png'])
p.kill()
