"""用同样的步骤驱动 TS 版（Playwright，854×480）。用法：python3 drive_ts.py steps.json outdir（TS_URL 默认 http://127.0.0.1:5173/）
额外步骤：["ticks_to",T] 跑到世界时间 T；["ticks",N]   直接跑 N 个游戏刻（跳过渲染；无头浏览器约 1 帧/秒，按秒等不到原版那么多刻）
          ["settle"]    把脏区块一次重建完，并把按帧收敛的暗角 tbr 设成收敛值 0（原版几十帧/秒时早已收敛）
控制台日志写到 outdir/console.log。"""
import json, sys, time, os
from playwright.sync_api import sync_playwright
steps = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
exe = os.environ.get('PW_CHROMIUM', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
KEYS = {'Return': 'Enter', 'Escape': 'Escape', 'BackSpace': 'Backspace'}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=['--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 854, 'height': 480}); page.set_default_timeout(280000)
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    logf = open(out + '/console.log', 'w'); page.on('console', lambda m: (logf.write(m.text + '\n'), logf.flush()))
    page.goto(os.environ.get('TS_URL', 'http://127.0.0.1:5173/')); page.wait_for_function('window.__app && window.__app.screen', timeout=90000); time.sleep(4)
    for st in steps:
        k = st[0]
        if k == 'wait': time.sleep(st[1])
        elif k in ('click', 'rclick'):
            page.mouse.move(st[1], st[2]); time.sleep(0.2)
            page.mouse.down(button='left' if k == 'click' else 'right'); time.sleep(0.15); page.mouse.up(button='left' if k == 'click' else 'right'); time.sleep(0.8)
        elif k in ('click_here', 'rclick_here'):
            btn = 'left' if k == 'click_here' else 'right'
            page.mouse.down(button=btn); time.sleep(0.15); page.mouse.up(button=btn); time.sleep(0.8)
        elif k == 'hold_here':
            page.mouse.down(); time.sleep(st[1]); page.mouse.up(); time.sleep(0.8)
        elif k == 'type': page.keyboard.type(st[1], delay=80); time.sleep(0.3)
        elif k == 'key': page.keyboard.press(KEYS.get(st[1], st[1])); time.sleep(0.5)
        elif k == 'keydown': page.keyboard.down(KEYS.get(st[1], st[1]))
        elif k == 'keyup': page.keyboard.up(KEYS.get(st[1], st[1]))
        elif k == 'ticks':
            n = page.evaluate("(n) => { const a = window.__app; for (let i = 0; i < n; ++i) a.tick(i, n - 1); return a.level ? a.level.getTime() : -1; }", st[1])
            print('ticks', st[1], '→ world time', n)
        elif k == 'ticks_to':
            # 跑到世界时间 = 目标值（原版暂停时存进 level.dat 的 Time，用 leveltime.py 读出）
            n = page.evaluate("(t) => { const a = window.__app; let i = 0; while (a.level && a.level.getTime() < t && i < 100000) { a.tick(0, 0); ++i; } return [i, a.level ? a.level.getTime() : -1]; }", st[1])
            print('ticks_to', st[1], '→ 跑了', n[0], '刻，世界时间', n[1])
        elif k == 'look':
            pass  # TS 侧的视角用 set_rot 直接设置（无头浏览器里没有指针锁定）
        elif k == 'set_rot':
            page.evaluate("([pitch, yawDelta]) => { const p = window.__app.player; p.xRot = p.xRotO = pitch; p.yRot = p.yRotO = p.yRot + yawDelta; }", [st[1], st[2] if len(st) > 2 else 0])
        elif k == 'settle':
            left = page.evaluate("""() => { const a = window.__app, lr = a.levelRenderer;
              if (lr && a.player) for (let i = 0; i < 2000 && lr.dirtyChunks.length; ++i) lr.updateDirtyChunks(a.player, true);
              a.gui.tbr = 0; return lr ? lr.dirtyChunks.length : -1; }""")
            print('settled, dirty left =', left)
        elif k == 'shot':
            page.screenshot(path=f'{out}/{st[1]}.png', timeout=280000)
            print(st[1], page.evaluate("() => window.__app.screen ? window.__app.screen.constructor.name : 'none'"))
    print('errors', errs[:3])
    b.close()
