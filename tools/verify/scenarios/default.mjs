// 默认场景：进入世界、HUD、F3、物品选择界面、暂停界面都能正常出现，且没有页面错误。
export default async function (h) {
  // 进世界时 Tile::initTiles / Item::initItems 会打 4 条 “Missing category for tile”。
  // 这是原版自己的诊断，不是移植问题：黄金样本 fixtures/golden/registry.json 里
  // tile 87(hellrock)、95(InvisibleTile)、253(CarriedTile)、255 的 category 就是 -1，
  // 参考源码 Tile.cpp:298 也照样 LOGE。所以在这里声明为“预期内”。
  h.allowConsole('Missing category for tile');

  await h.wait(1500);
  const s0 = await h.state('进入世界', (a) => ({
    creative: a.isCreativeMode(),
    pos: [a.player.x, a.player.y, a.player.z],
    slots: a.gui.getNumSlots(),
  }));
  h.expect(s0.creative === true, 'demo 世界是创造模式');
  // #status 只用于“正在初始化…”和启动失败；游戏起来后必须是空的，否则画面左上角会一直压着一行字（原版没有）
  const hint = await h.state('左上角提示', () => document.querySelector('#status')?.textContent);
  h.expect(hint === '', '#status 已清空，画面上没有常驻提示文字');

  // 存档地基：main.ts 在 app.init 之前建好 VirtualFS 并挂到 window.__vfs。
  // 这里在**真浏览器**里跑一次 写 → 落盘 → 读回 —— 单元测试用的是 fake-indexeddb，
  // 只能证明逻辑对，证明不了真 IndexedDB 这条链通。写完自己清理掉，不污染浏览器配置。
  const rt = await h.state('存档往返', async () => {
    const vfs = window.__vfs;
    if (typeof vfs?.open !== 'function') return { error: 'window.__vfs 上没有 open' };
    vfs.mkdir('/smoke');
    const w = vfs.open('/smoke/probe.dat', 'wb');
    w.write(new Uint8Array([1, 2, 3]), 1, 3);
    w.close();
    await vfs.flush();
    const r = vfs.open('/smoke/probe.dat', 'rb');
    const buf = new Uint8Array(3);
    const n = r.read(buf, 1, 3);
    r.close();
    vfs.remove('/smoke/probe.dat');
    await vfs.flush();
    const gone = !vfs.exists('/smoke/probe.dat');
    return { n, bytes: [...buf], gone };
  });
  h.expect(
    rt.n === 3 && rt.bytes.join(',') === '1,2,3' && rt.gone === true,
    '真浏览器里 IndexedDB 的 写→落盘→读回→删除 往返是通的',
  );

  await h.shot('01-游戏中');
  await h.page.evaluate(() => window.__app.screenChooser.setScreen(6)); // SCREEN_BLOCKSELECTION
  await h.wait(800);
  const s1 = await h.state('物品选择界面', (a) => a.screen && a.screen.constructor.name);
  h.expect(s1 === 'TouchIngameBlockSelectionScreen', '按 E 对应的物品选择界面能打开');
  await h.shot('02-物品选择界面');
  await h.page.evaluate(() => window.__app.setScreen(null));
  await h.page.evaluate(() => window.__app.screenChooser.setScreen(3)); // SCREEN_PAUSE
  await h.wait(800);
  const s2 = await h.state('暂停界面', (a) => a.screen && a.screen.constructor.name);
  h.expect(s2 === 'PauseScreen', '暂停界面能打开');
  await h.shot('03-暂停界面');
}
