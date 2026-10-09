"""把一个原版格式的存档文件夹装进 TS 的虚拟文件系统并进入，等区块建好后截图。用法：python3 ts_load_save.py <存档文件夹> <世界 id> <截图.png> [等待秒数]"""
import base64, os, sys, time
from playwright.sync_api import sync_playwright
src, wid, shot = sys.argv[1], sys.argv[2], sys.argv[3]; wait = float(sys.argv[4]) if len(sys.argv) > 4 else 5
exe = os.environ.get('PW_CHROMIUM', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
files = {}
for d, _, fs in os.walk(src):
    for f in fs:
        if f.endswith('.json'): continue
        p = os.path.join(d, f); files[os.path.relpath(p, src)] = base64.b64encode(open(p, 'rb').read()).decode()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=['--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 854, 'height': 480}); page.set_default_timeout(280000)
    logs = []; page.on('console', lambda m: logs.append(m.text))
    page.goto(os.environ.get('TS_URL', 'http://127.0.0.1:5173/')); page.wait_for_function('window.__app && window.__app.screen', timeout=90000); time.sleep(3)
    page.evaluate("""async ([root, wid, files]) => { const P = await import('/@fs' + root + '/packages/platform/src/index.ts');
      const W = await import('/@fs' + root + '/packages/world/src/index.ts');
      const vfs = P.getVfs(); const base = '/games/com.mojang/minecraftWorlds/' + wid;
      for (const d of ['/games', '/games/com.mojang', '/games/com.mojang/minecraftWorlds', base, base + '/players']) if (!vfs.exists(d)) vfs.mkdir(d);
      for (const [rel, b64] of Object.entries(files)) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; ++i) u[i] = bin.charCodeAt(i);
        const f = vfs.open(base + '/' + rel, 'wb'); f.write(u, 1, u.length); f.close(); }
      const a = window.__app; a.options.set(8, 'Steve'); a.setScreen(null);
      a.selectLevel(wid, wid, W.LevelSettings.None()); }""", [ROOT, wid, files])
    page.wait_for_function('window.__app.level && window.__app.player', timeout=200000); time.sleep(wait)
    left = page.evaluate("""() => { const a = window.__app, lr = a.levelRenderer; a.setScreen(null);
      for (let i = 0; i < 2000 && lr.dirtyChunks.length; ++i) lr.updateDirtyChunks(a.player, true); a.gui.tbr = 0;
      const p = a.player; return [lr.dirtyChunks.length, p.x, p.y, p.z, p.yRot, p.xRot, a.level.getTime()]; }""")
    print('dirty 剩余 / 玩家 x y z / 偏航 俯仰 / 世界时间：', left)
    page.screenshot(path=shot, timeout=280000)
    open(shot + '.console.log', 'w').write('\n'.join(logs))
    b.close()
