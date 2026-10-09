/**
 * 1:1 移植自 src/client/model/geom/ModelPart.h 与 .cpp（74 + 303 行）：模型的一个部件。
 *
 * 【它是什么】一个带位移和三个轴向旋转的"盒子容器"。`addBox` 往里加 `Cube`；
 * `setModel` 把自己登记进 `Model::cubes`（贴图尺寸也从那儿来）；`render` 递归画自己和子部件。
 *
 * 【G3 只做「造形状」那一半】本步交付的是**不碰 GL** 的部分：构造 / `_init` / `setModel` /
 * `addChild` / 三个 `addBox` / `setPos` / `setTexSize` / `texOffs` / `mimic` / `clear` /
 * `assign` / `onGraphicsReset`。**渲染那一半**（`render` `renderRollable` `translateTo`
 * `compile` `draw` `renderHorrible` `drawSlow`）留在 G4，原地标 `DEFERRED(Model)`。
 * 这么切是因为 `Cube`/`ModelPart`/`Model` 互相引用，按类拆根本拆不开（见任务单"计划改过一次"）。
 *
 * ⚠ 三个构造函数：C++ 用重载，TS 里按**第一个参数的类型**分派（string / number / Model）。
 *   注意第三个 `ModelPart(Model*, int, int)` **不会**把自己塞进 `model->cubes` ——
 *   只有 `setModel` 会。C++ 就是这样，`SheepModel` 那边正因此漏登记（照抄）。
 */
import { Mth, Util } from '@mcpe/util';
import {
  drawArrayVTN_NoState,
  glGenBuffers2,
  glPopMatrix2,
  glPushMatrix2,
  glRotatef2,
  glTranslatef2,
} from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { Cube } from './Cube';
import type { Model } from '../Model';

export class ModelPart {
  x = 0;
  y = 0;
  z = 0;
  xRot = 0;
  yRot = 0;
  zRot = 0;
  mirror = false;
  visible = true;
  cubes: Cube[] = [];
  children: ModelPart[] = [];
  id = '';
  xTexSize = 64;
  yTexSize = 32;

  private xTexOffs = 0;
  private yTexOffs = 0;
  private neverRender = false;
  private compiled = false;
  /** C++ 的显示列表句柄。网页版构建走 VBO（`OPENGL_ES`），这个 `list` 是死字段，照抄 */
  private list = 0;
  private vboId = 0;
  private model: Model | null = null;

  constructor();
  constructor(id: string);
  constructor(xTexOffs: number, yTexOffs?: number);
  constructor(model: Model, xTexOffs?: number, yTexOffs?: number);
  constructor(a?: string | number | Model, b = 0, c = 0) {
    if (typeof a === 'string') {
      this.id = a;
      this.model = null;
      this.xTexOffs = 0;
      this.yTexOffs = 0;
    } else if (typeof a === 'number') {
      this.xTexOffs = a;
      this.yTexOffs = b;
      this.model = null;
    } else {
      this.model = a ?? null;
      this.xTexOffs = b;
      this.yTexOffs = c;
    }
    this._init();
  }

  private _init(): void {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.xRot = 0;
    this.yRot = 0;
    this.zRot = 0;
    this.list = 0;
    this.mirror = false;
    this.visible = true;
    this.neverRender = false;
    this.compiled = false;
    this.xTexSize = 64;
    this.yTexSize = 32;
    this.vboId = 0;
    // C++ `glGenBuffers2(1, &vboId)`：每个部件一个 VBO，**构造时就分配**。
    // 无头测试要先 glSetContext(new GLES1(null))，否则这里会抛（gles.ts:153）。
    const ids: number[] = [0];
    glGenBuffers2(1, ids);
    this.vboId = ids[0]!;
  }

  setModel(model: Model | null): void {
    if (this.model) {
      Util.remove(this.model.cubes, this);
    }
    if (model) {
      model.cubes.push(this);
      this.setTexSize(model.texWidth, model.texHeight);
    }
    this.model = model;
  }

