import { describe, expect, it } from 'vitest';
import { PolygonQuad, VertexPT } from '@mcpe/client';
import type { Tesselator } from '../../../packages/client/src/renderer/Tesselator';

// G2：模型几何层的两个小类（`VertexPT` / `PolygonQuad`）。
//
// 【这个文件钉什么】
//   1. `remap` **返回新对象**、不动原来的（`PolygonQuad` 的四个角靠这条）；
//   2. UV 那套公式的**确切数字** —— 期望值是从参考 C++ 生成的夹具里抄下来的
//      （`fixtures/golden/model.json` 的 `head` 盒子，+x 面的 4 个角），
//      **不是**在这个文件里重算一遍（重算就成了自己证自己）；
//   3. `mirror` 的交换、`render` 的法线方向与 `*scale`。
//
// 【怎么比对浮点】夹具里是 C++ 按 `%.9g` 打印的十进制。读回来要**先 `fround`**
// 才是原来那个 float32 —— 9 位有效数字正好是 float32 的往返精度。
// 直接写 `toBe(0.375031263)` 会红：那个字面量是 double，和 float32 差一点点。

const f = Math.fround;

/** 从夹具抄下来的一个面：head 盒子的 +x 面（`xTexOffs/yTexOffs = 0/0`，w=h=d=8） */
const HEAD_RIGHT = {
  // 四个角的原始位置（Cube 构造里给的是 (x,y,z,0,0) / (x,y,z,0,8) 那套占位 uv）
  corners: [
    [4, -8, 4],
    [4, -8, -4],
    [4, 0, -4],
    [4, 0, 4],
  ] as const,
  uu0: 0 + 8 + 8, // xTexOffs + d + w = 16
  vv0: 0 + 8, // yTexOffs + d     = 8
  uu1: 0 + 8 + 8 + 8, // xTexOffs + d + w + d = 24
  vv1: 0 + 8 + 8, // yTexOffs + d + h     = 16
  texW: 64,
  texH: 32,
  // 夹具里那 4 行 u/v（`model.json` → shapes[head] → cubes[0] → polygons[0]）
  uv: [
    [0.375031263, 0.249937505],
    [0.249968752, 0.249937505],
    [0.249968752, 0.500062525],
    [0.375031263, 0.500062525],
  ] as const,
};

function rightFace(): PolygonQuad {
  const [a, b, c, d] = HEAD_RIGHT.corners;
  const v = (p: readonly [number, number, number], u: number, vv: number): VertexPT =>
    new VertexPT(p[0], p[1], p[2], u, vv);
  // Cube 给的是 0/8 那套占位 uv —— 这里照样给，验证 PolygonQuad 会**全覆盖**掉
  return new PolygonQuad(
    v(a, 0, 0),
    v(b, 0, 8),
    v(c, 8, 8),
    v(d, 8, 0),
    HEAD_RIGHT.uu0,
    HEAD_RIGHT.vv0,
    HEAD_RIGHT.uu1,
    HEAD_RIGHT.vv1,
    HEAD_RIGHT.texW,
    HEAD_RIGHT.texH,
  );
}

/** 只记调用的 Tesselator 替身 */
class SpyTesselator {
  normals: number[][] = [];
  uvs: number[][] = [];
  normal(x: number, y: number, z: number): void {
    this.normals.push([x, y, z]);
  }
  vertexUV(x: number, y: number, z: number, u: number, v: number): void {
    this.uvs.push([x, y, z, u, v]);
  }
}

describe('VertexPT（G2）', () => {
  it('5 参构造：位置与 uv 都照给', () => {
    const v = new VertexPT(1, 2, 3, 0.25, 0.75);
    expect([v.pos.x, v.pos.y, v.pos.z]).toEqual([1, 2, 3]);
    expect([v.u, v.v]).toEqual([0.25, 0.75]);
  });

  it('默认构造：位置归零（C++ 里 u/v 是未初始化，TS 给 0）', () => {
    const v = new VertexPT();
    expect([v.pos.x, v.pos.y, v.pos.z, v.u, v.v]).toEqual([0, 0, 0, 0, 0]);
  });

  it('⚠ remap 返回**新对象**、不动原来的（C++ 是值返回）', () => {
    const a = new VertexPT(1, 2, 3, 0.25, 0.75);
    const b = a.remap(0.5, 0.6);
    expect(b).not.toBe(a);
    expect([b.pos.x, b.pos.y, b.pos.z], '位置照拷').toEqual([1, 2, 3]);
    expect([b.u, b.v], 'uv 换掉').toEqual([0.5, 0.6]);
    expect([a.u, a.v], '原来的没被改').toEqual([0.25, 0.75]);
  });

  it('remap 拿到的位置是**同一个** Vec3 引用（C++ 的 pos = vertex.pos 是按值拷 float，这里共享对象）', () => {
    // 记录一条语义差别，不是 bug：C++ 的 VertexPT 拷贝构造会连 pos 一起按值拷。
    // TS 里共享 Vec3 对象。当前没有任何调用方在 remap 之后改 pos，所以看不出来。
    const a = new VertexPT(1, 2, 3, 0, 0);
    const b = a.remap(0.5, 0.6);
    expect(b.pos).toBe(a.pos);
  });
});

