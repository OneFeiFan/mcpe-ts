// G11 场景：PlayerRenderer 与空手手臂 —— 第三人称的自己和第一人称的手臂。
//
// 【验收（任务单 G11）】第三人称截一张（能看到自己的头和身子）；切回第一人称、
//   清空手持物品截一张（能看到手臂）。
//
// 【F5 那条链路】Minecraft.ts:675-677：按 F5 → `options.toggle(OPTIONS_THIRD_PERSON_VIEW)`,
//   正是下面 state 里调的那一句（无头环境驱动不了真实按键，等价链路在注释里写明）。
//   toggle 后每次渲染实时读这个开关：LevelRenderer.ts:900 第一人称跳过画自己、第三人称画自己
//   （走 ER_PLAYER_RENDERER → PlayerRenderer）；GameRenderer.moveCameraToPlayer 的
//   thirdPerson 分支（:579）把相机沿视线反方向拉 thirdDistance=4 格（字段初值就是 4，
//   切过去立刻到位，不用等平滑）。
//
// 【手臂】第一人称下才调 itemInHandRenderer.render(a)（GameRenderer.ts:508-521，第三人称不画手）。
//   IIH.render 读 `this.item.id > 0` 分物品/空手两支；id 归零走真实链路：
//   IIH.tick（GameRenderer.ts:726，照 C++ GameRenderer.cpp:827）在 RESTORED_ANIMS（默认开）
//   且 height 降到 <0.1 时把 id 清 0 —— 清空物品栏后约 3 个 tick 到位（无头约 1 tick/秒）。
//   空手分支里 PlayerRenderer.renderHand() 画 humanoidModel.arm0（HumanoidMobRenderer.cpp:22）。
//
// 【h.state 的 fn 只能写字面量】会被 toString() 后在页面里重新求值（见 smoke.mjs）。

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);

  await h.state('建/进 demo 世界（场景后门）', (a) => {
    a.startDemoWorld();
    a.setScreen(null);
    return { screen: a.screen === null ? 'none' : a.screen.constructor.name };
  });
  await h.wait(1000);

  // ---- 摆机位：朝 +z 平视（同 G10）----
  const view = await h.state('摆机位：朝 +z 平视', (a) => {
    a.player.yRot = 0;
    a.player.yRotO = 0;
    a.player.xRot = 0;
    a.player.xRotO = 0;
    a.player.y = 65;
    return { x: Math.floor(a.player.x), y: a.player.y, z: Math.floor(a.player.z) };
  });
  h.expect(view.y === 65, `站位就绪（${view.x}, ${view.y}, ${view.z}）`);

  // ---- 清空物品栏：空手是"看得见手臂"的前提 ----
  const cleared = await h.state('清空物品栏的全部槽位', (a) => {
    const inv = a.player.inventory;
    let n = 0;
    for (let i = 0; i < inv.items.length; i++) {
      if (inv.items[i] !== null && inv.items[i] !== undefined) n++;
      inv.items[i] = null;
    }
    inv.selectSlot(0);
    const sel = a.player.getSelectedItem();
    return { n, selId: sel === null ? null : sel.id };
  });
  h.expect(cleared.selId === null, `选中槽已空（清掉 ${cleared.n} 个槽，selId=${cleared.selId}）`);

  // ---- 等 IIH.tick 把 item.id 清 0（见文件头【手臂】那一段）----
  await h.wait(6000);
  const iih = await h.state('IIH 状态', (a) => {
    const r = a.gameRenderer.itemInHandRenderer;
    return { id: r.item.id, height: r.height };
  });
  h.expect(iih.id === 0, `空手就绪：IIH.item.id=${iih.id}（height=${iih.height}）`);

  // ---- 00 第三人称：能看到自己的头和身子 ----
  const tp = await h.state(
    '切第三人称（= 按 F5：options.toggle(2)，2 是 OPTIONS_THIRD_PERSON_VIEW）',
    (a) => {
      if (!a.options.getBooleanValue(2)) a.options.toggle(2);
      a.pause = true;
      return { third: a.options.getBooleanValue(2) };
    },
  );
  h.expect(tp.third === true, `第三人称开关打开了（third=${tp.third}）`);
  await h.wait(2500);
  await h.shot('00-第三人称：自己站在画面里（头+身子）');

  // ---- 01 第一人称空手：手臂 ----
  const fp = await h.state('切回第一人称', (a) => {
    if (a.options.getBooleanValue(2)) a.options.toggle(2);
    return { third: a.options.getBooleanValue(2), id: a.gameRenderer.itemInHandRenderer.item.id };
  });
  h.expect(fp.third === false, `切回第一人称（third=${fp.third}）`);
  h.expect(fp.id === 0, `手臂支：item.id 仍是 0（${fp.id}）`);
  await h.wait(2500);
  await h.shot('01-第一人称空手：右臂伸在画面角落');
}
