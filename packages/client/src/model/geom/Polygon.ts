/**
 * 1:1 移植自 src/client/model/geom/Polygon.h 与 .cpp（29 + 67 行）：盒子的一个面 —— 四个角 + 一组 UV。
 *
 * 【这一类的输出被黄金样本逐位钉住】`fixtures/golden/model.json` 里 6 个面 × 4 个角的
 * 位置和 UV，比对是**逐位相等**（不是近似）。所以：
 *
 * ⚠ **这里不适用「第三档渲染代码不逐步 fround」那条豁免。** 常规的渲染代码（`ArrowRenderer`
 * 那种）只要求 f 后缀字面量包 `f()`；这一类的构造算式**每一个运算都要 `f()`**。
 * 理由：C++ 这边全是 `float`，而 `us = -0.002f / texW` 这个数不是 float32 能精确表示的，
 * 少包一层 `f()`，`0.37503125` 就会变成 `0.375031263` 之外的另一个值，夹具立刻红。
 * 这不是理论担忧 —— 写 G1 夹具时正是这一类差别让 head 那个面的 UV 定在了 `0.375031263`。
 *
 * 【UV 是「反着给」的，四行符号还各不相同】
 *   vertices[0] = v0.remap(uu1 / texW - us, vv0 / texH + vs);
 *   vertices[1] = v1.remap(uu0 / texW + us, vv0 / texH + vs);
 *   vertices[2] = v2.remap(uu0 / texW + us, vv1 / texH - vs);
 *   vertices[3] = v3.remap(uu1 / texW - us, vv1 / texH - vs);
 * 第 0 个角拿的是 **uu1**（不是 uu0）；`- us` 是往里缩、`+ vs` 是往另一个方向缩。
 * 抄错任何一个符号，贴图边缘就漏一条缝 —— 而且是那种"看起来只是有点糊"的错。
 *
 * 【C++ 有四个构造函数，这里只留三个】
 *   1. `PolygonQuad()`                     → `Cube::polygons[6]` 数组
 *   2. `PolygonQuad(v0, v1, v2, v3)`       → 零调用方，照抄（4 个角按值拷贝）
 *   3. `PolygonQuad(v0..v3, int u0,v0,u1,v1, float texW=64, float texH=32)` → `Cube` 用（6 次）
 *   4. `PolygonQuad(v0..v3, float u0,v0,u1,v1)` → **零调用方**，且和 3 在 TS 里只差参数类型，记 OMIT
 */
import type { Tesselator } from '../../renderer/Tesselator';
import { VertexPT } from './Vertex';

const f = Math.fround;

export class PolygonQuad {
  private static readonly VERTEX_COUNT = 4;

  vertices: VertexPT[];
  private _flipNormal: boolean;

  constructor();
  constructor(v0: VertexPT, v1: VertexPT, v2: VertexPT, v3: VertexPT);
  constructor(
    v0: VertexPT,
    v1: VertexPT,
    v2: VertexPT,
    v3: VertexPT,
    uu0: number,
    vv0: number,
    uu1: number,
    vv1: number,
    texW?: number,
    texH?: number,
  );
  constructor(
    v0?: VertexPT,
    v1?: VertexPT,
    v2?: VertexPT,
    v3?: VertexPT,
    uu0?: number,
    vv0?: number,
    uu1?: number,
    vv1?: number,
    texW = 64.0,
    texH = 32.0,
  ) {
    this._flipNormal = false;
    this.vertices = [new VertexPT(), new VertexPT(), new VertexPT(), new VertexPT()];
    if (v0 === undefined) return;

    if (uu0 === undefined) {
      // C++ 的 `vertices[i] = *vi` 是**按值拷贝**（不是存指针），这里照样拷一份
      this.vertices[0] = new VertexPT(v0.pos.x, v0.pos.y, v0.pos.z, v0.u, v0.v);
      this.vertices[1] = new VertexPT(v1!.pos.x, v1!.pos.y, v1!.pos.z, v1!.u, v1!.v);
      this.vertices[2] = new VertexPT(v2!.pos.x, v2!.pos.y, v2!.pos.z, v2!.u, v2!.v);
      this.vertices[3] = new VertexPT(v3!.pos.x, v3!.pos.y, v3!.pos.z, v3!.u, v3!.v);
      return;
    }

    const us = f(f(-0.002) / texW);
    const vs = f(f(-0.002) / texH);
    this.vertices[0] = v0.remap(f(f(uu1! / texW) - us), f(f(vv0! / texH) + vs));
    this.vertices[1] = v1!.remap(f(f(uu0 / texW) + us), f(f(vv0! / texH) + vs));
    this.vertices[2] = v2!.remap(f(f(uu0 / texW) + us), f(f(vv1! / texH) - vs));
    this.vertices[3] = v3!.remap(f(f(uu1! / texW) - us), f(f(vv1! / texH) - vs));
  }

  /** C++ `void mirror()`：首尾对调（0↔3、1↔2） */
  mirror(): void {
    for (let i = 0; i < PolygonQuad.VERTEX_COUNT / 2; ++i) {
      const j = PolygonQuad.VERTEX_COUNT - i - 1;
      const tmp = this.vertices[i]!;
      this.vertices[i] = this.vertices[j]!;
      this.vertices[j] = tmp;
    }
  }

  /**
   * C++ `void render(Tesselator& t, float scale, int vboId = -1)`。
   * ⚠ `vboId` 在 C++ 里**收了但没用**（函数体一行都没读它）—— 照抄，参数留着。
   */
  render(t: Tesselator, scale: number, _vboId = -1): void {
    const v0 = this.vertices[0]!.pos.sub(this.vertices[1]!.pos.x, this.vertices[1]!.pos.y, this.vertices[1]!.pos.z);
    const v1 = this.vertices[2]!.pos.sub(this.vertices[1]!.pos.x, this.vertices[1]!.pos.y, this.vertices[1]!.pos.z);
    // ⚠ 是 v1 叉 v0，不是 v0 叉 v1 —— 顺序反了整个模型的法线都朝里
    const n = v1.cross(v0.x, v0.y, v0.z).normalized();
    if (this._flipNormal === true) {
      t.normal(-n.x, -n.y, -n.z);
    } else {
      t.normal(n.x, n.y, n.z);
    }
    for (let i = 0; i < PolygonQuad.VERTEX_COUNT; i++) {
      const v = this.vertices[i]!;
      t.vertexUV(f(v.pos.x * scale), f(v.pos.y * scale), f(v.pos.z * scale), v.u, v.v);
    }
  }

  /** C++ `PolygonQuad* flipNormal()` —— 零调用方，照抄 */
  flipNormal(): PolygonQuad {
    this._flipNormal = true;
    return this;
  }

  // OMIT(Model): PolygonQuad(VertexPT*,VertexPT*,VertexPT*,VertexPT*, float u0, float v0, float u1, float v1)  Polygon.h:15
  //   零调用方；和带 texW/texH 那个在 TS 里只差参数类型（TS 没有重载决议），合并会让"要不要除 texW"含糊。
}
