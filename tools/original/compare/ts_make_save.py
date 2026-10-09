"""在 TS 版里造一个存档并导出成原版能读的文件夹（存档互通 + 免输入的画面对比）。
用法：python3 ts_make_save.py <导出目录>   （TS_URL 默认 http://127.0.0.1:5173/）
做法：种子 123、创造模式新建世界 → 在玩家前方用代码摆一组方块（石柱、玻璃、火把、羊毛）并挖掉一格 →
固定视角（偏航、俯仰）→ 跑到固定的世界时间 → leaveGame 存盘 → 把虚拟文件系统里这个世界的全部文件写到导出目录。"""
import base64, json, os, sys, time
from playwright.sync_api import sync_playwright
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
exe = os.environ.get('PW_CHROMIUM', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=['--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 854, 'height': 480}); page.set_default_timeout(280000)
    logs = []; page.on('console', lambda m: logs.append(m.text))
    page.goto(os.environ.get('TS_URL', 'http://127.0.0.1:5173/')); page.wait_for_function('window.__app && window.__app.screen', timeout=90000); time.sleep(3)
    page.evaluate("""async (root) => { const W = await import('/@fs' + root + '/packages/world/src/index.ts');
      const a = window.__app; a.options.set(8, 'Steve'); a.setScreen(null);
      a.selectLevel('tsworld', 'TS World', new W.LevelSettings(123, W.GameType.Creative)); }""", ROOT)
    page.wait_for_function('window.__app.level && window.__app.player', timeout=200000); time.sleep(3)
    info = page.evaluate("""async (root) => { const W = await import('/@fs' + root + '/packages/world/src/index.ts');
      const a = window.__app, L = a.level, p = a.player;
      const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y - 1.62);
      const T = W.Tile;
      for (let i = 0; i < 4; ++i) L.setTile(x + 3, y + i, z, T.rock.id);           // 石柱
      L.setTile(x + 3, y, z + 1, T.glass.id); L.setTile(x + 3, y + 1, z + 1, T.glass.id);
      L.setTileAndData(x + 3, y, z - 1, T.cloth.id, 14);                          // 红羊毛
      L.setTile(x + 2, y + 1, z - 1, T.torch.id);
      L.setTile(x + 3, y + 2, z, 0);                                               // 石柱中间挖空一格
      p.yRot = p.yRotO = -90; p.xRot = p.xRotO = 20;                              // 朝 +x 看、略向下
      return { x, y, z, time: L.getTime() }; }""", ROOT)
    # 原版在打开游戏内界面（暂停等）时 saveLevelData + saveGame（level.dat 带 Player 标签、写 players/Steve.dat）；leaveGame 本身只存区块。这里直接调这两个
    page.evaluate("() => { const a = window.__app; while (a.level.getTime() < 1000) a.tick(0, 0); a.level.saveLevelData(); a.level.saveGame(); return a.screen ? a.screen.constructor.name : null; }"); time.sleep(2)
    page.evaluate("() => { window.__app.leaveGame(); }")
    time.sleep(3)
    files = page.evaluate("""async (root) => { const P = await import('/@fs' + root + '/packages/platform/src/index.ts');
      const vfs = P.getVfs(); const base = '/games/com.mojang/minecraftWorlds/tsworld'; const out = {};
      const walk = (d) => { for (const n of vfs.listDir(d)) { const q = d + '/' + n; const buf = vfs.getBuffer(q);
        if (buf) { let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); out[q.slice(base.length + 1)] = btoa(s); }
        else walk(q); } };
      walk(base); return out; }""", ROOT)
    for rel, b64 in files.items():
        dst = os.path.join(out, rel); os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'wb').write(base64.b64decode(b64))
    json.dump(info, open(os.path.join(out, 'made.json'), 'w'))
    print('导出', sorted(files), info)
    b.close()
