/**
 * NEW（S9）：网页入口，对照 main_glfw.h 写。
 * WebGL2（antialias:false、alpha:false）→ GLES1 兼容层 → 预加载图片 → NinecraftApp.init → 按 devicePixelRatio 设尺寸 →
 * requestAnimationFrame 驱动 update()。键鼠由 DomInput 喂给 Keyboard、Mouse；pointer lock 解除时调用 releaseMouse()（A6）。
 */
import { GLES1, glSetContext, NinecraftApp } from '@mcpe/client';
import { LOGW, VirtualFS } from '@mcpe/platform';
import { AppPlatform_web } from './AppPlatform_web';
import { preloadAssets, preloadFiles } from './assets';
import { DomInput } from './DomInput';
import { IndexedDbBackend } from './IndexedDbBackend';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const status = document.querySelector<HTMLParagraphElement>('#status');

/**
 * 卸载时再写一次。IDB 只有异步 API，pagehide / visibilitychange 里发起的事务**不保证提交完**
 * （Safari 尤其不可靠），所以这只是"尽力而为"；真正保命的是 200ms 防抖。
 * 不用 beforeunload：它在移动端常常不触发，而且同样保证不了异步事务。
 */
function installUnloadFlush(vfs: VirtualFS): void {
  const flush = (): void => {
    void vfs.flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

async function main(): Promise<void> {
  // 存档用的虚拟文件系统：先把 IndexedDB 里的内容读进内存，再启动游戏。
  // 必须在 app.init 之前完成，否则读存档的代码会看到一个空的文件系统。
  const vfs = new VirtualFS();
  try {
    await vfs.load(new IndexedDbBackend());
    vfs.enableAutoFlush(200);
    installUnloadFlush(vfs);
  } catch (e) {
    // 隐私模式、配额满、或被别的标签页占着旧版本时都会失败。
    // 参考 C++ 磁盘写不了也是照样进游戏，这里降级成"这一局存不下来"，不拦着启动。
    LOGW(`存档库打不开，这一局不会被保存：${String(e)}`);
  }

  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: false,
  });
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

  const input = new DomInput(canvas, {
    onPointerUnlock: () => app.releaseMouse(),
    onPointerLock: () => app.grabMouse(),
  });
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
  // 浏览器场景脚本（tools/verify/smoke.mjs）靠它读存档状态，和 __app 一个路子
  (window as unknown as { __vfs: VirtualFS }).__vfs = vfs;
}

main().catch((e: unknown) => {
  if (status) status.textContent = '启动失败：' + String(e);
  console.error(e);
});
