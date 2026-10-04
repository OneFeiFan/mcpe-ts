// D11b 场景：拉满弓射一箭 —— 箭飞出去、插进方块、然后一直插着。
//
// 【怎么"射"的】页面里没有全局的 Item/Arrow，`BowItem.releaseUsing` 又得先"拉弓"。
// 走的是物品栏里那把弓：从现有 ItemInstance 反推类 → `Item.items[261]`（= 5 + 256）拿到弓，
// 再造一个 ItemInstance 调 `releaseUsing(inst, level, player, durationLeft)` —— 这正是
// 游戏里松手那一刻走的那句（`Player.releaseUsingItem` → `useItem.releaseUsing(...)`）。
// `durationLeft` 控制拉弓时长：`timeHeld = getUseDuration() - durationLeft`，
// 拉满（timeHeld ≥ 20）时 pow = 1 → **critArrow = true**。
//
// ⚠ 物品 id 带 +256（弓是 5 → 261，箭是 6 → 262）。
// ⚠ 箭的渲染器（ArrowRenderer）没移植 → **箭在画面上看不见**，靠状态断言。
// ⚠ `h.state` 的 fn 只能写字面量。

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);

  await h.state('建/进 demo 世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000);

  // ---- 朝 +z 平视，正前方 8 格处摆一堵石头墙 ----
  const setup = await h.state('摆机位 + 在正前方 8 格砌一堵墙', (a) => {
    a.player.yRot = 0;
    a.player.yRotO = 0;
    a.player.xRot = 0;
    a.player.xRotO = 0;
    a.player.y = 65;
    const px = Math.floor(a.player.x);
    const pz = Math.floor(a.player.z);
    for (let dy = 0; dy <= 4; dy++)
      for (let dx = -2; dx <= 2; dx++) a.level.setTile(px + dx, 64 + dy, pz + 8, 1);
    return { px, pz, wall: a.level.getTile(px, 66, pz + 8), air: a.level.getTile(px, 66, pz + 3) };
  });
  h.expect(setup.wall === 1, `墙砌好了（实测 id=${setup.wall}）`);
  h.expect(setup.air === 0, '墙前面是空气');
  await h.wait(800);
  await h.shot('00-站定，正前方一堵墙');

  // ---- 拉满弓、放箭 ----
  const shot1 = await h.state('拉满弓射一箭（pow = 1 → 暴击箭）', (a) => {
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
    const bowItem = ItemC.items[261]; // 5 + 256
    const before = a.level.entities.length;
    const inst = new InstC(261, 1, 0);
    const dur = bowItem.getUseDuration(inst); // 72000
    // timeHeld = 20 → pow = (1 + 2)/3 = 1 → 拉满
    bowItem.releaseUsing(inst, a.level, a.player, dur - 20);
    const arrows = a.level.entities.filter((e) => e.constructor.name === 'Arrow');
    const ar = arrows[0];
    return {
      bowClass: bowItem.constructor.name,
      sameAsStatic: bowItem === ItemC.bow,
      before,
      after: a.level.entities.length,
      n: arrows.length,
      crit: ar ? ar.critArrow : null,
      owner: ar ? ar.getAuxData() : null,
      playerId: a.player.entityId,
      damage: inst.getDamageValue ? inst.getDamageValue() : null,
      x: ar ? ar.x : null,
      y: ar ? ar.y : null,
      z: ar ? ar.z : null,
      pz: a.player.z,
    };
  });
  h.expect(!shot1.error, `前置条件：能拿到物品（${shot1.error ?? 'ok'}）`);
  h.expect(shot1.bowClass === 'BowItem', `261 号是 BowItem（实测 ${shot1.bowClass}）`);
  h.expect(shot1.sameAsStatic === true, 'Item.items[261] 就是 Item.bow');
  h.expect(shot1.n === 1, `世界里出现 1 支箭（实测 ${shot1.n}）`);
  h.expect(shot1.after === shot1.before + 1, '箭进了世界');
  h.expect(shot1.crit === true, '拉满 → critArrow = true（原句是 `if (pow == 1)`）');
  h.expect(shot1.owner === shot1.playerId, `ownerId 是射箭的玩家（${shot1.owner} vs ${shot1.playerId}）`);
  h.expect(shot1.damage === 1, `弓被磨损 1 点（实测 ${shot1.damage}）`);

  // ---- 定格拍一张"箭在飞" ----
  await h.wait(250);
  const frozen = await h.state('pause 定格', (a) => {
    a.pause = true;
    const ar = a.level.entities.find((e) => e.constructor.name === 'Arrow');
    return { n: a.level.entities.filter((e) => e.constructor.name === 'Arrow').length, z: ar ? ar.z : null };
  });
  await h.wait(400);
  await h.shot('01-箭飞出去（定格）');
  h.expect(frozen.n === 1, '定格时箭还在');
  h.expect(
    frozen.z > shot1.z + 0.2,
    `箭往 +z 飞了（${shot1.z?.toFixed(2)} → ${frozen.z?.toFixed(2)}）`,
  );
  await h.state('放开 pause', (a) => {
    a.pause = false;
    return { pause: a.pause };
  });

  // ---- 等它撞墙插住 ----
  await h.wait(2000);
  const stuck = await h.state('箭插进墙里了吗', (a) => {
    const ar = a.level.entities.find((e) => e.constructor.name === 'Arrow');
    if (!ar) return { gone: true };
    return {
      gone: false,
      z: ar.z,
      inGround: ar.inGround,
      shakeTime: ar.shakeTime,
      xd: ar.xd,
      zd: ar.zd,
      wallZ: Math.floor(a.player.z) + 8,
    };
  });
  h.expect(!stuck.gone, '箭还在（插住之后要躺 60 秒才消失）');
  h.expect(stuck.inGround === true, 'inGround = true（撞墙那条路）');
  h.expect(stuck.shakeTime !== undefined && stuck.shakeTime <= 7, `shakeTime 是 7 或已经递减（实测 ${stuck.shakeTime}）`);
  h.expect(stuck.z < stuck.wallZ + 1, `没穿进墙里（z=${stuck.z?.toFixed(2)}，墙在 ${stuck.wallZ}）`);
  await h.shot('02-箭插在墙上（看不见，渲染器没移植）');

  // ---- 再跑一会儿：插着的箭不该乱跑 ----
  await h.wait(1500);
  const still = await h.state('再跑一会儿，箭还插着', (a) => {
    const ar = a.level.entities.find((e) => e.constructor.name === 'Arrow');
    return ar ? { z: ar.z, inGround: ar.inGround, shakeTime: ar.shakeTime } : { gone: true };
  });
  h.expect(!still.gone, '还在');
  h.expect(still.inGround === true, '还插着');
  h.expect(
    Math.abs(still.z - stuck.z) < 0.2,
    `位置基本没动（${stuck.z?.toFixed(2)} → ${still.z?.toFixed(2)}）`,
  );
  await h.shot('03-插着的箭');
}
