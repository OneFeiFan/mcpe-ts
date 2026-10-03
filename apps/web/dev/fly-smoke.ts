// S8 的 dev 页（长期保留）：DomInput → Keyboard/Mouse → KeyboardInput、MouseTurnInput → DebugFreeCamera，在 S7 的地形上飞行。
// 主循环、转向系数与相机变换是 S9 里 Minecraft、GameRenderer 的简化版；S9 完成后这里只作为输入链路的单独检查。
import {
  AppPlatform,
  Chunk,
  CustomInputHolder,
  FrustumCuller,
  GL_ALPHA_TEST,
  GL_BACK,
  GL_COLOR_BUFFER_BIT,
  GL_CULL_FACE,
  GL_DEPTH_BUFFER_BIT,
  GL_DEPTH_TEST,
  GL_GREATER,
  GL_LEQUAL,
  GL_MODELVIEW,
  GL_PROJECTION,
  GL_TEXTURE_2D,
  GLES1,
  glAlphaFunc,
  glClear,
  glClearColor,
  glCullFace,
  glDepthFunc,
  glEnable,
  glGenBuffers,
  glLoadIdentity,
  glMatrixMode,
  glRotatef,
  glSetContext,
  glTranslatef,
  gluPerspective,
  glViewport,
  KeyboardInput,
  Minecraft,
  MouseBuildInput,
  MouseHandler,
  MouseTurnInput,
  OptionId,
  Options,
  RenderList,
  Tesselator,
  TextureData,
  Textures,
  Timer,
} from '@mcpe/client';
import { SharedConstants } from '@mcpe/core';
import { Keyboard, KeyboardAction, Mouse } from '@mcpe/platform';
import { DomInput } from '../src/DomInput';
import { DebugFreeCamera } from './camera/DebugFreeCamera';
import { createDemoLevel, loadImage } from './demoWorld';

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const gl = canvas.getContext('webgl2', { antialias: false })!;

class DevPlatform extends AppPlatform {
  constructor(private readonly images: Map<string, TextureData>) {
    super();
  }
  override loadTexture(name: string): TextureData {
    return this.images.get(name) ?? new TextureData();
  }
}

async function main(): Promise<void> {
  const ctx = new GLES1(gl);
  glSetContext(ctx);
  Tesselator.instance.init();
  const textures = new Textures(
    null,
    new DevPlatform(new Map([['terrain.png', await loadImage('/images/terrain.png')]])),
  );
  const level = createDemoLevel();
  Minecraft.useAmbientOcclusion = true;
  const chunks: Chunk[] = [];
  for (let cx = 7; cx <= 9; cx++)
    for (let cz = 7; cz <= 9; cz++)
      for (let cy = 0; cy < 8; cy++) {
        const ids = [0, 0, 0];
        glGenBuffers(3, ids);
        const c = new Chunk(level, cx * 16, cy * 16, cz * 16, 16, 0, ids);
        c.rebuild();
        chunks.push(c);
      }

  // ---- 输入链路（Minecraft::_reloadInput 的桌面分支）
  const options = new Options(null);
  const input = new CustomInputHolder(
    new KeyboardInput(options),
    new MouseTurnInput(MouseTurnInput.MODE_DELTA, canvas.width / 2, canvas.height / 2),
    new MouseBuildInput(),
  );
  const mouseHandler = new MouseHandler(input.getTurnInput());
  const camera = new DebugFreeCamera(level, 136, 72, 104);
  camera.xRot = camera.xRotO = 30;
  const dom = new DomInput(canvas, {
    onPointerUnlock: () => input.getMoveInput().releaseAllKeys(),
  }); // A6：releaseMouse → releaseAllKeys
  dom.attach();
  const timer = new Timer(SharedConstants.TicksPerSecond);

  const ss = options.getProgressValue(OptionId.OPTIONS_SENSITIVITY) * 0.6 + 0.2;
  const sens = ss * ss * ss * 8; // GameRenderer::render 的系数（默认灵敏度时为 1.0）

  const frame = () => {
    // Minecraft::tickInput：按键事件交给移动输入（A3）
    while (Keyboard.next()) {
      const key = Keyboard.getEventKey();
      const isDown = Keyboard.getEventKeyState() === KeyboardAction.KEYDOWN;
      input.getMoveInput().setKey(key, isDown);
    }
    Keyboard.reset();
    timer.advanceTime();
    for (let i = 0; i < timer.ticks; i++) camera.tick(input.getMoveInput()); // A2
    if (dom.isLocked()) {
      mouseHandler.poll();
      camera.turn(mouseHandler.xd * sens, -mouseHandler.yd * sens); // A4 的简化：S9 用 GameRenderer 的平滑量
    }
    Mouse.reset();
    Mouse.reset2();

    const a = timer.a;
    const p = camera.getPos(a);
    glViewport(0, 0, canvas.width, canvas.height);
    glClearColor(0.5, 0.7, 1.0, 1.0);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glEnable(GL_TEXTURE_2D);
    textures.loadAndBindTexture('terrain.png');
    glEnable(GL_ALPHA_TEST);
    glAlphaFunc(GL_GREATER, 0.1);
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    gluPerspective(70, canvas.width / canvas.height, 0.05, 256);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    // GameRenderer::moveCameraToPlayer 的第一人称分支
    glTranslatef(0, 0, -0.1);
    glRotatef(camera.xRotO + (camera.xRot - camera.xRotO) * a, 1, 0, 0);
    glRotatef(camera.yRotO + (camera.yRot - camera.yRotO) * a + 180, 0, 1, 0);
    glTranslatef(0, camera.heightOffset - 1.62, 0);
    const culler = new FrustumCuller();
    culler.prepare(p.x, p.y, p.z);
    const list = new RenderList();
    list.init(p.x, p.y, p.z);
    for (const c of chunks) {
      c.cull(culler);
      if (!c.visible || c.isEmpty()) continue;
      list.addR(c.getRenderChunk(0));
      list.next();
    }
    list.render();
    status.textContent = `相机 (${camera.x.toFixed(2)}, ${camera.y.toFixed(2)}, ${camera.z.toFixed(2)})  xRot ${camera.xRot.toFixed(1)}  yRot ${camera.yRot.toFixed(1)}  ${dom.isLocked() ? '已锁定' : '点击画面开始'}`;
    (window as unknown as { __fly: unknown }).__fly = {
      x: camera.x,
      y: camera.y,
      z: camera.z,
      xRot: camera.xRot,
      yRot: camera.yRot,
      locked: dom.isLocked(),
    };
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((e: unknown) => {
  status.textContent = '失败：' + String(e);
});
