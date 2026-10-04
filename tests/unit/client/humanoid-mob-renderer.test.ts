import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EntityRenderDispatcher,
  GLES1,
  GL_TEXTURE_COORD_ARRAY,
  GL_VERTEX_ARRAY,
  HumanoidMobRenderer,
  HumanoidModel,
  Tesselator,
  glSetContext,
} from '@mcpe/client';
import { initItems, Item, Tile, type ItemInstance, type Mob } from '@mcpe/world';
import { Mth } from '@mcpe/util';
import { createFlatLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

// G8：`HumanoidMobRenderer` 的三件事 —— `render` 的标志生命周期、`renderHand`、`additionalRendering`。
//
// 【验收按任务单的口径】四路手持物品的变换矩阵链条太长（还是 C++ 那种"转完就画"的状态机），
//   所以不去解析最终矩阵，而是**把每一步 GL 调用原样记下来逐条对** —— 这比"调用次数对"更硬，
//   谁把 -20 抄成 20、谁把 `s,-s,s` 抄成 `s,s,s` 都会被抓住。
//
// 【观察手段】
//   - `SpyGL extends GLES1` 把 push/pop/translate/rotate/scale/enable/disable 记成字符串（G6 同款）；
//   - `Tesselator.instance` 的 tex/vertex/begin/draw/color 用 `vi.spyOn` 数；
//   - `itemInHandRenderer.renderItem` 与 `textures.loadAndBindTexture` 用 `vi.fn()` 塞进分派器。
//
// 【两个前置】和 G7 一样：`Mth` 的三角函数表要先 `initMth()`（`Mth.sin/cos` 查的那张表
//   不初始化就全是 0）；`HumanoidModel` 的构造要 GL 上下文。
//
// 【浮点档位】按 float 走：变换量在期望里也包 `f()`。
//   ⚠ 披风那段有两套精度：capeX/px/dx 是 double（不包），bodyYaw/forward/lift/walk/capeXRot 是 float（包）。

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
  override enableClientState(array: number): void {
    this.ops.push(`enable:${array}`);
    super.enableClientState(array);
  }
  override disableClientState(array: number): void {
    this.ops.push(`disable:${array}`);
    super.disableClientState(array);
  }
}

let gl: SpyGL;
let erd: EntityRenderDispatcher;
let renderItem: ReturnType<typeof vi.fn>;
let loadAndBindTexture: ReturnType<typeof vi.fn>;

/** 建渲染器并把静态的 `entityRenderDispatcher` 指过去（`itemInHandRenderer`/`textures` 都在它身上） */
function makeRenderer(): { r: HumanoidMobRenderer; model: HumanoidModel } {
  const model = new HumanoidModel(0, 0);
  const r = new HumanoidMobRenderer(model, 0.5);
  r.init(erd);
  return { r, model };
}

/** 手上拿着 `item` 的假生物。`isPlayer:false` 是必须的 —— `Player.asPlayer` 要调它 */
function fakeCarry(item: ItemInstance | null): Mob {
  return { isPlayer: () => false, getCarriedItem: () => item } as unknown as Mob;
}

function fakeItem(id: number, count = 1): ItemInstance {
  return { id, count } as unknown as ItemInstance;
}

/** 假玩家：披风位置/身体朝向/走路速度都能精确摆值 */
function fakePlayer(
  o: {
    capeTex?: string;
    cape?: [number, number, number];
    pos?: [number, number, number];
    bodyYaw?: number;
    walkSpeed?: number;
  } = {},
): Mob {
  const cape = o.cape ?? [0, 0, 0];
  const pos = o.pos ?? [0, 0, 0];
  return {
    isPlayer: () => true,
    getCarriedItem: () => null,
    getCapeTexture: () => o.capeTex ?? 'mob/cape.png',
    getCapeX: () => cape[0],
    getCapeY: () => cape[1],
    getCapeZ: () => cape[2],
    getCapePrevX: () => cape[0],
    getCapePrevY: () => cape[1],
    getCapePrevZ: () => cape[2],
    xo: pos[0],
    yo: pos[1],
    zo: pos[2],
    x: pos[0],
    y: pos[1],
    z: pos[2],
    yBodyRotO: o.bodyYaw ?? 0,
    yBodyRot: o.bodyYaw ?? 0,
    walkAnimPos: 0,
    walkAnimSpeed: o.walkSpeed ?? 0,
  } as unknown as Mob;
}

