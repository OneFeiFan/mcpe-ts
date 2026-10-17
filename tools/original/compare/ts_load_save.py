"""把一个原版格式的存档文件夹装进 TS 的虚拟文件系统并进入，等区块建好后截图。用法：python3 ts_load_save.py <存档文件夹> <世界 id> <截图.png> [等待秒数] [补跑刻数]"""
import base64, os, sys, time
from playwright.sync_api import sync_playwright
src, wid, shot = sys.argv[1], sys.argv[2], sys.argv[3]; wait = float(sys.argv[4]) if len(sys.argv) > 4 else 5
TICKS = int(sys.argv[5]) if len(sys.argv) > 5 else 0  # 载入后先补跑的刻数：原版等 20 秒约 400 刻，光照更新在这些刻里做完
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
    page.evaluate("(n) => { const a = window.__app; for (let i = 0; i < n; ++i) a.tick(0, 0); }", TICKS)
    if os.environ.get('DIFF_STALE'):
        # 诊断 R4：记下每个已建好区块的网格（每层顶点数），整体重建后再比，列出网格变了却没被标脏的区块
        print('网格变化的区块：', page.evaluate("""() => { const a = window.__app, lr = a.levelRenderer, L = a.level;
          for (let k = 0; k < 100000 && L.updateLights(); ++k);
          const sig = (c) => c.renderChunk.map((r) => r.vertexCount).join(',');
          const before = new Map(); for (const c of lr.chunks) if (!c.isDirty()) before.set(c, sig(c));
          for (const c of before.keys()) { c.setDirty(); c.rebuild(); }
          const out = []; for (const [c, s0] of before) { const s1 = sig(c); if (s0 !== s1) out.push([c.x, c.y, c.z, s0, s1]); }
          return out.slice(0, 40); }"""))
    if os.environ.get('REBUILD_ALL'):
        page.evaluate("() => window.__app.levelRenderer.allChanged()")  # 实验：丢掉已建好的区块网格，全部按当前世界状态重建
    # 区块的“可见”标记是每帧做视锥剔除时才更新的；强制重建只建当前标为可见的。所以重建一轮后让页面画几帧
    # （更新可见标记），再重建，直到剩下的待建区块数不再减少——原版几十帧/秒，载入 20 秒后早已建完。
    prev = None
    for _ in range(12):
        left = page.evaluate("""() => { const a = window.__app, lr = a.levelRenderer; a.setScreen(null);
          /* 先把排队的光照更新做完（原版是逐刻慢慢做完再慢慢建区块），否则会把还没算完光照的区块建出来 */ for (let k = 0; k < 100000 && a.level.updateLights(); ++k); for (let i = 0; i < 2000 && lr.dirtyChunks.length; ++i) lr.updateDirtyChunks(a.player, true); /* 强制模式只建“可见”的；不可见与编译过的空区块要靠普通模式逐帧建（原版每帧都在做） */ for (let i = 0; i < 5000 && lr.dirtyChunks.length; ++i) lr.updateDirtyChunks(a.player, false); a.gui.tbr = Math.min(1, Math.max(0, 1 - a.player.getBrightness(1)));  /* 暗角按帧收敛到 1-亮度（Gui::renderVignette），原版几十帧/秒时早已收敛 */
          const p = a.player; return [lr.dirtyChunks.length, p.x, p.y, p.z, p.yRot, p.xRot, a.level.getTime()]; }""")
        if prev is not None and left[0] >= prev: break
        prev = left[0]
        page.evaluate("() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")
    print('dirty 剩余 / 玩家 x y z / 偏航 俯仰 / 世界时间：', left)
    page.screenshot(path=shot, timeout=280000)
    open(shot + '.console.log', 'w').write('\n'.join(logs))
    b.close()
