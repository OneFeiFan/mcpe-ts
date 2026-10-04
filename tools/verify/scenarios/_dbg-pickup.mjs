// 隔离调试（E9）：TakeAnimationParticle 到底画不画得出来。
//
// 上一版实测到：捡东西时引擎确实收到一颗 `TakeAnimationParticle`（档位 3），
// 但截图上看不见它。可能性有两个：(a) 渲染路径坏了；(b) 它就停在相机原点（近裁剪面里）。
// 这个场景把两者分开：**人为把粒子的起点挪到相机前方 3 格**，再拍一张。
// 挪了能看见 → 路径是好的，看不见 → 路径有问题。
//
// 不是验收场景，跑完看一眼截图就行。

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);
  await h.state('进 demo 世界', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { ok: true };
  });
  await h.wait(800);
  // ⚠ 玩家要等一帧才建出来，不能和 startDemoWorld 写在同一次 state 里
  await h.state('摆机位', (a) => {
    a.player.yRot = 0;
    a.player.yRotO = 0;
    a.player.xRot = 0;
    a.player.xRotO = 0;
    return { y: a.player.y };
  });
  await h.wait(400);

  // 记录引擎收到过什么
  await h.state('挂记录', (a) => {
    const pe = a.particleEngine;
    a.__added = [];
    const orig = pe.add.bind(pe);
    pe.add = (p) => {
      a.__added.push(p.constructor.name);
      return orig(p);
    };
    return { ok: true };
  });

  // 扔一个 + 摁到脚下
  await h.state('扔一个并摁到脚下', (a) => {
    const src = a.player.inventory.getItem(0);
    a.player.drop(src, false);
    const items = a.level
      .getEntities(a.player, a.player.bb.grow(6, 6, 6))
      .filter((e) => e.isItemEntity());
    const it = items[items.length - 1];
    it.throwTime = 0;
    it.xd = 0;
    it.yd = 0;
    it.zd = 0;
    it.setPos(a.player.x, a.player.y, a.player.z);
    return { ok: true };
  });

  // 盯着，一出现就暂停
  let info = null;
  for (let i = 0; i < 40; i++) {
    await h.wait(60);
    const s = await h.state('盯着', (a) => {
      const added = a.__added.slice();
      if (added.length > 0) a.pause = true;
      return { added };
    });
    if (s.added.length > 0) {
      info = s;
      break;
    }
  }
  h.expect(info !== null, `收到了：${JSON.stringify(info && info.added)}`);

  // 把粒子内部那个壳的位置读出来（只是读，不改）
  const where = await h.state('读粒子的起点/终点/相机', (a) => {
    const p = a.particleEngine.particles[3][0];
    if (!p) return { none: true };
    return {
      e: [p.e.x, p.e.y, p.e.z],
      target: [p.target.x, p.target.xOld, p.target.y, p.target.yOld, p.target.z, p.target.zOld],
      life: p.life,
      yOffs: p.yOffs,
      cam: [a.player.x, a.player.y, a.player.z],
      xOff: a.particleEngine.particles[3][0].constructor.xOff,
    };
  });
  h.expect(true, `粒子/相机位置：${JSON.stringify(where)}`);

  await h.wait(400);
  await h.shot('00-原样（起点=终点=相机，应该在近裁剪面里）');

  // 人为把起点挪到相机正前方 3 格（+z 方向，玩家朝 +z 看）
  await h.state('把起点挪到相机前方 3 格', (a) => {
    const p = a.particleEngine.particles[3][0];
    p.e.x = a.player.x;
    p.e.y = a.player.y;
    p.e.z = a.player.z + 3;
    return { e: [p.e.x, p.e.y, p.e.z] };
  });
  await h.wait(400);
  await h.shot('01-起点挪到前方 3 格（看得见就说明渲染路径是好的）');

  // 对照：把这颗粒子摘掉，拍一张干净的
  await h.state('摘掉这颗粒子', (a) => {
    a.particleEngine.particles[3].length = 0;
    return { n: Number(a.particleEngine.countParticles()) };
  });
  await h.wait(400);
  await h.shot('02-对照：没有粒子');
}
