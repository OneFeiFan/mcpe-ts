import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EntityRenderer,
  EntityRenderDispatcher,
  GLES1,
  glSetContext,
  Tesselator,
  TntRenderer,
} from '@mcpe/client';
import { EntityRendererId, initItems, PrimedTnt, Tile } from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// G10：TntRenderer —— 点燃的 TNT 画成方块，快炸时"鼓包"（glScalef2 三次缩放），
// 并且 (life / 5) & 1 == 0 的 tick 再画第二遍半透明白光（闪烁）。
// 这个文件钉四件事：注册那一行、鼓包公式与它的 <10 边界、闪烁支的完整 GL 序列、br 公式。

const f = Math.fround;

/**
 * 记 GL 调用序列的假上下文。
 * ⚠ gles.ts 的 glBlendFunc 直接走底层 `this.gl.blendFunc`（GLES1 自己没有这个方法），
 *   headless（gl = null）时它会静默跳过 —— 所以把底层 gl 换成一个"记录 blendFunc、
 *   其余方法一律空操作"的 Proxy 桥（enable/disable 若走 native 分支碰到它也不会崩）。
 *   矩阵/着色这些走 GLES1 自己的实现，override 就能记到。
 */
class SpyGL extends GLES1 {
  ops: string[] = [];
  constructor() {
    super(null);
    const target = {
      blendFunc: (s: number, d: number): void => void this.ops.push(`blendFunc:${s},${d}`),
    };
    (this as unknown as { gl: unknown }).gl = new Proxy(target, {
      get: (o, k) =>
        k in o ? (o as Record<string | symbol, unknown>)[k] : (): undefined => undefined,
    });
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
  override setColor(r: number, g: number, b: number, a: number): void {
    this.ops.push(`color:${r},${g},${b},${a}`);
    super.setColor(r, g, b, a);
  }
}

let gl: SpyGL;
let loadAndBindTexture: ReturnType<typeof vi.fn>;

beforeAll(() => {
  // ⚠ 建任何渲染器之前先铺 GL 上下文（ModelPart 构造要 glGenBuffers）+ 按真机顺序
  //   createFlatLevel → initItems（分派器构造会读 Item.egg / Item.snowBall）。
  gl = new SpyGL();
  glSetContext(gl);
  createFlatLevel();
  initItems();
});

afterEach(() => {
  vi.restoreAllMocks();
  EntityRenderDispatcher.destroy(); // 单例，别让用例之间互相污染
});

/** 建渲染器并把静态的 entityRenderDispatcher 指过去（bindTexture 要用它身上的 textures） */
function makeRenderer(): TntRenderer {
  loadAndBindTexture = vi.fn();
  const r = new TntRenderer();
  r.init({ textures: { loadAndBindTexture } } as unknown as EntityRenderDispatcher);
  return r;
}

function makeTnt(life: number): PrimedTnt {
  const level = createFlatLevel();
  const tnt = new PrimedTnt(level, 0.5, 64, 0.5);
  tnt.life = life;
  return tnt;
}

describe('TntRenderer（G10）', () => {
  it('ER_TNT_RENDERER 注册的就是 TntRenderer；前面那几个没被挤掉', () => {
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_TNT_RENDERER)).toBeInstanceOf(TntRenderer);
    expect(erd.getRendererById(EntityRendererId.ER_ITEM_RENDERER)).not.toBeNull();
    expect(erd.getRendererById(EntityRendererId.ER_CHICKEN_RENDERER)).not.toBeNull();
  });

