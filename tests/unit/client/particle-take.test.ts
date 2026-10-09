import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompoundTag } from '@mcpe/nbt';
import { Entity, initItems, Item, ItemEntity, ItemInstance, type Level } from '@mcpe/world';
import {
  EntityRenderDispatcher,
  GLES1,
  Particle,
  ParticleEngine,
  TakeAnimationParticle,
  Tesselator,
  Textures,
  glSetContext,
  type Minecraft,
} from '@mcpe/client';
// ⚠ `LocalPlayer` 在 `@mcpe/client` 的桶里是 **export type**（只有类型，运行时不导出），
//   要拿构造函数只能按相对路径直接引源文件 —— 和 confirm-screen.test.ts 一个做法。
import { LocalPlayer } from '../../../packages/client/src/player/LocalPlayer';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// E9：`TakeAnimationParticle`（C++ 头文件 63 行，整个类内联，没有 .cpp）。
//
// 【这个文件钉什么】它是唯一一个**不画 quad** 的粒子：内部藏一个没进世界的 `ItemEntity`，
// 每帧算个插值位置再交给 `EntityRenderDispatcher`。所以钉三件事：
//   1. `tick()` **完全不调** `Particle::tick()`（不移动、不吃阻力、生命周期是 3 拍）；
//   2. `render()` 传给渲染器的**坐标**是逐字照抄 C++ 的那套插值（time 平方、yOffs 加在 target 上、
//      最后各减一次 `Particle.xOff/yOff/zOff`）；
//   3. ⚠ 调的是 **6 参数的 `renderAt`**，不是 `render(entity, a)` —— 后者会再减一遍相机位置
//      并按 `entity.xOld` 重新插值，位置就错两遍。
//
// 【数值为什么挑这几个】1 / 2 / 3（掉落物）、10→20 / 30→40 / 50→60（目标）、
//   life=1、a=0.5 全是二进制精确值，手算的期望能逐位相等，不用写浮点容差。

const f = Math.fround;

/**
 * 只记 `setColor` 的假 GL 上下文：用来钉 `glColor4f2(br, br, br, 1)`。
 * ⚠ G9 起 `EntityRenderDispatcher` 的构造函数会 `new ChickenModel()` —— `ModelPart._init`
 * 构造时要 `glGenBuffers`（每个部件一个 VBO，构造时只调这一个 GL 函数），所以这里也得有。
 */
class RecordingGL {
  colors: number[][] = [];
  setColor(r: number, g: number, b: number, a: number): void {
    this.colors.push([r, g, b, a]);
  }
  genBuffers(_n: number, buffers: { [i: number]: number }): void {
    buffers[0] = 1; // 一个任意 id，够 `ModelPart` 存进 vboId
  }
}

/** 假 Textures：ParticleEngine 只要这两个方法 */
class FakeTextures {
  loadTexture(): number {
    return 0;
  }
  loadAndBindTexture(): number {
    return 0;
  }
}

/**
 * 一个最小可实例化的实体，只用来当"物品飞向的目标"。
 * ⚠ `Entity` 是**抽象类**（`getEntityTypeId` + 两个 NBT 方法），不能直接 `new` ——
 *   vitest 不做类型检查所以这么写测试照样绿，但 `pnpm typecheck` 会红。
 */
class PlainEntity extends Entity {
  override getEntityTypeId(): number {
    return 0;
  }
  protected override readAdditionalSaveData(_tag: CompoundTag): void {}
  protected override addAdditonalSaveData(_tag: CompoundTag): void {}
}

type Inner = {
  e: ItemEntity;
  target: Entity;
  life: number;
  lifeTime: number;
  yOffs: number;
  lifetime: number;
  removed: boolean;
};
const inner = (p: Particle) => p as unknown as Inner;

let level: Level;
let gl: RecordingGL;
let engine: ParticleEngine;
let item: ItemEntity;
let target: Entity;

/** 造一颗：掉落物在 (1,2,3)，目标从 (10,30,50) 走到 (20,40,60)，yOffs = -0.5f */
function makeParticle(yOffs = f(-0.5)): TakeAnimationParticle {
  return new TakeAnimationParticle(level, item, target, yOffs);
}

beforeAll(() => {
  createFlatLevel(); // 先 initHeadless（方块注册），再 initItems —— 真机就是这个顺序
  initItems();
});

