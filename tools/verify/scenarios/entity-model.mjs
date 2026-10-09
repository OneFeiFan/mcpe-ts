// G9 场景：鸡 —— TS 里第一只画面上看得见的生物
//（`ChickenModel` + `ChickenRenderer` + `EntityRenderDispatcher` 的注册那一行）。
//
// 【和 egg.mjs 的分工】egg.mjs 证明"蛋孵出鸡"（状态断言）；这个场景证明"鸡**画得出来**"：
//   - 00 鸡正对镜头（yRot=180）：该看到白色鸡身 + 橙色喙 + 红冠；
//   - 01 原地转 90°（yRot=90）：侧身，喙转到一边 —— 两张都该看到鸡，
//     证明画面确实跟着朝向走，不是碰巧有个白东西。**截图必须打开看。**
//
// 【怎么拿到鸡】没有造鸡的后门（`MobFactory::CreateMob` 整条 OMIT），走真实链路：
// 一帧扔 160 个蛋，每个 1/8 概率孵一只，(7/8)^160 ≈ 5e-10 一只都不孵 —— 可以忽略。
//
// 【怎么摆/怎么拍】鸡自己不会走到镜头前（AI 是 OMIT 的），蛋落地后把一只
// `moveTo` 到玩家正前方 3.5 格、正对镜头（yRot=180），落稳后 `pause` 定格。
// ⚠ pause 只停 tick、渲染照跑，而渲染读的是**插值字段**（`MobRenderer` 转朝向用的是
//   `yBodyRotO + (yBodyRot - yBodyRotO) * a`，位置用的是 `xo/yo/zo`）—— 定格前必须把
//   这些 *O 字段同步成当前值，否则画面停在"上一帧"，偏一格（PITFALLS F 节）。
//
// ⚠ `h.state` 的 fn 会被 toString 后在页面里重新求值，只能写字面量、不能用闭包。

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);

  await h.state('建/进 demo 世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000);

  const view = await h.state('摆机位：朝 +z 平视', (a) => {
    a.player.yRot = 0;
    a.player.yRotO = 0;
    a.player.xRot = 0;
    a.player.xRotO = 0;
    a.player.y = 65;
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 4;
    return { px, bz, ground: a.level.getTile(px, 63, bz) };
  });
  h.expect(view.ground !== 0, `正前方有地面（实测 id=${view.ground}）`);
  await h.wait(800);

  // ---- 一口气扔 160 个蛋 ----
  const threw = await h.state('连扔 160 个蛋', (a) => {
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
    const ItemC = any.getItem().constructor;
    const InstC = any.constructor;
    const eggItem = ItemC.items[344]; // 蛋 = 88 + 256（照 egg.mjs）
    for (let i = 0; i < 160; i++) {
      eggItem.use(new InstC(344, 16, 0), a.level, a.player);
    }
    return {
      itemClass: eggItem.constructor.name,
      eggs: a.level.entities.filter((e) => e.constructor.name === 'ThrownEgg').length,
    };
  });
  h.expect(!threw.error, `前置条件：能拿到物品（${threw.error ?? 'ok'}）`);
  h.expect(threw.itemClass === 'EggItem', `344 号是 EggItem（实测 ${threw.itemClass}）`);
  h.expect(threw.eggs === 160, `160 个蛋都在世界里（实测 ${threw.eggs}）`);

  // ---- 等蛋落地孵鸡 ----
  await h.wait(4000);
  const hatched = await h.state('蛋落地之后数鸡', (a) => {
    const chickens = a.level.entities.filter((e) => e.constructor.name === 'Chicken');
    return {
      n: chickens.length,
      texture: chickens.length ? chickens[0].getTexture() : null,
      baby: chickens.length ? chickens[0].isBaby() : null,
    };
  });
  h.expect(hatched.n >= 1, `孵出鸡了（实测 ${hatched.n} 只；(7/8)^160 ≈ 5e-10 一只都不出）`);
  h.expect(
    hatched.texture === 'mob/chicken.png',
    `贴图是 mob/chicken.png（实测 ${hatched.texture}）`,
  );
  h.expect(hatched.baby === false, `成年鸡（走成年渲染分支；实测 baby=${hatched.baby}）`);

  // ---- 把一只鸡摆到镜头前 ----
  const posed = await h.state('把一只鸡 moveTo 到正前方 3.5 格、正对镜头', (a) => {
    const chickens = a.level.entities.filter((e) => e.constructor.name === 'Chicken');
    if (!chickens.length) return { error: '一只鸡都没有' };
    const c = chickens[0];
    const cx = Math.floor(a.player.x) + 0.5;
    const cz = Math.floor(a.player.z) + 3.5;
    c.moveTo(cx, a.player.y + 2, cz, 180, 0);
    return {
      x: cx,
      z: cz,
      // 顺带留一张"全世界的鸡"快照，出问题时好排查
      all: chickens.map((x) => [Math.round(x.x * 10) / 10, Math.round(x.z * 10) / 10]),
    };
  });
  h.expect(!posed.error, `摆位成功（${posed.error ?? 'ok'}）`);
  await h.wait(1500); // 让它从 2 格高落到地面站稳（这期间还没 pause）

  // ---- 定格 + 同步插值字段 ----
  const frozen = await h.state('pause 定格（同步 xo/yo/zo 与 yRotO/xRotO/yBodyRotO）', (a) => {
    const c = a.level.entities.filter((e) => e.constructor.name === 'Chicken')[0];
    c.xo = c.x;
    c.yo = c.y;
    c.zo = c.z;
    c.yRotO = c.yRot;
    c.xRotO = c.xRot;
    c.yBodyRot = c.yRot;
    c.yBodyRotO = c.yRot;
    a.pause = true;
    return { x: c.x, y: c.y, z: c.z, yRot: c.yRot, px: a.player.x, pz: a.player.z, py: a.player.y };
  });
  h.expect(frozen.y > 63 && frozen.y < 66, `鸡站在地面上（实测 y=${frozen.y}）`);
  h.expect(
    frozen.z - frozen.pz > 2.5 && frozen.z - frozen.pz < 4.5,
    `在正前方约 3.5 格（实测 dz=${(frozen.z - frozen.pz).toFixed(2)}）`,
  );

  await h.wait(1500); // 无头浏览器渲染约 1 帧/秒，等画面追上定格状态
  await h.shot('00-正对镜头（yRot=180）：白色鸡身 + 橙色喙');

  const turned = await h.state('原地转 90°（yRot=90），同步 O 字段', (a) => {
    const c = a.level.entities.filter((e) => e.constructor.name === 'Chicken')[0];
    c.yRot = 90;
    c.yRotO = 90;
    c.yBodyRot = 90;
    c.yBodyRotO = 90;
    return { yRot: c.yRot };
  });
  h.expect(turned.yRot === 90, 'yRot 转到位');
  await h.wait(1500);
  await h.shot('01-原地转 90°（yRot=90）：侧身');
}
