import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EntityRenderDispatcher,
  GLES1,
  glSetContext,
  TripodCameraRenderer,
  Tesselator,
} from '@mcpe/client';
import { Mth } from '@mcpe/util';
import {
  type Entity,
  EntityRendererId,
  initItems,
  type Player,
  Tile,
  TripodCamera,
} from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// G10：TripodCameraRenderer —— 三脚架相机（木叉 + 8×8×10 的相机方块）。
//
// ⚠ 这个文件钉的第一件事就是"它**没有**被注册"：C++ 的 EntityRenderDispatcher.h:55
//   只有一行注释掉的 `//TripodCameraRenderer tripodCameraRenderer;`，assign 列表里没有它 ——
//   原版画面上相机实体就是隐形的。照 C++ 1:1，TS 同样不注册（见 TripodCameraRenderer 文件头）。
//   剩下的用例逐条验证"类本身是照 C++ 写的"（旋转、两次 bindTexture、闪光、拾取高亮）。
//   ⚠ 对 cameraCube.render/renderHorrible 一律打桩 —— vi.spyOn 默认调原实现，真跑会往 GL 里
//   塞 cube 内部的 push/translate/pop（t:0,0.6875,0 就是 y=11 ÷ 16），干扰 ops 序列断言。

const f = Math.fround;

class SpyGL extends GLES1 {
  ops: string[] = [];
  constructor() {
    super(null);
    // glBlendFunc 走底层 this.gl.blendFunc（GLES1 没这个方法），headless 下塞个记录桥
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
  gl = new SpyGL();
  glSetContext(gl);
  createFlatLevel();
  initItems();
});

afterEach(() => {
  vi.restoreAllMocks();
  EntityRenderDispatcher.destroy();
});

/** TripodCamera 的构造函数只读 owner 的 xRot/yRot，给个最小替身就够了（同 world 侧测试） */
function fakePlayer(xRot = 30, yRot = 90): Player {
  return { xRot, yRot } as unknown as Player;
}

/** ⚠ 构造是 (level, owner, x, y, z) —— 后三个是坐标，不是朝向；朝向只从 owner 拷贝一次 */
function makeCam(life = 80, xRot = 0, yRot = 0): TripodCamera {
  const level = createFlatLevel();
  const cam = new TripodCamera(level, fakePlayer(), 0.5, 70, 0.5);
  cam.life = life;
  cam.xRot = xRot; // 渲染器读相机自己的 xRot/yRot（public 字段，交互后会变）
  cam.yRot = yRot;
  return cam;
}

type CubeView = {
  xRot: number;
  yRot: number;
  y: number;
  render: (s: number) => void;
  renderHorrible: (s: number) => void;
};
type TripodView = { tripod: Tile; cameraCube: CubeView };

function makeRenderer(hitEntity: Entity | null = null): TripodCameraRenderer {
  loadAndBindTexture = vi.fn();
  const r = new TripodCameraRenderer();
  r.init({
    textures: { loadAndBindTexture },
    minecraft: { hitResult: { entity: hitEntity } },
  } as unknown as EntityRenderDispatcher);
  return r;
}

