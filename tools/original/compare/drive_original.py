"""在 Xvfb 里驱动原版：按步骤发送点击、按键、键入并截图。用法（由 xvfb-run 包着）：python3 drive_original.py steps.json outdir
环境变量：ORIG_BIN（可执行文件，默认 /home/claude/refbuild/MinecraftPE）、ORIG_WORK（工作目录，里面要有指向 $REF/data 的 data 链接）。
步骤：["look",dx,dy]（相对移动指针 = 转视角） ["wait",秒] ["click",x,y] ["rclick",x,y] ["click_here"]（原地左键，不移动指针） ["rclick_here"] ["hold_here",秒]
      ["type",文字] ["key",名字] ["keydown",名字] ["keyup",名字] ["shot",名字]；ticks / settle 只对 TS 有意义，这里忽略。
注意：进世界后原版会锁住鼠标，移动指针就是转动视角——世界里的操作要用 *_here 系列，不要再 click x,y。"""
import json, subprocess, sys, time, os
steps = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
env = dict(os.environ, LIBGL_ALWAYS_SOFTWARE='1')
os.chdir(os.environ.get('ORIG_WORK', '/home/claude/orig'))
p = subprocess.Popen(['stdbuf', '-oL', '-eL', os.environ.get('ORIG_BIN', '/home/claude/refbuild/MinecraftPE')],
                     stdout=open(out + '/game.log', 'w'), stderr=subprocess.STDOUT, env=env)  # 行缓冲：被强杀时日志也不丢
time.sleep(6)
W = subprocess.run(['xdotool', 'search', '--name', 'Minecraft PE'], capture_output=True, text=True).stdout.split()[0]
def x(*a): subprocess.run(['xdotool', *a])
for st in steps:
    k = st[0]
    if k == 'wait': time.sleep(st[1])
    elif k in ('click', 'rclick'):
        b = '1' if k == 'click' else '3'
        x('mousemove', '--window', W, str(st[1]), str(st[2])); time.sleep(0.2)
        x('mousedown', '--window', W, b); time.sleep(0.15); x('mouseup', '--window', W, b); time.sleep(0.5)
    elif k in ('click_here', 'rclick_here'):
        b = '1' if k == 'click_here' else '3'
        x('mousedown', '--window', W, b); time.sleep(0.15); x('mouseup', '--window', W, b); time.sleep(0.5)
    elif k == 'hold_here':
        x('mousedown', '--window', W, '1'); time.sleep(st[1]); x('mouseup', '--window', W, '1'); time.sleep(0.5)
    elif k == 'mousemove':
        # 进世界、还没锁住鼠标之前把指针摆到窗口中心：之后第一次点击锁鼠标时，指针被拉回中心不会产生位移（不转视角）
        x('mousemove', '--window', W, str(st[1]), str(st[2])); time.sleep(0.3)
    elif k == 'look':
        # 视角：原版锁住鼠标后，相对移动指针就是转动视角（分 10 小步，免得一次跳太大）
        for _ in range(10):
            x('mousemove_relative', '--sync', '--', str(st[1] // 10), str(st[2] // 10)); time.sleep(0.1)
        time.sleep(0.5)
    elif k == 'type': x('type', '--window', W, '--delay', '80', st[1]); time.sleep(0.3)
    elif k == 'key': x('key', '--window', W, st[1]); time.sleep(0.3)
    elif k == 'keydown': x('keydown', '--window', W, st[1])
    elif k == 'keyup': x('keyup', '--window', W, st[1])
    elif k == 'shot': subprocess.run(['import', '-window', W, f'{out}/{st[1]}.png'])
try:
    p.wait(timeout=15)  # 步骤里退出了游戏就会自己结束
except subprocess.TimeoutExpired:
    p.kill()
