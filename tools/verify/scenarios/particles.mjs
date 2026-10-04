// E8 场景：粒子系统 —— 撒下去、看得见、会消失、挖方块会溅碎屑。
//
// 【⚠ `h.state` 的 fn 会被 toString() 后在页面里重新求值，闭包和模块级常量全丢，
//    只能写字面量】。所以下面凡是常量都直接写数字，并注明它是什么。
//
// 【物品 id 带 +256 偏移】`Item::Item(int id) : id(256 + id)`，所以雪球
// （`new SnowballItem(76)`）在注册表里的键是 **332**。iconcrack 的 data 要传这个。
//
// 【数字 id 也是合法输入】E6 在 `LevelRenderer.addParticle` 入口做了一次
// 数字→名字归一化（C++ 里那个枚举重载是死代码，但 TS 里已有调用点就是传数字的）。
// 下面专门有一条断言走数字路径。
//
// 【无头浏览器画面约 1 帧/秒】要拍"粒子还在"就得先 `a.pause = true` 把世界按住
// （pause 只挡 level.tick/tickEntities，渲染照跑）。

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

  // ---- 摆机位：朝 +z 平视，脚下一格地面 ----
  const view = await h.state('摆机位：朝 +z 平视', (a) => {
    a.player.yRot = 0;
    a.player.yRotO = 0;
    a.player.xRot = 0;
    a.player.xRotO = 0;
    a.player.y = 65;
    const px = Math.floor(a.player.x);
    const pz = Math.floor(a.player.z);
    return { px, pz, ground: a.level.getTile(px, 63, pz), engine: a.particleEngine !== null };
  });
  h.expect(view.ground !== 0, `脚下有地面（实测 id=${view.ground}）`);
  h.expect(view.engine, 'particleEngine 在进世界之后不是 null');
  await h.wait(800);

  // ---- 1) 手动撒 8 个火苗（字符串 id）----
  const s1 = await h.state('手动撒 8 个 flame', (a) => {
    const before = Number(a.particleEngine.countParticles());
    for (let i = 0; i < 8; i++) {
      // 相机正前方 3 格、脚边一字排开
      a.level.addParticle(
        'flame',
        a.player.x - 1.5 + i * 0.4,
        a.player.y - 0.6,
        a.player.z + 3,
        0,
        0,
        0,
      );
    }
    return { before, after: Number(a.particleEngine.countParticles()) };
  });
  h.expect(s1.after - s1.before === 8, `撒 8 个就多 8 个（实测 ${s1.after - s1.before}）`);

  // ---- 2) 16 格剔除：40 格外撒一个，计数不变 ----
  const s2 = await h.state('40 格外撒一个（该被剔除）', (a) => {
    const before = Number(a.particleEngine.countParticles());
    a.level.addParticle('flame', a.player.x + 40, a.player.y, a.player.z, 0, 0, 0);
    a.level.addParticle('flame', a.player.x, a.player.y, a.player.z, 0, 0, 0); // 近的作对照
    return { before, after: Number(a.particleEngine.countParticles()) };
  });
  h.expect(
    s2.after - s2.before === 1,
    `远的被剔除、近的留下 → 只多 1 个（实测 ${s2.after - s2.before}）`,
  );

  // ---- 3) 数字 id 也认（3 = ParticleType.smoke）----
  const s3 = await h.state('传数字 3（= smoke）也认', (a) => {
    const before = Number(a.particleEngine.countParticles());
    a.level.addParticle(3, a.player.x + 1, a.player.y - 0.6, a.player.z + 3, 0, 0, 0);
    return { before, after: Number(a.particleEngine.countParticles()) };
  });
  h.expect(s3.after - s3.before === 1, `数字 id 走通（实测 +${s3.after - s3.before}）`);

  // ---- 4) iconcrack 用 data 查物品（332 = 雪球，id 带 +256 偏移）----
  const s4 = await h.state('iconcrack 带 data=332（雪球）', (a) => {
    const before = Number(a.particleEngine.countParticles());
    a.level.addParticle('iconcrack', a.player.x - 1, a.player.y - 0.6, a.player.z + 3, 0, 0, 0, 332);
    return { before, after: Number(a.particleEngine.countParticles()) };
  });
  h.expect(s4.after - s4.before === 1, `iconcrack 走通（实测 +${s4.after - s4.before}）`);

  // ---- 定格拍照：这一刻场上应该有 11 颗粒子 ----
  const total = await h.state('定格，看场上粒子数', (a) => {
    a.pause = true;
    return { n: Number(a.particleEngine.countParticles()) };
  });
  h.expect(total.n >= 8, `定格那一刻场上至少 8 颗（实测 ${total.n}）`);
  await h.wait(1200);
  await h.shot('00-手动撒的粒子（火苗/烟/碎屑）');

  // ---- 5) 真链路：游戏自己挖掉脚边前方那格，溅出碎屑 ----
  const dug = await h.state('挖掉前方那格方块（走 GameMode.destroyBlock）', (a) => {
    a.pause = false;
    const px = Math.floor(a.player.x);
    const pz = Math.floor(a.player.z) + 3;
    const py = 63;
    const before = a.level.getTile(px, py, pz);
    const cnt0 = Number(a.particleEngine.countParticles());
    // GameMode.destroyBlock：真机路径是 Minecraft.handleBuildAction → GameMode 子类 → 这里
    const ok = a.gameMode.destroyBlock(px, py, pz);
    const cnt1 = Number(a.particleEngine.countParticles());
    return { before, ok, after: a.level.getTile(px, py, pz), cnt0, cnt1 };
  });
  h.expect(dug.before !== 0, `挖之前那格有方块（id=${dug.before}）`);
  h.expect(dug.ok, 'destroyBlock 返回 true');
  h.expect(dug.after === 0, '挖完变成空气');
  h.expect(dug.cnt1 - dug.cnt0 >= 18, `碎屑 ≥18 颗（实测 +${dug.cnt1 - dug.cnt0}）`);

  await h.state('立刻定格（碎屑还在飞）', (a) => {
    a.pause = true;
    return { n: Number(a.particleEngine.countParticles()) };
  });
  await h.wait(900);
  await h.shot('01-挖方块溅出的碎屑');

  // ---- 6) 粒子会自己死光（生命周期）----
  const alive0 = await h.state('放开世界', (a) => {
    a.pause = false;
    return { n: Number(a.particleEngine.countParticles()) };
  });
  h.expect(alive0.n > 0, `放开时还有 ${alive0.n} 颗`);
  await h.wait(6000);
  const alive1 = await h.state('等 6 秒后', (a) => {
    return { n: Number(a.particleEngine.countParticles()) };
  });
  h.expect(
    alive1.n < alive0.n,
    `粒子会自己消失（${alive0.n} → ${alive1.n}）`,
  );
  await h.shot('02-过了一会儿，粒子少了');

  // ---- 7) F3 的 P: 数字是真的了 ----
  const stats = await h.state('gatherStats3 的 P: 不是写死的 0', (a) => {
    return { s: a.gatherStats3() };
  });
  h.expect(/^P: \d+\. T: /.test(stats.s), `gatherStats3 形如 "P: n. T: …"（实测 ${stats.s.slice(0, 24)}…）`);
}
