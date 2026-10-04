/**
 * NEW（S9）：网页入口，对照 main_glfw.h 写。
 * WebGL2（antialias:false、alpha:false）→ GLES1 兼容层 → 预加载图片 → NinecraftApp.init → 按 devicePixelRatio 设尺寸 →
 * requestAnimationFrame 驱动 update()。键鼠由 DomInput 喂给 Keyboard、Mouse；pointer lock 解除时调用 releaseMouse()（A6）。
 */
import { GLES1, glSetContext, installSoundBackend, NinecraftApp } from '@mcpe/client';
import { LOGW, VirtualFS, setVfs } from '@mcpe/platform';
import { AppPlatform_web } from './AppPlatform_web';
import { loadSoundBank, preloadAssets, preloadFiles } from './assets';
import { WebAudioSoundSystem } from './WebAudioSoundSystem';
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
  // 【B7 补上】模块级注入点。C++ 那边 fopen 是全局函数，存档代码直接调；TS 对应成 getVfs()，
  // 所以要在这里把实例装进去。B1b 只把它挂到了 window.__vfs（给 smoke 场景用），
  // 装注入点这一步一直没做 —— 在 B7 之前应用路径上没人调 getVfs()，所以没暴露出来。
  // 放在 try 外面：就算 IndexedDB 打不开，内存里这个文件系统也照样能用（只是存不下去）。
  setVfs(vfs);
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

  // F6：音频后端和音源包要在建 app **之前**装好 —— Minecraft 的构造函数里就会
  //   `new SoundEngine(20.0f)` 并 init（那时要把 100 条名字表登记进仓库）。
  // ⚠ AudioContext 要**在这里就建**（哪怕还是 suspended）：解锁用的 pointerdown 监听是在
  //   建 context 的时候挂的。如果拖到第一次 playAt 才建，那次 playAt 已经发生在
  //   "点开始游戏"之后了 —— 用户得再点一次才听得到声音。
  const sound = new WebAudioSoundSystem();
  sound.context();
  installSoundBackend(sound, await loadSoundBank());

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
