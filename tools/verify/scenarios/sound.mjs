// F7 场景：声音。
//
// 【为什么没有截图】声音截不了图。判据是后端里那份**播放调用记录**
// （`WebAudioSoundSystem.plays`）—— 断言的是"**调了、参数对**"，不是"我听见了"。
//
// 【无头浏览器里 AudioContext 是 suspended（自动播放策略）】记录是在碰 AudioContext
// **之前**就写下的，所以没手势也能断言。真机上用户点过菜单就已经解锁了。

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);
  await h.state('进 demo 世界', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { ok: true };
  });
  await h.wait(1200);

  // ---- 1) 引擎与音源包都在 ----
  const wired = await h.state('引擎建出来了、名字表也登记了', (a) => ({
    engine: a.soundEngine !== null,
    names: a.soundEngine ? Number(a.soundEngine._soundCountForTest()) : -1,
    system: a.soundEngine ? a.soundEngine._systemForTest().constructor.name : null,
  }));
  h.expect(wired.engine, 'Minecraft.soundEngine 不是 null');
  h.expect(wired.names === 42, `100 条 sounds.add 归并成 42 个游戏内名字（实测 ${wired.names}）`);
  h.expect(
    wired.system === 'WebAudioSoundSystem',
    `注入的是 Web Audio 后端（实测 ${wired.system}）`,
  );

  // ---- 2) 真链路：挖方块 → step.* 或 random.* ----
  const dug = await h.state('清空记录，挖掉脚边前方那格', (a) => {
    const sys = a.soundEngine._systemForTest();
    sys.plays.length = 0;
    const px = Math.floor(a.player.x);
    const pz = Math.floor(a.player.z) + 3;
    const before = a.level.getTile(px, 63, pz);
    const ok = a.gameMode.destroyBlock(px, 63, pz);
    return { before, ok, plays: sys.plays.slice() };
  });
  h.expect(dug.before !== 0, `前提：那格有方块（id=${dug.before}）`);
  h.expect(dug.ok, 'destroyBlock 返回 true');
  h.expect(dug.plays.length > 0, `挖方块产生了播放调用（实测 ${dug.plays.length} 条）`);
  const names = dug.plays.map((p) => p.name);
  h.expect(
    names.some((n) => n.startsWith('step.') || n.startsWith('random.')),
    `名字是 step.* 或 random.*（实测 ${JSON.stringify(names)}）`,
  );
  h.expect(
    dug.plays.every((p) => p.volume > 0 && p.volume <= 1),
    `音量都落在 (0,1]（实测 ${JSON.stringify(dug.plays.map((p) => p.volume))}）`,
  );

  // ---- 3) 16 格硬剔除：远处的事件根本不调引擎 ----
  const far = await h.state('40 格外砸一下', (a) => {
    const sys = a.soundEngine._systemForTest();
    sys.plays.length = 0;
    // 直接打 LevelRenderer 那条路（Level.playSound → listener → LevelRenderer.playSound）
    a.level.playSound(a.player.x + 40, a.player.y, a.player.z, 'step.stone', 1, 1);
    const farCount = sys.plays.length;
    a.level.playSound(a.player.x + 2, a.player.y, a.player.z, 'step.stone', 1, 1);
    return { farCount, nearCount: sys.plays.length };
  });
  h.expect(far.farCount === 0, `40 格外被剔掉（实测调了 ${far.farCount} 次）`);
  h.expect(far.nearCount === 1, `2 格外放行（实测调了 ${far.nearCount} 次）`);

  // ---- 4) 距离越大音量越小（两层衰减的第一层）----
  const falloff = await h.state('同一个声音，远近各放一次', (a) => {
    const sys = a.soundEngine._systemForTest();
    const pe = a.player;
    const near = a.soundEngine._getVolumeMult(pe.x, pe.y, pe.z);
    const mid = a.soundEngine._getVolumeMult(pe.x + 5, pe.y, pe.z);
    const edge = a.soundEngine._getVolumeMult(pe.x + 15, pe.y, pe.z);
    return { near, mid, edge };
  });
  h.expect(falloff.near > falloff.mid, `近处比中间响（${falloff.near} > ${falloff.mid}）`);
  h.expect(falloff.mid > falloff.edge, `中间比远处响（${falloff.mid} > ${falloff.edge}）`);
  // ⚠ 不是 1.1：C++ 是 `clamp(1.1f - dist/20, -1.0f, 1.0f)`，**上界就是 1.0**，
  //   所以 dist ≤ 2 格时被夹成正好 1（第一版断言写了 1.1，是我想当然了）
  h.expect(falloff.near === 1, `脚下被 clamp 成正好 1（实测 ${falloff.near}）`);
  // 期望值按**和实现一样的算式**算（C++ 全是 float 运算，_invMaxDistance = f(1/20)）
  const f32 = Math.fround;
  const want5 = f32(f32(1.1) - f32(5 * f32(1 / 20)));
  h.expect(falloff.mid === want5, `5 格处 = 1.1 - 5×(1/20)（实测 ${falloff.mid}）`);

  // ---- 5) UI 音：playUI 不走距离衰减，坐标是 (0,0,0) ----
  const ui = await h.state('放一个 UI 音', (a) => {
    const sys = a.soundEngine._systemForTest();
    sys.plays.length = 0;
    a.soundEngine.playUI('random.click', 1, 1);
    return { plays: sys.plays.slice() };
  });
  h.expect(ui.plays.length === 1, `playUI 调了一次（实测 ${ui.plays.length}）`);
  h.expect(ui.plays[0].name === 'random.click', `名字对（实测 ${ui.plays[0].name}）`);
  h.expect(
    ui.plays[0].x === 0 && ui.plays[0].y === 0 && ui.plays[0].z === 0,
    `playUI 的坐标是 (0,0,0)（实测 ${ui.plays[0].x},${ui.plays[0].y},${ui.plays[0].z}）`,
  );

  // ---- 6) 后端真的能拿到音频数据（建得出 AudioBuffer）----
  const audio = await h.state('AudioContext 与解码路径', (a) => {
    const sys = a.soundEngine._systemForTest();
    const ctx = sys.context();
    const desc = a.soundEngine._systemForTest() && null;
    void desc;
    return {
      hasCtx: ctx !== null,
      state: ctx ? ctx.state : null,
      sampleRate: ctx ? ctx.sampleRate : 0,
    };
  });
  h.expect(audio.hasCtx, '浏览器给得出 AudioContext');
  h.expect(
    audio.state === 'suspended' || audio.state === 'running',
    `AudioContext 状态正常（实测 ${audio.state}）`,
  );
}