  it('rendererId 是 ER_TNT_RENDERER 的实体能拿到它', () => {
    const tnt = makeTnt(80);
    expect(tnt.entityRendererId).toBe(EntityRendererId.ER_TNT_RENDERER);
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRenderer(tnt)).toBeInstanceOf(TntRenderer);
  });

  it('构造：shadowRadius = f(0.5)（C++ 0.5f）', () => {
    const r = makeRenderer();
    expect((r as unknown as { shadowRadius: number }).shadowRadius).toBe(f(0.5));
    expect(r).toBeInstanceOf(EntityRenderer);
  });

  it('life=75（不闪、不鼓包）：只有 push/translate/pop，方块画一遍', () => {
    const r = makeRenderer();
    const tnt = makeTnt(75); // 75-a+1 = 76 ≥ 10 不缩放；75/5=15，15&1=1 不闪
    const renderTile = vi.spyOn(r.tileRenderer, 'renderTile');

    gl.ops.length = 0;
    r.render(tnt, 0.5, 64, 0.5, 0, 0);

    expect(gl.ops).toEqual(['push', 't:0.5,64,0.5', 'pop']);
    expect(renderTile).toHaveBeenCalledTimes(1);
    expect(renderTile).toHaveBeenCalledWith(Tile.tnt, 0);
    expect(loadAndBindTexture).toHaveBeenCalledWith('terrain.png');
  });

  it('闪烁支：life=10（10/5&1==0）→ 第二遍 + 完整混合序列 + br', () => {
    const r = makeRenderer();
    const tnt = makeTnt(10); // 10-a+1 = 11 ≥ 10 不缩放
    const renderTile = vi.spyOn(r.tileRenderer, 'renderTile');

    // C++：br = (1 - ((life - a + 1) / 100.0f)) * 0.8f，渲染属第三档 → 字面量 0.8 过 f()
    const br = (1 - (10 - 0 + 1) / 100) * f(0.8);

    gl.ops.length = 0;
    r.render(tnt, 0.5, 64, 0.5, 0, 0);

    expect(gl.ops).toEqual([
      'push',
      't:0.5,64,0.5',
      'disable:3553', // GL_TEXTURE_2D
      'enable:3042', // GL_BLEND
      'blendFunc:770,772', // GL_SRC_ALPHA, GL_DST_ALPHA
      `color:1,1,1,${br}`,
      'color:1,1,1,1',
      'disable:3042', // GL_BLEND
      'enable:3553', // GL_TEXTURE_2D
      'pop',
    ]);
    expect(renderTile).toHaveBeenCalledTimes(2);
  });

  it('鼓包支：life=3（3-a+1=4 < 10）→ glScalef2 的 s = 1 + ((1-0.4)²)² * f(0.3)', () => {
    const r = makeRenderer();
    const tnt = makeTnt(3);
    vi.spyOn(r.tileRenderer, 'renderTile');

    // C++ 逐步：g = 1 - (4 / 10.0f); g = g*g; g = g*g; s = 1.0f + g * 0.3f
    let g = 1 - 4 / 10.0;
    g = g * g;
    g = g * g;
    const s = 1.0 + g * f(0.3);

    gl.ops.length = 0;
    r.render(tnt, 0.5, 64, 0.5, 0, 0);

    expect(gl.ops[2]).toBe(`s:${s},${s},${s}`);
    // 3/5 = 0，0&1 == 0 → 这条 life 也顺带闪（见上一条），这里只钉缩放的位置和值
  });

  it('鼓包公式里的 a 是插值参数：life=2、a=0.5 → 按 2.5 算，不是按 3', () => {
    const r = makeRenderer();
    const tnt = makeTnt(2); // 2-0.5+1 = 2.5 < 10 → g = 1 - 0.25 = 0.75
    vi.spyOn(r.tileRenderer, 'renderTile');

    let g = 1 - 2.5 / 10.0;
    g = g * g;
    g = g * g;
    const s = 1.0 + g * f(0.3);

    gl.ops.length = 0;
    r.render(tnt, 0.5, 64, 0.5, 0, 0.5);

    expect(gl.ops[2]).toBe(`s:${s},${s},${s}`);
  });

  it('边界：life-a+1 恰好 = 10 时不鼓包（9 + 0 + 1），且 9/5&1==1 不闪', () => {
    const r = makeRenderer();
    const tnt = makeTnt(9);
    vi.spyOn(r.tileRenderer, 'renderTile');

    gl.ops.length = 0;
    r.render(tnt, 0.5, 64, 0.5, 0, 0);

    expect(gl.ops).toEqual(['push', 't:0.5,64,0.5', 'pop']);
  });

  it('t.color(1,1,1) 是 Tesselator 的浮点版（写成 colorInt 会把 1 变白）', () => {
    const r = makeRenderer();
    const tnt = makeTnt(75);
    vi.spyOn(r.tileRenderer, 'renderTile');
    const color = vi.spyOn(Tesselator.instance, 'color');

    r.render(tnt, 0.5, 64, 0.5, 0, 0);

    expect(color).toHaveBeenCalledWith(1.0, 1.0, 1.0);
  });
});
