"""用同样的步骤驱动 TS 版（Playwright，854×480），截图到 outdir。用法：python3 drive_ts.py steps.json outdir"""
import json, sys, time, os
from playwright.sync_api import sync_playwright
steps = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
exe = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
KEYS = {'Return': 'Enter', 'Escape': 'Escape', 'BackSpace': 'Backspace'}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=['--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 854, 'height': 480})
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.goto('http://127.0.0.1:5173/'); page.wait_for_function('window.__app && window.__app.screen', timeout=90000); time.sleep(4)
    for st in steps:
        k = st[0]
        if k == 'wait': time.sleep(st[1])
        elif k == 'click':
            page.mouse.move(st[1], st[2]); time.sleep(0.2); page.mouse.down(); time.sleep(0.15); page.mouse.up(); time.sleep(0.8)
        elif k == 'type': page.keyboard.type(st[1], delay=80); time.sleep(0.3)
        elif k == 'key': page.keyboard.press(KEYS.get(st[1], st[1])); time.sleep(0.5)
        elif k == 'settle':
            # 让帧率相关的状态和原版对齐：等脏区块全部重建完；暗角 tbr 每帧衰减 1%，原版几十帧/秒时早已收敛到 0
            for _ in range(240):
                n = page.evaluate("() => { const lr = window.__app.levelRenderer; return lr ? lr.dirtyChunks.length : -1; }")
                if n == 0: break
                time.sleep(1)
            page.evaluate("() => { window.__app.gui.tbr = 0; }")
            print('settled, dirty=', n)
        elif k == 'shot':
            page.screenshot(path=f'{out}/{st[1]}.png', timeout=150000)
            print(st[1], page.evaluate("() => window.__app.screen ? window.__app.screen.constructor.name : 'none'"))
    print('errors', errs[:3])
    b.close()
