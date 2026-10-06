// 告示牌场景：方块实体渲染（TileEntityRenderDispatcher → SignRenderer）。
// 告示牌方块的渲染形状是 SHAPE_INVISIBLE，画面上看到的牌子和字全靠方块实体渲染器；
// 箱子在这一版 C++ 里按普通方块画（ChestTileEntity 不设 rendererId），一并放一个确认它照常显示。
// h.state 的 fn 会被 toString 后在页面里重新求值，只能用字面量（见 falling.mjs 的说明）。
export default async function (h) {
  h.allowConsole('Missing category for tile');
  await h.wait(1500);
  await h.state('进 demo 世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? null : a.screen.constructor.name };
  });
  await h.wait(1000);

  const placed = await h.state('摆机位，放墙、墙上告示牌、立着的告示牌和箱子', (a) => {
    const p = a.player;
    p.yRot = 0; // 朝 +z
    p.xRot = 12;
    const px = Math.floor(p.x), pz = Math.floor(p.z);
    const L = a.level;
    let gy = 127;
    while (gy > 0 && L.getTile(px, gy, pz + 4) === 0) gy--;
    const y = gy + 1;
    // 一面 3 格宽、2 格高的石墙，在玩家前方 5 格
    for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 2; dy++) L.setTile(px + dx, y + dy, pz + 5, 1);
    // 墙上告示牌：贴在墙朝向玩家的一面（data 2 = 朝 -z）
    L.setTileAndData(px, y + 1, pz + 4, 68, 2);
    // 立着的告示牌：data 8 → 转 180°，正面朝 -z（朝着玩家）
    L.setTileAndData(px - 2, y, pz + 3, 63, 8);
    // 箱子
    L.setTileAndData(px + 2, y, pz + 3, 54, 2);
    const wall = L.getTileEntity(px, y + 1, pz + 4);
    const stand = L.getTileEntity(px - 2, y, pz + 3);
    if (wall) wall.messages = ['Hello', 'MCPE-TS', '', 'wall sign'];
    if (stand) { stand.messages = ['Standing', 'sign', '', ':)']; stand.selectedLine = 1; }
    return {
      y,
      wall: wall && wall.constructor.name,
      stand: stand && stand.constructor.name,
      chest: L.getTileEntity(px + 2, y, pz + 3) && L.getTileEntity(px + 2, y, pz + 3).constructor.name,
      tileEntities: L.tileEntities.length,
    };
  });
  h.expect(placed.wall === 'SignTileEntity', '墙上告示牌有方块实体');
  h.expect(placed.stand === 'SignTileEntity', '立着的告示牌有方块实体');
  h.expect(placed.chest === 'ChestTileEntity', '箱子有方块实体');
  await h.wait(1500);

  const r = await h.state('渲染器分派', (a) => {
    const L = a.level;
    const signs = L.tileEntities.filter((t) => t.constructor.name === 'SignTileEntity');
    const chests = L.tileEntities.filter((t) => t.constructor.name === 'ChestTileEntity');
    return { signRendererIds: signs.map((s) => s.rendererId), chestRendererIds: chests.map((c) => c.rendererId) };
  });
  h.expect(r.signRendererIds.every((id) => id === 2), '告示牌走 TR_SIGN_RENDERER');
  h.expect(r.chestRendererIds.every((id) => id === 0), '箱子是 TR_DEFAULT_RENDERER（原版行为，按方块画）');
  await h.shot('01-告示牌与箱子');
}
