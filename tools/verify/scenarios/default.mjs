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

  // ---- B8f：暂停界面的「Quit to title」把世界拆掉、退回起始菜单 ----
  // 【为什么放最后】拆掉之后这个 demo 世界就回不来了 —— 再进世界要走 selectLevel，
  // 而世界生成（RandomLevelSource）还没移植。所以这一步之后场景就结束。
  // "退出前先把改动落盘"由单测 leave-game.test.ts 钉住（那里能真的重进世界比对），
  // 浏览器侧只验证拆干净了、界面退对了、而且拆完还能继续跑帧不报错。
  const s3 = await h.state('点「Quit to title」', (a) => {
    const s = a.screen;
    s.buttonClicked(s.buttons.find((b) => b.msg === 'Quit to title'));
    return {
      level: a.level === null ? null : 'still-there',
      player: a.player === null ? null : 'still-there',
      screen: a.screen && a.screen.constructor.name,
      isInGame: a.screen && a.screen.isInGameScreen(),
      rendererLevel: a.levelRenderer.level === null ? null : 'still-there',
      files: window.__vfs.listDir('/games/com.mojang/minecraftWorlds/demo').sort(),
    };
  });
  h.expect(s3.level === null, '世界拆掉了（app.level 变成 null）');
  h.expect(s3.player === null, '玩家也清掉了');
  h.expect(s3.rendererLevel === null, 'levelRenderer 上挂的世界一并摘掉（不然还接着画旧世界）');
  h.expect(s3.screen === 'TouchStartMenuScreen', '界面退回起始菜单');
  h.expect(s3.isInGame === false, '起始菜单不算游戏内界面');
  h.expect(s3.files.includes('level.dat'), '存档没被顺手删掉：level.dat 还在');
  h.expect(s3.files.includes('chunks.dat'), '存档没被顺手删掉：chunks.dat 还在');

  // 关键：离开游戏之后主循环还在转（相机目标、玩家全是 null）。多跑几帧，
  // 任何空指针都会变成 pageerror 让这个场景挂掉。
  await h.wait(1200);
  const s4 = await h.state('退出之后又跑了几帧', (a) => ({
    screen: a.screen && a.screen.constructor.name,
    hint: document.querySelector('#status')?.textContent,
  }));
  h.expect(s4.screen === 'TouchStartMenuScreen', '跑了几帧之后还稳稳停在起始菜单');
  h.expect(s4.hint === '' || s4.hint === undefined, '没有冒出报错提示（空指针会被主循环抛出来）');
  await h.shot('04-退回起始菜单');
}
