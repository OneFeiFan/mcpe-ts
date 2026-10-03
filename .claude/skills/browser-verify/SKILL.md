---
name: browser-verify
description: 移植或修改了任何会出现在画面上的东西（渲染、方块形状、界面、HUD、实体、手持物品、纹理）之后使用。用 Playwright 启动网页版、跑场景脚本、读取游戏状态、截图并人工查看截图。
---

# 浏览器实测

## 一次性准备

```bash
pnpm add -D -w playwright
npx playwright install chromium
```

## 跑

```bash
node tools/verify/smoke.mjs                                        # 默认场景：进世界、物品选择界面、暂停界面
node tools/verify/smoke.mjs tools/verify/scenarios/<你的场景>.mjs
```

输出 JSON 报告（页面错误、控制台错误、每个 expect、读到的状态、截图路径）；有错误或 expect 失败时退出码为 1。截图在 `tools/verify/out/<场景名>/`。

## 写场景

```js
export default async function (h) {
  await h.wait(1500);
  const s = await h.state('名字', (a) => ({
    x: a.player.x,
    screen: a.screen && a.screen.constructor.name,
  }));
  h.expect(s.screen === null, '一开始没有界面');
  await h.page.evaluate(() => window.__app.screenChooser.setScreen(6)); // 直接操作游戏
  await h.wait(800);
  await h.shot('02-界面');
}
```

`a` 就是 `window.__app`（NinecraftApp）。常用：`a.player`、`a.level`、`a.gui`、`a.screen`、`a.setScreen(null)`、`a.screenChooser.setScreen(id)`、`a.setIsCreativeMode(b)`、`a.options.toggle(id)`、`a.player.xRot = 60`（低头）、`a.player.drop(new II(id, n, aux), true)`（`II = a.player.inventory.getSelected().constructor`）。

## 必须做到

1. **用图片查看工具打开每一张截图**，描述你看到了什么，与预期对照。脚本通过不代表画面对（“画错了图”这类问题只有看图才能发现）。
2. 用 `h.state` 读出能证明功能生效的值（选中的物品名、界面类名、方块 id），写进 `h.expect`。
3. **不要点击画面去锁定鼠标**：无头浏览器锁定指针后每秒只有约 1 帧，截图会超时。要模拟点击界面里的按钮可以 `page.mouse.move(x, y); page.mouse.down(); await h.wait(300); page.mouse.up()`（有界面时不会锁定）；按住时间至少 300ms，否则游戏一帧都看不到按下。
4. 坐标换算：画布 960×540、GuiScale = 3，界面坐标 × 3 = 页面像素。
