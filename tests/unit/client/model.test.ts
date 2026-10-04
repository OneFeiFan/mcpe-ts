import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GLES1, Model, ModelPart, Tesselator, glSetContext } from '@mcpe/client';

// G5：`Model` 基类（`src/client/model/Model.h`，48 行）—— 5 个字段的默认值 + 5 个虚函数的行为。
//
// 【这一节为什么值得单独测】这批模型的**每一个**都从 `Model` 继承，所以这里抄错一位，
// 7 个子类一起错。两处最容易抄错的：
//   1. **`young` 的默认值是 `true`**（`Model.h:20` 写的是 `young(true)`，不是 `false`）——
//      子类靠它决定走不走"幼体"那套缩放；抄成 `false` 的话幼体分支永远进不去，
//      而且**编译期和运行期都不报错**，只是画出来的小动物个头不对。
//   2. `cubes` 必须是**每个实例各一份**：`ModelPart::setModel` 往里塞自己，
//      共享一份就会把两个模型的部件串到一起。
//
// 【和 `model-part.test.ts` 的分工】那边已经测了"转发到了"（1 个部件）；
// 这里补的是：**全部**部件（不是只看第一个）、**不清空** `cubes`、以及转发**真的**把
// 部件打回未编译 —— 最后这条要等 G4 的 `compile` 落地之后才可观察，现在补上。

/** C++ 的 `Model()` 是 `protected`（`Model.h:14`），外面 `new Model()` 编不过，所以借个壳 */
class Probe extends Model {
  constructor() {
    super();
  }
}

const snap = (m: Model): unknown => ({
  attackTime: m.attackTime,
  riding: m.riding,
  texWidth: m.texWidth,
  texHeight: m.texHeight,
  young: m.young,
  cubes: m.cubes.length,
});

let gl: GLES1;

beforeEach(() => {
  gl = new GLES1(null);
  glSetContext(gl); // 无头：ModelPart 构造时会 glGenBuffers2
  vi.restoreAllMocks();
});

describe('Model 的字段默认值（G5）', () => {
  it('五个字段的默认值，对着 Model.h:15-21 的初始化列表逐条核', () => {
    const m = new Probe();
    expect(m.attackTime, 'attackTime(0)').toBe(0);
    expect(m.riding, 'riding(false)').toBe(false);
    expect(m.texWidth, 'texWidth(64)').toBe(64);
    expect(m.texHeight, 'texHeight(32)').toBe(32);
    expect(m.cubes.length, 'cubes 是默认构造的空 vector').toBe(0);
  });

  it('⚠ young 默认是 true（Model.h:20 是 `young(true)`，不是 false）', () => {
    expect(new Probe().young).toBe(true);
  });

  it('cubes 是每个实例各一份，不是共享的一份', () => {
    const a = new Probe();
    const b = new Probe();
    expect(a.cubes).not.toBe(b.cubes);
    new ModelPart(0, 0).setModel(a);
    expect([a.cubes.length, b.cubes.length]).toEqual([1, 0]);
  });
});

describe('Model 的四个空虚函数（G5）', () => {
  it('render / renderHorrible / setupAnim / prepareMobModel 在基类里都是空的', () => {
    const m = new Probe();
    const before = snap(m);

    expect(() => {
      m.render(null, 1, 2, 3, 4, 5, 6);
      m.renderHorrible(1, 2, 3, 4, 5, 6);
      m.setupAnim(1, 2, 3, 4, 5, 6);
      m.prepareMobModel(null, 1, 2, 3);
    }).not.toThrow();

    expect(snap(m), '一个字段都不该动').toEqual(before);
    expect(gl.drawCalls, '也不该画出任何东西（Model.h:31-34 全是 `{}`）').toBe(0);
  });
});

describe('Model.onGraphicsReset 的转发（G5）', () => {
  it('遍历**全部**部件，不是只看第一个', () => {
    const m = new Probe();
    new ModelPart(0, 0).setModel(m);
    new ModelPart(0, 0).setModel(m);
    new ModelPart(0, 0).setModel(m);
    const spy = vi.spyOn(ModelPart.prototype, 'onGraphicsReset');
    m.onGraphicsReset();
    expect(spy.mock.calls.length).toBe(3);
  });

  it('只转发，**不**清空 cubes（C++ 那段循环没碰 vector）', () => {
    const m = new Probe();
    new ModelPart(0, 0).setModel(m);
    m.onGraphicsReset();
    expect(m.cubes.length).toBe(1);
  });

  it('转发的结果是部件真的被标回"未编译"：下一次 render 会重新 compile', () => {
    const m = new Probe();
    const p = new ModelPart(0, 0);
    p.addBox(0, 0, 0, 8, 8, 8);
    p.setModel(m);

    const spy = vi.spyOn(Tesselator.instance, 'begin');
    p.render(1);
    expect(spy.mock.calls.length, '第一次要编译').toBe(1);
    p.render(1);
    expect(spy.mock.calls.length, '第二次不用再编译').toBe(1);

    m.onGraphicsReset();
    p.render(1);
    expect(spy.mock.calls.length, '重置之后要重新编译').toBe(2);
  });
});