/** `render()` 全流程要的假生物：`MobRenderer.render` 念到的每个成员都在 */
function fakeRenderMob(o: { carried?: ItemInstance | null; sneaking?: boolean } = {}): Mob {
  return {
    isPlayer: () => false,
    getCarriedItem: () => o.carried ?? null,
    isSneaking: () => o.sneaking ?? false,
    getAttackAnim: () => 0,
    isBaby: () => false,
    yBodyRotO: 0,
    yBodyRot: 0,
    xRotO: 0,
    xRot: 0,
    yRotO: 0,
    yRot: 0,
    heightOffset: 0,
    walkAnimSpeedO: 0,
    walkAnimSpeed: 0,
    walkAnimPos: 0,
    getTexture: () => 'mob/char.png',
    getBrightness: () => 1,
    hurtTime: 0,
    deathTime: 0,
    isOnFire: () => false,
  } as unknown as Mob;
}

beforeAll(() => {
  createFlatLevel(); // 先 initHeadless（方块注册），再 initItems —— 真机就是这个顺序
  initItems();
  Mth.initMth(); // ⚠ 不调这句，Mth.sin/cos 一律返回 0（G7 踩过）
});

beforeEach(() => {
  gl = new SpyGL(null);
  glSetContext(gl);
  EntityRenderDispatcher.destroy();
  erd = EntityRenderDispatcher.getInstance();
  renderItem = vi.fn();
  loadAndBindTexture = vi.fn();
  erd.itemInHandRenderer = { renderItem } as unknown as typeof erd.itemInHandRenderer;
  erd.textures = { loadAndBindTexture } as unknown as typeof erd.textures;
  erd.minecraft = { options: { getBooleanValue: () => false } } as unknown as typeof erd.minecraft;
  vi.restoreAllMocks();
});

describe('G8 构造与 renderHand', () => {
  it('构造器：模型就是自己那个（super 的 model 与 humanoidModel 同一个），披风两个角度从 0 起', () => {
    const { r, model } = makeRenderer();
    const self = r as unknown as {
      model: HumanoidModel;
      humanoidModel: HumanoidModel;
      lastCapeXRot: number;
      lastCapeZRot: number;
      shadowRadius: number;
    };
    expect(self.humanoidModel).toBe(model);
    expect(self.model).toBe(model);
    expect(self.shadowRadius).toBe(0.5);
    expect(self.lastCapeXRot).toBe(0);
    expect(self.lastCapeZRot).toBe(0);
  });

  it('renderHand：attackTime 清零 → setupAnim(0,0,0,0,0,1/16) → 只画 arm0，开关一开一关', () => {
    const { r, model } = makeRenderer();
    model.attackTime = 42;
    const setup = vi.spyOn(model, 'setupAnim');
    const arm = vi.spyOn(model.arm0, 'render').mockImplementation(() => {});
    r.renderHand();
    expect(model.attackTime).toBe(0);
    expect(setup).toHaveBeenCalledWith(0, 0, 0, 0, 0, f(1 / f(16.0)));
    expect(arm).toHaveBeenCalledTimes(1);
    expect(arm).toHaveBeenCalledWith(f(1 / f(16.0)));
    // ⚠ 开关的**顺序**也是抄的：两个 enable 在前、两个 disable 在后
    expect(gl.ops).toEqual([
      `enable:${GL_VERTEX_ARRAY}`,
      `enable:${GL_TEXTURE_COORD_ARRAY}`,
      `disable:${GL_VERTEX_ARRAY}`,
      `disable:${GL_TEXTURE_COORD_ARRAY}`,
    ]);
  });
});