beforeEach(() => {
  gl = new RecordingGL();
  glSetContext(gl as unknown as GLES1);
  level = createFlatLevel();
  prepareLevel(level);
  engine = new ParticleEngine(level, new FakeTextures() as unknown as Textures);

  item = new ItemEntity(level, 1, 2, 3, new ItemInstance(Item.feather.id, 16, 0));
  target = new PlainEntity(level);
  target.setPos(10, 30, 50);
  // setPos 不动 xOld/yOld/zOld（只挪碰撞盒），这里显式给个"上一帧的位置"
  target.xOld = 10;
  target.yOld = 30;
  target.zOld = 50;
  target.x = 20;
  target.y = 40;
  target.z = 60;

  Particle.xOff = 0;
  Particle.yOff = 0;
  Particle.zOff = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  Particle.xOff = 0;
  Particle.yOff = 0;
  Particle.zOff = 0;
});

afterAll(() => {
  EntityRenderDispatcher.destroy();
});

/** 拦下渲染器，只记参数（真 ItemRenderer 要纹理，这里不跑它） */
function captureRender(): { renderAt: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> } {
  const d = EntityRenderDispatcher.getInstance();
  const renderAt = vi.fn();
  const render = vi.fn();
  vi.spyOn(d, 'renderAt').mockImplementation(renderAt as unknown as () => void);
  vi.spyOn(d, 'render').mockImplementation(render as unknown as () => void);
  return { renderAt, render };
}

describe('TakeAnimationParticle 的构造（E9）', () => {
  it('落在第 4 档（ENTITY_PARTICLE_TEXTURE），由 renderLit 负责', () => {
    expect(makeParticle().getParticleTexture()).toBe(ParticleEngine.ENTITY_PARTICLE_TEXTURE);
  });

  it('内部那个 ItemEntity 复制了一份物品，且把 count 压成 1（源物品不受影响）', () => {
    const p = makeParticle();
    expect(item.item.count, '前提：掉落物本身是一叠 16 个').toBe(16);
    expect(inner(p).e.item.count, 'C++：e.item.count = 1').toBe(1);
    expect(item.item.count, '改的是副本，源物品还是 16').toBe(16);
  });

  it('内部 ItemEntity 建在掉落物当时的位置上', () => {
    const e = inner(makeParticle()).e;
    expect([e.x, e.y, e.z]).toEqual([1, 2, 3]);
  });

  it('基类先构造：坐标取自掉落物（粒子自己也是从那份 x/y/z 起）', () => {
    const p = makeParticle();
    expect([p.x, p.y, p.z]).toEqual([1, 2, 3]);
  });

  it('yOffs / life / lifeTime 的初值照抄（0 / 3）', () => {
    const p = inner(makeParticle(-0.5));
    expect(p.yOffs).toBe(-0.5);
    expect(p.life).toBe(0);
    expect(p.lifeTime).toBe(3);
  });
});

describe('TakeAnimationParticle.tick（E9）', () => {
  it('⚠ 不调 Particle::tick —— 位置和速度一个都不动', () => {
    const p = makeParticle();
    const before = [p.x, p.y, p.z, p.xd, p.yd, p.zd];
    p.tick();
    expect(
      [p.x, p.y, p.z, p.xd, p.yd, p.zd],
      '基类 tick 会 move() 并吃阻力，这里都不该发生',
    ).toEqual(before);
  });

  it('⚠ 不调 Particle::tick —— 就算基类的 lifetime 只有 1 也不会被移除', () => {
    // 基类 tick 里是 `if (age++ >= lifetime) remove()`：lifetime=1 时第一次 tick 就死。
    // 走了 super.tick() 的话这条必红 —— 这是"有没有偷偷调基类"最灵敏的探针。
    const p = makeParticle();
    inner(p).lifetime = 1;
    p.tick();
    expect(inner(p).removed).toBe(false);
  });

  it('数到第 3 拍才走：第 1、2 拍还在，第 3 拍 remove', () => {
    const p = makeParticle();
    p.tick();
    expect(inner(p).life).toBe(1);
    expect(inner(p).removed, '第 1 拍不该走').toBe(false);
    p.tick();
    expect(inner(p).life).toBe(2);
    expect(inner(p).removed, '第 2 拍不该走').toBe(false);
    p.tick();
    expect(inner(p).life).toBe(3);
    expect(inner(p).removed, '第 3 拍走').toBe(true);
  });
});

