// C-6b 场景：从起始菜单**真的**点进一个新生成的世界。
//
// 这是「世界生成」这条链在浏览器里唯一的端到端验证。之前所有场景进世界都走后门
// （`startDemoWorld()`，一个平坦世界），因为从菜单进世界要撞上 `Minecraft.selectLevel`
// → 普通维度 → `createRandomLevelSource()` 那个 throw。C-6a 把那条线接上了，这个场景
// 就走真路：**开始游戏 → 新建世界 → Create → selectLevel**。
//
// 判据两条，缺一不可：
//   1. **数量**：出生点周围数方块 —— 水、石头、草/土、基岩都得真的有，而且地面要有起伏。
//      只截图不看数的话，"整片都是平地"也能截出一张好看的图。
//   2. **画面**：截图里有山有水。**跑完必须打开图看一眼** —— 脚本通过不等于画面对
//      （PITFALLS「验证时的坑」最后一条）。
//
// 【h.state 的 fn 只能写字面量】它会被 toString() 之后在页面里重新求值，闭包全丢
// （见 smoke.mjs 的注释）。所以下面所有常量都写在函数体里面。

// 【种子是挑出来的，不是随手写的】验收是"截图里真的有山有水"，所以种子得让出生点附近两样都有。
// 拿一个临时脚本扫了 8 个种子（整个世界 256×256），数据是这样的：
//
//   seed=777          落差 48  22% 是水   ← 就它
//   seed=42           落差 41  25% 是水
//   seed=20251003     落差 57   0% 是水   → 一派高地，看不到水
//   seed=1234567      落差 69   0% 是水   → 同上
//   seed=999983       落差  2  85% 是水   → 几乎纯海，没有山
//
// 只出现在 `h.state` 的函数体里，见上面那条"只能写字面量"。
//
// 【这个世界是有限的，扫描必须先夹边界】`ChunkCache::fits` 写死区块 `0 <= x,z < 16`，
// 也就是**整个世界只有 256×256 格**；范围外返回 `EmptyLevelChunk` ——
// 整块 `invisible_bedrock`(95)、`getHeightmap` 恒返回 0。
// 不夹边界的话，扫到世界外面的柱子高度是 0，`hMin` 会被拉成 0，起伏全是假象。