  addChild(child: ModelPart): void {
    this.children.push(child);
  }

  /** C++ `addBox(const std::string& id, …)` —— 生成的 cube 会被 setId 成 `父id.子id` */
  addBox(
    id: string,
    x0: number,
    y0: number,
    z0: number,
    w: number,
    h: number,
    d: number,
  ): ModelPart;
  /** C++ `addBox(float, float, float, int, int, int)` —— 外扩 g 固定为 0 */
  addBox(x0: number, y0: number, z0: number, w: number, h: number, d: number): ModelPart;
  /** C++ `void addBox(float, float, float, int, int, int, float g)` —— 注意**没有返回值** */
  addBox(x0: number, y0: number, z0: number, w: number, h: number, d: number, g: number): void;
  addBox(
    a: string | number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g?: number,
  ): ModelPart | void {
    if (typeof a === 'string') {
      // 字符串版：a=id，b..g = x0,y0,z0,w,h,d
      const newid = `${this.id}.${a}`;
      this.cubes.push(
        new Cube(this, this.xTexOffs, this.yTexOffs, b, c, d, e, f, g!, 0).setId(newid),
      );
      return this;
    }
    if (g === undefined) {
      this.cubes.push(new Cube(this, this.xTexOffs, this.yTexOffs, a, b, c, d, e, f, 0));
      return this;
    }
    this.cubes.push(new Cube(this, this.xTexOffs, this.yTexOffs, a, b, c, d, e, f, g));
  }

  // OMIT(Model): void ModelPart::addTexBox(float x0, float y0, float z0, int w, int h, int d, int tex)  ModelPart.h:46
  //   C++ 里**只有声明**，实现整段被注释掉了（ModelPart.cpp:85-87），零调用方也根本链不上。

