// G10 场景：三个新渲染器的画面验证 —— TntRenderer / PaintingRenderer / TripodCameraRenderer。
//
// 【和 tnt.mjs 的分工】tnt.mjs（D4）证明的是 TNT 的**逻辑链**（爆炸/连锁/引信随机数）——
// 那时 TntRenderer 还不存在，被点燃的 TNT 在画面上是隐形的。这个场景证明"**画得出来**"：
//   00 打火石点着的 TNT 立在正前方（life=75：不闪不鼓的正常态）—— TntRenderer 的方块本体；
//   01 引信烧到尾（life=0：四次方鼓包 g=0.9⁴ → 放大到 ~1.2 倍 + 半透明白光闪烁）；
//   02 石墙上挂着一幅画（PaintingRenderer 的 24 顶点像素板）—— 贴图 art/kz.png；
//   03 相机实体进世界了、但画面上**空空如也** —— 见下面的 ⚠。
//
// 【⚠ 相机为什么拍不到】C++ 的 EntityRenderDispatcher.h:55 只有一行注释掉的
//   `//TripodCameraRenderer tripodCameraRenderer;`，assign 列表里没有它 —— 相机实体
//   在原版画面上就是**隐形**的。TS 照 C++ 1:1 同样不注册（单测里钉死了），所以这张图
//   只能证明"实体在、渲染表里没有它"，看不到相机本体是**正确行为**、不是 bug。
//
// 【点燃走真实链路】打火石（items[259] = 3+256）塞进热键 0 号槽 → `gameMode.useItemOn`
//   → `Tile.tiles[46].use` → 手持打火石 → `destroy(EXPLODE_BIT)` → 生成 PrimedTnt。
//   单机世界 isClientSide=false（Level.ts:93 的默认值），destroy 里那句客户端守卫不会吞掉它。
//
// 【h.state 的 fn 只能写字面量】会被 toString() 后在页面里重新求值，闭包与模块级常量全丢
// （见 smoke.mjs）—— 所以每个 state 里都用裸数字（259/321/456/46…）。
//
// 【⚠ xOld 与"pause 后加入的实体"】渲染插值读的是 `entity.xOld`（EntityRenderDispatcher 是
//   `xOld + (x - xOld) * a`，C++ 照抄）。xOld 只在三处同步：`_init()`（构造，=0）、`moveTo`、
//   存档读取，以及**每次 `Level::tick(Entity*)`**（C++ Level.cpp:1538 / TS Level.ts:1241）。
//   画和相机是在 `a.pause = true` **之后**才加进世界的 → 一次 tick 都没跑过 → xOld 停在 0 →
//   渲染坐标会漂在 0 与真实位置之间（画面上就是"墙上一片空 / 相机隐形"）。
//   药方不是手改字段，而是走原版自己的那条路径：`level.tickEntity(e, false)` ——
//   C++ 的 `Level::tick(Entity*, actual=false)`，只做同步（含入 chunk），不跑实体 tick。

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);

  await h.state('建/进 demo 世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000);

  // ---- 摆机位：朝 +z 平视，正前方 6 格是空地 ----
  const view = await h.state('摆机位：朝 +z 平视', (a) => {
    a.player.yRot = 0;
    a.player.yRotO = 0;
    a.player.xRot = 0;
    a.player.xRotO = 0;
    a.player.y = 65;
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 6;
    return {
      px,
      bz,
      ground: a.level.getTile(px, 63, bz),
      above: a.level.getTile(px, 64, bz),
      clientSide: a.level.isClientSide,
    };
  });
  h.expect(view.ground === 2, `正前方 6 格脚下是草（实测 id=${view.ground}）`);
  h.expect(view.above === 0, `上面是空气，能摆东西（实测 id=${view.above}）`);
  h.expect(
    view.clientSide === false,
    `单机世界的 isClientSide=false（实测 ${view.clientSide}）—— 否则 TntTile.destroy 里那句客户端守卫会把点燃吞掉`,
  );

  // ---- 把打火石塞进热键 0 号槽（走物品栏真实的 linkedSlots 结构，不硬编码下标）----
  const fs = await h.state('把打火石塞进选中槽', (a) => {
    const inv = a.player.inventory;
    let any = null;
    for (let i = 0; i < inv.items.length; i++) {
      const it = inv.items[i];
      if (it && it.getItem && it.getItem()) {
        any = it;
        break;
      }
    }
    if (!any) return { error: '物品栏里一个实例都没有' };
    const InstC = any.constructor;
    const ItemC = any.getItem().constructor;
    const fsItem = ItemC.items[259]; // flintAndSteel = 3 + 256
    if (!fsItem) return { error: 'items[259] 是空的' };
    const link = inv.linkedSlots[0].inventorySlot;
    inv.items[link] = new InstC(fsItem.id, 1, 0);
    inv.selectSlot(0);
    const carried = a.player.getSelectedItem();
    return {
      itemClass: fsItem.constructor.name,
      fsId: fsItem.id,
      carriedId: carried ? carried.id : null,
      link,
    };
  });
  h.expect(!fs.error, `前置条件：能拿到物品（${fs.error ?? 'ok'}）`);
  h.expect(
    fs.carriedId === fs.fsId,
    `手上拿的就是 items[259] 那个物品（${fs.itemClass}，id 对齐：carried=${fs.carriedId} fs=${fs.fsId}）`,
  );

  // ---- 摆一块 TNT 方块，然后点它 ----
  const lit = await h.state('摆 TNT 方块（id 46）并用 gameMode.useItemOn 点着', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 6;
    a.level.setTile(px, 64, bz, 46);
    const before = a.level.getTile(px, 64, bz);
    const carried = a.player.getSelectedItem();
    if (!carried) return { error: '手上一件东西都没有' };
    const ok = a.gameMode.useItemOn(a.player, a.level, carried, px, 64, bz, 1, {
      x: px + 0.5,
      y: 64.5,
      z: bz + 0.5,
    });
    const primed = a.level.entities.filter((e) => e.constructor.name === 'PrimedTnt');
    return {
      before,
      ok,
      blockAfter: a.level.getTile(px, 64, bz),
      n: primed.length,
      life: primed.length ? primed[0].life : null,
      pos: primed.length ? [primed[0].x, primed[0].y, primed[0].z] : null,
    };
  });
  h.expect(!lit.error, `前置条件：${lit.error ?? 'ok'}`);
  h.expect(lit.before === 46, '前置条件：点燃前方块是 TNT');
  h.expect(lit.n === 1, `点燃后世界里有一个 PrimedTnt 实体（实测 ${lit.n}）`);
  h.expect(
    lit.blockAfter === 0,
    `原处方块被清空（TntTile.use 里的 setTile(…, 0)；实测 id=${lit.blockAfter}）`,
  );
  h.expect(lit.life === 80, `引信初始 80（实测 ${lit.life}）`);
  h.expect(
    lit.pos !== null && Math.abs(lit.pos[1] - 64.5) < 0.6,
    `实体在方块原位（y=${lit.pos ? lit.pos[1] : null}，方块中心 64.5）`,
  );

  // ---- 定格：先拍"正常态"（life=75 不闪不鼓）----
  const frozen = await h.state('pause 定格：life=75（不闪不鼓），同步插值字段', (a) => {
    const t = a.level.entities.filter((e) => e.constructor.name === 'PrimedTnt')[0];
    if (!t) return { error: '没有 PrimedTnt' };
    t.life = 75;
    t.xo = t.x;
    t.yo = t.y;
    t.zo = t.z;
    a.pause = true;
    return { x: t.x, y: t.y, z: t.z, px: a.player.x, pz: a.player.z };
  });
  h.expect(!frozen.error, `定格成功（${frozen.error ?? 'ok'}）`);
  h.expect(
    frozen.z - frozen.pz > 5 && frozen.z - frozen.pz < 7,
    `在正前方约 6 格（实测 dz=${(frozen.z - frozen.pz).toFixed(2)}）`,
  );

  await h.wait(1500); // 无头浏览器约 1 帧/秒，等画面追上定格状态
  await h.shot('00-TNT 点着了：立在正前方（TntRenderer 画出来的方块）');

  // ---- 引信烧到尾：life=0 → g=0.9⁴=0.656 → 放大 ~1.2 倍；0/5&1==0 → 叠半透明白光 ----
  const aboutToBlow = await h.state('把引信拨到 0（渲染按 life=0 算：鼓包 + 闪白）', (a) => {
    const t = a.level.entities.filter((e) => e.constructor.name === 'PrimedTnt')[0];
    t.life = 0; // pause 还在 → 不会真的炸，只影响渲染
    return { life: t.life };
  });
  h.expect(aboutToBlow.life === 0, '引信拨到 0 了（不 tick 不会爆）');
  await h.wait(1500);
  await h.shot('01-引信烧到尾：鼓包（放大 ~1.2 倍）+ 半透明白光闪烁');

  // ---- 把 TNT 挪出画面，给画腾地方 ----
  await h.state('把 TNT 实体挪到 100 格外（下一张要干净的墙面）', (a) => {
    const t = a.level.entities.filter((e) => e.constructor.name === 'PrimedTnt')[0];
    t.x += 100;
    t.xo = t.x;
    return { x: t.x };
  });

  // ---- 砌一面 3×3 石墙 + 挂画 ----
  const wall = await h.state('在正前方 6 格砌 3×3 石墙（id 1）', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 6;
    let n = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = 0; dy <= 2; dy++) {
        a.level.setTile(px + dx, 64 + dy, bz, 1);
        if (a.level.getTile(px + dx, 64 + dy, bz) === 1) n++;
      }
    return { n, check: a.level.getTile(px, 65, bz) };
  });
  h.expect(wall.n === 9, `9 块石头都砌上了（实测 ${wall.n}）`);

  const hung = await h.state('拿画点墙的北面（face=2 → dir=NORTH）挂上去', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 6;
    const inv = a.player.inventory;
    let any = null;
    for (let i = 0; i < inv.items.length; i++) {
      const it = inv.items[i];
      if (it && it.getItem && it.getItem()) {
        any = it;
        break;
      }
    }
    if (!any) return { error: '物品栏里一个实例都没有' };
    const InstC = any.constructor;
    const ItemC = any.getItem().constructor;
    const paintItem = ItemC.items[321]; // painting = 65 + 256
    if (!paintItem) return { error: 'items[321] 是空的' };
    const ok = paintItem.useOnByPlayer(
      new InstC(paintItem.id, 1, 0),
      a.player,
      a.level,
      px,
      65,
      bz,
      2,
      0,
      0,
      0,
    );
    const paintings = a.level.entities.filter((e) => e.constructor.name === 'Painting');
    const p = paintings.length ? paintings[0] : null;
    // ⚠ 见文件头【xOld 与"pause 后加入的实体"】：先把根因摆出来（xOld 应为 0），再照原版路径同步
    const xoldBefore = p ? p.xOld : null;
    if (p) a.level.tickEntity(p, false); // C++ Level::tick(e, false)：只同步不 tick
    return {
      ok,
      err: p ? null : '没挂上（survives() 没过？）',
      n: paintings.length,
      motive: p ? p.motive.name : null,
      size: p ? [p.motive.w, p.motive.h] : null,
      xoldBefore,
      xoldAfter: p ? p.xOld : null,
      px: p ? p.x : null,
      pos: p
        ? [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10]
        : null,
    };
  });
  h.expect(!hung.error, `前置条件：${hung.error ?? 'ok'}`);
  h.expect(hung.n === 1, `画挂上了（实测 ${hung.n} 幅，motive=${hung.motive} ${hung.size}）`);
  h.expect(
    hung.xoldBefore === 0,
    `根因确认：pause 后加入的实体 xOld 停在 _init 的 0（实测 ${hung.xoldBefore}）—— 渲染插值会把它画到半路`,
  );
  h.expect(
    hung.xoldAfter === hung.px,
    `tickEntity(e, false) 同步后 xOld 归位（${hung.xoldAfter} === x ${hung.px}）`,
  );
  h.expect(
    hung.pos !== null && hung.pos[2] < Math.floor(view.bz),
    `画在墙的北侧外面（z=${hung.pos ? hung.pos[2] : null} < 墙 z=${view.bz}）`,
  );
  await h.wait(1500);
  await h.shot('02-墙上挂着一幅画（PaintingRenderer 的像素板）');

  // ---- 相机：实体照常造，但渲染表里没有它（照 C++）----
  const cam = await h.state('用相机物品（items[456] = 200+256）放一个 TripodCamera', (a) => {
    const inv = a.player.inventory;
    let any = null;
    for (let i = 0; i < inv.items.length; i++) {
      const it = inv.items[i];
      if (it && it.getItem && it.getItem()) {
        any = it;
        break;
      }
    }
    if (!any) return { error: '物品栏里一个实例都没有' };
    const InstC = any.constructor;
    const ItemC = any.getItem().constructor;
    const camItem = ItemC.items[456]; // camera = 200 + 256
    if (!camItem) return { error: 'items[456] 是空的' };
    camItem.use(new InstC(camItem.id, 1, 0), a.level, a.player);
    const cams = a.level.entities.filter((e) => e.constructor.name === 'TripodCamera');
    const c = cams.length ? cams[0] : null;
    // 同画：pause 后加入 → xOld 从没被同步过（先留证）。
    const xoldBefore = c ? c.xOld : null;
    // 再把相机挪到镜头正前方 4 格（画的前面约 1.5 格）—— 它要是可见，就该钉在画面正中挡住画；
    // 隐形（照 C++ 没注册渲染器）的话，这张截图就是"该位置上什么都没有"的视觉证据。
    // 走 moveTo —— C++ Entity::moveTo 自带 xOld/xo 同步（Entity.cpp:606-608）。
    if (c) c.moveTo(Math.floor(a.player.x) + 0.5, 65, Math.floor(a.player.z) + 4, 0, 0);
    return {
      itemClass: camItem.constructor.name,
      n: cams.length,
      xoldBefore,
      xoldAfter: c ? c.xOld : null,
      rendererId: c ? c.entityRendererId : null,
      pos: c ? [c.x, c.y, c.z] : null,
      dz: c ? c.z - a.player.z : null,
    };
  });
  h.expect(!cam.error, `前置条件：${cam.error ?? 'ok'}`);
  h.expect(
    cam.n === 1,
    `相机实体进了世界（实测 ${cam.n} 个，${cam.itemClass}）—— ⚠ 但照 C++ 它没有渲染器，画面上看不见`,
  );
  h.expect(cam.xoldBefore === 0, `相机同理：pause 后加入，xOld 也停在 0（实测 ${cam.xoldBefore}）`);
  h.expect(
    cam.pos !== null && cam.xoldAfter === cam.pos[0],
    `moveTo 后 xOld 归位（${cam.xoldAfter} === x ${cam.pos ? cam.pos[0] : null}）`,
  );
  h.expect(
    cam.dz !== null && cam.dz > 3 && cam.dz < 5,
    `相机挪到了镜头正前方 4 格（实测 dz=${cam.dz}）—— 画面上却什么都没有`,
  );
  await h.wait(1500);
  await h.shot('03-相机：实体挪到镜头正前方 4 格，画面上什么都没有（C++ 没注册它的渲染器）');
}
