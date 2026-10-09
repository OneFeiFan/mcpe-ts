import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EntityRenderDispatcher,
  GLES1,
  MobRenderer,
  Model,
  Tesselator,
  glSetContext,
  type Font,
} from '@mcpe/client';
import { initItems, type Mob } from '@mcpe/world';
import { Mth } from '@mcpe/util';
import { createFlatLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

// G6：`MobRenderer` 的基类那一半 —— 任务单 G6 点名的三项验收（任务单原文见 docs/历史.md 里的找回方法）：
//   `setupRotations` 的死亡翻滚角度、`getBob`、`renderNameTag` 的远近剔除。
//
// 【为什么只钉这三项】`render()` 全流程要拖进模型、`minecraft.options`、`postRender` 的影子一大串，
//   等 G8/G9 把渲染器接上之后走浏览器场景验。这里钉的是**渲染器自己的算术** ——
//   它们不需要任何模型就能算出来，也正是最容易抄错的地方：
//     - `getBob` = `f(tickCount + a)`；
//     - 死亡翻滚角 = `min(√f((deathTime + a - 1)/20f × 1.6f), 1) × getFlipDegrees()`，
//       **封顶那一步在乘之前**，而且 multiplier 是个虚函数；
//     - `renderNameTag` 的剔除是 `dist > maxDist²`（**`>` 不是 `>=`**），
//       且早退发生在取字体**之前**。
//
// 【怎么观察】和 `model-part-render.test.ts` 一个套路：子类 `GLES1` 把矩阵操作记下来，
//   再 `glSetContext` 换掉；字体和 Tesselator 用假的 / `vi.spyOn` 数调用。
//
// 【浮点档位】G6 是**按 float 走**的（任务单第 516 行："三档数值规则按 float 走"），
//   所以下面的期望值也逐步 `f()` —— 实现里漏一次 fround 就会被抓到。

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

/** `Model` 的构造函数是 `protected`（`Model.h:14`），外面 `new Model()` 编不过，借个壳 */
class StubModel extends Model {
  constructor() {
    super();
  }
}

/** 翻倍用的子类：证明翻滚角里那个乘数**真的**是 `getFlipDegrees()` */
class Flip180Renderer extends MobRenderer {
  constructor() {
    super(new StubModel(), 0);
  }
  override getFlipDegrees(_mob: Mob): number {
    return 180;
  }
}

/** 只记 `draw` 的假字体。`width` 故意给奇数 9 —— 好让 `/2` 的两种除法（截断的与不截断的）分得开 */
class FakeFont {
  draws: Array<[string, number, number, number]> = [];
  width(_s: string): number {
    return 9;
  }
  draw(s: string, x: number, y: number, color: number): void {
    this.draws.push([s, x, y, color]);
  }
}

/**
 * 这三项都只读生物身上很少几个成员，所以直接给个只装这些的假生物。
 * 真去 `new Chicken(level)` 要拖进世界、纹理、初始化一大串，而且 `tickCount` / `deathTime`
 * 还没法精确摆成想要的值 —— 而精确摆值恰恰是这里要测的。
 */
function fakeMob(o: { deathTime?: number; tickCount?: number; dist?: number; player?: boolean } = {}): Mob {
  return {
    deathTime: o.deathTime ?? 0,
    tickCount: o.tickCount ?? 0,
    isPlayer: () => o.player ?? false,
    distanceToSqr: () => o.dist ?? 0,
  } as unknown as Mob;
}

let gl: SpyGL;
let erd: EntityRenderDispatcher;
let font: FakeFont;

/** 建一个渲染器并把静态的 `entityRenderDispatcher` 指过去（`renderNameTag` 要用） */
function renderer(): MobRenderer {
  const r = new MobRenderer(new StubModel(), 0);
  r.init(erd);
  return r;
}

/** 近处那次要真的走完，字体得是有的；把假的塞给 `getFont()` */
function withFont(r: MobRenderer): void {
  vi.spyOn(r, 'getFont').mockReturnValue(font as unknown as Font);
}

const angleOf = (op: string): number => Number(op.slice(2).split(',')[0]);

beforeAll(() => {
  createFlatLevel(); // 先 initHeadless（方块注册），再 initItems —— 真机就是这个顺序
  initItems();
});

beforeEach(() => {
  gl = new SpyGL(null);
  glSetContext(gl);
  EntityRenderDispatcher.destroy();
  erd = EntityRenderDispatcher.getInstance();
  font = new FakeFont();
  vi.restoreAllMocks();
});

describe('G6 getBob：tickCount + a', () => {
  it('tickCount=7、a=0.5 → 7.5', () => {
    expect(renderer().getBob(fakeMob({ tickCount: 7 }), 0.5)).toBe(7.5);
  });

  it('⚠ 结果过一次 fround：2²⁴+1 应该被抹成 2²⁴', () => {
    const got = renderer().getBob(fakeMob({ tickCount: 16777217 }), 0);
    expect(got).toBe(16777216); // double 里会是 16777217
  });
});

describe('G6 setupRotations：死亡翻滚', () => {
  it('没死的时候只有朝身体朝向的那一次 y 旋转', () => {
    renderer().setupRotations(fakeMob({ deathTime: 0 }), 0, 30, 0.5);
    expect(gl.ops).toEqual([`r:${f(180 - 30)},0,1,0`]);
  });

  it('⚠ 角度就是 √((deathTime + a - 1)/20 × 1.6) × 90（逐位对齐）', () => {
    renderer().setupRotations(fakeMob({ deathTime: 10 }), 0, 0, 1);
    const fall = f(Mth.sqrt(f(((10 + 1 - 1) / f(20.0)) * f(1.6))));
    expect(gl.ops[1]).toBe(`r:${f(fall * 90)},0,0,1`);
    expect(angleOf(gl.ops[1]!)).toBeCloseTo(80.4984, 4); // √0.8 × 90
  });

  it('⚠ 先封顶到 1 再乘 90：deathTime=20 正好 90 度，不是 113.8', () => {
    renderer().setupRotations(fakeMob({ deathTime: 20 }), 0, 0, 1);
    expect(angleOf(gl.ops[1]!)).toBe(90);
  });

  it('⚠ 乘数是虚函数 getFlipDegrees()：子类给 180 就翻倍', () => {
    const r = new Flip180Renderer();
    r.init(erd);
    r.setupRotations(fakeMob({ deathTime: 20 }), 0, 0, 1);
    expect(angleOf(gl.ops[1]!)).toBe(180);
  });

  it('a 参与插值：deathTime=10 时 a=0.5 比 a=1 转得少', () => {
    renderer().setupRotations(fakeMob({ deathTime: 10 }), 0, 0, 1);
    const at1 = angleOf(gl.ops[1]!);
    gl.ops = [];
    renderer().setupRotations(fakeMob({ deathTime: 10 }), 0, 0, 0.5);
    expect(angleOf(gl.ops[1]!)).toBeLessThan(at1);
  });
});

describe('G6 renderNameTag：远近剔除', () => {
  it('⚠ 边界上不剔：dist 正好等于 maxDist²（C++ 是 `>` 不是 `>=`）', () => {
    const r = renderer();
    withFont(r);
    r.renderNameTag(fakeMob({ dist: 64 * 64 }), 'x', 0, 0, 0, 64);
    expect(gl.ops.length).toBeGreaterThan(0);
  });

  it('多一个单位（4097）就整段早退：一条 GL 操作都没有', () => {
    const r = renderer();
    withFont(r);
    r.renderNameTag(fakeMob({ dist: 4097 }), 'x', 0, 0, 0, 64);
    expect(gl.ops).toEqual([]);
    expect(font.draws).toEqual([]);
  });

  it('⚠ 早退发生在取字体**之前**（C++ 里那句 return 在 getFont 上两行）', () => {
    const r = renderer();
    const spy = vi.spyOn(r, 'getFont');
    r.renderNameTag(fakeMob({ dist: 4097 }), 'x', 0, 0, 0, 64);
    expect(spy).not.toHaveBeenCalled();
  });

  it('近处走完整段：push → 抬高 → 两次旋转 → 缩放 → pop', () => {
    const r = renderer();
    withFont(r);
    erd.playerRotY = 30;
    erd.playerRotX = 45;
    r.renderNameTag(fakeMob({ dist: 4 }), 'ab', 0, 0, 0, 64);
    const s = f(f(1 / f(60.0)) * f(1.6));
    expect(gl.ops).toEqual([
      'push',
      `t:0,${f(0 + f(2.3))},0`,
      `r:${f(-30)},0,1,0`,
      'r:45,1,0,0',
      `s:${-s},${-s},${s}`,
      'pop',
    ]);
    // 画两遍：先阴影色，再正常色（C++ `0x20ffffff` / `0xffffffff`）
    expect(font.draws.map((d) => d[3])).toEqual([0x20ffffff, 0xffffffff | 0]);
  });

  it('玩家抬 +1.0，其它生物抬 +2.3（C++ 的两个分支）', () => {
    const r = renderer();
    withFont(r);
    r.renderNameTag(fakeMob({ dist: 0, player: true }), 'x', 1, 2, 3, 64);
    expect(gl.ops[1]).toBe(`t:1,${f(2 + f(1.0))},3`);
  });

  it('⚠ 底板宽度是整数除法（9/2 → 4，顶点 ±5），文字位置是浮点除法（-4.5）', () => {
    const r = renderer();
    withFont(r);
    const vspy = vi.spyOn(Tesselator.instance, 'vertex');
    r.renderNameTag(fakeMob({ dist: 4 }), 'ab', 0, 0, 0, 64);
    expect(vspy.mock.calls.map((c) => c[0])).toEqual([-5, -5, 5, 5]);
    expect(font.draws.map((d) => d[1])).toEqual([f(9 / -2), f(9 / -2)]);
    expect(font.draws[0]![1]).toBe(-4.5); // 没截断 —— 和上面那对 ±5 是两处不同的除法
  });
});
