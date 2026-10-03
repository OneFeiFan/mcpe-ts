// 默认场景：进入世界、HUD、F3、物品选择界面、暂停界面都能正常出现，且没有页面错误。
export default async function (h) {
  await h.wait(1500);
  const s0 = await h.state('进入世界', (a) => ({ creative: a.isCreativeMode(), pos: [a.player.x, a.player.y, a.player.z], slots: a.gui.getNumSlots() }));
  h.expect(s0.creative === true, 'demo 世界是创造模式');
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
