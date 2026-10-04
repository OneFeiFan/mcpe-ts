import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EntityRenderDispatcher,
  GLES1,
  glSetContext,
  PaintingRenderer,
  Tesselator,
} from '@mcpe/client';
import { EntityRendererId, initItems, type Painting } from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// G10：PaintingRenderer —— 挂在墙上的画。核心是 renderPainting：把 motive 的 16×16 图块
// 铺成 w×h，每块画一块厚 1 像素的"板"（六面 24 个顶点）。
// 这个文件钉：注册那一行、render 的 GL 序列、24 个顶点的**逐条数值与顺序**、多块循环。

const f = Math.fround;

class SpyGL extends GLES1 {
  ops: string[] = [];
  constructor() {
    super(null);
  }
  override pushMatrix(): void {
    this.ops.push('push');
    super.pushMatrix();
  }
  override popMatrix(): void {
    this.ops.push('pop');
    super.popMatrix();
  }
  override translate(x: number, y: number, z: number): void {
    this.ops.push(`t:${x},${y},${z}`);
    super.translate(x, y, z);
  }
  override rotate(a: number, x: number, y: number, z: number): void {
    this.ops.push(`r:${a},${x},${y},${z}`);
    super.rotate(a, x, y, z);
  }
  override scale(x: number, y: number, z: number): void {
    this.ops.push(`s:${x},${y},${z}`);
    super.scale(x, y, z);
  }
  override enable(cap: number): void {
    this.ops.push(`enable:${cap}`);
    super.enable(cap);
  }
  override disable(cap: number): void {
    this.ops.push(`disable:${cap}`);
    super.disable(cap);
  }
}

let gl: SpyGL;
let loadAndBindTexture: ReturnType<typeof vi.fn>;

beforeAll(() => {
  gl = new SpyGL();
  glSetContext(gl);
  createFlatLevel();
  initItems();
});

afterEach(() => {
  vi.restoreAllMocks();
  EntityRenderDispatcher.destroy();
});

/** render 只碰 painting.motive（读 w/h/uo/vo）和 painting.getBrightness(a) —— 给个最小替身 */
function fakePainting(w: number, h: number, uo: number, vo: number, br = 1): Painting {
  return { motive: { w, h, uo, vo }, getBrightness: () => br } as unknown as Painting;
}

function makeRenderer(): PaintingRenderer {
  loadAndBindTexture = vi.fn();
  const r = new PaintingRenderer();
  r.init({ textures: { loadAndBindTexture } } as unknown as EntityRenderDispatcher);
  return r;
}

