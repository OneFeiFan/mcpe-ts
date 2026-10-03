// S11 的 dev 页（长期保留）：在 demo 平台上把 S11 能渲染的每种方块各摆一个，用真实的 NinecraftApp 渲染（含水、熔岩、火的动画纹理）。
// 第一排是立方体方块，第二排是非立方体形状（十字形、火把、火、梯子、栅栏、玻璃板、茎、床、水、熔岩……）。
import { GLES1, glSetContext, NinecraftApp } from '@mcpe/client';
import { AppPlatform_web } from '../src/AppPlatform_web';
import { preloadAssets, preloadFiles } from '../src/assets';
import { DomInput } from '../src/DomInput';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;

/** [id, data]：一格一个，0 表示空位 */
const CUBES: [number, number][] = [
  [1, 0], [4, 0], [5, 0], [17, 0], [17, 1], [17, 2], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0], [21, 0], [56, 0], [73, 0],
  [20, 0], [24, 0], [98, 0], [45, 0], [47, 0], [46, 0], [49, 0], [41, 0], [42, 0], [57, 0], [79, 0], [80, 0], [82, 0], [89, 0],
  [103, 0], [155, 0], [35, 0], [35, 14], [35, 11], [35, 4], [18, 0], [44, 0], [43, 0], [87, 0], [7, 0], [246, 0],
];
const SHAPES: [number, number][] = [
  [6, 0], [37, 0], [38, 0], [39, 0], [40, 0], [50, 5], [83, 0], [78, 0], [96, 0],
];

async function main(): Promise<void> {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })!;
  glSetContext(new GLES1(gl));
  const platform = new AppPlatform_web(canvas, await preloadAssets(), await preloadFiles());
  const app = new NinecraftApp();
  app.init({ platform, doRender: true });
  const resize = () => {
    canvas.width = Math.round(canvas.clientWidth * devicePixelRatio);
    canvas.height = Math.round(canvas.clientHeight * devicePixelRatio);
    app.setSize(canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);
  new DomInput(canvas, { onPointerUnlock: () => app.releaseMouse(), onPointerLock: () => app.grabMouse() }).attach();

  let placed = false;
  const frame = () => {
    app.update();
    if (!placed && app.cameraTargetPlayer) {
      placed = true;
      const level = app.level!;
      const y = 64; // 平台顶面（草）在 63
      CUBES.forEach(([id, data], i) => level.setTileAndData(116 + (i % 20) * 2, y, 120 + Math.floor(i / 20) * 2, id, data));
      SHAPES.forEach(([id, data], i) => level.setTileAndData(116 + i * 2, y, 114, id, data));
      // 需要特定邻居的形状
      level.setTileAndData(136, y, 114, 85, 0); level.setTileAndData(137, y, 114, 85, 0); level.setTileAndData(138, y, 114, 85, 0); // 栅栏
      level.setTileAndData(140, y, 114, 102, 0); level.setTileAndData(141, y, 114, 102, 0); level.setTileAndData(142, y, 114, 102, 0); // 玻璃板
      level.setTileAndData(144, y, 115, 1, 0); level.setTileAndData(144, y, 114, 65, 2); // 梯子靠在石头上
      level.setTileAndData(146, y - 1, 114, 60, 7); level.setTileAndData(146, y, 114, 105, 7); // 耕地上的西瓜茎
      level.setTileAndData(148, y, 114, 26, 2); level.setTileAndData(148, y, 115, 26, 2 | 8); // 床（脚、头）
      level.setTileAndData(150, y - 1, 114, 87, 0); level.setTileAndData(150, y, 114, 51, 0); // 地狱岩上的火
      level.setTileAndData(152, y - 1, 114, 9, 0); level.setTileAndData(153, y - 1, 114, 9, 0); // 水（嵌进地面）
      level.setTileAndData(155, y - 1, 114, 11, 0); level.setTileAndData(156, y - 1, 114, 11, 0); // 熔岩
      // S12：第三排（离相机最近）
      const r3 = 110;
      level.setTileAndData(116, y, r3, 53, 0); level.setTileAndData(118, y, r3, 67, 1); level.setTileAndData(120, y, r3, 108, 2); // 楼梯
      level.setTileAndData(122, y, r3, 64, 0); level.setTileAndData(122, y + 1, r3, 64, 8); // 木门（下、上）
      level.setTileAndData(124, y - 1, r3, 12, 0); level.setTileAndData(124, y, r3, 81, 0); // 沙子上的仙人掌
      level.setTileAndData(126, y, r3, 107, 0); // 栅栏门
      level.setTileAndData(128, y - 1, r3, 60, 7); level.setTileAndData(128, y, r3, 59, 7); // 耕地上的成熟小麦
      level.setTileAndData(130, y, r3, 31, 1); level.setTileAndData(132, y, r3, 30, 0); // 草丛、蜘蛛网
      level.setTileAndData(134, y, r3, 58, 0); level.setTileAndData(136, y, r3, 61, 2); level.setTileAndData(138, y, r3, 245, 0); // 工作台、熔炉、切石机
      level.setTileAndData(140, y, r3, 247, 0); level.setTileAndData(142, y, r3, 71, 0); level.setTileAndData(142, y + 1, r3, 71, 8); // 下界反应堆、铁门
      const p = app.player!; // S12 起相机就是玩家：悬停在空中俯视陈列
      p.abilities.flying = true;
      p.moveTo(136, 70, 102, 0, 30);
      p.xRotO = p.xRot;
      p.yRotO = p.yRot;
      status.textContent = '方块陈列：后排立方体，中排 S11 形状，前排 S12 方块。点击画面后可用 WASD、鼠标飞行查看。';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as unknown as { __app: NinecraftApp }).__app = app;
}

main().catch((e: unknown) => {
  status.textContent = '失败：' + String(e);
  console.error(e);
});