describe('TakeAnimationParticle.render 的坐标（E9）', () => {
  it('⚠ 走 renderAt（6 参数），**不走** render(entity, a)', () => {
    const { renderAt, render } = captureRender();
    makeParticle().render(Tesselator.instance, 0, 0, 0, 0, 0, 0);
    expect(renderAt).toHaveBeenCalledTimes(1);
    expect(render, 'render(entity, a) 会再减一遍相机位置 —— 用错就错两遍').not.toHaveBeenCalled();
  });

  it('life=0、a=0 时从掉落物原地出发（time=0）', () => {
    const { renderAt } = captureRender();
    Particle.xOff = f(100);
    Particle.yOff = f(200);
    Particle.zOff = f(300);
    makeParticle().render(Tesselator.instance, 0, 0, 0, 0, 0, 0);
    const [, x, y, z] = renderAt.mock.calls[0]! as [unknown, number, number, number];
    expect([x, y, z], '(1,2,3) 各减一次相机位置').toEqual([1 - 100, 2 - 200, 3 - 300]);
  });

  it('⚠ life=1、a=0.5：time=(1.5/3)²=0.25，向目标插值 1/4（逐位手算）', () => {
    const { renderAt } = captureRender();
    Particle.xOff = f(100);
    Particle.yOff = f(200);
    Particle.zOff = f(300);
    const p = makeParticle();
    p.tick(); // life = 1
    p.render(Tesselator.instance, 0.5, 0, 0, 0, 0, 0);
    const [, x, y, z] = renderAt.mock.calls[0]! as [unknown, number, number, number];
    // xt=15, xx=1+14*0.25=4.5；yt=30+10*0.5-0.5=34.5, yy=2+32.5*0.25=10.125；
    // zt=55, zz=3+52*0.25=16
    expect([x, y, z]).toEqual([4.5 - 100, 10.125 - 200, 16 - 300]);
  });

  it('⚠ yOffs 加在 **target 的 y** 上（不是加在插值结果上）', () => {
    // 两种写法在 life=1、a=0.5 时分别是 10.125 和 9.625
    const { renderAt } = captureRender();
    const p = makeParticle(f(-0.5));
    p.tick();
    p.render(Tesselator.instance, 0.5, 0, 0, 0, 0, 0);
    const [, , y] = renderAt.mock.calls[0]! as [unknown, number, number];
    expect(y).toBe(10.125);
  });

  it('yOffs = 0 时同一时刻是 10.25（差 0.125 = 0.5f × time，验证 yOffs 也过了 time）', () => {
    const { renderAt } = captureRender();
    const p = makeParticle(f(0));
    p.tick();
    p.render(Tesselator.instance, 0.5, 0, 0, 0, 0, 0);
    const [, , y] = renderAt.mock.calls[0]! as [unknown, number, number];
    expect(y).toBe(10.25);
  });

  it('time 是**平方过**的（不平方的话是 8，不是 4.5）', () => {
    const { renderAt } = captureRender();
    const p = makeParticle();
    p.tick();
    p.render(Tesselator.instance, 0.5, 0, 0, 0, 0, 0);
    const [, x] = renderAt.mock.calls[0]! as [unknown, number, number];
    expect(x, '不平方：1+14*0.5=8').toBe(4.5);
  });

  it('传给渲染器的是**内部那个 ItemEntity**，rot 用它自己的 yRot，a 原样透传', () => {
    const { renderAt } = captureRender();
    const p = makeParticle();
    const e = inner(p).e;
    p.render(Tesselator.instance, 0.375, 0, 0, 0, 0, 0);
    const [entity, , , , rot, a] = renderAt.mock.calls[0]! as [
      Entity,
      number,
      number,
      number,
      number,
      number,
    ];
    expect(entity).toBe(e);
    expect(rot).toBe(e.yRot);
    expect(a).toBe(0.375);
  });

  it('render 的六个基向量参数一个都不用（原样收下但忽略）', () => {
    const { renderAt } = captureRender();
    const p = makeParticle();
    p.render(Tesselator.instance, 0, 5, 6, 7, 8, 9);
    const [, x, y, z] = renderAt.mock.calls[0]! as [unknown, number, number, number];
    expect([x, y, z], '与传 0 时一致').toEqual([1, 2, 3]);
  });

  it('⚠ 记录：`e.x` 与 `this.x` **永远相等**，这两个写法测不出来', () => {
    // 基类构造给了 this 同样的坐标，而 `tick()` 两边都不移动 —— 所以
    // 把 `const xo = this.e.x` 改成 `const xo = this.x` 是**等价变异**，
    // 任何断言都抓不到（和 D2 的 isClientSide 两道守卫一个性质）。写下来免得以后
    // 有人拿它做反向验证、得到个假绿。
    const p = makeParticle();
    expect([p.x, p.y, p.z]).toEqual([inner(p).e.x, inner(p).e.y, inner(p).e.z]);
    p.tick();
    expect([p.x, p.y, p.z], 'tick 两边都不动 → 仍然相等').toEqual([
      inner(p).e.x,
      inner(p).e.y,
      inner(p).e.z,
    ]);
  });
});

