// S6 的 dev 页（长期保留）：只用 GLES1 兼容层、Tesselator、Textures 画两样东西，检查固定管线的模拟是否正确。
import {
  AppPlatform, GL_ALPHA_TEST, GL_BACK, GL_COLOR_BUFFER_BIT, GL_CULL_FACE, GL_DEPTH_BUFFER_BIT, GL_DEPTH_TEST, GL_FOG, GL_FOG_COLOR, GL_FOG_END,
  GL_FOG_MODE, GL_FOG_START, GL_GREATER, GL_LEQUAL, GL_LINEAR, GL_MODELVIEW, GL_PROJECTION, GL_TEXTURE_2D, GLES1, glAlphaFunc, glClear,
  glClearColor, glCullFace, glDepthFunc, glDisable, glEnable, glFogf, glFogfv, glFogx, glLoadIdentity, glMatrixMode, glOrthof, glRotatef,
  glSetContext, glTranslatef, gluPerspective, glViewport, Tesselator, TextureData, Textures,
} from '@mcpe/client';

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) throw new Error('浏览器不支持 WebGL2');

/** 预加载的图片按 C++ 的同步语义交给 Textures（决策 D9） */
class SmokePlatform extends AppPlatform {
  constructor(private readonly images: Map<string, TextureData>) {
    super();
  }
  override loadTexture(name: string): TextureData {
    return this.images.get(name) ?? new TextureData();
  }
}

async function loadImage(url: string): Promise<TextureData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const t = new TextureData();
  t.w = img.width;
  t.h = img.height;
  t.data = new Uint8Array(g.getImageData(0, 0, img.width, img.height).data.buffer);
  return t;
}

const T = 1 / 16; // terrain.png 每格占 1/16

function quadTile(t: Tesselator, tex: number, x0: number, y0: number, x1: number, y1: number): void {
  const u = (tex % 16) * T, v = ((tex / 16) | 0) * T;
  t.vertexUV(x0, y1, 0, u, v + T);
  t.vertexUV(x1, y1, 0, u + T, v + T);
  t.vertexUV(x1, y0, 0, u + T, v);
  t.vertexUV(x0, y0, 0, u, v);
}

/** 草方块：顶 0（乘草色）、侧 3、底 2；逆时针为正面 */
function grassBlock(t: Tesselator): void {
  const face = (tex: number, tint: number, p: number[][]) => {
    t.color(tint);
    const u = (tex % 16) * T, v = ((tex / 16) | 0) * T;
    const uv = [[u, v + T], [u + T, v + T], [u + T, v], [u, v]];
    for (let i = 0; i < 4; i++) t.vertexUV(p[i]![0]!, p[i]![1]!, p[i]![2]!, uv[i]![0]!, uv[i]![1]!);
  };
  face(0, 0x339933, [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]); // 顶
  face(2, 0xffffff, [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]); // 底
  face(3, 0xcccccc, [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]); // 南
  face(3, 0xcccccc, [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]); // 北
  face(3, 0x999999, [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]); // 东
  face(3, 0x999999, [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]]); // 西
}

async function main(): Promise<void> {
  const ctx = new GLES1(gl!);
  glSetContext(ctx);
  const textures = new Textures(null, new SmokePlatform(new Map([['terrain.png', await loadImage('/images/terrain.png')]])));
  const t = Tesselator.instance;
  t.init();

  glClearColor(0.5, 0.7, 1.0, 1.0);
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  glEnable(GL_TEXTURE_2D);
  textures.loadAndBindTexture('terrain.png');

  // ---- 左：正交，第 0 格 × 0x339933，alpha test GREATER 0.1
  glViewport(0, 0, 320, 320);
  glMatrixMode(GL_PROJECTION);
  glLoadIdentity();
  glOrthof(0, 1, 0, 1, -1, 1);
  glMatrixMode(GL_MODELVIEW);
  glLoadIdentity();
  glEnable(GL_ALPHA_TEST);
  glAlphaFunc(GL_GREATER, 0.1);
  t.begin();
  t.color(0x339933);
  quadTile(t, 0, 0.1, 0.1, 0.9, 0.9);
  t.draw();

  // ---- 右：透视、深度、剔除、雾
  glViewport(320, 0, 320, 320);
  glMatrixMode(GL_PROJECTION);
  glLoadIdentity();
  gluPerspective(70, 1, 0.05, 256);
  glMatrixMode(GL_MODELVIEW);
  glLoadIdentity();
  glTranslatef(0, 0, -2.2);
  glRotatef(30, 1, 0, 0);
  glRotatef(40, 0, 1, 0);
  glEnable(GL_DEPTH_TEST);
  glDepthFunc(GL_LEQUAL);
  glEnable(GL_CULL_FACE);
  glCullFace(GL_BACK);
  glEnable(GL_FOG);
  glFogx(GL_FOG_MODE, GL_LINEAR);
  glFogf(GL_FOG_START, 1.5);
  glFogf(GL_FOG_END, 4.0);
  glFogfv(GL_FOG_COLOR, [0.5, 0.7, 1.0, 1.0]);
  t.begin();
  grassBlock(t);
  t.draw();
  glDisable(GL_FOG);

  // ---- 读回几个像素，供无头检查
  const px = (x: number, y: number) => {
    const out = new Uint8Array(4);
    gl!.readPixels(x, y, 1, 1, gl!.RGBA, gl!.UNSIGNED_BYTE, out);
    return Array.from(out);
  };
  const result = { left: px(160, 160), leftCorner: px(10, 10), right: px(480, 200), rightCorner: px(330, 10), drawCalls: ctx.drawCalls, glError: gl!.getError() };
  (window as unknown as { __smoke: unknown }).__smoke = result;
  status.textContent = `完成：drawCalls=${result.drawCalls}，glError=${result.glError}，左中心=${result.left.join(',')}，右=${result.right.join(',')}`;
}

main().catch((e: unknown) => {
  status.textContent = '失败：' + String(e);
  (window as unknown as { __smoke: unknown }).__smoke = { error: String(e) };
});