  setPos(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  setTexSize(xs: number, ys: number): ModelPart {
    this.xTexSize = xs;
    this.yTexSize = ys;
    return this;
  }

  texOffs(xTexOffs: number, yTexOffs: number): ModelPart {
    this.xTexOffs = xTexOffs;
    this.yTexOffs = yTexOffs;
    return this;
  }

  /** C++ `void mimic(const ModelPart* o)` —— 只抄位置和三个旋转，不抄尺寸 */
  mimic(o: ModelPart): void {
    this.x = o.x;
    this.y = o.y;
    this.z = o.z;
    this.xRot = o.xRot;
    this.yRot = o.yRot;
    this.zRot = o.zRot;
  }

  /** C++ `void onGraphicsReset()`（头文件里是内联的 `{ compiled = false; }`） */
  onGraphicsReset(): void {
    this.compiled = false;
  }

  // ---- 渲染那一半（G4）----
  //
  // 【三档浮点】这一半是**每帧都跑**的画面代码，按 PITFALLS 第三档处理：
  // 变换算式不逐步 fround（`x * scale` 这种乘的是 ±2 的幂或整块矩阵，差不出可见效果），
  // 真正要紧的是**调用顺序**和**哪些分支 push/pop** —— 下面逐个标了。

  /** C++ `void render(float scale)` —— 画自己 + 递归画子部件 */
  render(scale: number): void {
    if (this.neverRender) return;
    if (!this.visible) return;
    if (!this.compiled) this.compile(scale);
    if (this.xRot !== 0 || this.yRot !== 0 || this.zRot !== 0) {
      // ⚠ 只有**这个**分支 push/pop；下面两个分支是"平移过去再平移回来"
      glPushMatrix2();
      glTranslatef2(this.x * scale, this.y * scale, this.z * scale);
      const c = Mth.RADDEG;
      // ⚠ 旋转顺序是 z → y → x（和 renderRollable 的 y → x → z **不一样**，别统一）
      if (this.zRot !== 0) glRotatef2(this.zRot * c, 0, 0, 1);
      if (this.yRot !== 0) glRotatef2(this.yRot * c, 0, 1, 0);
      if (this.xRot !== 0) glRotatef2(this.xRot * c, 1, 0, 0);
      this.draw();
      if (this.children.length > 0) {
        for (const child of this.children) child.render(scale);
      }
      glPopMatrix2();
    } else if (this.x !== 0 || this.y !== 0 || this.z !== 0) {
      glTranslatef2(this.x * scale, this.y * scale, this.z * scale);
      this.draw();
      if (this.children.length > 0) {
        for (const child of this.children) child.render(scale);
      }
      glTranslatef2(-this.x * scale, -this.y * scale, -this.z * scale);
    } else {
      this.draw();
      if (this.children.length > 0) {
        for (const child of this.children) child.render(scale);
      }
    }
  }

  /**
   * C++ `void renderRollable(float scale)`。
   * ⚠ 与 `render` 三处不同：旋转顺序是 **y → x → z**；**不递归子部件**；**无条件** push/pop。
   * 全参考源码**零调用方**，照抄。
   */
  renderRollable(scale: number): void {
    if (this.neverRender) return;
    if (!this.visible) return;
    if (!this.compiled) this.compile(scale);
    glPushMatrix2();
    glTranslatef2(this.x * scale, this.y * scale, this.z * scale);
    const c = Mth.RADDEG;
    if (this.yRot !== 0) glRotatef2(this.yRot * c, 0, 1, 0);
    if (this.xRot !== 0) glRotatef2(this.xRot * c, 1, 0, 0);
    if (this.zRot !== 0) glRotatef2(this.zRot * c, 0, 0, 1);
    this.draw();
    glPopMatrix2();
  }

  /**
   * C++ `void translateTo(float scale)` —— 只把"这个部件在哪、朝哪"压进矩阵，**不画**。
   * `HumanoidMobRenderer` 靠它把手持物品/披风摆到手臂/身体的位置上。
   * ⚠ **不 push/pop**（调用方自己 push 过了），而且末尾那个空 `else {}` 是原样的。
   */
  translateTo(scale: number): void {
    if (this.neverRender) return;
    if (!this.visible) return;
    if (!this.compiled) this.compile(scale);
    if (this.xRot !== 0 || this.yRot !== 0 || this.zRot !== 0) {
      const c = Mth.RADDEG;
      glTranslatef2(this.x * scale, this.y * scale, this.z * scale);
      if (this.zRot !== 0) glRotatef2(this.zRot * c, 0, 0, 1);
      if (this.yRot !== 0) glRotatef2(this.yRot * c, 0, 1, 0);
      if (this.xRot !== 0) glRotatef2(this.xRot * c, 1, 0, 0);
    } else if (this.x !== 0 || this.y !== 0 || this.z !== 0) {
      glTranslatef2(this.x * scale, this.y * scale, this.z * scale);
    } else {
      // C++ 这里就是一个空的 else，原样保留
    }
  }

  /**
   * C++ `void compile(float scale)` —— 把整个部件烘进自己那个 VBO。
   *
   * ⚠⚠ 外面这层跑 **6 遍**的循环是 C++ 原样：内层的 `unsigned int i` 把外层的 `int i` 遮蔽了，
   *   所以每个 cube 被编译 6 次（白干 5 倍活）。而 `draw()` 按 `cubes.length * 2 * 3 * 6`
   *   个顶点画 —— 正好等于"第 1 遍的全部 + 后面重复的一部分"，**画面结果是对的**。
   *   别"优化"成跑 1 遍：那样 `draw()` 的顶点数也得跟着改，就不是 1:1 了。
   */
  compile(scale: number): void {
    const t = Tesselator.instance;
    t.begin();
    // ⚠ C++ 写的是 `t.color(255, 255, 255, 255)`，重载决议选中的是 **int 重载**
    //   `color(int r, int g, int b, int a)`。TS 的 `color(a,b,c,d)` 四参形式是**浮点**版
    //   （内部 `(int)(x * 255)`），所以这里必须用 `colorInt` —— 写 `color(255,...)` 会变成
    //   255*255 再被钳回 255，看着也对，纯属侥幸。
    t.colorInt(255, 255, 255, 255);
    for (let i = 0; i < 6; i++) {
      for (const cube of this.cubes) cube.compile(t, scale);
    }
    t.end(true, this.vboId);
    this.compiled = true;
  }

  /**
   * C++ `void draw()`。
   * ⚠ 顶点数是**硬编码**的 `cubes.size() * 2 * 3 * 6`（每个 cube 36 个），不是编译时记下来的实际数量 ——
   * 见 `compile` 那条注释，两者靠那层 6 遍循环对上。
   */
  draw(): void {
    drawArrayVTN_NoState(this.vboId, this.cubes.length * 2 * 3 * 6, 36);
  }

  /**
   * C++ `void renderHorrible(float scale)` —— 不走 VBO 的"慢速渲染"。
   * ⚠ 三处和 `render` 不同：**没有** `if (!compiled) compile(scale)`（它根本不吃 VBO）、
   *   画的是 `drawSlow`、以及**不递归子部件**。
   * 目前只有 `TripodCameraRenderer` 用它（画被选中的照相机）。
   */
  renderHorrible(scale: number): void {
    if (this.neverRender) return;
    if (!this.visible) return;
    if (this.xRot !== 0 || this.yRot !== 0 || this.zRot !== 0) {
      glPushMatrix2();
      glTranslatef2(this.x * scale, this.y * scale, this.z * scale);
      if (this.zRot !== 0) glRotatef2(this.zRot * Mth.RADDEG, 0, 0, 1);
      if (this.yRot !== 0) glRotatef2(this.yRot * Mth.RADDEG, 0, 1, 0);
      if (this.xRot !== 0) glRotatef2(this.xRot * Mth.RADDEG, 1, 0, 0);
      this.drawSlow(scale);
      glPopMatrix2();
    } else if (this.x !== 0 || this.y !== 0 || this.z !== 0) {
      glTranslatef2(this.x * scale, this.y * scale, this.z * scale);
      this.drawSlow(scale);
      glTranslatef2(-this.x * scale, -this.y * scale, -this.z * scale);
    } else {
      this.drawSlow(scale);
    }
  }

  /** C++ `void drawSlow(float scale)` —— 现场把 6 个面重新 tessellate 一遍（不吃 VBO） */
  drawSlow(scale: number): void {
    const t = Tesselator.instance;
    t.begin();
    for (const c of this.cubes) {
      for (let i = 0; i < 6; i++) {
        c.polygons[i]!.render(t, scale, this.vboId);
      }
    }
    t.draw();
  }

  /** C++ `void clear()` —— 删掉自己的 cube、并从 model 里摘掉自己 */
  clear(): void {
    // C++ 这里还要 `delete cubes[i]`；TS 交给 GC，只清容器
    this.cubes.length = 0;
    this.setModel(null);
  }

  /**
   * C++ `ModelPart& operator=(const ModelPart& rhs)` —— **拷贝赋值**。
   *
   * ⚠ 不能写成 `this.head = new ModelPart(0, 0)`：C++ 是**拷进现有对象**，所以别处
   * （`model->cubes` 里那个指针、`head` 这个名字）都还指着同一个东西；换对象会把旧对象
   * 留在 `model.cubes` 里、新的又没登记。仓库先例：`RenderChunk.assign`。
   */
  assign(rhs: ModelPart): ModelPart {
    this.clear();
    if (this.id !== '' || rhs.id !== '') {
      this.id = rhs.id;
    }
    this.xTexOffs = rhs.xTexOffs;
    this.yTexOffs = rhs.yTexOffs;
    this.compiled = false;
    this.mirror = rhs.mirror;
    this.setModel(rhs.model);
    this.cubes = rhs.cubes.slice();
    this.mimic(rhs);
    return this;
  }
}
