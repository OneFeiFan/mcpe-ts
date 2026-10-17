"""在 TS 版里造一个存档并导出成原版能读的文件夹（存档互通 + 免输入的画面对比）。
用法：python3 ts_make_save.py <导出目录> [场景：basic / blocks / plants / night]   （TS_URL 默认 http://127.0.0.1:5173/）
做法：种子 123、创造模式新建世界 → 在玩家前方用代码摆一组方块（石柱、玻璃、火把、羊毛）并挖掉一格 →
固定视角（偏航、俯仰）→ 跑到固定的世界时间 → leaveGame 存盘 → 把虚拟文件系统里这个世界的全部文件写到导出目录。"""
import base64, json, os, sys, time

SCENES = {
  # 默认：石柱、玻璃、红羊毛、火把，石柱挖空一格（第一次对比用的那个）
  'basic': ("""const T = W.Tile;
      for (let i = 0; i < 4; ++i) L.setTile(x + 3, y + i, z, T.rock.id);
      L.setTile(x + 3, y, z + 1, T.glass.id); L.setTile(x + 3, y + 1, z + 1, T.glass.id);
      L.setTileAndData(x + 3, y, z - 1, T.cloth.id, 14); L.setTile(x + 2, y + 1, z - 1, T.torch.id);
      L.setTile(x + 3, y + 2, z, 0);""", 1000),
  # 带方块实体与特殊形状的方块：门、楼梯、半砖、栅栏、箱子、熔炉、工作台、书架、TNT，以及墙上的梯子与告示牌
  'blocks': ("""const T = W.Tile; const X = x + 4;
      for (let dz = -5; dz <= 5; ++dz) for (let dy = 0; dy < 4; ++dy) L.setTile(X + 1, y + dy, z + dz, T.stoneBrick.id);
      L.setTileAndData(X, y, z - 4, T.door_wood.id, 0); L.setTileAndData(X, y + 1, z - 4, T.door_wood.id, 8);
      L.setTileAndData(X, y, z - 3, T.stairs_wood.id, 1);
      L.setTileAndData(X, y, z - 2, T.stoneSlabHalf.id, 0);
      L.setTile(X, y, z - 1, T.fence.id); L.setTile(X, y + 1, z - 1, T.fence.id);
      L.setTile(X, y, z, T.chest.id);
      L.setTileAndData(X, y, z + 1, T.furnace.id, 4);
      L.setTile(X, y, z + 2, T.workBench.id);
      L.setTile(X, y, z + 3, T.bookshelf.id);
      L.setTile(X, y, z + 4, T.tnt.id);
      L.setTileAndData(X, y + 2, z - 2, T.ladder.id, 4); L.setTileAndData(X, y + 3, z - 2, T.ladder.id, 4);
      L.setTileAndData(X, y + 2, z + 1, T.wallSign.id, 4);
      const te = L.getTileEntity(X, y + 2, z + 1); if (te) { te.messages[0] = 'Hello'; te.messages[1] = 'from TS'; }
      L.setTileAndData(X, y + 2, z + 3, T.torch.id, 2);""", 1000),
  # 植物与地面上的东西：仙人掌、花、草、麦子、甘蔗、树苗、西瓜、站立的告示牌、床
  'plants': ("""const T = W.Tile; const X = x + 4;
      for (let dz = -5; dz <= 5; ++dz) for (let dx = 0; dx < 3; ++dx) L.setTile(X + dx, y - 1, z + dz, T.grass.id);
      L.setTile(X, y - 1, z - 5, T.sand.id); L.setTile(X, y, z - 5, T.cactus.id); L.setTile(X, y + 1, z - 5, T.cactus.id);
      L.setTile(X, y, z - 4, T.flower.id); L.setTile(X, y, z - 3, T.rose.id);
      L.setTileAndData(X, y, z - 2, T.tallgrass.id, 1);
      L.setTile(X + 1, y - 1, z - 1, T.calmWater.id);
      L.setTileAndData(X, y - 1, z - 1, T.farmland.id, 7); L.setTileAndData(X, y, z - 1, T.crops.id, 7);
      L.setTile(X + 1, y - 1, z, T.sand.id); L.setTile(X, y, z, T.reeds.id); L.setTile(X, y + 1, z, T.reeds.id);
      L.setTile(X, y, z + 1, T.sapling.id);
      L.setTile(X, y, z + 3, T.melon.id);  // 南瓜、蛋糕在这一版里没有注册（C++ Tile.cpp 里被注释掉），不放
      L.setTileAndData(X + 1, y, z + 2, T.sign.id, 4);
      const te = L.getTileEntity(X + 1, y, z + 2); if (te) { te.messages[0] = 'Plants'; }
      L.setTileAndData(X + 2, y, z - 3, T.bed.id, 1); L.setTileAndData(X + 3, y, z - 3, T.bed.id, 9);""", 1000),
  # 夜里的光：水、岩浆、萤石、火把、玻璃；世界时间设到午夜（这一版一天 19200 刻）。
  # 必须是生存模式：DimensionFactory::createDefaultDimension 只给生存模式昼夜（NormalDayCycleDimension），创造模式的 Dimension 恒为白天
  'mobs': ("""const T = W.Tile; const X = x + 4;
      for (let dz = -5; dz <= 5; ++dz) for (let dx = -1; dx < 4; ++dx) { L.setTile(X + dx, y - 1, z + dz, T.grass.id); L.setTile(X + dx, y + 2, z + dz, T.glass.id); }
      for (let dz = -5; dz <= 5; ++dz) for (let dy = 0; dy < 2; ++dy) { L.setTile(X + 4, y + dy, z + dz, T.glass.id); L.setTile(X - 1, y + dy, z + dz, T.glass.id); }
      for (let dx = -1; dx < 4; ++dx) for (let dy = 0; dy < 2; ++dy) { L.setTile(X + dx, y + dy, z - 6, T.glass.id); L.setTile(X + dx, y + dy, z + 6, T.glass.id); }
      const kinds = [W.MobTypes.Pig, W.MobTypes.Cow, W.MobTypes.Sheep, W.MobTypes.Chicken, W.MobTypes.Zombie, W.MobTypes.Skeleton, W.MobTypes.Creeper, W.MobTypes.Spider];
      kinds.forEach((k, i) => { const m = W.MobFactory.CreateMob(k, L); m.moveTo(X + 1.5 + (i % 2), y, z - 4.5 + i * 1.2, 270, 0); L.addEntity(m); });""", 4800, 'Survival'),
  'night': ("""const T = W.Tile; const X = x + 4;
      for (let dz = -4; dz <= 4; ++dz) for (let dx = 0; dx < 4; ++dx) L.setTile(X + dx, y - 1, z + dz, T.stoneBrick.id);
      L.setTile(X + 1, y, z - 3, T.calmWater.id);
      L.setTile(X + 1, y, z + 3, T.calmLava.id);
      L.setTile(X + 2, y, z, T.lightGem.id);
      L.setTileAndData(X, y, z - 1, T.torch.id, 5); L.setTileAndData(X, y, z + 1, T.torch.id, 5);
      L.setTile(X + 3, y, z, T.glass.id); L.setTile(X + 3, y + 1, z, T.glass.id);""", 14400, 'Survival'),
}
from playwright.sync_api import sync_playwright
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
SCENE = sys.argv[2] if len(sys.argv) > 2 else 'basic'
BUILD, TIME, MODE = (SCENES[SCENE] + ('Creative',))[:3]
exe = os.environ.get('PW_CHROMIUM', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe, args=['--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 854, 'height': 480}); page.set_default_timeout(280000)
    logs = []; page.on('console', lambda m: logs.append(m.text))
    page.goto(os.environ.get('TS_URL', 'http://127.0.0.1:5173/')); page.wait_for_function('window.__app && window.__app.screen', timeout=90000); time.sleep(3)
    page.evaluate("""async ([root, mode]) => { const W = await import('/@fs' + root + '/packages/world/src/index.ts');
      const a = window.__app; a.options.set(8, 'Steve'); a.setScreen(null);
      a.selectLevel('tsworld', 'TS World', new W.LevelSettings(123, W.GameType[mode])); }""", [ROOT, MODE])
    page.wait_for_function('window.__app.level && window.__app.player', timeout=200000); time.sleep(3)
    info = page.evaluate(("""async (root) => { const W = await import('/@fs' + root + '/packages/world/src/index.ts');
      const a = window.__app, L = a.level, p = a.player;
      const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y - 1.62);
      ' + BUILD + '
      p.yRot = p.yRotO = -90; p.xRot = p.xRotO = 20;                              // 朝 +x 看、略向下
      return { x, y, z, time: L.getTime() }; }""").replace("' + BUILD + '", BUILD), ROOT)
    # 原版在打开游戏内界面（暂停等）时 saveLevelData + saveGame（level.dat 带 Player 标签、写 players/Steve.dat）；leaveGame 本身只存区块。这里直接调这两个
    page.evaluate(("() => { const a = window.__app; a.level.setTime(Math.max(a.level.getTime(), %d) - 20); while (a.level.getTime() < %d) a.tick(0, 0); a.level.saveLevelData(); a.level.saveGame(); return a.screen ? a.screen.constructor.name : null; }") % (TIME, TIME)); time.sleep(2)
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
