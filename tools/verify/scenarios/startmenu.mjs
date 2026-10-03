// B8c 场景：起始菜单能出来、长得对。
//
// 【为什么不走启动入口】任务单里定了两条：B8 期间启动入口不动（打开页面还是直接进 demo 世界），
// 而且现在从菜单进世界会撞上 `selectLevel` 抛异常（世界生成还没移植）。所以这里直接调
// `screenChooser.setScreen(SCREEN_STARTMENU)` 把菜单摆出来看 —— 验证的是**界面本身**。
//
// 【h.state 的 fn 只能写字面量】它会被 toString() 之后在页面里重新求值，闭包全丢。
// 所以进页面的数字一律写死（ScreenId.SCREEN_STARTMENU = 1）。
export default async function (h) {
  h.allowConsole('Missing category for tile'); // 见 default.mjs 里的说明

  await h.wait(1500);

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
}
