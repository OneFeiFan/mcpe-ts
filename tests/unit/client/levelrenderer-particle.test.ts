import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockMthRandom } from '../../helpers/mthRandom';
import { Entity, Item, ParticleType, initItems, type Level } from '@mcpe/world';
import {
  BreakingItemParticle,
  BubbleParticle,
  CritParticle2,
  ExplodeParticle,
  FlameParticle,
  GLES1,
  LavaParticle,
  LevelRenderer,
  Particle,
  ParticleEngine,
  RedDustParticle,
  SmokeParticle,
  Textures,
  glSetContext,
  type Minecraft,
} from '@mcpe/client';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// E6：`LevelRenderer.addParticle` 的字符串分派（C++ LevelRenderer.cpp:1463-1505）+ **数字→名字归一化**。
//
// 【这一步为什么需要归一化】C++ 实际传的永远是字符串（`PARTICLETYPE(x)` 是逗号表达式，
// 枚举那个重载整段是死代码）；而 TS 里已有的调用点混着两种写法，而且**已有四条断言钉的是数字**
// （`snowball.test.ts:167` 等），不能改。所以入口归一化一次、后面逐字照抄字符串梯子。
//
// 【怎么搭出 LevelRenderer】它的构造函数要一个 `Minecraft` —— 这里给个只有
// `cameraTargetPlayer` / `particleEngine` / `textures` 的替身（addParticle 只读这三个）。

const f = Math.fround;

class FakeTextures {
  loadTexture(): number {
    return 0;
  }
  loadAndBindTexture(): number {
    return 0;
  }
}

let level: Level;
let engine: ParticleEngine;
let lr: LevelRenderer;
let player: Particle;

/** 引擎里的四个档（只给测试看） */
const buckets = () => (engine as unknown as { particles: Particle[][] }).particles;

/**
 * ⚠ **不走 LevelRenderer 的构造函数** —— 它要一整个 Minecraft（options / platform /
 * isPowerVR…），为了测一个 addParticle 去把那些全替身出来不划算，而且每加一个依赖
 * 就得补一个（第一版就是这么一路补到 isPowerVR 的）。
 * 这里直接 `Object.create(prototype)`，只塞 addParticle 真正读的两个字段：`mc` 和 `level`。
 * 监听器要用的那几条测试自己 `level.addListener(r)`。
 */
function makeRenderer(cam: Entity | null, engineOverride?: ParticleEngine): LevelRenderer {
  const e = engineOverride ?? engine;
  const r = Object.create(LevelRenderer.prototype) as LevelRenderer;
  const internal = r as unknown as { mc: unknown; level: Level };
  internal.mc = { cameraTargetPlayer: cam, particleEngine: e };
  internal.level = level;
  return r;
}

beforeAll(() => {
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  glSetContext(new GLES1(null));
  level = createFlatLevel();
  prepareLevel(level);
  Entity.sharedRandom.setSeed(20261004);
  mockMthRandom(0.75);
  engine = new ParticleEngine(level, new FakeTextures() as unknown as Textures);
  // 相机站在 (8.5, 70.5, 8.5)
  player = new Particle(level, 8.5, 70.5, 8.5, 0, 0, 0);
  lr = makeRenderer(player);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LevelRenderer.addParticle 的字符串梯子（E6）', () => {
  const cases: Array<[string, number, new (...a: never[]) => Particle]> = [
    ['bubble', 0, BubbleParticle],
    ['crit', 0, CritParticle2],
    ['smoke', 0, SmokeParticle],
    ['explode', 0, ExplodeParticle],
    ['flame', 0, FlameParticle],
    ['lava', 0, LavaParticle],
    ['largesmoke', 0, SmokeParticle],
    ['reddust', 0, RedDustParticle],
    ['snowballpoof', 2, BreakingItemParticle],
  ];

  for (const [name, bucket, cls] of cases) {
    it(`'${name}' → ${cls.name}，落在第 ${bucket} 档`, () => {
      lr.addParticle(name, 8.5, 70.5, 8.5, 0, 0, 0, 0);
      expect(buckets()[bucket]!.length, `第 ${bucket} 档该有 1 个`).toBe(1);
      expect(buckets()[bucket]![0]).toBeInstanceOf(cls);
    });
  }

  it("'iconcrack' 用 data 去查 Item.items（不是写死的物品）", () => {
    // ⚠ data 必须挑一个**不是雪球**的物品：用 snowBall.id 的话
    //   `Item.items[data]` 和 `Item.snowBall` 恰好是同一个对象，两种写法分不开（变异测出来的）
    lr.addParticle('iconcrack', 8.5, 70.5, 8.5, 0, 0, 0, Item.feather.id);
    const p = buckets()[2]![0] as BreakingItemParticle;
    expect(p).toBeInstanceOf(BreakingItemParticle);
    const tex = (p as unknown as { tex: number }).tex;
    expect(tex, 'tex 来自 Item.items[data].getIcon(0)').toBe(Item.feather.getIcon(0));
    expect(tex).not.toBe(Item.snowBall.getIcon(0));
  });

  it('不认识的 id 什么都不造（C++ 的梯子末尾没有 else）', () => {
    lr.addParticle('hugeexplosion', 8.5, 70.5, 8.5, 0, 0, 0, 0);
    lr.addParticle('note', 8.5, 70.5, 8.5, 0, 0, 0, 0);
    lr.addParticle('slime', 8.5, 70.5, 8.5, 0, 0, 0, 0);
    expect(engine.countParticles()).toBe('0');
  });
});

