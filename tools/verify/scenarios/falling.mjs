// D2 场景：落沙接线。世界里多了一格会掉的方块，而且是**游戏自己的循环**把它弄掉的。
//
// 这是 D2 唯一能证明"接线真的接上了"的地方。单测（fallingtile-wiring.test.ts）是直接调
// `heavy.tick(...)`、自己驱动 `tickEntities()`；这里一格方块都不手动 tick ——
// 只把方块放进世界、或者挖掉底下的方块，剩下交给
// `Minecraft.tick` → `Level.tick` → `tickPendingTicks` → `HeavyTile.checkSlide` → `FallingTile`。
//
// 【⚠ 这里推翻过一个想当然的结论，记下来】原以为"沙子（SandTile）只在随机刻检查下落，
// 所以场景里没法等，得手动递一刻进去"。**是错的**：
// `Tile.cpp:173` 是 `sand = (new HeavyTile(12, 18))->init()...` —— **游戏里的沙子本来就是
// HeavyTile**，放下去就排刻、邻居变了也排刻，自己就会掉。`SandTile` 那个类是**死代码**，
// 全参考源码里一处都没被实例化（`rg SandTile src/` 只命中它自己和 Tile.cpp 里一行注释掉的 hellSand）。
// 这个错误是**这个场景自己抓出来的**：埋了条"沙子不该排刻"的断言，跑出来是 +1，
// 顺着查才挖到 `Tile.cpp:173`。现在 SandTile.ts 的头注释已经改对了。
//
// 【h.state 的 fn 只能写字面量】**闭包和模块级常量全都看不见** —— 它会被 toString() 之后
// 在页面里 `new Function` 重新求值（见 smoke.mjs:140-152）。所以下面每个 state 里都用**裸数字**，
// 而且**每次都要重新读一遍玩家坐标**（不能从外面传进来）。
// （第一版在文件顶上定义了 AIR_TOP / SPAWN_Y，然后在 state 里用了它们 —— 直接
//  `ReferenceError: AIR_TOP is not defined`。注释里写了的坑，自己照样踩。）
//
// 世界坐标约定：平坦 demo 世界的平台是区块 7–9，方块 x/z 112..159，地表草在 y=63，
// 上面全是空气。出生点在世界中心附近（128,128），所以玩家脚下就在平台里，往 +z 走 14 格
// 还在平台上（128+14=142 < 159）。
// 方块一律放在**玩家正前方 14 格**（下面每个 state 里的 `+ 14`）：镜头站在原地看着 +z，
// 只要把俯仰角算对就能拍到。
// 下落起点取 y=100、落点是地表顶上第一格 y=64：FallingTile 自由落体的稳态速度约
// 1.96 格/刻（yd 收敛在 -1.96），掉 36 格要跑 20 来刻 ≈ 1 秒（20 TPS），
// 够场景轮询到"它正在半空中"。
//
// 【俯仰角】MC 里 `xRot` 是俯仰，90 = 朝下、-90 = 朝上（视线 = (-sin(yaw)cos(pitch), -sin(pitch),
// cos(yaw)cos(pitch))）。所以要看向正前方 14 格、高 dy 处的目标：
// `xRot = -(atan2(dy, 14) * 180 / PI)`，其中 dy = 目标 y − 眼睛 y。

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);

  // ---- 进 demo 世界（场景后门）：这里测的是落沙接线，不是世界生成，平坦世界跑得快 ----
  await h.state('建/进 demo 世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000);

  // ---- 摆好机位：站定、朝 +z 平视。之后整个场景玩家都不再移动 ----
  const view = await h.state('摆机位：朝 +z 看', (a) => {
    a.player.yRot = 0; // yaw 0 = 朝 +z
    a.player.xRot = 0;
    a.player.y = 65;
    const px = Math.floor(a.player.x);
    const pz = Math.floor(a.player.z);
    const top = (() => {
      for (let y = 127; y > 0; y--) if (a.level.getTile(px, y, pz) !== 0) return y;
      return -1;
    })();
    return {
      px,
      pz,
      top,
      surface: a.level.getTile(px, top, pz),
      ahead: a.level.getTile(px, 64, pz + 14),
      airAt100: a.level.getTile(px, 100, pz + 14),
    };
  });
  h.expect(view.surface === 2, `脚下是草方块（实测 id=${view.surface}，平台顶 y=${view.top}）`);
  h.expect(view.top === 63, '平台顶就是 y=63（平坦世界的地层是固定的）');
  h.expect(view.ahead === 0 && view.airAt100 === 0, '正前方 14 格的地面和半空都是空气，有地方放');
  await h.wait(600);
  await h.shot('00-站定，朝 +z');

  // ---- 一、空中放一格沙砾（id 13 = GravelTile extends HeavyTile）：放下去就自己掉 ----
  // 用 setTile（会触发 onPlace），不是 setTileNoUpdate。
  const gravelPut = await h.state('在正前方半空放一格沙砾', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 14;
    const before = a.level._pendingTickCountForTest();
    a.level.setTile(px, 100, bz, 13); // 13 = Tile.gravel
    const after = a.level._pendingTickCountForTest();
    return { put: a.level.getTile(px, 100, bz), scheduled: after - before };
  });
  h.expect(gravelPut.put === 13, '沙砾放进去了');
  h.expect(
    gravelPut.scheduled >= 1,
    `沙砾的 onPlace 往计划刻队列里排了一刻（实测 +${gravelPut.scheduled}）—— 这就是接线的入口`,
  );

  // 轮询：趁它还在半空中，抓一次"世界里真的有个 FallingTile"。
  // ⚠ 不能抓到第一次 n>0 就停：那多半是刚建出来的出生位置（y=100.5），
  // 断言"已经在往下掉"就挂了。要一直等到它**已经往下走过**才算数。
  let seen = null;
  let first = null;
  for (let i = 0; i < 60; i++) {
    const s = await h.state('半空中找 FallingTile', (a) => {
      const list = a.level.entities.filter((e) => e.constructor.name === 'FallingTile');
      const src = list.find((e) => e.tile === 13);
      return { n: src ? 1 : 0, y: src ? src.y : null, tile: src ? src.tile : null };
    });
    if (s.n > 0 && first === null) first = s;
    if (s.n > 0 && s.y < 99.5) {
      seen = s;
      break;
    }
    await h.wait(50);
  }
  h.expect(first !== null, '世界里真的出现了一个 FallingTile（不是直接搬方块，是造了实体）');
  h.expect(
    seen !== null,
    `等到它在往下掉（抓到的最靠后一次：${seen ? `y=${seen.y.toFixed(2)}` : '一直没低于 99.5'}）`,
  );
  if (seen) {
    h.expect(seen.tile === 13, `实体记的方块就是沙砾（tile=${seen.tile}）`);
    h.expect(seen.y > 64 && seen.y < 99.5, `抓到的时候它在半空中（y=${seen.y.toFixed(2)}）`);

    // 【为什么要暂停才拍得到】无头浏览器里画面只有约 1 帧/秒（worldgen.mjs 也记了这条），
    // 而落体每刻走约 2 格 —— 等截图落盘，方块早着地了，拍出来是一片空天（第一版就是）。
    // `Minecraft.pause` 只挡住 `level.tick/tickEntities`（Minecraft.ts:557-577），
    // 渲染照跑，所以把世界按住、等画面追上来，就能拍到一个定格在半空的实体。
    const froze = await h.state('按住世界，把下落的沙砾定格并对准它', (a) => {
      a.pause = true;
      const list = a.level.entities.filter((e) => e.constructor.name === 'FallingTile');
      const src = list.find((e) => e.tile === 13);
      if (!src) return { frozen: null };
      const dy = src.y - (a.player.y + 1.62); // 眼睛在脚上方 1.62
      const pitch = -(Math.atan2(dy, 14) * 180) / Math.PI;
      a.player.xRot = pitch;
      // ⚠ 暂停之后必须**手动把 xRotO 也对齐**：相机实际用的是
      //   `xRotO + (xRot - xRotO) * a` 这个插值（EntityRenderer 分派器 prepare 里那句），
      //   而 xRotO 只在 `Entity.tick()` 里被赋成 xRot。世界一按住就不 tick 了，
      //   于是 xRotO 停在旧值、镜头只插值转过去一小截 —— 实体在 33 格高处，
      //   直接被视锥裁掉，拍出来是一片空天（第一版就是这个原因，查了半天以为是渲染器没生效）。
      a.player.xRotO = pitch;
      a.player.yRot = 0;
      a.player.yRotO = 0;
      return { frozen: src.y, xRot: a.player.xRot, bb: [src.bb.x0, src.bb.y0, src.bb.z0] };
    });
    h.expect(froze.frozen !== null, `定格成功（y=${froze.frozen}）`);
    await h.wait(1500); // 让渲染真的追上这个状态
    await h.shot('01-沙砾在半空中');
    await h.state('放开世界', (a) => {
      a.pause = false;
      return { pause: a.pause };
    });
  }

  // 等它落地
  await h.wait(4000);
  const gravelLand = await h.state('沙砾落地了吗（顺带把镜头压低看地面）', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 14;
    a.player.xRot = -(Math.atan2(65 - (a.player.y + 1.62), 14) * 180) / Math.PI;
    return {
      from: a.level.getTile(px, 100, bz),
      land: a.level.getTile(px, 64, bz),
      below: a.level.getTile(px, 63, bz),
      falling: a.level.entities.filter((e) => e.constructor.name === 'FallingTile').length,
    };
  });
  h.expect(gravelLand.from === 0, '原来那一格空了（FallingTile 第一刻把它清掉了）');
  h.expect(gravelLand.land === 13, `沙砾落到地面 y=64（实测 id=${gravelLand.land}）`);
  h.expect(gravelLand.below === 2, '下面那格还是草 —— 没穿地');
  h.expect(gravelLand.falling === 0, '落地之后实体自己消失了');
  await h.wait(500);
  await h.shot('02-沙砾落地了');

  // ---- 二、沙子上挖掉底下那格（这就是任务单要的那条）----
  // 沙子（id 12）**也是 HeavyTile**（见文件头）：站在一块悬空的石头上时它不掉，
  // 把石头挖掉 → `neighborChanged` → 排刻 → 掉下来。
  const built = await h.state('在半空垒一格石头，上面放一格沙子', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 15; // ⚠ 旁边一格：沙砾已经占了 +14 那格的地面
    a.level.setTile(px, 74, bz, 1); // 1 = 石头，悬在半空
    const before = a.level._pendingTickCountForTest();
    a.level.setTile(px, 75, bz, 12); // 12 = Tile.sand
    const after = a.level._pendingTickCountForTest();
    const dy = 75.5 - (a.player.y + 1.62);
    a.player.xRot = -(Math.atan2(dy, 15) * 180) / Math.PI;
    return {
      stone: a.level.getTile(px, 74, bz),
      sand: a.level.getTile(px, 75, bz),
      scheduled: after - before,
    };
  });
  h.expect(built.stone === 1 && built.sand === 12, '石头和沙子都放好了');
  h.expect(
    built.scheduled >= 1,
    `沙子放下去也排了一刻（实测 +${built.scheduled}）—— 跟沙砾一样，都是 HeavyTile`,
  );

  await h.wait(1200);
  const held = await h.state('沙子还站在石头上', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 15;
    return { sand: a.level.getTile(px, 75, bz), stone: a.level.getTile(px, 74, bz) };
  });
  h.expect(
    held.sand === 12 && held.stone === 1,
    '底下的石头撑着它，所以它没掉 —— `checkSlide` 里 `isFree(下面那格)` 为假',
  );
  await h.shot('03-沙子站在悬空石头上');

  // 挖掉底下那格
  const dug = await h.state('把石头挖掉', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 15;
    const before = a.level._pendingTickCountForTest();
    a.level.setTile(px, 74, bz, 0);
    const after = a.level._pendingTickCountForTest();
    return { stone: a.level.getTile(px, 74, bz), scheduled: after - before };
  });
  h.expect(dug.stone === 0, '石头挖掉了');
  h.expect(
    dug.scheduled >= 1,
    `挖掉底下那格，上面的沙子经 neighborChanged 排了一刻（实测 +${dug.scheduled}）`,
  );

  await h.wait(4000);
  const sandLand = await h.state('沙子落地了吗（镜头压低）', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 15;
    // 瞄落地之后那格方块的**顶面** y=65（不是下落起点 y=75，写成 75 就朝天看了）
    a.player.xRot = -(Math.atan2(65.0 - (a.player.y + 1.62), 15) * 180) / Math.PI;
    return {
      from: a.level.getTile(px, 75, bz),
      land: a.level.getTile(px, 64, bz),
      below: a.level.getTile(px, 63, bz),
      falling: a.level.entities.filter((e) => e.constructor.name === 'FallingTile').length,
    };
  });
  h.expect(sandLand.from === 0, '沙子原来那一格空了');
  h.expect(sandLand.land === 12, `沙子落到地面 y=64（实测 id=${sandLand.land}）`);
  h.expect(sandLand.below === 2, '也没穿地');
  h.expect(sandLand.falling === 0, '实体也自己消失了');
  await h.wait(500);
  await h.shot('04-沙子落下来了');

  // ---- 三、照一张并排的图：两格都躺在地上 ----
  // 机位照抄 04 那套（原地看着 +z、瞄方块顶面）—— 试过"走近 4 格再拍"，
  // 俯仰角对不上（玩家 Y 跟我假设的不一样），拍出来方块跑到准星上面去了。
  // 不调玩家位置就不会有这种偏差，所以这里只重新瞄一次，不动坐标。
  const finalView = await h.state('最后再拍一张：两格并排躺在地上', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 15;
    a.player.xRot = -(Math.atan2(65.0 - (a.player.y + 1.62), 15) * 180) / Math.PI;
    return {
      playerY: a.player.y,
      gravel: a.level.getTile(px, 64, bz - 1),
      sand: a.level.getTile(px, 64, bz),
    };
  });
  h.expect(
    finalView.gravel === 13 && finalView.sand === 12,
    `两格并排躺在地上（沙砾 ${finalView.gravel} 在 z=${'bz-1'}，沙子 ${finalView.sand} 在 z=bz）`,
  );
  await h.wait(2000);
  await h.shot('05-沙砾和沙子都躺在地上');
}
