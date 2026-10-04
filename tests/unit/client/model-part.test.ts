import { beforeAll, describe, expect, it } from 'vitest';
import { Cube, GLES1, Model, ModelPart, glSetContext } from '@mcpe/client';

// G3：`ModelPart` 里**黄金样本盖不到**的那一半 —— 增删部件、登记/摘除、拷贝赋值。
// （`Cube` 的几何由 `tests/golden/model.golden.test.ts` 逐位钉住，这里不重复。）
//
// 【为什么这些也要测】`assign`（C++ 的 `operator=`）是这批里最容易抄错的一个：
// 它必须**拷进现有对象**，因为别处（`model.cubes` 里那个指针、`head` 这个名字）
// 还指着同一个东西。写成 `this.head = new ModelPart(...)` 就把旧对象留在 model.cubes 里了。

/** 造一个能被 ModelPart 认领的模型（C++ 的 Model 构造函数是 protected） */
class TestModel extends Model {
  constructor(texWidth = 64, texHeight = 32) {
    super();
    this.texWidth = texWidth;
    this.texHeight = texHeight;
  }
}

beforeAll(() => glSetContext(new GLES1(null))); // 无头：ModelPart 构造时会 glGenBuffers2

describe('ModelPart 的构造（G3）', () => {
  it('默认构造：贴图尺寸 64×32、mirror/neverRender 都是 false、visible 是 true', () => {
    const p = new ModelPart();
    expect([p.x, p.y, p.z, p.xRot, p.yRot, p.zRot]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([p.xTexSize, p.yTexSize]).toEqual([64, 32]);
    expect([p.mirror, p.visible]).toEqual([false, true]);
    expect([p.cubes.length, p.children.length, p.id]).toEqual([0, 0, '']);
  });

  it('字符串版：id 照给，texOffs 归 0', () => {
    const p = new ModelPart('torso');
    expect(p.id).toBe('torso');
  });

  it('两个 int 版：texOffs 照给', () => {
    const p = new ModelPart(40, 16);
    p.addBox(0, 0, 0, 1, 1, 1);
    // texOffs 会在 cube 的 UV 里体现：+x 面从 (d+w, d) = (17, 16) 开始
    const cube = (p as unknown as { cubes: { polygons: { vertices: { u: number }[] }[] }[] }).cubes[0]!;
    expect(cube.polygons[0]!.vertices[0]!.u).toBeGreaterThan(0.25);
  });

  it('⚠ Model 版：只记下 model，**不**把自己登记进 model.cubes（C++ 就是这样）', () => {
    const model = new TestModel();
    const p = new ModelPart(model, 0, 0);
    expect(model.cubes).toEqual([]);
  });
});

describe('setModel / clear：登记与摘除（G3）', () => {
  it('setModel 把自己登记进去，并从 model 取贴图尺寸', () => {
    const model = new TestModel(64, 64);
    const p = new ModelPart(0, 0);
    p.setModel(model);
    expect(model.cubes).toEqual([p]);
    expect([p.xTexSize, p.yTexSize], '尺寸是从 model 来的').toEqual([64, 64]);
  });

  it('换到另一个 model 时，会先从**旧** model 里摘掉', () => {
    const a = new TestModel();
    const b = new TestModel();
    const p = new ModelPart(0, 0);
    p.setModel(a);
    p.setModel(b);
    expect(a.cubes, '旧的不该还留着它').toEqual([]);
    expect(b.cubes).toEqual([p]);
  });

  it('setModel(null) 摘掉自己', () => {
    const model = new TestModel();
    const p = new ModelPart(0, 0);
    p.setModel(model);
    p.setModel(null);
    expect(model.cubes).toEqual([]);
  });

  it('clear 清空 cube 并摘掉自己', () => {
    const model = new TestModel();
    const p = new ModelPart(0, 0);
    p.setModel(model);
    p.addBox(0, 0, 0, 1, 1, 1);
    expect(p.cubes.length).toBe(1);
    p.clear();
    expect(p.cubes.length).toBe(0);
    expect(model.cubes).toEqual([]);
  });

  it('addChild 只放进 children，不碰 model', () => {
    const parent = new ModelPart(0, 0);
    const child = new ModelPart(0, 0);
    parent.addChild(child);
    expect(parent.children).toEqual([child]);
    expect(parent.cubes).toEqual([]);
  });
});

describe('addBox 的三个重载（G3）', () => {
  it('6 参版：返回 this，外扩固定为 0', () => {
    const p = new ModelPart(0, 0);
    expect(p.addBox(0, 0, 0, 8, 8, 8)).toBe(p);
    const cube = (p as unknown as { cubes: { x0: number }[] }).cubes[0]!;
    expect(cube).toBeInstanceOf(Cube);
    expect(cube.x0, 'g=0 所以成员和顶点一致').toBe(0);
  });

  it('7 参版：返回 void，外扩传下去', () => {
    const p = new ModelPart(0, 0);
    expect(p.addBox(0, 0, 0, 8, 8, 8, 0.5)).toBeUndefined();
    const cube = (p as unknown as { cubes: { x0: number; vertices: { pos: { x: number } }[] }[] })
      .cubes[0]!;
    expect(cube.x0, '成员是没外扩的').toBe(0);
    expect(cube.vertices[0]!.pos.x, '顶点是外扩过的').toBe(-0.5);
  });

  it('字符串版：cube 的 id 是 `父id.子id`，且返回 this', () => {
    const p = new ModelPart('body');
    expect(p.addBox('nose', 0, 0, 0, 1, 1, 1)).toBe(p);
    const cube = (p as unknown as { cubes: { id: string }[] }).cubes[0]!;
    expect(cube.id).toBe('body.nose');
  });
});

describe('setPos / setTexSize / texOffs / mimic（G3）', () => {
  it('setPos 与 setTexSize 与 texOffs 都返回 this（C++ 是可链式调用的引用版）', () => {
    const p = new ModelPart(0, 0);
    expect(p.setTexSize(64, 64)).toBe(p);
    expect(p.texOffs(8, 16)).toBe(p);
    expect(p.setPos(1, 2, 3)).toBeUndefined(); // setPos 在 C++ 里返回 void
    expect([p.x, p.y, p.z]).toEqual([1, 2, 3]);
  });

  it('⚠ mimic 只抄位置和三个旋转，**不**抄尺寸/贴图/可见性', () => {
    const src = new ModelPart(0, 0);
    src.setPos(1, 2, 3);
    src.xRot = 0.25;
    src.yRot = 0.5;
    src.zRot = 0.75;
    src.setTexSize(128, 128);
    src.visible = false;

    const dst = new ModelPart(0, 0);
    dst.mimic(src);
    expect([dst.x, dst.y, dst.z]).toEqual([1, 2, 3]);
    expect([dst.xRot, dst.yRot, dst.zRot]).toEqual([0.25, 0.5, 0.75]);
    expect([dst.xTexSize, dst.yTexSize], '尺寸不抄').toEqual([64, 32]);
    expect(dst.visible, '可见性不抄').toBe(true);
  });
});

describe('⚠ assign（C++ 的 operator=）：拷进现有对象，不是换对象（G3）', () => {
  it('是把内容拷进来：对象身份不变（别处握着的引用还指得对）', () => {
    const model = new TestModel(64, 64);
    const head = new ModelPart(0, 0);
    head.setModel(model);
    head.addBox(0, 0, 0, 1, 1, 1);
    const kept = head; // 别处的引用

    head.assign(new ModelPart(8, 16));

    expect(head, '还是同一个对象').toBe(kept);
    expect(head.id, '临时对象 id 为空、原 id 也为空 → 保持空').toBe('');
  });

  it('新对象的 texOffs 与 mirror 会覆盖过来', () => {
    const model = new TestModel();
    const p = new ModelPart(0, 0);
    p.setModel(model);
    const rhs = new ModelPart(8, 16);
    rhs.mirror = true;
    p.assign(rhs);
    expect(p.mirror).toBe(true);
    // texOffs 通过接下来 addBox 的 UV 体现：+x 面从 (d+w, d) 起 —— 有偏移就该大于 0.25
    p.addBox(0, 0, 0, 8, 8, 8);
    const cube = (p as unknown as { cubes: { polygons: { vertices: { u: number }[] }[] }[] }).cubes[0]!;
    expect(cube.polygons[0]!.vertices[0]!.u).toBeGreaterThan(0.25);
  });

  it('assign 会先 clear：自己原来的 cube 被清掉，且从旧 model 摘掉', () => {
    const model = new TestModel();
    const p = new ModelPart(0, 0);
    p.setModel(model);
    p.addBox(0, 0, 0, 1, 1, 1);
    p.assign(new ModelPart(0, 0));
    expect(p.cubes.length, 'clear 过了').toBe(0);
    expect(model.cubes, 'clear 里 setModel(null) 摘掉了').toEqual([]);
  });

  it('rhs 的 cube 是**浅拷**（C++ 的 `cubes.assign(rhs.cubes.begin(), rhs.cubes.end())` 拷的是指针）', () => {
    const rhs = new ModelPart(0, 0);
    rhs.addBox(0, 0, 0, 1, 1, 1);
    const p = new ModelPart(0, 0);
    p.assign(rhs);
    expect(p.cubes.length).toBe(1);
    expect(p.cubes[0], '同一个 cube 对象，不是新造的').toBe(rhs.cubes[0]);
  });
});

describe('onGraphicsReset（G3）', () => {
  it('Model.onGraphicsReset 会转发给自己登记的每个部件', () => {
    // 这里只验"转发到了"，`compiled = false` 的实际效果要等 G4 有 compile 之后才有意义
    const model = new TestModel();
    const p = new ModelPart(0, 0);
    p.setModel(model);
    let calls = 0;
    const orig = p.onGraphicsReset.bind(p);
    p.onGraphicsReset = (): void => {
      calls++;
      orig();
    };
    model.onGraphicsReset();
    expect(calls).toBe(1);
  });
});
