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
import { Util } from '@mcpe/util';
import { glGenBuffers2 } from '../../renderer/gles';
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
  addBox(id: string, x0: number, y0: number, z0: number, w: number, h: number, d: number): ModelPart;
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

  // ---- 渲染那一半，留到 G4 ----
  // DEFERRED(Model): void render(float scale)  ModelPart.cpp:97
  // DEFERRED(Model): void renderRollable(float scale)  ModelPart.cpp:136
  // DEFERRED(Model): void translateTo(float scale)  ModelPart.cpp:158
  // DEFERRED(Model): void compile(float scale)  ModelPart.cpp:183
  // DEFERRED(Model): void draw()  ModelPart.cpp:202
  // DEFERRED(Model): void renderHorrible(float scale)  ModelPart.cpp:234
  // DEFERRED(Model): void drawSlow(float scale)  ModelPart.cpp:264

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
