export default async function (h) {
  h.allowConsole('Missing category for tile');
  await h.wait(1500);
  await h.state('进世界', (a) => { a.startDemoWorld(); a.setScreen(null); return {}; });
  await h.wait(1000);
  await h.state('摆机位', (a) => {
    a.player.yRot = 0; a.player.yRotO = 0; a.player.xRot = 0; a.player.xRotO = 0;
    a.player.y = 65;
    return {};
  });
  await h.wait(800);
  const d1 = await h.state('只放一个 flame（眼前 3 格、与眼同高）', (a) => {
    a.pause = true;
    const before = Number(a.particleEngine.countParticles());
    a.level.addParticle('flame', a.player.x, a.player.y + 1.0, a.player.z + 3, 0, 0, 0);
    const bs = a.particleEngine.particles;
    const info = [];
    for (const list of bs) for (const p of list) {
      info.push(p.constructor.name + ' pos=' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) + ' size=' + p.size.toFixed(3) + ' tex=' + p.tex);
    }
    return { before, after: Number(a.particleEngine.countParticles()), info, camY: a.player.y, off: [Math.round(a.particleEngine.countParticles())] };
  });
  h.expect(d1.after - d1.before === 1, '加进去了');
  console.log('FLAME ' + JSON.stringify(d1));
  await h.wait(900);
  await h.shot('dbg-1-flame');
  const d2 = await h.state('清空后再只放一个 snowballpoof', (a) => {
    a.particleEngine.setLevel(a.level);
    a.level.addParticle('snowballpoof', a.player.x, a.player.y + 1.0, a.player.z + 3, 0, 0, 0);
    const bs = a.particleEngine.particles;
    const info = [];
    for (const list of bs) for (const p of list) {
      info.push(p.constructor.name + ' pos=' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) + ' size=' + p.size.toFixed(3) + ' tex=' + p.tex);
    }
    return { n: Number(a.particleEngine.countParticles()), info };
  });
  h.expect(d2.n === 1, '只剩一个');
  console.log('SNOW ' + JSON.stringify(d2));
  await h.wait(900);
  await h.shot('dbg-2-snowballpoof');
}