describe('G8 additionalRendering：手持物品四路', () => {
  // 每路的开头都一样：push → arm0.translateTo（-5,2,0 各乘 1/16）→ 往手心挪 (-1,7,1)/16
  const HEAD = ['push', 't:-0.3125,0.125,0', 't:-0.0625,0.4375,0.0625'];

  it('方块（id<256 且 TileRenderer 认它的形状）：8/16 再乘 0.75，转 20/45', () => {
    const { r } = makeRenderer();
    const item = fakeItem(Tile.dirt.id);
    r.additionalRendering(fakeCarry(item), 0.5);
    expect(gl.ops).toEqual([
      ...HEAD,
      't:0,0.1875,-0.3125',
      'r:20,1,0,0',
      'r:45,0,1,0',
      's:0.375,-0.375,0.375', // 8/16 × 0.75
      'pop',
    ]);
    expect(renderItem).toHaveBeenCalledTimes(1);
    expect(renderItem).toHaveBeenCalledWith(expect.anything(), item);
  });

  it('弓：先绕 y 转 -20 再缩放，再转 -100/45（顺序和别路不一样）', () => {
    const { r } = makeRenderer();
    const item = fakeItem(Item.bow.id);
    r.additionalRendering(fakeCarry(item), 0.5);
    expect(gl.ops).toEqual([
      ...HEAD,
      't:0,0.125,0.3125', // 弓是往前挪 5/16
      'r:-20,0,1,0',
      's:0.625,-0.625,0.625', // 10/16
      'r:-100,1,0,0',
      'r:45,0,1,0',
      'pop',
    ]);
    expect(renderItem).toHaveBeenCalledTimes(1);
  });

  it('手持类物品（棍子）：10/16 缩放后转 -100/45，没有第一段平移', () => {
    const { r } = makeRenderer();
    const item = fakeItem(Item.stick.id); // stick 在 C++/TS 里都是 handEquipped
    expect(Item.stick.isHandEquipped()).toBe(true);
    r.additionalRendering(fakeCarry(item), 0.5);
    expect(gl.ops).toEqual([
      ...HEAD,
      't:0,0.1875,0',
      's:0.625,-0.625,0.625',
      'r:-100,1,0,0',
      'r:45,0,1,0',
      'pop',
    ]);
    expect(renderItem).toHaveBeenCalledTimes(1);
  });

  it('其余物品（碗）：6/16 等比缩放 —— ⚠ 这一路的 glScalef2 三个参数都没负号', () => {
    const { r } = makeRenderer();
    const item = fakeItem(Item.bowl.id);
    r.additionalRendering(fakeCarry(item), 0.5);
    expect(gl.ops).toEqual([
      ...HEAD,
      't:0.25,0.1875,-0.1875',
      's:0.375,0.375,0.375',
      'r:60,0,0,1',
      'r:-90,1,0,0',
      'r:20,0,0,1',
      'pop',
    ]);
    expect(renderItem).toHaveBeenCalledTimes(1);
  });

  it('⚠ count=0 和没物品一样：一句不分派（C++ 判的是 `count > 0`）', () => {
    const { r } = makeRenderer();
    r.additionalRendering(fakeCarry(fakeItem(Tile.dirt.id, 0)), 0.5);
    r.additionalRendering(fakeCarry(null), 0.5);
    expect(gl.ops).toEqual([]);
    expect(renderItem).not.toHaveBeenCalled();
  });
});

