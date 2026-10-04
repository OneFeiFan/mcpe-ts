// D4 场景：TNT 炸掉周围方块。**在真浏览器里**跑完 `Explosion` + `TntTile.wasExploded` +
// `PrimedTnt` 引信 + 连锁反应这一整条链。
//
// 【怎么把 TNT 点着的】游戏里是"打火石点一下"或"红石信号"。场景里拿不到 `Tile.tiles[46]`
// 那个对象（页面里只有 `window.__app`，没有 `Tile` 这个全局），所以走**另一条真实存在的路**：
// 先摆几块 TNT，再用 `level.explode()` 在旁边炸一下 —— 爆炸会把 TNT 方块算进 toBlow，
// `finalizeExplosion` 清掉它的时候调 `TntTile::wasExploded`，于是自己又生成一个新的 PrimedTnt。
// 也就是说：**第一下是我们给的，后面的连锁全是游戏自己跑的。**
//
// 【h.state 的 fn 只能写字面量】会被 toString() 后在页面里重新求值，闭包和模块级常量全丢
// （见 smoke.mjs:140-152）。所以下面每个 state 里都用裸数字。

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

  // ---- 摆机位：朝 +z 平视，方块放在正前方 14 格 ----
  const view = await h.state('摆机位：朝 +z 看', (a) => {
    a.player.yRot = 0;
    a.player.yRotO = 0;
    a.player.xRot = 0;
    a.player.xRotO = 0;
    a.player.y = 65;
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 14;
    return { px, bz, ground: a.level.getTile(px, 63, bz), tnt: a.level.getTile(px, 64, bz) };
  });
  h.expect(view.ground === 2, `正前方 14 格脚下是草（实测 id=${view.ground}）`);
  h.expect(view.tnt === 0, '那上面是空气，有地方摆 TNT');
  await h.wait(600);
  await h.shot('00-站定，朝 +z');

  // ---- 摆一个 3×3 的 TNT 台（id 46 = Tile.tnt）----
  const placed = await h.state('在正前方铺 3×3 的 TNT', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 14;
    let n = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        a.level.setTile(px + dx, 64, bz + dz, 46);
        if (a.level.getTile(px + dx, 64, bz + dz) === 46) n++;
      }
    return { n, center: a.level.getTile(px, 64, bz) };
  });
  h.expect(placed.n === 9, `9 块 TNT 都摆上了（实测 ${placed.n}）`);
  h.expect(placed.center === 46, '正中间那块是 TNT');
  await h.wait(400);
  await h.shot('01-摆好 TNT');

  // ---- 先记下"炸之前这一片有多少方块" ----
  const before = await h.state('记下炸之前这一片的方块数', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 14;
    let n = 0;
    for (let dx = -5; dx <= 5; dx++)
      for (let dy = -5; dy <= 3; dy++)
        for (let dz = -5; dz <= 5; dz++) if (a.level.getTile(px + dx, 63 + dy, bz + dz) !== 0) n++;
    return { n, entities: a.level.entities.length };
  });

  // ---- 点第一下 ----
  const first = await h.state('在 TNT 台中心炸一下（= 点着第一块）', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 14;
    // ⚠ 炸之前先记一下中心那块 TNT 还在不在
    const tntBefore = a.level.getTile(px, 64, bz);
    a.level.explode(null, px + 0.5, 65, bz + 0.5, 3.1);
    const primed = a.level.entities.filter((e) => e.constructor.name === 'PrimedTnt');
    return {
      tntBefore,
      primed: primed.length,
      minLife: primed.length ? Math.min(...primed.map((e) => e.life)) : null,
      maxLife: primed.length ? Math.max(...primed.map((e) => e.life)) : null,
    };
  });
  h.expect(first.tntBefore === 46, '前置条件：炸之前中心那块 TNT 在');
  // 这一条是本场景的核心：**被炸掉的 TNT 方块自己生成了 PrimedTnt 实体**
  h.expect(
    first.primed >= 1,
    `TntTile.wasExploded 造出了 PrimedTnt 实体（实测 ${first.primed} 个）`,
  );
  if (first.primed > 0) {
    // nextInt(80/4) + 80/8 = nextInt(20) + 10 → 引信在 [10, 30)
    h.expect(
      first.minLife >= 10 && first.maxLife < 30,
      `引信落在 [10,30) 里（实测 ${first.minLife}~${first.maxLife}）—— wasExploded 那条随机数调用还原对了`,
    );
  }
  await h.shot('02-刚炸第一下');

  // ---- 等连锁反应跑完（每根引信最多 29 刻，加上下落/弹跳，给足时间）----
  await h.wait(6000);

  const after = await h.state('连锁反应跑完了吗', (a) => {
    const px = Math.floor(a.player.x);
    const bz = Math.floor(a.player.z) + 14;
    let n = 0;
    for (let dx = -5; dx <= 5; dx++)
      for (let dy = -5; dy <= 3; dy++)
        for (let dz = -5; dz <= 5; dz++) if (a.level.getTile(px + dx, 63 + dy, bz + dz) !== 0) n++;
    let tntLeft = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) if (a.level.getTile(px + dx, 64, bz + dz) === 46) tntLeft++;
    return {
      n,
      tntLeft,
      primed: a.level.entities.filter((e) => e.constructor.name === 'PrimedTnt').length,
      center: a.level.getTile(px, 63, bz),
    };
  });
  h.expect(after.tntLeft === 0, `9 块 TNT 全没了（还剩 ${after.tntLeft}）`);
  h.expect(after.primed === 0, `连锁跑完之后没有残留的 PrimedTnt（还剩 ${after.primed}）`);
  h.expect(
    after.n < before.n,
    `这一片方块变少了（${before.n} → ${after.n}）—— 爆炸真的改了世界`,
  );
  h.expect(after.center === 0, '正中间那格被炸空了');
  await h.shot('03-炸完了');

  // ---- 把镜头压低，拍一张看得清坑的图 ----
  await h.state('镜头压低看坑', (a) => {
    const bz = Math.floor(a.player.z) + 14;
    a.player.xRot = -(Math.atan2(63 - (a.player.y + 1.62), 14) * 180) / Math.PI;
    a.player.xRotO = a.player.xRot;
    return { xRot: a.player.xRot, bz };
  });
  await h.wait(2000);
  await h.shot('04-坑');
}
