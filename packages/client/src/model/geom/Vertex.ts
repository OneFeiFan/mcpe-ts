/**
 * 1:1 移植自 src/client/model/geom/Vertex.h（40 行）：一个「位置 + 一组 UV」的顶点。
 *
 * 【为什么单独一个类】`Cube` 的 8 个角和 `PolygonQuad` 的 4 个角都是它。
 * ⚠ `remap(u, v)` 是**返回新对象**（C++ 是值返回），不是改自己 —— 必须照抄这一条，
 * 因为 `PolygonQuad` 的四个角就是从**同一个**顶点 remap 出来的四份拷贝。
 *
 * 【C++ 有四个构造函数，这里只留三个】
 *   - `VertexPT()`              → `Cube::vertices[8]` 数组、`PolygonQuad::mirror` 的 tmp
 *   - `VertexPT(x, y, z, u, v)` → `Cube` 构造里用（8 次）
 *   - `VertexPT(from, u, v)`    → `remap` 用
 * 第四个 `VertexPT(const Vec3&, float, float)` **零调用方**（全树 grep 只有定义本身），
 * 而且它和第三个在 TS 里只差第一个参数的类型 —— TS 没有重载决议，所以记 OMIT。
 *
 * ⚠ 唯一的语义差别：C++ 的默认构造 `VertexPT() {}` 里 `u` / `v` 是**未初始化**的
 * （`Vec3` 有默认构造会归零，`u`/`v` 不会）。TS 没法留未初始化，这里给 0。
 * 实际用不到这个差别：`Cube` 的 8 个角和 6 个面都会被写满。
 */
import { Vec3 } from '@mcpe/world';

export class VertexPT {
  pos: Vec3;
  u: number;
  v: number;

  constructor();
  constructor(x: number, y: number, z: number, u: number, v: number);
  constructor(from: VertexPT, u: number, v: number);
  constructor(a?: number | VertexPT, b?: number, c?: number, d?: number, e?: number) {
    if (a === undefined) {
      this.pos = new Vec3(); // C++ 的 VertexPT()：pos 归零、u/v 未初始化（这里给 0）
      this.u = 0;
      this.v = 0;
      return;
    }
    if (typeof a === 'number') {
      this.pos = new Vec3(a, b!, c!);
      this.u = d!;
      this.v = e!;
      return;
    }
    // VertexPT(const VertexPT& vertex, float u_, float v_)：位置照拷，uv 换掉
    this.pos = a.pos;
    this.u = b!;
    this.v = c!;
  }

  /** C++ `VertexPT remap(float u, float v)` —— 返回**新**对象，不是改自己 */
  remap(u: number, v: number): VertexPT {
    return new VertexPT(this, u, v);
  }

  // OMIT(Model): VertexPT(const Vec3& pos_, float u_, float v_)  Vertex.h:33
  //   零调用方；且与上面第三个构造在 TS 里无法区分（只差第一个参数的类型）。
}