describe('G8 additionalRendering：披风', () => {
  it('不是玩家、或披风贴图名是空的：一条 GL 操作都没有', () => {
    const { r } = makeRenderer();
    r.additionalRendering(fakeCarry(null), 0.5); // isPlayer:false
    r.additionalRendering(fakePlayer({ capeTex: '' }), 0.5);
    expect(gl.ops).toEqual([]);
    expect(loadAndBindTexture).not.toHaveBeenCalled();
  });

  it('零位移玩家的第一帧：capeXRot 从 0 平滑到 1.8（6×0.3），capeZRot 保持 0', () => {
    const { r } = makeRenderer();
    r.additionalRendering(fakePlayer(), 0.5);
    const sm = f((f(6.0) - 0) * f(0.3)); // C++ `capeXRot = 0 + (6 - 0) * 0.3f`
    expect(gl.ops).toEqual([
      'push',
      's:0.0625,0.0625,0.0625', // body.translateTo(1/16) → 位置全 0，没有平移那句
      't:0,1,2',
      `r:${sm},1,0,0`,
      'r:0,0,0,1',
      // 下面四条来自 `t.draw()` 自己（drawArrayVTN 会开关两组客户端数组），不是披风代码写的
      `enable:${GL_TEXTURE_COORD_ARRAY}`,
      `enable:${GL_VERTEX_ARRAY}`,
      `disable:${GL_VERTEX_ARRAY}`,
      `disable:${GL_TEXTURE_COORD_ARRAY}`,
      'pop',
    ]);
    expect(loadAndBindTexture).toHaveBeenCalledWith('mob/cape.png');
    const self = r as unknown as { lastCapeXRot: number; lastCapeZRot: number };
    expect(self.lastCapeXRot).toBe(sm);
    expect(self.lastCapeZRot).toBe(0);
  });

  it('⚠ 披风角度有记忆：第二帧从上一次的 1.8 再往 6 靠（lastCapeXRot 会存回去）', () => {
    const { r } = makeRenderer();
    const target = f(6.0);
    const sm1 = f((target - 0) * f(0.3));
    const sm2 = f(sm1 + (target - sm1) * f(0.3));
    expect(sm2).not.toBe(sm1); // 没记忆的话两帧会一模一样
    r.additionalRendering(fakePlayer(), 0.5);
    gl.ops = [];
    r.additionalRendering(fakePlayer(), 0.5);
    expect(gl.ops).toContain(`r:${sm2},1,0,0`);
  });

  it('lift 的上下限：dy=+100 夹到 32，dy=-100 夹到 -6', () => {
    const up = makeRenderer();
    up.r.additionalRendering(fakePlayer({ cape: [0, 100, 0] }), 0.5);
    expect(gl.ops).toContain(`r:${f((f(f(6.0) + 32) - 0) * f(0.3))},1,0,0`);

    const down = makeRenderer();
    down.r.additionalRendering(fakePlayer({ cape: [0, -100, 0] }), 0.5);
    expect(gl.ops).toContain('r:0,0,0,1'); // 6 + (-6) = 0，再从 0 平滑还是 0
  });

  it('⚠ forward 为负时夹到 0（披风不能被"顶"到身后）', () => {
    const { r } = makeRenderer();
    // bodyYaw=0 → cosYaw=-1；披风在玩家 +z 方向 10 格 → forward = -1000 → 夹到 0
    r.additionalRendering(fakePlayer({ cape: [0, 0, 10], pos: [0, 0, 0] }), 0.5);
    expect(gl.ops).toContain(`r:${f((f(6.0) - 0) * f(0.3))},1,0,0`);
  });

  it('⚠ forward 在 (-1, 0) 之间也夹到 0（C++ 是 `< 0`，不是 <= -1 —— 变异验证补的）', () => {
    const { r } = makeRenderer();
    // bodyYaw=0 → cosYaw=-1；披风在 +z 方向 0.005 格 → forward = f(f(0.005 * -1) * 100) = -0.5
    // 正确实现夹到 0（目标角还是 6）；<= -1 的写法会留下 -0.5（目标角 5.75 → 第一帧 1.725）
    r.additionalRendering(fakePlayer({ cape: [0, 0, 0.005], pos: [0, 0, 0] }), 0.5);
    expect(gl.ops).toContain(`r:${f((f(6.0) - 0) * f(0.3))},1,0,0`);
  });

  it('披风 24 个顶点：tex+vertex 成对手写（不用 vertexUV），begin 前没有 color', () => {
    const { r, model } = makeRenderer();
    model.body.compile(f(1 / f(16.0))); // 先烘掉，免得 compile 自己写的顶点混进来
    const tex = vi.spyOn(Tesselator.instance, 'tex');
    const vertex = vi.spyOn(Tesselator.instance, 'vertex');
    const vertexUV = vi.spyOn(Tesselator.instance, 'vertexUV');
    const color = vi.spyOn(Tesselator.instance, 'color');
    const begin = vi.spyOn(Tesselator.instance, 'begin');
    const draw = vi.spyOn(Tesselator.instance, 'draw');
    r.additionalRendering(fakePlayer(), 0.5);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(tex).toHaveBeenCalledTimes(24);
    expect(vertex).toHaveBeenCalledTimes(24);
    expect(vertexUV).not.toHaveBeenCalled();
    // ⚠ 原样保留：C++ 在 t.begin() 之前没有 t.color(...)，用的是上一次留下的颜色
    expect(color).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledTimes(1);
    // 24 个顶点逐条对（手抄表最容易错，全列出来）：正面 / 背面 / 左 / 右 / 下 / 上
    const u0 = 1 / 64;
    const u1 = 11 / 64;
    const u2 = 12 / 64;
    const u3 = 22 / 64;
    const uL0 = 0 / 64;
    const uL1 = 1 / 64;
    const uR0 = 11 / 64;
    const uR1 = 12 / 64;
    const v0 = 0 / 32;
    const v1 = 1 / 32;
    const vTop = 1 / 32;
    const vBottom = 17 / 32;
    const halfW = 5;
    const height = 16;
    const depth = 1;
    const expected: number[][] = [
      [u2, vTop, -halfW, 0, 0],
      [u3, vTop, halfW, 0, 0],
      [u3, vBottom, halfW, height, 0],
      [u2, vBottom, -halfW, height, 0],
      [u0, vTop, halfW, 0, depth],
      [u1, vTop, -halfW, 0, depth],
      [u1, vBottom, -halfW, height, depth],
      [u0, vBottom, halfW, height, depth],
      [uL0, vTop, -halfW, 0, depth],
      [uL1, vTop, -halfW, 0, 0],
      [uL1, vBottom, -halfW, height, 0],
      [uL0, vBottom, -halfW, height, depth],
      [uR0, vTop, halfW, 0, 0],
      [uR1, vTop, halfW, 0, depth],
      [uR1, vBottom, halfW, height, depth],
      [uR0, vBottom, halfW, height, 0],
      [u0, v0, -halfW, 0, depth],
      [u1, v0, halfW, 0, depth],
      [u1, v1, halfW, 0, 0],
      [u0, v1, -halfW, 0, 0],
      [u2, v0, halfW, height, 0],
      [u3, v0, -halfW, height, 0],
      [u3, v1, -halfW, height, depth],
      [u2, v1, halfW, height, depth],
    ];
    const got = vertex.mock.calls.map((c, i) => [
      tex.mock.calls[i]![0],
      tex.mock.calls[i]![1],
      c[0],
      c[1],
      c[2],
    ]);
    expect(got).toEqual(expected);
  });
});

