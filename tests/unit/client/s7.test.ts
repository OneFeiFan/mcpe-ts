import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AllowAllCuller,
  Chunk,
  DistanceChunkSorter,
  Frustum,
  FrustumCuller,
  GL_MODELVIEW,
  GL_PROJECTION,
  GLES1,
  glGetContext,
  glLoadIdentity,
  glMatrixMode,
  glRotatef,
  glSetContext,
  glTranslatef,
  gluPerspective,
  Minecraft,
  RenderList,
  sorterComparator,
  Tesselator,
  TileRenderer,
} from '@mcpe/client';
import { AABB, FoliageColor, GrassColor, Level, Material, Tile } from '@mcpe/world';
import type { Entity } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// S7 检查点：用 S5 的无头世界做网格测试（GLES1 无头模式，只记录上传的字节数）
let level: Level;
const t = Tesselator.instance;
let nextVbo = 1;
const vbo = (): number[] => [nextVbo++, nextVbo++, nextVbo++];

/** 重建一段渲染区块，返回 layer 0 的顶点（从 Tesselator 的缓冲里读回） */
function build(x: number, y: number, z: number): { chunk: Chunk; verts: number[][] } {
  const c = new Chunk(level, x, y, z, 16, 0, vbo());
  c.rebuild();
  const n = c.getRenderChunk(0).vertexCount;
  return { chunk: c, verts: Array.from({ length: n }, (_, i) => t._vertexForTest(i)) };
}
const rgb = (c: number): [number, number, number] => [
  c & 0xff,
  (c >>> 8) & 0xff,
  (c >>> 16) & 0xff,
];

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  level = createFlatLevel();
  prepareLevel(level);
  // Minecraft::init 按选项改写（foliagetint、tintedSide 默认都是 false）：S9 移植 Minecraft::init 后由它来做
  FoliageColor.setUseTint(false);
  GrassColor.setUseTint(false);
  TileRenderer.setUseTint(false);
});

beforeEach(() => {
  glSetContext(new GLES1(null));
  t.init();
  Minecraft.useAmbientOcclusion = false;
});

describe('S7：方块与区块渲染', () => {
  it('区块 (8,8) 的 y 48..63：1536 个顶点（256 个草顶面 × 6），UV 都在第 0 格，颜色相同', () => {
    const { chunk, verts } = build(128, 48, 128);
    expect(verts.length).toBe(1536);
    expect(glGetContext().bufferSizes.get(chunk.getRenderChunk(0).vboId)).toBe(1536 * 36);
    expect(
      verts.every(
        (v) => v[1] === 16 && v[3]! >= 0 && v[3]! <= 1 / 16 && v[4]! >= 0 && v[4]! <= 1 / 16,
      ),
    ).toBe(true); // 顶面 y = 63 + 1，相对区块 +16
    expect(new Set(verts.map((v) => v[5])).size).toBe(1);
    expect(chunk.isEmpty()).toBe(false);
    expect(chunk.getRenderChunk(0).pos).toMatchObject({ x: 128, y: 48, z: 128 });
  });

  it('同一区块 y 0..15：0 个顶点（底面朝 y = −1，shouldRenderFace 直接返回 false）', () => {
    const { chunk, verts } = build(128, 0, 128);
    expect(verts.length).toBe(0);
    expect(chunk.isEmpty()).toBe(true);
  });

  it('AO 开关不改变顶点数；AO 时草色只上顶面，侧面是灰色', () => {
    const plain = build(112, 48, 112).verts; // 平台角上的区块 (7,7)：西、北两侧外露
    Minecraft.useAmbientOcclusion = true;
    const ao = build(112, 48, 112).verts;
    expect(ao.length).toBe(plain.length);
    expect(ao.length).toBeGreaterThan(1536);
    // 每 6 个顶点是一个面：y 全相同的是顶面，y 不全相同的是侧面
    const faces = Array.from({ length: ao.length / 6 }, (_, i) => ao.slice(i * 6, i * 6 + 6));
    const top = faces.filter((f) => f.every((v) => v[1] === 16)).flat();
    const side = faces.filter((f) => new Set(f.map((v) => v[1])).size > 1).flat();
    expect(top.length).toBe(1536);
    expect(
      top.every((v) => {
        const [r, g, b] = rgb(v[5]!);
        return g > r && g > b;
      }),
    ).toBe(true); // 0x339933 的绿
    expect(side.length).toBe(ao.length - 1536);
    expect(
      side.every((v) => {
        const [r, g, b] = rgb(v[5]!);
        return r === g && g === b;
      }),
    ).toBe(true);
    expect(Tile.grass.tex).toBe(3);
  });

  it('普通路径：草顶乘 0x339933、亮度 0.9（第 15 级），侧面不着色', () => {
    const { verts } = build(112, 48, 112);
    const top = verts.find((v) => v[1] === 16)!;
    const [r, g, b] = rgb(top[5]!);
    expect([r, g, b]).toEqual([
      Math.trunc((0x33 / 255) * 0.9 * 255),
      Math.trunc((0x99 / 255) * 0.9 * 255),
      Math.trunc((0x33 / 255) * 0.9 * 255),
    ]);
  });

  it('getWaterHeight、canRender', () => {
    expect(TileRenderer.canRender(Tile.SHAPE_BLOCK)).toBe(true);
    expect(TileRenderer.canRender(Tile.SHAPE_WATER)).toBe(false);
    const tr = new TileRenderer(level);
    expect(tr._getWaterHeightForTest(136, 64, 136, Material.water)).toBe(0); // 四周都是空气：1 - 4/4
  });
});

describe('剔除、排序、RenderList', () => {
  it('视锥：相机在 (136, 72, 104) 朝 +z，前方的平台可见，身后的区块不可见', () => {
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    gluPerspective(70, 16 / 9, 0.05, 256);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glRotatef(30, 1, 0, 0);
    glRotatef(180, 0, 1, 0);
    const culler = new FrustumCuller();
    culler.prepare(136, 72, 104);
    expect(culler.isVisible(new AABB(128, 48, 128, 144, 64, 144))).toBe(true);
    expect(culler.isVisible(new AABB(128, 48, 64, 144, 64, 80))).toBe(false);
    expect(new AllowAllCuller().isVisible(new AABB(0, 0, 0, 1, 1, 1))).toBe(true);
    expect(Frustum.getFrustum().pointInFrustum(0, 0, 1)).toBe(true); // 相机坐标系：+z 方向就是视线方向（转了 180°）
  });

  it('DistanceChunkSorter：近的排前面；RenderList 逐个绘制已加入的区块', () => {
    const near = new Chunk(level, 128, 64, 112, 16, 0, vbo());
    const far = new Chunk(level, 128, 64, 160, 16, 0, vbo());
    const sorted = [far, near].sort(
      sorterComparator(
        new DistanceChunkSorter({ x: 136, y: 72, z: 104, heightOffset: 0 } as unknown as Entity),
      ),
    );
    expect(sorted[0]).toBe(near);
    const { chunk } = build(128, 48, 128);
    const list = new RenderList();
    list.init(136, 72, 104);
    list.addR(chunk.getRenderChunk(0));
    list.next();
    const before = glGetContext().drawCalls;
    list.render();
    expect(glGetContext().drawCalls).toBe(before + 1);
  });
});