export default async function (h) {
  h.allowConsole('Missing category for tile'); // 见 default.mjs 里的说明

  await h.wait(1500);

  // ---- 1. 起始菜单 ----
  const boot = await h.state('启动入口', (a) => ({
    screen: a.screen && a.screen.constructor.name,
    level: a.level === null ? null : 'loaded',
  }));
  h.expect(boot.screen === 'TouchStartMenuScreen', '打开页面就在起始菜单上');
  h.expect(boot.level === null, '这时候还没有世界');
  await h.shot('00-起始菜单');

  // ---- 2. 点「开始游戏」→ 选世界 ----
  await h.state('点「开始游戏」', (a) => {
    const s = a.screen;
    s.buttonClicked(s.buttons.find((b) => b.id === 2)); // 2 = 开始游戏
    return { cls: a.screen.constructor.name };
  });
  await h.wait(500);
  const list = await h.state('选世界界面', (a) => ({
    cls: a.screen.constructor.name,
    worlds: a.screen.worldsList.levels.map((l) => l.id),
  }));
  h.expect(list.cls === 'SelectWorldScreen', '进到选世界界面');
  h.expect(Array.isArray(list.worlds), '世界列表能读出来（哪怕是空的）');

  // ---- 3. 点「Create new」→ 新建世界 ----
  await h.state('点「Create new」', (a) => {
    const s = a.screen;
    s.buttonClicked(s.buttons.find((b) => b.id === 2)); // bCreate
    return { cls: a.screen.constructor.name };
  });
  await h.wait(300);
  const choose = await h.state('新建世界：填名字和种子', (a) => {
    const s = a.screen;
    if (s.constructor.name !== 'SimpleChooseLevelScreen') {
      return { cls: s.constructor.name, seeded: false };
    }
    s.tLevelName.text = 'gen';
    s.tSeed.text = '777';
    return {
      cls: s.constructor.name,
      mode: s.gamemode,
      name: s.tLevelName.text,
      seed: s.tSeed.text,
    };
  });
  h.expect(choose.cls === 'SimpleChooseLevelScreen', '进到新建世界界面');
  h.expect(choose.seeded === undefined || choose.seed === '777', '种子填进去了');
  await h.shot('01-新建世界');

  // ---- 4. 点「Create」—— **这一步以前必抛，现在是真进世界** ----
  // 用 try/catch 把异常抓成返回值：不然它会被 Playwright 记成 pageerror，
  // 报告里只会看到一句"页面出错"，看不到是哪一句抛的。
  const created = await h.state('点「Create」', (a) => {
    const s = a.screen;
    const b = s.buttons.find((x) => x.id === 3); // bCreate
    try {
      s.buttonClicked(b);
      return { threw: false, msg: '', screen: a.screen ? a.screen.constructor.name : null };
    } catch (e) {
      return { threw: true, msg: String(e && e.message), screen: null };
    }
  });
  h.expect(created.threw === false, `点 Create 不再抛（实际：${created.msg.slice(0, 80)}）`);
  if (created.threw) return; // 后面全依赖世界建起来了，先停下看报告

  // 等世界生成 + `_levelGenerated` 把玩家建出来。普通世界比平坦世界慢得多 ——
  // 出生点周围要现算好几个区块，给足时间。
  await h.wait(4000);

  // ---- 5. 世界真的起来了吗 ----
  const inGame = await h.state('进入世界', (a) => ({
    level: a.level === null ? null : 'loaded',
    screen: a.screen ? a.screen.constructor.name : null,
    player: a.player === null ? null : [a.player.x, a.player.y, a.player.z],
    dimension: a.level ? a.level.dimension.getDimension() : null,
    // 平坦世界的维度是 FlatDimension；普通世界应当是 Dimension/NormalDayCycleDimension
    dimensionClass: a.level ? a.level.dimension.constructor.name : null,
    seed: a.level ? a.level.getSeed() : null,
    // 区块源是不是真的 RandomLevelSource（不是 FlatChunkSource 那种后门）
    chunkSource: a.level ? a.level.getChunkSource().constructor.name : null,
  }));
  h.expect(inGame.level === 'loaded', '世界建起来了');
  h.expect(inGame.screen === null, '加载屏已经关掉（ProgressScreen.render 里那句 setScreen(null)）');
  h.expect(inGame.player !== null, '玩家建出来了');
  h.expect(inGame.dimensionClass !== 'FlatDimension', '不是平坦维度 —— 走的是普通维度的真路');
  h.expect(
    inGame.chunkSource !== 'FlatChunkSource',
    `区块源不是 demo 的平坦那个（实际 ${inGame.chunkSource}）`,
  );
  h.expect(inGame.seed === 777, '种子就是填进去那个（说明走的是新建世界那条路）');

  // ---- 6. 数方块：光有图不算，得真的有水有石头有草 ----
  // 以出生点为中心扫 32×32 的一小片（跨 4 个区块左右），从 y=0 到 y=127 全高。
  const survey = await h.state('出生点周围 32×32 的方块统计', (a) => {
    const lv = a.level;
    const x0 = Math.floor(a.player.x) - 16;
    const z0 = Math.floor(a.player.z) - 16;
    const counts = {};
    for (let dx = 0; dx < 32; dx++) {
      for (let dz = 0; dz < 32; dz++) {
        for (let y = 0; y < 128; y++) {
          const t = lv.getTile(x0 + dx, y, z0 + dz);
          if (t === 0) continue;
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
    return { counts };
  });
  const c = survey.counts;
  // 主要方块 id（Tile.cpp）：1 石头、2 草、3 土、7 基岩、8 水、9 静水、12 沙、24 沙岩、79 冰
  h.expect((c[8] || 0) + (c[9] || 0) > 0, `有水（id8/9 共 ${(c[8] || 0) + (c[9] || 0)} 格）`);
  h.expect((c[1] || 0) > 500, `有石头（id1 共 ${c[1] || 0} 格）`);
  h.expect((c[2] || 0) > 0, `有草方块（id2 共 ${c[2] || 0} 格）`);
  h.expect((c[7] || 0) > 0, `有基岩（id7 共 ${c[7] || 0} 格）`);

  await h.shot('02-刚进世界');

  // ---- 7. 地形有没有起伏（"有山"就是这个数不是 0）----
  // 用 `level.getHeightmap` 而不是自己扫全高：它是区块自己算好的高度图，读一次就够，
  // 扫 ±96（约 12×12 个区块）也不慢。
  //
  // ⚠ 一开始这段写错了：`if (top < 0) top = y` 记的是**最低**那个非空气格 ——
  // 于是每个柱子都是 y=0 的基岩，最高减最低恒等于 0，"地面有起伏"永远为假。
  // 断言看着很合理，其实量错了东西。
  const relief = await h.state('出生点周围 ±96 的地面高度', (a) => {
    const lv = a.level;
    const px = Math.floor(a.player.x);
    const pz = Math.floor(a.player.z);
    let hMin = 999;
    let hMax = -1;
    let hiX = 0;
    let hiZ = 0;
    // 夹在世界里（0..255）：外面是空区块，heightmap 一律返回 0，会把这几个数带坏
    const lo = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    for (let dx = -96; dx <= 96; dx++) {
      for (let dz = -96; dz <= 96; dz++) {
        const wx = lo(px + dx);
        const wz = lo(pz + dz);
        const y = lv.getHeightmap(wx, wz);
        if (y > hMax) {
          hMax = y;
          hiX = wx;
          hiZ = wz;
        }
        if (y < hMin) hMin = y;
      }
    }
    return { hMin, hMax, hiX, hiZ, spawnY: Math.floor(a.player.y) };
  });
  h.expect(
    relief.hMax - relief.hMin >= 8,
    `地面有起伏（最高 ${relief.hMax} / 最低 ${relief.hMin}）`,
  );
  h.expect(relief.hMax <= 127 && relief.hMin >= 0, '地面高度落在 0~127 里');

  // ---- 8. 站在出生点，朝这片地形最高处看 ----
  // 直接改玩家坐标（场景里不要点画面：无头浏览器锁光标之后每秒只有约 1 帧）。
  //
  // 【为什么是"朝最高处看"而不是"站在最高处看"】先试过站在最高点朝出生点看，
  // 拍出来一片平沙 —— 因为种子 777 的地形是"一大片低地 + 东北角一片高地"，
  // 站在高地上往低处看当然看不到山。方向反过来了。
  //
  // 【朝向是算出来的，不是随手写的】MC 的约定：yaw 0 朝 +z，90 朝 -x，180 朝 -z，270 朝 +x，
  // 也就是视线方向 = (-sin(yaw), cos(yaw))。要到目标 (tx,tz) 就取 yaw = atan2(-(tx-x), tz-z)。
  const vantage = await h.state('站在出生点，朝最高处看', (a) => {
    const lv = a.level;
    const px = Math.floor(a.player.x);
    const pz = Math.floor(a.player.z);
    let hMax = -1;
    let hiX = px;
    let hiZ = pz;
    const lo = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
    for (let dx = -96; dx <= 96; dx++) {
      for (let dz = -96; dz <= 96; dz++) {
        const wx = lo(px + dx);
        const wz = lo(pz + dz);
        const y = lv.getHeightmap(wx, wz);
        if (y > hMax) {
          hMax = y;
          hiX = wx;
          hiZ = wz;
        }
      }
    }
    a.player.x = px + 0.5;
    a.player.z = pz + 0.5;
    a.player.y = lv.getHeightmap(px, pz) + 2;
    a.player.yRot = (Math.atan2(-(hiX - px), hiZ - pz) * 180) / Math.PI;
    a.player.xRot = -3;
    return { pos: [a.player.x, a.player.y, a.player.z], peak: [hiX, hMax, hiZ], yRot: a.player.yRot };
  });
  h.expect(vantage.peak[1] === relief.hMax, '两次扫出来的最高点一致（同一片地形）');
  await h.wait(3000);
  await h.shot('03-朝最高处看');

  // ---- 9. 能挖能放（C-6 的验收里写着这一条）----
  const dig = await h.state('准星前方砌一格再挖掉', (a) => {
    const x = Math.floor(a.player.x);
    const z = Math.floor(a.player.z) + 3;
    const y = Math.floor(a.player.y);
    const before = a.level.getTile(x, y, z);
    a.level.setTile(x, y, z, 1); // 1 = 石头
    const placed = a.level.getTile(x, y, z);
    a.level.setTile(x, y, z, 0); // 挖掉
    const after = a.level.getTile(x, y, z);
    return { before, placed, after };
  });
  h.expect(dig.placed === 1, '能在生成出来的地形上放方块');
  h.expect(dig.after === 0, '能挖掉');
}