describe('G8 render：两个状态标志的生命周期', () => {
  it('拿着东西：模型画的那一瞬间 holdingRightHand=true，整个 render 结束后清回 false', () => {
    const { r, model } = makeRenderer();
    const seen: boolean[] = [];
    vi.spyOn(model, 'render').mockImplementation(() => {
      seen.push(model.holdingRightHand);
    });
    r.render(fakeRenderMob({ carried: fakeItem(Item.bowl.id) }), 0, 0, 0, 0, 0.5);
    expect(seen).toEqual([true]);
    expect(model.holdingRightHand).toBe(false);
  });

  it('⚠ 没拿东西时既不置 true 也不重置：遗留的 true 要留到画完才清', () => {
    const { r, model } = makeRenderer();
    const seen: boolean[] = [];
    vi.spyOn(model, 'render').mockImplementation(() => {
      seen.push(model.holdingRightHand);
    });
    model.holdingRightHand = true; // 模拟上一帧遗留
    r.render(fakeRenderMob({ carried: null }), 0, 0, 0, 0, 0.5);
    r.render(fakeRenderMob({ carried: null }), 0, 0, 0, 0, 0.5); // 刚被清成 false，这次就该保持 false
    expect(seen).toEqual([true, false]);
    expect(model.holdingRightHand).toBe(false);
  });

  it('sneaking 跟着 mob.isSneaking() 走，而且是画之前就设好', () => {
    const { r, model } = makeRenderer();
    const seen: boolean[] = [];
    vi.spyOn(model, 'render').mockImplementation(() => {
      seen.push(model.sneaking);
    });
    r.render(fakeRenderMob({ sneaking: true }), 0, 0, 0, 0, 0.5);
    expect(seen).toEqual([true]);
  });
});
