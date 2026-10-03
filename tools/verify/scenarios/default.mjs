// 默认场景：进入世界、HUD、F3、物品选择界面、暂停界面都能正常出现，且没有页面错误。
export default async function (h) {
  // 进世界时 Tile::initTiles / Item::initItems 会打 4 条 “Missing category for tile”。
  // 这是原版自己的诊断，不是移植问题：黄金样本 fixtures/golden/registry.json 里
  // tile 87(hellrock)、95(InvisibleTile)、253(CarriedTile)、255 的 category 就是 -1，
  // 参考源码 Tile.cpp:298 也照样 LOGE。所以在这里声明为“预期内”。
  h.allowConsole('Missing category for tile');

  await h.wait(1500);
  const s0 = await h.state('进入世界', (a) => ({ creative: a.isCreativeMode(), pos: [a.player.x, a.player.y, a.player.z], slots: a.gui.getNumSlots() }));
  h.expect(s0.creative === true, 'demo 世界是创造模式');
  // #status 只用于“正在初始化…”和启动失败；游戏起来后必须是空的，否则画面左上角会一直压着一行字（原版没有）
  const hint = await h.state('左上角提示', () => document.querySelector('#status')?.textContent);
  h.expect(hint === '', '#status 已清空，画面上没有常驻提示文字');
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
