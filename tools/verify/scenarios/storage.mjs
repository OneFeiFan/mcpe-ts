// B7 场景：世界能存下来，刷新之后还在。
//
// 这是整条存档链路的端到端验证 —— 单元测试和黄金样本各自只盖了一段：
//   VFS/IndexedDB（B1）、RegionFile（B3 + G14-1）、level.dat（B4 + G14-2/G14-4）、
//   区块载荷（B5 + G14-5）、entities.dat（B5 + G14-6）。
// 这里把它们串起来在**真浏览器**里跑一遍：放方块 → 存 → 刷新页面 → 方块还在。
//
// 【为什么"刷新"是关键】不刷新的话读回来的可能还是内存里那个 Level 对象；
// 只有真的重新加载页面，才会走 IndexedDB → VirtualFS → readLevelData → RegionFile 这一整条路。
//
// 【h.state 的 fn 只能写字面量】它会被 toString() 之后在页面里重新求值，闭包全丢，
// 引用任何 Node 侧的变量都是 ReferenceError（第一版就是这么炸的）。所以进页面的数字一律写死；
// 唯一"从外面拿"的东西只有 `a.player`，而那是页面里的对象。
//
// 【为什么把 yRot 钉成 0 再算墙的位置】墙摆在玩家正前方，位置得从玩家坐标推。
// 但刷新后要再算一次才知道去哪儿找那堵墙，所以朝向必须是确定值 —— yRot = 0 就是朝 +z，
// 这样两次算出来的坐标一定一样。（也试过瞬移玩家去看墙，结果镜头在坠落途中，地面全出画了。）
const WALL_TILE = 1; // Tile.stone

/** 在玩家正前方 3 格砌一堵 3×3 的石墙，返回墙心坐标 */
const BUILD_WALL = (a) => {
  a.player.yRot = 0; // 朝 +z
  const cx = Math.floor(a.player.x);
  const cz = Math.floor(a.player.z) + 3;
  const cy = Math.floor(a.player.y);
  for (let dy = 0; dy < 3; dy++) {
    for (let i = -1; i <= 1; i++) {
      a.level.setTile(cx + i, cy + dy, cz, 0); // 先清成空气，免得测到地形本来就有的东西
      a.level.setTile(cx + i, cy + dy, cz, 1);
    }
  }
  return { cx, cy, cz, mid: a.level.getTile(cx, cy + 1, cz) };
};

/** 刷新后按同一条公式找回墙心（只读，不改世界） */
const FIND_WALL = (a) => {
  a.player.yRot = 0;
  const cx = Math.floor(a.player.x);
  const cz = Math.floor(a.player.z) + 3;
  const cy = Math.floor(a.player.y);
  return { cx, cy, cz, mid: a.level.getTile(cx, cy + 1, cz) };
};

export default async function (h) {
  // 原版自己的诊断，见 default.mjs 里的说明（registry.json 里那几个 tile 的 category 就是 -1）。
  h.allowConsole('Missing category for tile');

  await h.wait(1500);

  // ---- B8g：启动入口是起始菜单，场景自己把世界造出来 ----
  // 【为什么走后门】从菜单点进世界要走 `Minecraft.selectLevel`，那条路会抛（世界生成没移植）。
  // `startDemoWorld()` 是 ADAPTED(Demo) 的公开方法，走的还是真存档 —— 所以存档这条链照旧能测。
  await h.state('建/进 demo 世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000); // 等第一个 tick 的 _levelGenerated 把玩家建出来

  const s0 = await h.state('首次进入：没有存档，建出 demo 世界', (a) => ({
    dimension: a.level.dimension.constructor.name,
    worlds: window.__vfs.listDir('/games/com.mojang/minecraftWorlds'),
    files: window.__vfs.listDir('/games/com.mojang/minecraftWorlds/demo'),
    spawn: [a.player.x, a.player.y, a.player.z],
  }));
  h.expect(s0.dimension === 'FlatDimension', 'demo 是平坦世界');
  h.expect(s0.worlds.includes('demo'), '世界目录已经建出来了');
  h.expect(s0.files.includes('level.dat'), 'level.dat 已经写下来了');
  await h.shot('01-首次进入');

  const placed = await h.state('在准星前方砌一堵石墙', BUILD_WALL);
  h.expect(placed.mid === WALL_TILE, '石墙砌好了');
  await h.wait(500); // 让区块标记成 unsaved 再存
  await h.shot('02-砌好石墙');

  const saved = await h.state('存档并落盘', async (a) => {
    a.level.saveLevelData();
    a.level.getChunkSource().saveAll(true); // 与 Minecraft.prepareLevel 里对新建世界做的是同一件事
    await window.__vfs.flush(); // 防抖是 200ms，这里强制写进 IndexedDB
    return { files: window.__vfs.listDir('/games/com.mojang/minecraftWorlds/demo').sort() };
  });
  h.expect(saved.files.includes('chunks.dat'), '区块文件写出来了');
  h.expect(saved.files.includes('entities.dat'), '实体文件写出来了');

  // ---- 真的刷新页面 ----
  await h.page.reload({ waitUntil: 'load' });
  await h.page.waitForFunction(() => globalThis.__app !== undefined, null, { timeout: 60_000 });
  await h.wait(1500);

  // 刷新之后又回到起始菜单（B8g 起启动入口就是它），照样从后门进世界 ——
  // 只不过这次 demo 已经存在了，走的是"读回来"那条路（`isNew()` 下面会断言）。
  const fresh = await h.state('刷新之后：先确认落到起始菜单', (a) => ({
    screen: a.screen && a.screen.constructor.name,
    level: a.level === null ? null : 'loaded',
  }));
  h.expect(fresh.screen === 'TouchStartMenuScreen', '刷新后回到起始菜单，不是直接进世界');
  h.expect(fresh.level === null, '刷新后世界里还没东西');
  await h.state('再进那个世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000);

  const s2 = await h.state('刷新之后', (a) => ({
    levelName: a.level.getLevelData().getLevelName(),
    isNew: a.level.isNew(),
    files: window.__vfs.listDir('/games/com.mojang/minecraftWorlds/demo').sort(),
  }));
  h.expect(s2.isNew === false, '这个世界是从磁盘读回来的，不是新建的');
  h.expect(s2.levelName === 'demo', '世界名也读回来了');
  h.expect(s2.files.includes('chunks.dat'), '存档文件还在');

  const after = await h.state('刷新之后：石墙还在不在', FIND_WALL);
  h.expect(
    after.cx === placed.cx && after.cy === placed.cy && after.cz === placed.cz,
    '刷新后玩家还站在同一个地方（世界是从存档恢复的）',
  );
  h.expect(after.mid === WALL_TILE, '刷新之后那堵石墙还在');
  await h.shot('03-刷新之后');
}
