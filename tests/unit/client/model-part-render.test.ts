import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GLES1, ModelPart, Tesselator, glSetContext } from '@mcpe/client';
import { Mth } from '@mcpe/util';

const f = Math.fround;

// G4：`ModelPart` / `Cube` 的**渲染那一半**。
//
// 【怎么观察】无头环境下没法截图，但有两层可观察的东西：
//   1. `GLES1` 的矩阵操作 —— 用子类把 push/pop/translate/rotate 记下来，
//      再 `glSetContext` 换成它。这样"哪个分支 push/pop、旋转什么顺序"都能断言。
//   2. `Tesselator.instance` 的方法（begin / colorInt / vertexUV / draw / end）+ `GLES1.drawCalls`
//      —— 用 `vi.spyOn` 数调用次数。顶点数是最硬的判据：
//      `compile` 里那层跑 6 遍的循环会让每个面被写 6 次（`Cube` 个 × 36 个面 × 4 个角）。
//
// 【这一半是三档浮点里的第三档】变换算式不逐步 fround（每帧都跑的画面代码）。
// 真正的判据是**调用顺序**和**哪些分支 push/pop**。

class SpyGL extends GLES1 {
  ops: string[] = [];
  draws: Array<[number, number, number]> = [];
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
  override drawArrays(mode: number, first: number, count: number): void {
    this.draws.push([mode, first, count]);
    super.drawArrays(mode, first, count);
  }
}

let gl: SpyGL;

/** 一个装了 n 个 cube 的部件（默认不位移、不旋转） */
function part(n = 1): ModelPart {
  const p = new ModelPart(0, 0);
  for (let i = 0; i < n; i++) p.addBox(0, 0, 0, 8, 8, 8);
  return p;
}

beforeEach(() => {
  gl = new SpyGL(null);
  glSetContext(gl);
  vi.restoreAllMocks();
});

describe('ModelPart.render 的三个分支（G4）', () => {
  it('没有旋转也没有位移：不碰矩阵，直接画', () => {
    const p = part();
    p.render(1);
    expect(gl.ops, '一条矩阵操作都不该有').toEqual([]);
    expect(gl.draws.length, '画了一次').toBe(1);
  });

  it('⚠ 只有位移：平移过去再平移回来，**不** push/pop', () => {
    const p = part();
    p.setPos(1, 2, 3);
    p.render(1);
    expect(gl.ops).toEqual(['t:1,2,3', 't:-1,-2,-3']);
  });

  it('⚠ 有旋转：push → 平移 → 转 z → 转 y → 转 x → pop（顺序不能换）', () => {
    const p = part();
    p.setPos(0, 1, 0);
    p.xRot = 1;
    p.yRot = 2;
    p.zRot = 3;
    p.render(1);
    const c = Mth.RADDEG; // 180/π：模型里存的是**弧度**，glRotatef 要的是**度**
    expect(gl.ops).toEqual([
      'push',
      't:0,1,0',
      `r:${3 * c},0,0,1`, // z
      `r:${2 * c},0,1,0`, // y
      `r:${1 * c},1,0,0`, // x
      'pop',
    ]);
  });

  it('⚠ 转速乘的是 RADDEG（弧度 → 度）：π/2 要变成 90 度', () => {
    const p = part();
    p.xRot = f(Math.PI / 2);
    p.render(1);
    const rot = gl.ops.find((o) => o.startsWith('r:'))!;
    const angle = Number(rot.slice(2).split(',')[0]);
    expect(angle, '没乘 RADDEG 的话这里会是 1.5708').toBeCloseTo(90, 3);
  });

  it('平移量是 `坐标 × scale`', () => {
    const p = part();
    p.setPos(16, 0, 0);
    p.render(0.0625); // 1/16
    expect(gl.ops[0]).toBe('t:1,0,0');
  });

  it('递归画子部件', () => {
    const parent = part();
    const child = part();
    child.setPos(5, 0, 0);
    parent.addChild(child);
    parent.render(1);
    expect(gl.draws.length, '父子各画一次').toBe(2);
    expect(gl.ops, '子部件那次平移').toContain('t:5,0,0');
  });

  it('⚠ 父部件有旋转时子部件也要画（旋转分支里也有一份递归 —— 变异验证补的）', () => {
    const parent = part();
    parent.xRot = 1; // 走"有旋转"那个分支（唯一 push/pop 的分支）
    const child = part();
    parent.addChild(child);
    parent.render(1);
    expect(gl.draws.length, '父子各画一次').toBe(2);
    expect(gl.ops[gl.ops.length - 1], '子部件是在 pop 之前画的').toBe('pop');
  });
});