describe('LevelRenderer.addParticle 的数字→名字归一化（E6 · ADAPTED(Cpp)）', () => {
  it('⚠ 传数字（ParticleType.x）等价于传那个名字 —— 这是本文件唯一一处非 1:1', () => {
    lr.addParticle(ParticleType.bubble, 8.5, 70.5, 8.5, 0, 0, 0, 0);
    lr.addParticle(ParticleType.flame, 8.5, 70.5, 8.5, 0, 0, 0, 0);
    lr.addParticle(ParticleType.snowballpoof, 8.5, 70.5, 8.5, 0, 0, 0, 0);
    expect(buckets()[0]!.length).toBe(2);
    expect(buckets()[0]![0]).toBeInstanceOf(BubbleParticle);
    expect(buckets()[0]![1]).toBeInstanceOf(FlameParticle);
    expect(buckets()[2]!.length).toBe(1);
    expect(buckets()[2]![0]).toBeInstanceOf(BreakingItemParticle);
  });

  it('⚠ 现有调用点用的那几个数字 id 都能对上名字（Snowball/Throwable/Explosion/Arrow）', () => {
    // 这几个就是 TS 里**已经写死成数字**的调用点传的值
    for (const [id, cls] of [
      [ParticleType.snowballpoof, BreakingItemParticle],
      [ParticleType.bubble, BubbleParticle],
      [ParticleType.crit, CritParticle2],
      [ParticleType.explode, ExplodeParticle],
      [ParticleType.smoke, SmokeParticle],
    ] as const) {
      const e = new ParticleEngine(level, new FakeTextures() as unknown as Textures);
      const r = makeRenderer(player, e);
      level.addListener(r);
      r.addParticle(id, 8.5, 70.5, 8.5, 0, 0, 0, 0);
      const bs = (e as unknown as { particles: Particle[][] }).particles;
      const all = bs.flat();
      expect(all.length, `id=${id} 该造出 1 个`).toBe(1);
      expect(all[0]).toBeInstanceOf(cls);
    }
  });

  it('数字 0（none）没有名字 → 不造任何粒子（不会炸）', () => {
    lr.addParticle(ParticleType.none, 8.5, 70.5, 8.5, 0, 0, 0, 0);
    expect(engine.countParticles()).toBe('0');
  });
});

describe('LevelRenderer.addParticle 的 16 格剔除（E6）', () => {
  it('正好 16 格内会造；超过 16 格什么都不造', () => {
    lr.addParticle('flame', 8.5 + 16, 70.5, 8.5, 0, 0, 0, 0);
    expect(engine.countParticles(), '距离平方 = 256，判据是 > 256 才剔除').toBe('1');

    lr.addParticle('flame', 8.5 + 16.5, 70.5, 8.5, 0, 0, 0, 0);
    expect(engine.countParticles(), '16.5 格该被剔除').toBe('1');
  });

  it('用平方距离比较（不是开方），三个方向都算进去', () => {
    // 3-4-12 这组：平方和 9+16+144 = 169 < 256 → 留着
    lr.addParticle('flame', 8.5 + 3, 70.5 + 4, 8.5 + 12, 0, 0, 0, 0);
    expect(engine.countParticles()).toBe('1');
  });

  it('⚠ cameraTargetPlayer 为 null 时**整段都不执行**（连剔除都不做）', () => {
    const r = makeRenderer(null);
    level.addListener(r);
    r.addParticle('flame', 8.5, 70.5, 8.5, 0, 0, 0, 0);
    expect(engine.countParticles()).toBe('0');
  });

  it('坐标是原样传给粒子的（不做任何偏移）', () => {
    // ⚠ 用 'smoke' 而不是 'flame' —— FlameParticle 的构造会**自己挪 x/y/z**
    //   （`x += (rand-rand)*0.05f`，那个"碰撞盒不跟着动"的怪癖），量不出"原样传"
    lr.addParticle('smoke', 9.25, 71.5, 7.75, 0, 0, 0, 0);
    const p = buckets()[0]![0]!;
    expect([p.x, p.y, p.z]).toEqual([9.25, 71.5, 7.75]);
  });

  it('largesmoke 传进去的 scale 是 2.5f（和 smoke 不是一个尺寸）', () => {
    // ⚠ 两次构造的随机流不同，基类算出来的 size 本来就不一样 ——
    //   要比就得**用同一个随机流**各造一次（reset seed 再各来一遍）
    const sizeOf = (name: string): number => {
      const e = new ParticleEngine(level, new FakeTextures() as unknown as Textures);
      const r = makeRenderer(player, e);
      Entity.sharedRandom.setSeed(20261004);
      r.addParticle(name, 8.5, 70.5, 8.5, 0, 0, 0, 0);
      const bs = (e as unknown as { particles: Particle[][] }).particles;
      return (bs[0]![0] as SmokeParticle).oSize;
    };
    expect(sizeOf('largesmoke')).toBe(f(sizeOf('smoke') * f(2.5)));
  });
});

describe('Level 转发到监听器的整条链（E6/E7）', () => {
  it('level.addParticle 真的会走到 LevelRenderer（监听器已注册）', () => {
    level.addListener(lr); // 真机上这行在 LevelRenderer.setLevel 里（这里跳过了构造）
    level.addParticle('flame', 8.5, 70.5, 8.5, 0, 0, 0);
    expect(engine.countParticles(), 'setLevel 时 LevelRenderer 注册成了监听器').toBe('1');
  });

  it('数字 id 走 level.addParticle 也一样（现有调用点的真实路径）', () => {
    level.addListener(lr);
    level.addParticle(ParticleType.snowballpoof, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(engine.countParticles()).toBe('1');
  });
});
