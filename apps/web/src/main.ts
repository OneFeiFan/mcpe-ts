/**
 * NEW（S9）：网页入口，对照 main_glfw.h 写。
 * WebGL2（antialias:false、alpha:false）→ GLES1 兼容层 → 预加载图片 → NinecraftApp.init → 按 devicePixelRatio 设尺寸 →
 * requestAnimationFrame 驱动 update()。键鼠由 DomInput 喂给 Keyboard、Mouse；pointer lock 解除时调用 releaseMouse()（A6）。
 */
import { GLES1, glSetContext, NinecraftApp } from '@mcpe/client';
import { AppPlatform_web } from './AppPlatform_web';
import { preloadAssets, preloadFiles } from './assets';
import { DomInput } from './DomInput';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const status = document.querySelector<HTMLParagraphElement>('#status');

async function main(): Promise<void> {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('浏览器不支持 WebGL2');
  glSetContext(new GLES1(gl));
  const images = await preloadAssets();
  const platform = new AppPlatform_web(canvas, images, await preloadFiles());

  const app = new NinecraftApp();
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    app.setSize(w, h); // window_size_callback → g_app->setSize
  };
  app.init({ platform, doRender: true }); // setSize 要在 init 之后：transformResolution 会读 platform()
  resize();
  window.addEventListener('resize', resize);

  const input = new DomInput(canvas, { onPointerUnlock: () => app.releaseMouse(), onPointerLock: () => app.grabMouse() });
  input.lockAllowed = () => app.screen === null; // C++：有界面时点击不 grabMouse
  input.attach();

  // 游戏起来了就把 #status 清空：原版画面上没有这行字，留着会一直压在画面左上角。
  // 这个元素只留给“正在初始化…”和 main() 抛异常时的“启动失败：…”，不要拿它显示常驻提示。
  if (status) status.textContent = '';
  const frame = () => {
    app.update();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as unknown as { __app: NinecraftApp }).__app = app;
}

main().catch((e: unknown) => {
  if (status) status.textContent = '启动失败：' + String(e);
  console.error(e);
});
