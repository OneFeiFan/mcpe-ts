// S7 的 dev 页（长期保留）：真实世界 → Chunk.rebuild（TileRenderer、AO）→ FrustumCuller → RenderList，经 GLES1 兼容层画出来。
import {
  AppPlatform, Chunk, FrustumCuller, GL_ALPHA_TEST, GL_BACK, GL_COLOR_BUFFER_BIT, GL_CULL_FACE, GL_DEPTH_BUFFER_BIT, GL_DEPTH_TEST, GL_GREATER,
  GL_LEQUAL, GL_MODELVIEW, GL_PROJECTION, GL_TEXTURE_2D, GLES1, glAlphaFunc, glClear, glClearColor, glCullFace, glDepthFunc, glEnable,
  glGenBuffers, glLoadIdentity, glMatrixMode, glRotatef, glSetContext, gluPerspective, glViewport, Minecraft, RenderList, Tesselator,
  TextureData, Textures,
} from '@mcpe/client';
import { createDemoLevel, loadImage } from './demoWorld';

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true })!;
const CAM = { x: 136, y: 72, z: 104 };

class DevPlatform extends AppPlatform {
  constructor(private readonly images: Map<string, TextureData>) {
    super();
  }
  override loadTexture(name: string): TextureData {
    return this.images.get(name) ?? new TextureData();
  }
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const ctx = new GLES1(gl);
  glSetContext(ctx);
  Tesselator.instance.init();
  const textures = new Textures(null, new DevPlatform(new Map([['terrain.png', await loadImage('/images/terrain.png')]])));
  const level = createDemoLevel();
  Minecraft.useAmbientOcclusion = true; // LevelRenderer 按选项 ao（默认 true）设置

  // 区块 7–9、每列 8 段（y 0..127）；每个渲染区块 3 个 VBO（3 个渲染层）
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
  const t1 = performance.now();

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

  const stats: Record<string, { visible: number; drawn: number; vertices: number }> = {};
  const draw = (name: string, vx: number, pick: (c: Chunk) => boolean) => {
    glViewport(vx, 0, 480, 360);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    gluPerspective(70, 480 / 360, 0.05, 256);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glRotatef(30, 1, 0, 0); // 俯角
    glRotatef(180, 0, 1, 0); // 朝 +z
    const culler = new FrustumCuller();
    culler.prepare(CAM.x, CAM.y, CAM.z);
    const list = new RenderList();
    list.init(CAM.x, CAM.y, CAM.z);
    const s = { visible: 0, drawn: 0, vertices: 0 };
    for (const c of chunks) {
      if (!pick(c)) continue;
      c.cull(culler);
      if (!c.visible) continue;
      s.visible++;
      if (c.isEmpty()) continue;
      list.addR(c.getRenderChunk(0));
      list.next();
      s.drawn++;
      s.vertices += c.getRenderChunk(0).vertexCount;
    }
    list.render();
    stats[name] = s;
  };
  draw('one', 0, (c) => c.x === 128 && c.z === 128);
  draw('all', 480, () => true);

  const px = (x: number, y: number) => {
    const out = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return Array.from(out);
  };
  const result = {
    stats, drawCalls: ctx.drawCalls, glError: gl.getError(), buildMs: Math.round(t1 - t0),
    oneCenter: px(240, 120), oneSky: px(240, 340), allNearWall: px(720, 40), allTop: px(720, 160), allSky: px(720, 350),
  };
  (window as unknown as { __smoke: unknown }).__smoke = result;
  status.textContent = `完成：${JSON.stringify(result)}`;
}

main().catch((e: unknown) => {
  status.textContent = '失败：' + String(e);
  (window as unknown as { __smoke: unknown }).__smoke = { error: String(e) };
});