describe('TripodCameraRenderer（G10）', () => {
  it('⚠ 照 C++ 不注册：渲染器表里没有它，相机实体在画面上是隐形的', () => {
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_TRIPODCAMERA_RENDERER)).toBeNull();

    const cam = makeCam();
    expect(cam.entityRendererId).toBe(EntityRendererId.ER_TRIPODCAMERA_RENDERER);
    expect(erd.getRenderer(cam)).toBeNull();
  });

  it('构造：shadowRadius = f(0.5)；tripod = Tile(0, 15*16+3)；cameraCube.y = 11', () => {
    const air = Tile.tiles[0]; // 先取空气的引用，构造之后再比 —— 钉"只警告不注册"
    const r = makeRenderer();
    const view = r as unknown as TripodView;

    expect((r as unknown as { shadowRadius: number }).shadowRadius).toBe(f(0.5));
    expect(view.tripod.tex).toBe(15 * 16 + 3);
    expect(view.tripod.id).toBe(0);
    expect(view.cameraCube.y).toBe(11);
    // Tile 构造对已占用的 id 只 LOGW、不写 Tile.tiles（注册在 Tile.init 里）→ 空气没被顶掉
    expect(Tile.tiles[0]).toBe(air);
  });

  it('getFlashTime：life>=8 与 life<0 都是 -1，其余是 (life-a)*0.125', () => {
    expect(TripodCameraRenderer.getFlashTime(makeCam(8), 0)).toBe(-1);
    expect(TripodCameraRenderer.getFlashTime(makeCam(9), 0)).toBe(-1);
    expect(TripodCameraRenderer.getFlashTime(makeCam(-1), 0)).toBe(-1);
    expect(TripodCameraRenderer.getFlashTime(makeCam(7), 0)).toBe(7 * f(0.125));
    expect(TripodCameraRenderer.getFlashTime(makeCam(4), 0)).toBe(4 * f(0.125));
    expect(TripodCameraRenderer.getFlashTime(makeCam(3), 0.5)).toBe(2.5 * f(0.125));
  });

  it('render：相机方块的朝向 = DEGRAD*(180+xRot/2) 与 -DEGRAD*yRot', () => {
    const r = makeRenderer();
    const cam = makeCam(80, 10, 20); // life=80 → 不闪光
    const view = r as unknown as TripodView;
    vi.spyOn(view.cameraCube, 'render').mockImplementation(() => {});

    r.render(cam, 1, 2, 3, 0, 0);

    expect(view.cameraCube.xRot).toBe(Mth.DEGRAD * (180 + 10 * f(0.5)));
    expect(view.cameraCube.yRot).toBe(-Mth.DEGRAD * 20);
  });

  it('render：木叉用 items 图集画十字、相机方块绑 item/camera.png 后 render(1/16)', () => {
    const r = makeRenderer();
    const cam = makeCam(80);
    const view = r as unknown as TripodView;
    const render = vi.spyOn(view.cameraCube, 'render').mockImplementation(() => {});
    const cross = vi
      .spyOn(
        (r as unknown as { tileRenderer: { tesselateCrossTexture: (...a: unknown[]) => void } })
          .tileRenderer,
        'tesselateCrossTexture',
      )
      .mockImplementation(() => {});

    gl.ops.length = 0;
    r.render(cam, 0.5, 64, 0.5, 0, 0);

    expect(gl.ops).toEqual(['push', 't:0.5,64,0.5', 'pop']);
    expect(cross).toHaveBeenCalledWith(view.tripod, 0, -0.5, -0.5, -0.5);
    expect(loadAndBindTexture.mock.calls).toEqual([['gui/items.png'], ['item/camera.png']]);
    expect(render).toHaveBeenCalledWith(0.0625); // 1/16
  });

  it('闪光：life=4、a=0 → sin(0.5*6.2830) 那对连发的 setColor（第二句立刻重置）', () => {
    const r = makeRenderer();
    const cam = makeCam(4); // flashLife = 4*0.125 = 0.5
    const view = r as unknown as TripodView;
    vi.spyOn(view.cameraCube, 'render').mockImplementation(() => {});

    gl.ops.length = 0;
    r.render(cam, 0, 0, 0, 0, 0);

    const flashStrength = Math.sin(0.5 * f(6.283));
    expect(gl.ops[2]).toBe(`color:1,1,1,${flashStrength}`);
    expect(gl.ops[3]).toBe('color:1,1,1,1');
  });

  it('life=8（getFlashTime 给 -1）时不闪光', () => {
    const r = makeRenderer();
    const cam = makeCam(8);
    const view = r as unknown as TripodView;
    vi.spyOn(view.cameraCube, 'render').mockImplementation(() => {});

    gl.ops.length = 0;
    r.render(cam, 0, 0, 0, 0, 0);

    expect(gl.ops).toEqual(['push', 't:0,0,0', 'pop']);
  });

  it('正被准星指着（hitResult.entity === cam）→ 第二遍 renderHorrible + 混合序列', () => {
    const cam = makeCam(80);
    const r = makeRenderer(cam); // hitResult.entity 就是它
    const view = r as unknown as TripodView;
    vi.spyOn(view.cameraCube, 'render').mockImplementation(() => {});
    const horrible = vi.spyOn(view.cameraCube, 'renderHorrible').mockImplementation(() => {});

    gl.ops.length = 0;
    r.render(cam, 0, 0, 0, 0, 0);

    expect(gl.ops).toEqual([
      'push',
      't:0,0,0',
      'disable:3553', // GL_TEXTURE_2D
      'enable:3042', // GL_BLEND
      'blendFunc:770,772', // GL_SRC_ALPHA, GL_DST_ALPHA
      'color:0.5,0.5,0.5,0.5',
      'color:1,1,1,1',
      'disable:3042',
      'enable:3553',
      'pop',
    ]);
    expect(horrible).toHaveBeenCalledWith(0.0625);
  });

  it('没被指着（hitResult.entity 是别的实体）→ 不画高亮那一遍', () => {
    const other = makeCam(80);
    const cam = makeCam(80);
    const r = makeRenderer(other); // 指着别人
    const view = r as unknown as TripodView;
    vi.spyOn(view.cameraCube, 'render').mockImplementation(() => {});
    const horrible = vi.spyOn(view.cameraCube, 'renderHorrible').mockImplementation(() => {});

    gl.ops.length = 0;
    r.render(cam, 0, 0, 0, 0, 0);

    expect(gl.ops).toEqual(['push', 't:0,0,0', 'pop']);
    expect(horrible).not.toHaveBeenCalled();
  });
});
