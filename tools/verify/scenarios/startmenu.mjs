// B8c 场景：起始菜单能出来、长得对；从它能进世界列表、能进新建世界。
//
// 【B8g 起它就是启动入口了】打开页面就在菜单上，所以下面第一句
// `screenChooser.setScreen(SCREEN_STARTMENU)` 是幂等的 —— 留着是为了让场景不依赖
// "启动入口是什么"这个前提。
// 【但世界列表得有东西可列】以前是启动时自动建 demo 世界，现在不会了。所以下面先走一遍
// 「进世界 → 退回标题」把世界造出来再存下去 —— 顺带把 B8f 那条路也覆盖了。
//
// 【C-6b 起这个场景能一路走到底了】B8 那会儿从菜单进世界会抛（世界生成没移植），
// 所以最后那两条断言写成了"点 Create / 点世界牌**会**抛"，注释里标明"将来会红"。
// 世界生成接上之后它们真的红了，现在翻成"真的进得去"—— 进世界的两条入口各钉一条。
//
// 【h.state 的 fn 只能写字面量】它会被 toString() 之后在页面里重新求值，闭包全丢。
// 所以进页面的数字一律写死（ScreenId.SCREEN_STARTMENU = 1）。
export default async function (h) {
  h.allowConsole('Missing category for tile'); // 见 default.mjs 里的说明

  await h.wait(1500);

  // ---- 先造一个世界出来（场景后门），再退回标题 ----
  await h.state('建/进 demo 世界', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000); // 等第一个 tick 的 _levelGenerated
  const back = await h.state('退回标题', (a) => {
    a.leaveGame();
    return {
      screen: a.screen && a.screen.constructor.name,
      level: a.level === null ? null : 'still-there',
      worlds: window.__vfs.listDir('/games/com.mojang/minecraftWorlds'),
    };
  });
  h.expect(back.screen === 'TouchStartMenuScreen', '退回标题，又回到起始菜单');
  h.expect(back.level === null, '世界拆掉了');
  h.expect(back.worlds.includes('demo'), 'demo 世界留在了存档里（不然下面的世界列表是空的）');

  const s0 = await h.state('把起始菜单调出来', (a) => {
    a.screenChooser.setScreen(1); // ScreenId.SCREEN_STARTMENU
    const s = a.screen;
    const titleId = a.textures.loadAndBindTexture('gui/title.png');
    const title = a.textures.getTemporaryTextureData(titleId);
    const ghId = a.textures.loadAndBindTexture('gui/logo/github.png');
    return {
      cls: s.constructor.name,
      isInGame: s.isInGameScreen(),
      buttons: s.buttons.map((b) => ({
        id: b.id,
        msg: b.msg,
        w: b.width,
        h: b.height,
        active: b.active,
      })),
      title: title ? [title.w, title.h] : null,
      githubOk: ghId !== -1,
      username: s.username,
    };
  });

  h.expect(s0.cls === 'TouchStartMenuScreen', '当前界面是起始菜单');
  h.expect(s0.isInGame === false, '它不算游戏内界面');
  h.expect(s0.buttons.length === 4, '三个大按钮 + 右上角的关闭按钮');
  h.expect(
    s0.buttons.map((b) => b.id).join(',') === '2,3,4,5',
    '按钮 id 是 2/3/4/5（开始游戏/加入游戏/选项/关闭）',
  );

  const big = s0.buttons.filter((b) => b.id !== 5);
  h.expect(
    big.every((b) => b.w === 75 && b.h === 75),
    '三个大按钮都是 75×75（touchgui.png 里竖排的三块）',
  );
  h.expect(
    big.every((b) => b.active === true),
    '三个大按钮都是可点的',
  );
  const quit = s0.buttons.find((b) => b.id === 5);
  h.expect(quit.w === 34 && quit.h === 26, '关闭按钮是 34×26');

  // 标题图必须真的解码出来了 —— 版本号、版权、github 那几行都画在同一个 if 里，
  // 少一张图会一起消失。
  h.expect(s0.title !== null, 'gui/title.png 取到了贴图');
  h.expect(s0.title[0] > 0 && s0.title[1] > 0, 'title.png 有实际像素（不是空的 TextureData）');
  h.expect(s0.githubOk === true, 'gui/logo/github.png 也在预加载表里');
  h.expect(s0.username.startsWith('Username: '), '左上角显示用户名');

  await h.shot('01-起始菜单');

  // 换个尺寸再截一张：这是**手机上会遇到的宽高比**。
  // main.ts 里挂了 window 的 resize 监听（→ app.setSize → screen.setSize），所以改视口就够了。
  await h.page.setViewportSize({ width: 480, height: 800 });
  await h.wait(500);
  const s1 = await h.state('换成竖屏之后', (a) => {
    const s = a.screen;
    return {
      w: s.width,
      h: s.height,
      // 注意 buttons 是按 push 顺序（host, join, options, quit），不是视觉顺序
      big: s.buttons
        .filter((b) => b.id !== 5)
        .map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.width })),
    };
  });
  // C++ 的公式：yBase = 2 + height/3；spacing = (width - 3*75)/4（浮点）；
  //   x = 第几个*75 + (int)(第几个+1 倍的 spacing) —— **spacing 是浮点，只在对齐时截断**
  //   （先截断再乘会差 1~2 像素，这个断言最初就是那么写错的）。
  const sp = (s1.w - 3 * 75) / 4;
  const byId = (id) => s1.big.find((b) => b.id === id);
  h.expect(
    s1.big.every((b) => b.y === 2 + Math.trunc(s1.h / 3)),
    '竖屏下三个按钮的 y 跟着重算',
  );
  h.expect(
    byId(3).x === Math.trunc(1 * sp) &&
      byId(2).x === 75 + Math.trunc(2 * sp) &&
      byId(4).x === 150 + Math.trunc(3 * sp),
    `竖屏下三个按钮的 x 仍按原版公式排（屏宽 ${s1.w}，spacing=${sp}）`,
  );
  await h.shot('02-起始菜单-竖屏');

  // ---- B8d-3：点「开始游戏」应该进世界列表 ----
  // 换回横屏再看，列表要横着翻牌才有意义。
  await h.page.setViewportSize({ width: 960, height: 540 });
  await h.wait(400);

  await h.state('点「开始游戏」', (a) => {
    // buttonClicked 在 TS 里是 protected，但浏览器里那只是编译期的 —— 直接调，
    // 走的是和真点击同一条路（Screen::mouseReleased → buttonClicked）。
    const start = a.screen.buttons.find((b) => b.id === 2);
    a.screen.buttonClicked(start);
    return { cls: a.screen.constructor.name };
  });
  // 【删除按钮的亮灭要等 tick】它是 tick() 里按当前选中项算出来的，刚 init 完还是构造函数
  // 里那个 false。这里等几帧再读。
  await h.wait(400);
  const s2 = await h.state('世界列表', (a) => {
    const s = a.screen;
    return {
      cls: s.constructor.name,
      isInGame: s.isInGameScreen(),
      listItems: s.worldsList.getNumberOfItems(),
      worldIds: s.worldsList.levels.map((l) => l.id),
      deleteActive: s.buttons.find((b) => b.id === 1).active,
      selected: s.worldsList.selectedItem,
      // 卡片上的预览图。**没进预加载表不会报错**，但 loadTexture 返回 InvalidId、bind 不执行，
      // 于是沿用上一次绑定的纹理 —— 表现为卡片上是一坨花屏（正好是刚画完字的字体图集）。
      preview: (() => {
        const id = a.textures.loadAndBindTexture('gui/default_world.png');
        const d = a.textures.getTemporaryTextureData(id);
        return d ? [d.w, d.h] : null;
      })(),
    };
  });
  h.expect(s2.cls === 'SelectWorldScreen', '进到选世界界面了');
  h.expect(s2.isInGame === true, '它算游戏内界面（列表背后还画着世界）');
  h.expect(s2.listItems === s2.worldIds.length + 1, '列表项数 = 世界数 + 1（那张 "Create new"）');
  h.expect(s2.worldIds.includes('demo'), 'demo 世界在列表里');
  h.expect(s2.selected === 0, '一进来选中的是第 0 张');
  h.expect(s2.deleteActive === true, '选中一个世界时删除按钮是亮的');
  h.expect(s2.preview !== null && s2.preview[0] > 0, '卡片预览图 gui/default_world.png 真的加载了');
  await h.shot('03-选世界');

  // ---- 「Create new」那张牌应该能翻到 ----
  const s3 = await h.state('往右翻一张', (a) => {
    const s = a.screen;
    s.worldsList.selectedItem = 0;
    s.worldsList.stepRight();
    return { mode: s.worldsList.mode, dur: s.worldsList.td.dur };
  });
  h.expect(s3.mode === 1, '翻牌起了一段补间');
  h.expect(s3.dur === 8, '补间 8 帧');
  await h.wait(400);
  await h.shot('04-翻到-Create-new');

  // ---- B8e：从选世界界面进「新建世界」 ----
  const s4 = await h.state('点「Create new」', (a) => {
    const list = a.screen;
    list.buttonClicked(list.buttons.find((b) => b.id === 2)); // bCreate
    const s = a.screen;
    return {
      cls: s.constructor.name,
      nameText: s.tLevelName.text,
      modeMsg: s.buttons.find((b) => b.id === 1).msg,
      levelBox: [s.tLevelName.x, s.tLevelName.y, s.tLevelName.width],
      seedBox: [s.tSeed.x, s.tSeed.y, s.tSeed.width],
    };
  });
  h.expect(s4.cls === 'SimpleChooseLevelScreen', '进到新建世界界面了');
  h.expect(s4.nameText.length > 0, '世界名有默认值（I18n 的 selectWorld.newWorld）');
  h.expect(s4.levelBox[2] === 200 && s4.seedBox[2] === 200, '两个输入框都是 200 宽');
  h.expect(s4.seedBox[1] === s4.levelBox[1] + 30, '种子框在世界名下方 30 像素');
  await h.wait(300);
  await h.shot('05-新建世界');

  // ---- B8b-2 的隐藏 input：点输入框之后，焦点应该跑到它上面 ----
  const s5 = await h.state('点一下世界名输入框', (a) => {
    const s = a.screen;
    s.mouseClicked(s.tLevelName.x + 10, s.tLevelName.y + 5, 1); // 1 = ACTION_LEFT
    return { focused: s.tLevelName.focused };
  });
  h.expect(s5.focused === true, '点一下输入框，它拿到焦点');

  const s6 = await h.state('焦点跑到哪去了', () => ({
    tag: document.activeElement ? document.activeElement.tagName : null,
    type: document.activeElement ? document.activeElement.type : null,
  }));
  h.expect(
    s6.tag === 'INPUT',
    '焦点落在 AppPlatform_web 挂的那个隐藏 <input> 上（手机上软键盘就是靠它弹出来的）',
  );

  // 用**真键盘**敲几个字，走完整的 DomInput → Keyboard.feedText → TextBox.charPressed 那条链
  const before5 = await h.state('敲字前', (a) => a.screen.tLevelName.text);
  await h.page.keyboard.type('XYZ');
  await h.wait(300);
  const after5 = await h.state('敲字后', (a) => a.screen.tLevelName.text);
  h.expect(before5 !== after5, '键盘输入真的进了输入框');
  h.expect(after5.endsWith('XYZ'), '敲进去的就是 XYZ（追加在默认名后面）');
  await h.shot('06-输入框聚焦并已输入');

  // ---- C-6b：点「Create」**真的进世界**（B8 时这里必抛，那两条断言就是为这一刻留的）----
  const s7 = await h.state('点「Create」', (a) => {
    const s = a.screen;
    const b = s.buttons.find((x) => x.id === 3); // bCreate
    try {
      s.buttonClicked(b);
      return { threw: false, msg: '', screen: a.screen ? a.screen.constructor.name : null };
    } catch (e) {
      return { threw: true, msg: String(e && e.message), screen: null };
    }
  });
  h.expect(s7.threw === false, `点 Create 不再抛（实际：${s7.msg.slice(0, 80)}）`);
  h.expect(s7.screen === 'ProgressScreen', '先看到「Generating world」那张加载屏');
  await h.wait(5000); // 普通世界比平坦世界慢：出生点周围要现算好几个区块
  const s7b = await h.state('世界建起来了', (a) => ({
    level: a.level === null ? null : 'loaded',
    player: a.player === null ? null : 'created',
    screen: a.screen ? a.screen.constructor.name : null,
    dimension: a.level ? a.level.dimension.constructor.name : null,
  }));
  h.expect(s7b.level === 'loaded' && s7b.player === 'created', '世界与玩家都建出来了');
  h.expect(s7b.screen === null, '加载屏自己关掉了（ProgressScreen.render 里那句 setScreen(null)）');
  h.expect(s7b.dimension !== 'FlatDimension', '是普通维度的真地形，不是 demo 那个平坦世界');
  await h.shot('07-从新建世界真的进了世界');

  // 退回标题，接着测**另一个**入口
  const back2 = await h.state('退回起始菜单', (a) => {
    a.leaveGame();
    return {
      cls: a.screen ? a.screen.constructor.name : null,
      level: a.level === null ? null : 'x',
    };
  });
  h.expect(back2.cls === 'TouchStartMenuScreen', '退回起始菜单');
  h.expect(back2.level === null, '世界拆掉了');
  await h.wait(600);

  // ---- C-6b：进世界的**另一条**入口 —— 在世界列表上点一张世界牌 ----
  // 和上面「Create」是同一个坑（都走 Minecraft.selectLevel），但入口不同、代码不同，值得各钉一条。
  const s8 = await h.state('进世界列表，点那张牌', (a) => {
    a.screenChooser.setScreen(5); // ScreenId.SCREEN_SELECTWORLD
    const list = a.screen;
    // 点"已经选中"的那张 = 挑中它；真正的 selectLevel 在 Screen.tick 里
    list.worldsList.selectItem(list.worldsList.selectedItem, false);
    const picked = list.worldsList.hasPickedLevel;
    try {
      list.tick();
      return { picked, threw: false, msg: '', screen: a.screen ? a.screen.constructor.name : null };
    } catch (e) {
      return { picked, threw: true, msg: String(e && e.message), screen: null };
    }
  });
  h.expect(s8.picked === true, '点一下世界牌，列表记下了"挑中这个"');
  h.expect(s8.threw === false, `进世界不再抛（实际：${s8.msg.slice(0, 80)}）`);
  await h.wait(5000);
  const s8b = await h.state('这个世界也建起来了', (a) => ({
    level: a.level === null ? null : 'loaded',
    player: a.player === null ? null : 'created',
    screen: a.screen ? a.screen.constructor.name : null,
    seed: a.level ? a.level.getSeed() : null,
  }));
  h.expect(s8b.level === 'loaded' && s8b.player === 'created', '世界与玩家都建出来了');
  h.expect(s8b.screen === null, '加载屏自己关掉了');
  await h.shot('08-从世界列表真的进了世界');
}