describe('render 的两个早退（G4）', () => {
  it('neverRender 为真时什么都不做', () => {
    const p = part();
    (p as unknown as { neverRender: boolean }).neverRender = true;
    p.render(1);
    expect(gl.ops).toEqual([]);
    expect(gl.draws).toEqual([]);
  });

  it('visible 为假时什么都不做', () => {
    const p = part();
    p.visible = false;
    p.render(1);
    expect(gl.ops).toEqual([]);
    expect(gl.draws).toEqual([]);
  });
});

describe('⚠ compile：那层跑 6 遍的循环（G4）', () => {
  it('1 个 cube 写出 6 × 6 个面 × 4 个角 = 144 个顶点', () => {
    const spy = vi.spyOn(Tesselator.instance, 'vertexUV');
    const p = part(1);
    p.compile(1);
    expect(spy.mock.calls.length).toBe(144);
  });

  it('2 个 cube 就是 288', () => {
    const spy = vi.spyOn(Tesselator.instance, 'vertexUV');
    part(2).compile(1);
    expect(spy.mock.calls.length).toBe(288);
  });

  it('⚠ 颜色走的是 int 版 colorInt(255,255,255,255)，不是浮点版', () => {
    const spyInt = vi.spyOn(Tesselator.instance, 'colorInt');
    const spyF = vi.spyOn(Tesselator.instance, 'color');
    part().compile(1);
    expect(spyInt.mock.calls[0]).toEqual([255, 255, 255, 255]);
    expect(spyF.mock.calls.length, 'C++ 的重载决议选的是 int 版').toBe(0);
  });

  it('编译过一次就记下来，第二次 render 不再编译', () => {
    const p = part();
    const spy = vi.spyOn(Tesselator.instance, 'begin');
    p.render(1);
    expect(spy.mock.calls.length).toBe(1);
    p.render(1);
    expect(spy.mock.calls.length, '第二次不再 compile').toBe(1);
  });

  it('onGraphicsReset 之后要重新编译', () => {
    const p = part();
    p.render(1);
    const spy = vi.spyOn(Tesselator.instance, 'begin');
    p.onGraphicsReset();
    p.render(1);
    expect(spy.mock.calls.length).toBe(1);
  });
});

describe('⚠ draw：顶点数是硬编码的 cubes×36（G4）', () => {
  it('1 个 cube 画 36 个顶点', () => {
    const p = part(1);
    p.render(1);
    expect(gl.draws.at(-1)![2]).toBe(36);
  });

  it('3 个 cube 画 108 个', () => {
    const p = part(3);
    p.render(1);
    expect(gl.draws.at(-1)![2]).toBe(108);
  });
});

describe('renderRollable / renderHorrible / translateTo（G4）', () => {
  it('⚠ renderRollable 的旋转顺序是 y → x → z（和 render 反着来）', () => {
    const p = part();
    p.setPos(0, 0, 0);
    p.xRot = 1;
    p.yRot = 2;
    p.zRot = 3;
    p.renderRollable(1);
    const c = Mth.RADDEG;
    expect(gl.ops).toEqual([
      'push',
      't:0,0,0',
      `r:${2 * c},0,1,0`, // y 先
      `r:${1 * c},1,0,0`, // x
      `r:${3 * c},0,0,1`, // z 后
      'pop',
    ]);
  });

  it('renderRollable 无条件 push/pop（哪怕不转也不移）', () => {
    part().renderRollable(1);
    expect(gl.ops).toEqual(['push', 't:0,0,0', 'pop']);
  });

  it('⚠ renderHorrible 不走 VBO：每个面只写一次（6 × 4 = 24 个顶点，不是 144）', () => {
    const spy = vi.spyOn(Tesselator.instance, 'vertexUV');
    part(1).renderHorrible(1);
    expect(spy.mock.calls.length).toBe(24);
  });

  it('renderHorrible 不会把自己标记成"已编译"', () => {
    const p = part();
    p.renderHorrible(1);
    const spy = vi.spyOn(Tesselator.instance, 'begin');
    p.render(1); // 这次该重新 compile
    expect(spy.mock.calls.length).toBe(1);
  });

  it('⚠ translateTo 不 push/pop（调用方自己 push 过了）', () => {
    const p = part();
    p.setPos(1, 0, 0);
    p.xRot = 1;
    p.translateTo(1);
    expect(gl.ops.some((o) => o === 'push' || o === 'pop')).toBe(false);
    expect(gl.ops[0]).toBe('t:1,0,0');
    expect(gl.ops.length).toBe(2); // 平移 + 一次旋转
  });

  it('translateTo 什么都不动时是真的一条操作都没有（C++ 的空 else）', () => {
    part().translateTo(1);
    expect(gl.ops).toEqual([]);
  });
});