describe('TakeAnimationParticle.render 的亮度（E9）', () => {
  /** 记录 `level.getBrightness` 的实参 */
  function spyBrightness(): number[][] {
    const calls: number[][] = [];
    const fake = level as unknown as { getBrightness: (...a: number[]) => number };
    fake.getBrightness = (...args: number[]): number => {
      calls.push(args);
      return 0.625;
    };
    return calls;
  }

  /**
   * 把目标挪到让插值后的 **yy 恰好等于** 给定值（life=1、a=0.5 时 time=0.25）：
   *   yy = 2 + (yt - 2) * 0.25        → yt = 2 + (yy - 2) / 0.25
   *   yt = 30 + (y - 30) * 0.5 - 0.5  → y  = 30 + (yt + 0.5 - 30) / 0.5
   * 这么做是为了让 yy 落在**格子边界旁边** —— 不然 +0.05 和 +0 的 floor 一样，
   * "少加 heightOffset" 这个变异就测不出来（第一版就栽在这）。
   */
  function aimAtY(yy: number): void {
    target.y = 30 + (2 + (yy - 2) / 0.25 + 0.5 - 30) / 0.5;
  }

  function renderOnce(): void {
    const p = makeParticle();
    p.tick(); // life = 1
    p.render(Tesselator.instance, 0.5, 0, 0, 0, 0, 0);
  }

  it('查亮度的格坐标用**减相机位置之前**的 yy（xx=4.5→4，zz=16→16）', () => {
    const { renderAt } = captureRender();
    const calls = spyBrightness();
    Particle.xOff = f(100); // 相机很远也不该影响查亮度用的坐标
    renderOnce(); // yy=10.125 → 10
    expect(calls).toEqual([[4, 10, 16]]);
    expect(renderAt).toHaveBeenCalledTimes(1);
  });

  it('⚠ y 格号要加 heightOffset*0.5f：yy 在边界下方 0.03 处才看得出（9.97→10）', () => {
    captureRender();
    const calls = spyBrightness();
    aimAtY(9.97); // floor(9.97)=9；9.97 + 0.10000000149011612*0.5 = 10.02 → 10
    renderOnce();
    expect(calls[0]![1], '不加 heightOffset 的话这里是 9').toBe(10);
  });

  it('⚠ 加的是 heightOffset*0.5f（≈0.05），不是写死的 0.5f（yy=10.6 时 10 vs 11）', () => {
    captureRender();
    const calls = spyBrightness();
    aimAtY(10.6); // floor(10.6)=10；+0.05 → 10.65 → 10；若写成 +0.5 → 11.1 → 11
    renderOnce();
    expect(calls[0]![1]).toBe(10);
  });

  it('glColor4f2(br, br, br, 1) —— 三个分量同一个值，alpha 是 1', () => {
    captureRender();
    const fake = level as unknown as { getBrightness: () => number };
    fake.getBrightness = (): number => 0.625;
    makeParticle().render(Tesselator.instance, 0, 0, 0, 0, 0, 0);
    expect(gl.colors, 'render 里唯一一次 setColor').toEqual([[0.625, 0.625, 0.625, 1]]);
  });
});

describe('LocalPlayer.take 的接线（E9）', () => {
  /** 只塞 take 读的那一个字段：`minecraft`（它只碰 particleEngine 和 level） */
  function makePlayer(): LocalPlayer {
    const p = Object.create(LocalPlayer.prototype) as LocalPlayer;
    (p as unknown as { minecraft: Minecraft }).minecraft = {
      particleEngine: engine,
      level,
    } as unknown as Minecraft;
    return p;
  }

  it('捡起掉落物 → 往粒子引擎里加一颗（yOffs 是 -0.5f）', () => {
    expect(engine.countParticles(), '前提：一开始是空的').toBe('0');
    makePlayer().take(item, 1);
    expect(engine.countParticles()).toBe('1');
    const p = (engine as unknown as { particles: Particle[][] }).particles[3]![0]!;
    expect(p).toBeInstanceOf(TakeAnimationParticle);
    expect(inner(p).yOffs).toBe(-0.5);
  });

  it('捡的不是掉落物（比如箭）就什么都不加', () => {
    const mob = new PlainEntity(level);
    makePlayer().take(mob, 1);
    expect(engine.countParticles()).toBe('0');
  });

  it('particleEngine 或 level 为 null 时不炸（C++ 里不判空，TS 的类型是 | null）', () => {
    for (const stub of [
      { particleEngine: null, level },
      { particleEngine: engine, level: null },
    ]) {
      const p = Object.create(LocalPlayer.prototype) as LocalPlayer;
      (p as unknown as { minecraft: Minecraft }).minecraft = stub as unknown as Minecraft;
      expect(() => p.take(item, 1)).not.toThrow();
    }
    expect(engine.countParticles()).toBe('0');
  });
});
