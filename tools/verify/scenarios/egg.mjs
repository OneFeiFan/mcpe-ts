// D10c 场景：扔蛋 —— 飞出去、命中消失、（1/8 概率）孵出鸡。
//
// 【为什么一次扔 80 个】孵鸡是 `sharedRandom.nextInt(8) == 0`，一个蛋 1/8 概率。
// 一个一个扔要等飞行（每个约 1 秒），40 个就是 40 秒；**同一帧连扔 80 个**，
// 它们一起飞、各自独立判定，(7/8)^80 ≈ 0.002% 的概率一只都不孵。
//
// ⚠ 物品 id 带 +256：蛋是 `new EggItem(88)` → 注册表键 **344**（Item.ts:247）。
// ⚠ `h.state` 的 fn 会被 toString 后重新求值，只能写字面量、不能用闭包。
// ⚠ 蛋的 `onHit` 是 protected，但它只由 `Throwable.tick` 在撞到东西时调用 ——
//   场景里不去碰它，扔出去让它自己撞地。
// ⚠ `ChickenRenderer` 没移植，所以孵出来的鸡**在画面上看不见**；这个场景靠状态断言
//   （不是截图）证明"孵出来了"。截图看的是"蛋在飞"。

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
    const bz = Math.floor(a.player.z) + 12;
    return { px, bz, ground: a.level.getTile(px, 63, bz) };
  });
  h.expect(view.ground !== 0, `正前方有地面（实测 id=${view.ground}）`);
  await h.wait(800);

  // ---- 一口气扔 80 个蛋 ----
  const threw = await h.state('连扔 80 个蛋', (a) => {
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
    const eggItem = ItemC.items[344]; // 88 + 256
    const before = a.level.entities.length;
    for (let i = 0; i < 80; i++) {
      eggItem.use(new InstC(344, 16, 0), a.level, a.player);
    }
    const eggs = a.level.entities.filter((e) => e.constructor.name === 'ThrownEgg');
    return {
      itemClass: eggItem.constructor.name,
      sameAsStatic: eggItem === ItemC.egg,
      before,
      after: a.level.entities.length,
      eggs: eggs.length,
      chickens: a.level.entities.filter((e) => e.constructor.name === 'Chicken').length,
      x: eggs.length ? eggs[0].x : null,
      z: eggs.length ? eggs[0].z : null,
      pz: a.player.z,
    };
  });
  h.expect(!threw.error, `前置条件：能拿到物品（${threw.error ?? 'ok'}）`);
  h.expect(threw.itemClass === 'EggItem', `344 号是 EggItem（实测 ${threw.itemClass}）`);
  h.expect(threw.sameAsStatic === true, 'Item.items[344] 就是 Item.egg');
  h.expect(threw.eggs === 80, `80 个蛋都在世界里（实测 ${threw.eggs}）`);
  h.expect(threw.after === threw.before + 80, '实体总数 +80');

  // ---- 定格拍一张"蛋在飞" ----
  await h.wait(200);
  await h.state('pause 定格', (a) => {
    a.pause = true;
    const eggs = a.level.entities.filter((e) => e.constructor.name === 'ThrownEgg');
    return { n: eggs.length, z: eggs.length ? eggs[0].z : null };
  });
  await h.wait(400);
  await h.shot('00-一片蛋飞出去（定格）');
  const flying = await h.state('定格时读位置', (a) => {
    const eggs = a.level.entities.filter((e) => e.constructor.name === 'ThrownEgg');
    return { n: eggs.length, z: eggs.length ? eggs[0].z : null };
  });
  h.expect(flying.n > 0, `定格时还有蛋在飞（实测 ${flying.n}）`);
  h.expect(flying.z > threw.z, `往 +z 飞了（${threw.z?.toFixed(2)} → ${flying.z?.toFixed(2)}）`);
  await h.state('放开 pause', (a) => {
    a.pause = false;
    return { pause: a.pause };
  });

  // ---- 等它们落地（撞地 → onHit → 孵鸡/放粒子/remove）----
  await h.wait(3000);

  const landed = await h.state('蛋落地之后', (a) => {
    const eggs = a.level.entities.filter((e) => e.constructor.name === 'ThrownEgg');
    const chickens = a.level.entities.filter((e) => e.constructor.name === 'Chicken');
    return {
      eggs: eggs.length,
      chickens: chickens.length,
      chickenTypeIds: chickens.map((c) => (typeof c.getEntityTypeId === 'function' ? c.getEntityTypeId() : -1)),
      chickenIsBaby: chickens.map((c) => (typeof c.isBaby === 'function' ? c.isBaby() : null)),
      chickenHealth: chickens.map((c) => (typeof c.getMaxHealth === 'function' ? c.getMaxHealth() : null)),
      total: a.level.entities.length,
    };
  });
  h.expect(landed.eggs === 0, `蛋全没了（还剩 ${landed.eggs}）—— 命中后 remove 了`);
  h.expect(
    landed.chickens >= 1,
    `80 个蛋里孵出了鸡（实测 ${landed.chickens} 只；(7/8)^80 ≈ 0.002% 一只都不出）`,
  );
  if (landed.chickens > 0) {
    h.expect(
      landed.chickenTypeIds.every((id) => id === 10),
      `孵出来的都是 MobTypes.Chicken=10（实测 ${landed.chickenTypeIds.join(',')}）`,
    );
    h.expect(landed.chickenHealth.every((hp) => hp === 4), '血量都是 4');
    h.expect(landed.chickenIsBaby.every((b) => b === false), '刚孵出来就是成年（AgableMob 的 -1 → setAge(0)）');
  }
  await h.shot('01-落地之后（鸡看不见，是渲染器没移植）');

  // ---- 再等一会儿，看鸡 tick 得住（Mob.tick → aiStep，AI 是 OMIT 的）----
  await h.wait(2000);
  const alive = await h.state('再跑两秒，看鸡还在不在', (a) => {
    const chickens = a.level.entities.filter((e) => e.constructor.name === 'Chicken');
    return {
      n: chickens.length,
      removed: chickens.map((c) => (typeof c.removed === 'boolean' ? c.removed : null)),
      y: chickens.map((c) => Math.round(c.y * 100) / 100),
    };
  });
  h.expect(alive.n >= 1, `鸡还活着（实测 ${alive.n} 只）`);
  h.expect(alive.removed.every((r) => r === false), '没有被移除');
  await h.shot('02-鸡 tick 了两秒之后');
}
