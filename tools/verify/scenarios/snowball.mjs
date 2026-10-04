// D9 场景：扔一个雪球 —— 生成、往前飞、撞地消失。
//
// 【怎么把雪球拿到手的】页面里只有 `window.__app`，没有 `Item` / `ItemInstance` 这些全局。
// 走的是"从现有对象反推类"的路子：创造模式的默认物品栏（`Inventory.setupDefault`）里有一堆
// 物品实例 —— 从任意一个 ItemInstance 就能问到它的类（`it.constructor` → ItemInstance）和
// 它指向的 Item 注册表（`it.getItem().constructor.items` → `Item` 类），于是能取出 `Item.snowBall`。
// 不改产品代码、不加新后门；拿到之后调的就是 `SnowballItem.use()` 本身。
//
// ⚠ `h.state` 的 fn 会被 `toString()` 后在页面里重新求值，**闭包和模块级常量全丢，只能写字面量**。
// ⚠ **物品 id 带 +256 偏移**：C++ `Item::Item(int id) : id(256 + id)`，`Item.items[id+256]` 才是它。
//    雪球是 `Item.snowBall = new SnowballItem(76)`（Item.ts:538）→ 注册表里的键是 **332**。
//    （第一版场景写了 76，`ItemC.items[76]` 是 null，跑到 `sbItem.use` 才炸出来。）
// ⚠ 雪球 1.5 格/刻、飞得很快，所以拍飞行照要**先 pause 定格**（`Minecraft.pause` 只挡
//    `level.tick/tickEntities`，渲染照跑）；paused 时镜头走插值，改朝向要连 `xRotO/yRotO` 一起改。

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);

  // ---- 进 demo 世界（场景后门）----
  await h.state('建/进 demo 世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000);

  // ---- 摆机位：朝 +z 平视。扔出去的东西沿视线飞，球就在画面正中 ----
  const view = await h.state('摆机位：朝 +z 平视', (a) => {
    a.player.yRot = 0;
    a.player.yRotO = 0;
    a.player.xRot = 0;
    a.player.xRotO = 0;
    a.player.y = 65;
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z);
    return { px, bz, ground: a.level.getTile(px, 63, bz), air: a.level.getTile(px, 64, bz) };
  });
  h.expect(view.ground !== 0, `脚下有地面（实测 id=${view.ground}）`);
  h.expect(view.air === 0, '眼睛前面是空气');
  // 视角这帧改完，下一帧 GameRenderer 才会把 aimDirection 刷新过来（GameRenderer.ts:429,444）
  await h.wait(800);
  await h.shot('00-站定，朝 +z');

  // ---- 从物品栏反推类，拿到雪球道具，扔一个 ----
  const threw = await h.state('拿 Item.snowBall 扔一个雪球', (a) => {
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
    const ItemC = any.getItem().constructor; // Item 类（注册表挂它身上）
    const InstC = any.constructor; // ItemInstance 类
    const sbItem = ItemC.items[332]; // 76 + 256（见文件头）
    const before = a.level.entities.length;
    const inst = new InstC(332, 16, 0);
    const ret = sbItem.use(inst, a.level, a.player);
    const made = a.level.entities.filter((e) => e.constructor.name === 'Snowball');
    const s = made[0];
    return {
      itemClass: sbItem.constructor.name,
      sameAsStatic: sbItem === ItemC.snowBall,
      before,
      after: a.level.entities.length,
      n: made.length,
      count: inst.count,
      retIsInstance: ret === inst,
      owner: s ? s.getAuxData() : null,
      playerId: a.player.entityId,
      x: s ? s.x : null,
      y: s ? s.y : null,
      z: s ? s.z : null,
      px: a.player.x,
      py: a.player.y,
      pz: a.player.z,
    };
  });
  h.expect(!threw.error, `前置条件：能拿到物品实例（${threw.error ?? 'ok'}）`);
  h.expect(
    threw.itemClass === 'SnowballItem',
    `注册表 332 号（76+256）是 SnowballItem（实测 ${threw.itemClass}）`,
  );
  h.expect(threw.sameAsStatic === true, 'Item.items[332] 就是 Item.snowBall');
  h.expect(threw.n === 1, `世界里出现 1 个 Snowball 实体（实测 ${threw.n}）`);
  h.expect(threw.after === threw.before + 1, '实体进了世界');
  h.expect(threw.owner === threw.playerId, `ownerId 是扔它的玩家（${threw.owner} vs ${threw.playerId}）`);
  // ⚠ demo 世界是**创造模式**（startDemoWorld 用 GameType.Creative）→ `abilities.instabuild` 为真，
  //   所以 C++ 那句 `if (!player->abilities.instabuild) instance->count--;` **不执行**。
  //   创造模式不减数量是对的；生存那条分支在下面单独验。
  h.expect(threw.count === 16, `创造模式不扣数量（16 → ${threw.count}）`);
  // 出生点：眼睛高度 - 0.1、朝身后偏 0.16（yRot=0 → 往 -x 偏）
  h.expect(
    Math.abs(threw.x - (threw.px - 0.16)) < 0.01 && Math.abs(threw.z - threw.pz) < 0.01,
    `雪球从玩家身上出来（x=${threw.x?.toFixed(3)} z=${threw.z?.toFixed(3)}）`,
  );

  // ---- 定格拍一张半空中的（pause 只挡 tick，渲染照跑）----
  // ⚠ 先等一小会儿再 pause：刚扔出来的那一帧球还在玩家身上（离镜头 0.16 格、几乎在视锥外），
  //   拍出来是空的（第一版就是）。往前飞几刻它才在画面正中。
  await h.wait(250);
  const frozen = await h.state('pause 定格，读飞行中的位置', (a) => {
    a.pause = true;
    const s = a.level.entities.find((e) => e.constructor.name === 'Snowball');
    return { n: a.level.entities.filter((e) => e.constructor.name === 'Snowball').length, z: s ? s.z : null };
  });
  await h.wait(400);
  await h.shot('01-半空中的雪球（定格）');
  h.expect(frozen.n === 1, '定格的时候它还在');
  const moved = await h.state('定格期间读第二遍位置（确认没再动）', (a) => {
    const s = a.level.entities.find((e) => e.constructor.name === 'Snowball');
    return { z: s ? s.z : null, pause: a.pause };
  });
  h.expect(moved.z === frozen.z, `pause 期间位置冻结（${frozen.z} → ${moved.z}）`);

  // ---- 放开，让它飞完落地 ----
  await h.state('放开 pause', (a) => {
    a.pause = false;
    return { pause: a.pause };
  });
  await h.wait(3000);

  const done = await h.state('飞完之后', (a) => {
    const left = a.level.entities.filter((e) => e.constructor.name === 'Snowball');
    return { n: left.length, entityCount: a.level.entities.length };
  });
  h.expect(done.n === 0, `撞地之后自己 remove 了（还剩 ${done.n} 个）`);
  await h.shot('02-落地后（球没了）');

  // ---- 再扔一个：这次关掉创造模式，验"生存模式扣一个"，顺便看它往前飞 ----
  const again = await h.state('切生存、再扔一个，往前飞一段', (a) => {
    a.player.abilities.instabuild = false;
    const inv = a.player.inventory;
    let any = null;
    for (let i = 0; i < inv.items.length; i++) {
      const it = inv.items[i];
      if (it && it.getItem && it.getItem()) {
        any = it;
        break;
      }
    }
    const sbItem = any.getItem().constructor.items[332];
    const inst = new any.constructor(332, 16, 0);
    sbItem.use(inst, a.level, a.player);
    const s = a.level.entities.find((e) => e.constructor.name === 'Snowball');
    return {
      x: s ? s.x : null,
      y: s ? s.y : null,
      z: s ? s.z : null,
      pz: a.player.z,
      count: inst.count,
    };
  });
  h.expect(again.count === 15, `生存模式扣一个（16 → ${again.count}）`);
  await h.wait(500);
  const flight = await h.state('飞了一段之后定格', (a) => {
    a.pause = true;
    const s = a.level.entities.find((e) => e.constructor.name === 'Snowball');
    return { x: s ? s.x : null, y: s ? s.y : null, z: s ? s.z : null, exists: !!s };
  });
  h.expect(flight.exists, '还在飞');
  h.expect(
    flight.z !== null && flight.z > again.z + 0.5,
    `往视线方向（+z）飞了（${again.z?.toFixed(2)} → ${flight.z?.toFixed(2)}）`,
  );
  h.expect(
    flight.y !== null && flight.y < again.y,
    `重力在拉它往下（y ${again.y?.toFixed(2)} → ${flight.y?.toFixed(2)}）`,
  );
  await h.wait(300);
  await h.shot('03-飞行中（定格，正前方）');
  await h.state('放开 pause', (a) => {
    a.pause = false;
    return { pause: a.pause };
  });
}
