// 鼠标光标场景：界面里系统光标看得见吗？点的位置对不对？
//
// 【必须用 SMOKE_DPR=1.5 跑】
//   node tools/verify/smoke.mjs tools/verify/scenarios/cursor.mjs            # dpr=1（跑不出问题）
//   SMOKE_DPR=1.5 node tools/verify/smoke.mjs tools/verify/scenarios/cursor.mjs
//
// 因为这两个 bug 都只在 dpr 不是 1 的时候才现形（见下）。场景自己会检查 dpr，不是 1.5 就报错，
// 免得"跑绿了"其实是没测到。
//
// 【两个 bug】
//   1. **界面里系统光标被藏了。** `AppPlatform_web.hideCursor` 是照着参考实现的**形参名**写的
//      （`hide ? 'none' : ''`），而参考 `AppPlatform_glfw.h` 的三元表达式其实是反的
//      （`hide ? GLFW_CURSOR_NORMAL : GLFW_CURSOR_HIDDEN`，形参名骗人）。于是每进一个界面
//      光标就被设成 `none`，而 `rpiCursor` 默认 false、游戏也不画自己的光标 → 两边都没有，只能盲选。
//   2. **鼠标坐标是 CSS 像素，画布是设备像素。** `main.ts` 里 `canvas.width = clientWidth * dpr`，
//      而 `DomInput` 用 `getBoundingClientRect()` 取坐标（CSS 像素）。dpr=1.5 时光标最多只能够到
//      屏幕的 1/1.5 —— 表现为"运动范围有限制"，右下角三分之一的按钮点不到。

export default async function (h) {
  h.allowConsole('Missing category for tile'); // 见 default.mjs 里的说明

  await h.wait(1500);

  // ---- 0. 先在**没有界面**的时候量一次坐标系 ----
  const geo = await h.state('画布与坐标系', () => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    const a = globalThis.__app;
    return {
      dpr: window.devicePixelRatio,
      client: [c.clientWidth, c.clientHeight], // CSS 像素
      buffer: [c.width, c.height], // 设备像素
      styleCursor: c.style.cursor,
      computedCursor: getComputedStyle(c).cursor,
      mc: [a.width, a.height], // 游戏认为的屏幕尺寸
    };
  });
  h.expect(geo.dpr !== 1, `这个场景要在 SMOKE_DPR=1.5 下跑（当前 dpr=${geo.dpr}）`);
  h.expect(
    geo.buffer[0] === Math.round(geo.client[0] * geo.dpr),
    `画布缓冲区是 CSS 尺寸 × dpr（${geo.client[0]}×${geo.dpr}=${geo.buffer[0]}）`,
  );
  h.expect(geo.mc[0] === geo.buffer[0], 'app.width 就是画布缓冲区宽度，两者同单位');

  // ---- 1. 起始菜单：光标应该看得见 ----
  await h.state('回到起始菜单', (a) => {
    a.screenChooser.setScreen(1); // ScreenID.SCREEN_STARTMENU
    return { cls: a.screen.constructor.name };
  });
  await h.wait(600);

  const menu = await h.state('起始菜单上的光标', () => {
    const c = document.querySelector('canvas');
    return {
      styleCursor: c.style.cursor,
      computedCursor: getComputedStyle(c).cursor,
      hidden: getComputedStyle(c).cursor === 'none',
    };
  });
  h.expect(
    menu.hidden === false,
    `起始菜单上系统光标是可见的（cursor=${JSON.stringify(menu.styleCursor)}）`,
  );
  await h.shot('01-起始菜单（光标应可见，截图拍不到系统光标，看断言）');

  // ---- 2. 点得准吗：把真鼠标放到按钮正中间，看它开不开对应的界面 ----
  //
  // 按钮坐标是 GUI 坐标（= 设备像素 × InvGuiScale）。要换成 CSS 像素：
  //     css = gui / InvGuiScale / dpr
  // `DomInput` 那边反过来：gui = css * (换算系数) * InvGuiScale。
  // 两边的系数要一样，点才准。dpr≠1 而系数没算 dpr 时，鼠标只能够到左上角 1/dpr。
  const target = await h.state('量一个按钮的位置', (a) => {
    const s = a.screen;
    const b = s.buttons.find((x) => x.id === 2); // 2 = 开始游戏
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return {
      gui: [b.x, b.y, b.width, b.height],
      screenW: s.width,
      mcW: a.width,
      cssW: r.width,
    };
  });
  // InvGuiScale = 屏幕 GUI 宽 / mc 宽。界面自己就是这么算的（Gui 里那些 * InvGuiScale）。
  const invGuiScale = target.screenW / target.mcW;
  const scale = target.cssW / target.screenW; // GUI 坐标 → CSS 像素
  const btnCssX = (target.gui[0] + target.gui[2] / 2) * scale;
  const btnCssY = (target.gui[1] + target.gui[3] / 2) * scale;
  const inRange = btnCssX <= target.cssW && btnCssY <= target.cssW;
  h.expect(
    inRange,
    `「开始游戏」按钮换算成 CSS 像素后在画布范围内（${Math.round(btnCssX)},${Math.round(btnCssY)} ≤ ${target.cssW}）` +
      ' —— 如果超了，说明按钮本身就画到了鼠标够不着的地方',
  );

  await h.page.mouse.move(btnCssX, btnCssY);
  await h.wait(300);
  await h.page.mouse.down();
  await h.page.mouse.up();
  await h.wait(800);

  const after = await h.state('点下去之后到了哪一屏', (a) => ({
    screen: a.screen ? a.screen.constructor.name : null,
  }));
  h.expect(
    after.screen === 'SelectWorldScreen',
    `鼠标放在「开始游戏」正中间点一下，真的进了选世界界面（实际：${after.screen}）`,
  );
  await h.shot('02-点对了按钮');
}
