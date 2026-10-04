/**
 * 1:1 移植自 src/client/model/geom/Cube.h 与 .cpp（29 + 74 行）：模型里的一个方块。
 *
 * 【它做什么】拿一个「盒子参数」（起点 + 长宽高 + 外扩量 g），算出 8 个角、
 * 再算出 6 个面各自的 4 个角与 UV。**这就是模型的全部几何**。
 *
 * ⚠⚠ 两处必须原样保留的怪癖，写 G1 夹具时都实测过：
 *
 *   一、**成员 `x0..z1` 存的是"没外扩"的值**。C++ 的初始化列表 `x1(x0 + w)` 算完成员之后，
 *       函数体里 `x0 -= g; x1 += g;` 改的是**形参和局部变量**（把同名的成员遮住了）。
 *       于是成员是没外扩的、局部是外扩的，`vertices` 用的是**局部**。
 *       而且那 6 个成员**全文没有任何一处读它们** —— 夹具里记下来就是为了防止以后有人"顺手清理"。
 *
 *   二、**`mirror` 的交换发生在外扩之后、算顶点之前**，而且**只交换 x**（y、z 不动）。
 *       最后六个面还要各自 `mirror()` 一遍。
 *
 * 【fround】这个类的输出被 `fixtures/golden/model.json` **逐位**钉住，所以每个浮点运算
 * 都要包 `f()`（不适用"第三档渲染代码不逐步 fround"那条豁免，理由同 `Polygon.ts`）。
 */
import { PolygonQuad } from './Polygon';
import { VertexPT } from './Vertex';
import type { Tesselator } from '../../renderer/Tesselator';
import type { ModelPart } from './ModelPart';

const f = Math.fround;

export class Cube {
  /**
   * ⚠ C++ 是 `private` + `friend class ModelPart`（`Cube.h:18`）。TS 没有 friend，
   * 按仓库先例（`TouchSelectWorldScreen.ts:82`）**放宽为 public** —— `ModelPart::drawSlow`
   * 要读 `c->polygons[i]`。
   */
  polygons: PolygonQuad[];

  /** C++ 是 `private`；只有夹具和 `ModelPart` 之外没人读，测试里用类型断言掏 */
  private vertices: VertexPT[];
  /** C++ 是 `private std::string id`，只由 `setId` 写、**没有任何地方读** */
  private id = '';

  // ⚠ C++ 里是 `const float`：构造时定死，之后不写。
  //   存的是**没外扩**的值（见文件头"怪癖一"）。
  private readonly x0: number;
  private readonly y0: number;
  private readonly z0: number;
  private readonly x1: number;
  private readonly y1: number;
  private readonly z1: number;

  constructor(
    modelPart: ModelPart,
    xTexOffs: number,
    yTexOffs: number,
    x0: number,
    y0: number,
    z0: number,
    w: number,
    h: number,
    d: number,
    g: number,
  ) {
    // 成员初始化列表：`x1(x0 + w)` —— 注意**没有加 g**
    this.x0 = x0;
    this.y0 = y0;
    this.z0 = z0;
    this.x1 = f(x0 + w);
    this.y1 = f(y0 + h);
    this.z1 = f(z0 + d);

    // ⚠ 这就是 C++ 里"形参 x0/y0/z0 与局部 x1/y1/z1 把同名成员遮住"的那几个变量。
    //   TS 不能重名，改叫 ix0/ix1（inflated）—— 含义一一对应：外扩只作用在这一组上。
    let ix0 = f(x0 - g);
    let iy0 = f(y0 - g);
    let iz0 = f(z0 - g);
    let ix1 = f(this.x1 + g);
    let iy1 = f(this.y1 + g);
    let iz1 = f(this.z1 + g);
    if (modelPart.mirror) {
      // ⚠ 只交换 x，而且是在外扩**之后**
      const tmp = ix1;
      ix1 = ix0;
      ix0 = tmp;
    }

    const v = (x: number, y: number, z: number, u: number, vv: number): VertexPT =>
      new VertexPT(x, y, z, u, vv);
    this.vertices = [
      v(ix0, iy0, iz0, 0, 0),
      v(ix1, iy0, iz0, 0, 8),
      v(ix1, iy1, iz0, 8, 8),
      v(ix0, iy1, iz0, 8, 0),
      v(ix0, iy0, iz1, 0, 0),
      v(ix1, iy0, iz1, 0, 8),
      v(ix1, iy1, iz1, 8, 8),
      v(ix0, iy1, iz1, 8, 0),
    ];

    // C++ 用 `VertexPT* ptr = vertices - 1;` 加一串 `++ptr` 起别名 —— 就是 vertices[0..7]。
    // u0..u3 是 z0 那一面（u 前缀），l0..l3 是 z1 那一面（l 前缀）。
    const u0 = this.vertices[0]!;
    const u1 = this.vertices[1]!;
    const u2 = this.vertices[2]!;
    const u3 = this.vertices[3]!;
    const l0 = this.vertices[4]!;
    const l1 = this.vertices[5]!;
    const l2 = this.vertices[6]!;
    const l3 = this.vertices[7]!;

    // ⚠⚠ 这 6 行的 u/v 参数**和 Java 版的 ModelBox 对不上**（第 3 行顶面的 v 反了、
    //   第 6 行 +z 面的 u 多跨了一格）。看着像笔误，但必须原样抄 —— 夹具钉的就是这套。
    //   括号里的 d/w/h 都是**整数**运算，`/texW` 才转浮点，别把顺序调了。
    const tW = modelPart.xTexSize;
    const tH = modelPart.yTexSize;
    this.polygons = [
      new PolygonQuad(l1, u1, u2, l2, xTexOffs + d + w, yTexOffs + d, xTexOffs + d + w + d, yTexOffs + d + h, tW, tH),
      new PolygonQuad(u0, l0, l3, u3, xTexOffs + 0, yTexOffs + d, xTexOffs + d, yTexOffs + d + h, tW, tH),
      new PolygonQuad(l1, l0, u0, u1, xTexOffs + d, yTexOffs + 0, xTexOffs + d + w, yTexOffs + d, tW, tH),
      new PolygonQuad(u2, u3, l3, l2, xTexOffs + d + w, yTexOffs + d, xTexOffs + d + w + w, yTexOffs, tW, tH),
      new PolygonQuad(u1, u0, u3, u2, xTexOffs + d, yTexOffs + d, xTexOffs + d + w, yTexOffs + d + h, tW, tH),
      new PolygonQuad(
        l0,
        l1,
        l2,
        l3,
        xTexOffs + d + w + d,
        yTexOffs + d,
        xTexOffs + d + w + d + w,
        yTexOffs + d + h,
        tW,
        tH,
      ),
    ];

    if (modelPart.mirror) {
      for (const p of this.polygons) p.mirror();
    }
  }

  /** C++ `Cube* setId(const std::string& id)` —— 只有 `ModelPart::addBox(id, …)` 用 */
  setId(id: string): Cube {
    this.id = id;
    return this;
  }

  /**
   * C++ `void Cube::compile(Tesselator& t, float scale)` —— 把 6 个面写进 tesselator。
   * 调用方是 `ModelPart::compile`（那里外面还套着一层跑 6 遍的循环，见那边的注释）。
   */
  compile(t: Tesselator, scale: number): void {
    for (let i = 0; i < 6; i++) {
      this.polygons[i]!.render(t, scale);
    }
  }
}