describe('PaintingRenderer（G10）', () => {
  it('ER_PAINTING_RENDERER 注册的就是 PaintingRenderer；前面那几个没被挤掉', () => {
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_PAINTING_RENDERER)).toBeInstanceOf(
      PaintingRenderer,
    );
    expect(erd.getRendererById(EntityRendererId.ER_TNT_RENDERER)).not.toBeNull();
    expect(erd.getRendererById(EntityRendererId.ER_ITEM_RENDERER)).not.toBeNull();
  });

  it('render 的 GL 序列：push/translate/rotate/缩放 1/16、RESCALE_NORMAL 开又关', () => {
    const r = makeRenderer();
    gl.ops.length = 0;
    r.render(fakePainting(16, 16, 0, 0), 1, 2, 3, 90, 0);
    expect(gl.ops).toEqual([
      'push',
      't:1,2,3',
      'r:90,0,1,0',
      'enable:32826', // GL_RESCALE_NORMAL (0x803a)
      's:0.0625,0.0625,0.0625', // 1/16
      'disable:32826',
      'pop',
    ]);
    expect(loadAndBindTexture).toHaveBeenCalledWith('art/kz.png');
  });

  it('16×16 一块：24 个顶点的数值与顺序逐条钉死（正/背/顶/底/左/右）', () => {
    const r = makeRenderer();
    const vertexUV = vi.spyOn(Tesselator.instance, 'vertexUV');
    const begin = vi.spyOn(Tesselator.instance, 'begin');
    const draw = vi.spyOn(Tesselator.instance, 'draw');
    const color = vi.spyOn(Tesselator.instance, 'color');

    r.render(fakePainting(16, 16, 0, 0), 0, 0, 0, 0, 0);

    // xx0 = -8、yy0 = -8、edgeWidth = 0.5；x0=8、x1=-8、y0=8、y1=-8
    // fu0=(0+16-0)/256=0.0625、fu1=(0+16-16)/256=0、fv0=0.0625、fv1=0
    // bu（背面）= 192/256=0.75、208/256=0.8125；bv = 0、16/256=0.0625
    // uu（顶/底）= 0.75、0.8125；uv = 0.5/256 = 0.001953125
    // su（左/右）= 192.5/256 = 0.751953125；sv = 0、0.0625
    expect(vertexUV.mock.calls).toEqual([
      [8, -8, -0.5, 0, 0.0625],
      [-8, -8, -0.5, 0.0625, 0.0625],
      [-8, 8, -0.5, 0.0625, 0],
      [8, 8, -0.5, 0, 0],
      [8, 8, 0.5, 0.75, 0],
      [-8, 8, 0.5, 0.8125, 0],
      [-8, -8, 0.5, 0.8125, 0.0625],
      [8, -8, 0.5, 0.75, 0.0625],
      [8, 8, -0.5, 0.75, 0.001953125],
      [-8, 8, -0.5, 0.8125, 0.001953125],
      [-8, 8, 0.5, 0.8125, 0.001953125],
      [8, 8, 0.5, 0.75, 0.001953125],
      [8, -8, 0.5, 0.75, 0.001953125],
      [-8, -8, 0.5, 0.8125, 0.001953125],
      [-8, -8, -0.5, 0.8125, 0.001953125],
      [8, -8, -0.5, 0.75, 0.001953125],
      [8, 8, 0.5, 0.751953125, 0],
      [8, -8, 0.5, 0.751953125, 0.0625],
      [8, -8, -0.5, 0.751953125, 0.0625],
      [8, 8, -0.5, 0.751953125, 0],
      [-8, 8, -0.5, 0.751953125, 0],
      [-8, -8, -0.5, 0.751953125, 0.0625],
      [-8, -8, 0.5, 0.751953125, 0.0625],
      [-8, 8, 0.5, 0.751953125, 0],
    ]);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(color).toHaveBeenCalledWith(1, 1, 1); // br 直接进浮点版 color
  });

  it('亮度来自 painting.getBrightness(a)：br=0.5 时三通道都是 0.5', () => {
    const r = makeRenderer();
    const color = vi.spyOn(Tesselator.instance, 'color');
    vi.spyOn(Tesselator.instance, 'vertexUV');
    vi.spyOn(Tesselator.instance, 'draw');

    r.render(fakePainting(16, 16, 0, 0, 0.5), 0, 0, 0, 0, 0);

    expect(color).toHaveBeenCalledWith(0.5, 0.5, 0.5);
  });

  it('32×16 两块：循环两次 → 48 个顶点、2 次 draw；第二块的 UV 从头再来（fu0/fu1 按 32 算）', () => {
    const r = makeRenderer();
    const vertexUV = vi.spyOn(Tesselator.instance, 'vertexUV');
    const draw = vi.spyOn(Tesselator.instance, 'draw');

    r.render(fakePainting(32, 16, 0, 0), 0, 0, 0, 0, 0);

    expect(vertexUV).toHaveBeenCalledTimes(48);
    expect(draw).toHaveBeenCalledTimes(2);
    // xs=1 块：xx0=-16 → x0 = -16+32 = 16、x1 = -16+16 = 0；
    // fu0 = (0+32-16)/256 = 0.0625、fu1 = (0+32-32)/256 = 0
    expect(vertexUV.mock.calls[24]).toEqual([16, -8, -0.5, 0, 0.0625]);
  });

  it('uo/vo 是画集里的格子偏移：uo=32 时 fu 系列整体 +0.125', () => {
    const r = makeRenderer();
    const vertexUV = vi.spyOn(Tesselator.instance, 'vertexUV');
    vi.spyOn(Tesselator.instance, 'draw');

    r.render(fakePainting(16, 16, 32, 0), 0, 0, 0, 0, 0);

    // fu0 = (32+16-0)/256 = 0.1875、fu1 = (32+16-16)/256 = 0.125
    expect(vertexUV.mock.calls[0]).toEqual([8, -8, -0.5, 0.125, 0.0625]);
    expect(vertexUV.mock.calls[1]).toEqual([-8, -8, -0.5, 0.1875, 0.0625]);
  });
});
