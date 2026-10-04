/**
 * G9 `ChickenModel` + `ChickenRenderer` 单测 —— 对应 packages/client/src/model/ChickenModel.ts
 * 与 packages/client/src/renderer/entity/ChickenRenderer.ts。
 *
 * 【验收（任务单 G 的口径）】形状那一半：8 个部件（`hair` 不在内）的盒子、位置、贴图偏移、
 * `setupAnim` 的 6 组角度。渲染那一半：成年/幼年两条分支的 GL 调用**顺序与参数逐条对**；
 * `getBob` 的插值与 `(sin+1)`。注册：`ER_CHICKEN_RENDERER` 挂的是
 * `ChickenRenderer(ChickenModel, 0.3f)`。
 *
 * 【观察手段】
 * - `SpyGL`（G6/G8 同款）把 push/pop/translate/rotate/scale 记成字符串；
 * - 8 个部件的 `render` 换成桩、往同一个 ops 数组里塞 `part:名字@scale` —— 这样 ops
 *   里**只有模型自己发的调用**（部件内部的 Tesselator 不掺进来），而且"哪几个部件
 *   落在哪个 push/pop 区间里"一目了然；
 * - 贴图偏移穿过私有字段读（`xTexOffs`/`yTexOffs`）。
 *
 * 【两个前置】`Mth.initMth()`（不调则 sin/cos 全 0，见 G7 的教训）；GL 上下文
 * （`ModelPart` 构造要 `glGenBuffers2`）。
 *
 * 【手算锚点】`setupAnim` 挑 `yRot = xRot = Mth.RADDEG`（正好 1 弧度）→ 角度就是 ±1，
 * 把"除以 RADDEG"和头那个**负号**一起钉死；`time = 0` → `cos(0) = 1` → 腿摆角就是 `1.4f * r`
 * （r = 2 时正好是 `f(2.8)`）。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChickenModel,
  ChickenRenderer,
  EntityRenderDispatcher,
  GLES1,
  MobRenderer,
  glSetContext,
} from '@mcpe/client';
import type { Model, ModelPart } from '@mcpe/client';
import { EntityRendererId, initItems, type Mob } from '@mcpe/world';
import { Mth } from '@mcpe/util';
import { createFlatLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

class SpyGL extends GLES1 {
  ops: string[] = [];
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
}

let gl: SpyGL;

// 8 个部件的登记顺序（= setModel 顺序 = render 顺序）；`hair` 声明了但从不登记
const PART_NAMES = ['head', 'beak', 'redThing', 'body', 'leg0', 'leg1', 'wing0', 'wing1'] as const;

/** 一个部件的全部盒子顶点的包围盒 —— 用来间接看 addBox 的 x0/w/h/d。 */
function bounds(part: ModelPart): number[][] {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const cube of part.cubes) {
    for (const poly of cube.polygons) {
      for (const v of poly.vertices) {
        xs.push(v.pos.x);
        ys.push(v.pos.y);
        zs.push(v.pos.z);
      }
    }
  }
  return [
    [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
    [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
  ];
}

/** 读私有的贴图偏移（对应 C++ 的 texOffs）。 */
function texOffs(part: ModelPart): number[] {
  const p = part as unknown as { xTexOffs: number; yTexOffs: number };
  return [p.xTexOffs, p.yTexOffs];
}

/** 把 8 个部件的 render 换成往 gl.ops 里记一笔的桩（scale 也记进去，顺手钉住"原样传"）。 */
function stubPartRenders(m: ChickenModel): void {
  for (const name of PART_NAMES) {
    vi.spyOn(m[name], 'render').mockImplementation((scale: number) => {
      gl.ops.push(`part:${name}@${scale}`);
    });
  }
}

/** `getBob` 只念这 4 个字段 —— 不用真鸡。 */
function fakeFlap(oFlap: number, flap: number, oFlapSpeed: number, flapSpeed: number): Mob {
  return { oFlap, flap, oFlapSpeed, flapSpeed } as unknown as Mob;
}

const scale16 = f(1 / 16);

beforeAll(() => {
  Mth.initMth(); // ⚠ 不调这个，sin/cos 全是 0（见文件头）
  createFlatLevel(); // 先注册方块 —— initItems() 会读 Tile.grass.id（真机就是 initTiles → initItems）
  initItems(); // 分派器构造要读 Item.egg / Item.snowBall（C++ assign 那两行）
});

beforeEach(() => {
  gl = new SpyGL(null);
  glSetContext(gl);
  vi.restoreAllMocks();
});

describe('G9 ChickenModel 构造函数：8 个部件、盒子、贴图偏移、位置', () => {
  it('8 个部件按 setModel 顺序进 cubes；hair 从不登记', () => {
    const m = new ChickenModel();
    expect(m.cubes).toEqual(PART_NAMES.map((n) => m[n]));
    expect(m.cubes).not.toContain(m.hair);
    expect(m.hair.cubes).toEqual([]);
  });

  it('贴图偏移（texOffs）逐条对', () => {
    const m = new ChickenModel();
    expect(PART_NAMES.map((n) => texOffs(m[n]))).toEqual([
      [0, 0], // head
      [14, 0], // beak
      [14, 4], // redThing
      [0, 9], // body
      [26, 0], // leg0
      [26, 0], // leg1
      [24, 13], // wing0
      [24, 13], // wing1
    ]);
  });

  it('位置：yo=16 叠在头/腿/翅膀上；两条腿不对称（-2 / +1）是 C++ 原样', () => {
    const m = new ChickenModel();
    expect([m.head.x, m.head.y, m.head.z]).toEqual([0, 15, -4]);
    expect([m.beak.x, m.beak.y, m.beak.z]).toEqual([0, 15, -4]);
    expect([m.redThing.x, m.redThing.y, m.redThing.z]).toEqual([0, 15, -4]);
    expect([m.body.x, m.body.y, m.body.z]).toEqual([0, 16, 0]);
    expect([m.leg0.x, m.leg0.y, m.leg0.z]).toEqual([-2, 19, 1]);
    expect([m.leg1.x, m.leg1.y, m.leg1.z]).toEqual([1, 19, 1]);
    expect([m.wing0.x, m.wing0.y, m.wing0.z]).toEqual([-4, 13, 0]);
    expect([m.wing1.x, m.wing1.y, m.wing1.z]).toEqual([4, 13, 0]);
  });

  it('盒子（包围盒）：头 4×6×3、身体 6×8×6；两只翅膀 x 一个从 0、一个从 -1', () => {
    const m = new ChickenModel();
    expect(bounds(m.head)).toEqual([
      [-2, -6, -2],
      [2, 0, 1],
    ]);
    expect(bounds(m.body)).toEqual([
      [-3, -4, -3],
      [3, 4, 3],
    ]);
    expect(bounds(m.leg0)).toEqual([
      [-1, 0, -3],
      [2, 5, 0],
    ]);
    expect(bounds(m.wing0)).toEqual([
      [0, 0, -3],
      [1, 4, 3],
    ]);
    expect(bounds(m.wing1)).toEqual([
      [-1, 0, -3],
      [0, 4, 3],
    ]);
  });
});

describe('G9 ChickenModel.setupAnim：角度', () => {
  it('头/嘴/冠：角度 = 输入 / RADDEG，且头的 xRot 带负号（与别的模型相反）', () => {
    const m = new ChickenModel();
    m.setupAnim(0, 0, 0, Mth.RADDEG, Mth.RADDEG, scale16); // yRot = xRot = 1 弧度
    expect(m.head.xRot).toBe(-1); // -(RADDEG / RADDEG)
    expect(m.head.yRot).toBe(1); // RADDEG / RADDEG
    expect(m.beak.xRot).toBe(-1);
    expect(m.beak.yRot).toBe(1);
    expect(m.redThing.xRot).toBe(-1);
    expect(m.redThing.yRot).toBe(1);
  });

  it('身体固定 90°（≈π/2，不是 180 也不是 45）', () => {
    const m = new ChickenModel();
    m.setupAnim(0, 1, 0, 0, 0, scale16);
    expect(m.body.xRot).toBeGreaterThan(1.5);
    expect(m.body.xRot).toBeLessThan(1.6);
    expect(m.body.xRot).toBeCloseTo(Math.PI / 2, 3);
  });

  it('腿摆角 = ±cos(time*0.6662f)*1.4f*r（time=0 → cos=1 → 就是 1.4f*r）', () => {
    const m = new ChickenModel();
    m.setupAnim(0, 2, 0, 0, 0, scale16);
    expect(m.leg0.xRot).toBe(f(2.8)); // f(1.4f * 2f) 的手算值
    expect(m.leg1.xRot).toBe(-f(2.8));

    m.setupAnim(0, 1, 0, 0, 0, scale16);
    expect(m.leg0.xRot).toBe(f(1.4));
    expect(m.leg1.xRot).toBe(-f(1.4));
  });

  it('翅膀摆角直接吃 bob 参数：wing0 = bob、wing1 = -bob', () => {
    const m = new ChickenModel();
    m.setupAnim(0, 0, f(0.42), 0, 0, scale16);
    expect(m.wing0.zRot).toBe(f(0.42));
    expect(m.wing1.zRot).toBe(-f(0.42));
  });
});

describe('G9 ChickenModel.render：成年 / 幼年两条分支', () => {
  it('成年：8 个部件按固定顺序直画，scale 原样传；render 先跑 setupAnim', () => {
    const m = new ChickenModel();
    m.young = false;
    stubPartRenders(m);
    m.render(null, 0, 0, 0, Mth.RADDEG, Mth.RADDEG, scale16);
    expect(gl.ops).toEqual(PART_NAMES.map((n) => `part:${n}@0.0625`));
    expect(m.head.xRot).toBe(-1); // render 第一句就是 setupAnim（负号那半顺带再钉一次）
  });

  it('幼年（默认 true）：两段 push/translate/scale/pop —— 头嘴冠一段；身体腿翅膀缩 1/2 再上移 24*scale', () => {
    const m = new ChickenModel();
    expect(m.young).toBe(true); // Model 基类默认值就是 true（Model.h:20）
    stubPartRenders(m);
    m.render(null, 0, 0, 0, 0, 0, scale16);
    expect(gl.ops).toEqual([
      'push',
      't:0,0.3125,0.125', // 5*scale / 2*scale（scale = 1/16）
      'part:head@0.0625',
      'part:beak@0.0625',
      'part:redThing@0.0625',
      'pop',
      'push',
      's:0.5,0.5,0.5', // 1/ss，ss = 2
      't:0,1.5,0', // 24*scale
      'part:body@0.0625',
      'part:leg0@0.0625',
      'part:leg1@0.0625',
      'part:wing0@0.0625',
      'part:wing1@0.0625',
      'pop',
    ]);
  });
});

describe('G9 ChickenRenderer：构造 / 转调 / getBob / 注册', () => {
  it('构造：shadow 原样存；模型原样持有', () => {
    const model = new ChickenModel();
    const r = new ChickenRenderer(model, f(0.3));
    expect((r as unknown as { shadowRadius: number }).shadowRadius).toBe(f(0.3));
    expect((r as unknown as { model: Model }).model).toBe(model);
    expect(r).toBeInstanceOf(MobRenderer);
  });

  it('render 原样转调父类（C++ 里就是一句空转，参数一个不改）', () => {
    const r = new ChickenRenderer(new ChickenModel(), f(0.3));
    const spy = vi.spyOn(MobRenderer.prototype, 'render').mockImplementation(() => {});
    const mob = {} as unknown as Mob;
    r.render(mob, 1, 2, 3, 4, 0.5);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(mob, 1, 2, 3, 4, 0.5);
  });

  it('getBob：flap 与 flapSpeed 都先插值，再 (sin(flap)+1)*flapSpeed', () => {
    const r = new ChickenRenderer(new ChickenModel(), f(0.3));
    const halfPi = f(Mth.PI / 2);
    expect(Mth.sin(halfPi)).toBe(1); // 前置：表索引正好落在 65536/4 这个整数格上

    // flapSpeed 插值：o=0、cur=0.5f、a=0.5 → 0.25f（不插值会是 0.5）
    expect(r.getBob(fakeFlap(0, 0, 0, f(0.5)), 0.5)).toBe(f(0.25));
    // flap 插值两个端点：a=0 取 oFlap、a=1 取 flap
    expect(r.getBob(fakeFlap(halfPi, 0, f(0.5), f(0.5)), 0)).toBe(1); // sin(π/2)=1 → (1+1)*0.5f
    expect(r.getBob(fakeFlap(0, halfPi, f(0.5), f(0.5)), 1)).toBe(1);
    // sin 从 0 到 1：同一 flapSpeed 下结果翻倍
    expect(r.getBob(fakeFlap(0, 0, f(0.5), f(0.5)), 1)).toBe(f(0.5)); // (0+1)*0.5f
    expect(r.getBob(fakeFlap(halfPi, halfPi, f(0.5), f(0.5)), 1)).toBe(1);
  });

  it('注册：ER_CHICKEN_RENDERER 挂的是 ChickenRenderer(ChickenModel, 0.3f)', () => {
    const erd = new EntityRenderDispatcher();
    const r = erd.getRendererById(EntityRendererId.ER_CHICKEN_RENDERER);
    expect(r).toBeInstanceOf(ChickenRenderer);
    expect((r as unknown as { shadowRadius: number }).shadowRadius).toBe(f(0.3));
    expect((r as unknown as { model: Model }).model).toBeInstanceOf(ChickenModel);
  });
});