describe('PolygonQuad（G2）', () => {
  it('默认构造：4 个角都是零顶点', () => {
    const p = new PolygonQuad();
    expect(p.vertices.length).toBe(4);
    for (const v of p.vertices) {
      expect([v.pos.x, v.pos.y, v.pos.z, v.u, v.v]).toEqual([0, 0, 0, 0, 0]);
    }
  });

  it('4 参构造：按值拷贝四个角（不是存指针）', () => {
    const src = new VertexPT(1, 2, 3, 0.1, 0.2);
    const p = new PolygonQuad(src, src, src, src);
    expect(p.vertices[0]).not.toBe(src);
    expect([p.vertices[0]!.pos.x, p.vertices[0]!.u]).toEqual([1, 0.1]);
  });

  it('⚠ UV 公式的数字 = 夹具里 head 的 +x 面（逐位相等）', () => {
    const p = rightFace();
    for (let i = 0; i < 4; i++) {
      const want = HEAD_RIGHT.uv[i]!;
      expect([p.vertices[i]!.u, p.vertices[i]!.v], `第 ${i} 个角`).toEqual([f(want[0]), f(want[1])]);
    }
  });

  it('⚠ 第 0 个角拿的是 uu1、第 1 个拿 uu0（UV 是反着给的）', () => {
    const p = rightFace();
    // uu1/64 + 0.002/64 vs uu0/64 - 0.002/64 —— 前者大
    expect(p.vertices[0]!.u).toBeGreaterThan(p.vertices[1]!.u);
  });

  it('⚠ 四行的 ±us / ±vs 符号不一样：v 有正有负地内缩', () => {
    const p = rightFace();
    const vs = f(f(-0.002) / HEAD_RIGHT.texH);
    // 第 1、2 个角用 vv0/texH + vs，第 3、4 个用 vv1/texH - vs
    expect(p.vertices[0]!.v).toBe(f(f(HEAD_RIGHT.vv0 / HEAD_RIGHT.texH) + vs));
    expect(p.vertices[2]!.v).toBe(f(f(HEAD_RIGHT.vv1 / HEAD_RIGHT.texH) - vs));
    expect(p.vertices[2]!.v - p.vertices[0]!.v).toBeGreaterThan(0.25);
  });

  it('UV 会把传进来的占位 uv 全盖掉（Cube 给的是 0/8 那套）', () => {
    const p = rightFace();
    expect([p.vertices[0]!.u, p.vertices[0]!.v]).not.toEqual([0, 0]);
  });

  it('mirror：首尾对调（0↔3、1↔2）', () => {
    const p = rightFace();
    const before = p.vertices.map((v) => [v.pos.x, v.pos.y, v.pos.z, v.u, v.v]);
    p.mirror();
    const after = p.vertices.map((v) => [v.pos.x, v.pos.y, v.pos.z, v.u, v.v]);
    expect(after[0]).toEqual(before[3]);
    expect(after[1]).toEqual(before[2]);
    expect(after[2]).toEqual(before[1]);
    expect(after[3]).toEqual(before[0]);
  });

  it('render：法线用 v1.cross(v0) —— +x 面的法线指向 +x', () => {
    // ⚠ 顺序反了法线就朝里，模型在光照下会整个变黑；这一条盯的就是那个顺序
    const spy = new SpyTesselator();
    rightFace().render(spy as unknown as Tesselator, 1);
    expect(spy.normals.length).toBe(1);
    const [nx, ny, nz] = spy.normals[0]!;
    expect(nx).toBeCloseTo(1, 6);
    expect([ny, nz]).toEqual([0, 0]);
  });

  it('render：四个角都按 scale 缩放后交出顶点', () => {
    const spy = new SpyTesselator();
    rightFace().render(spy as unknown as Tesselator, f(1 / 16));
    expect(spy.uvs.length).toBe(4);
    expect(spy.uvs[0]!.slice(0, 3)).toEqual([f(4 / 16), f(-8 / 16), f(4 / 16)]);
  });

  it('flipNormal：返回 this，且把法线取反', () => {
    const spy = new SpyTesselator();
    const p = rightFace();
    expect(p.flipNormal()).toBe(p);
    p.render(spy as unknown as Tesselator, 1);
    expect(spy.normals[0]![0]).toBeCloseTo(-1, 6);
  });

  it('render 的第三个参数（vboId）在 C++ 里收了但没用 —— 传什么都一样', () => {
    const a = new SpyTesselator();
    const b = new SpyTesselator();
    rightFace().render(a as unknown as Tesselator, 1);
    rightFace().render(b as unknown as Tesselator, 1, 12345);
    expect(b.uvs).toEqual(a.uvs);
    expect(b.normals).toEqual(a.normals);
  });
});
