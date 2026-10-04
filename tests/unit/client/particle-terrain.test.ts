import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import { Entity, Item, LevelListener, Tile, initItems, type Level } from '@mcpe/world';
import {
  BreakingItemParticle,
  GLES1,
  LavaParticle,
  Particle,
  Tesselator,
  TerrainParticle,
  glSetContext,
} from '@mcpe/client';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// E4：三个"要读 Tile / Item"的粒子 —— LavaParticle（63 行）、TerrainParticle（63）、
// BreakingItemParticle（66）。前两个是**挖方块的碎屑**要用的，所以这一步做完，
// `ParticleEngine.destroy/crack`（E5）才有东西可造。
//
// 【⚠ 随机值一律 0.75】0.5 会让基类初速度变 NaN，而 NaN 之间 `toBe` 是相等的
// （详见 particle.test.ts 里 `make()` 的注释）。
//
// 【三个类的 UV 取格号写法各不相同，各钉一条】
//   LavaParticle       —— 不重写 render，用基类的 `tex % 16` / `tex / 16`
//   TerrainParticle    —— `tex & 15` / `tex >> 4`（+ uo/vo 的 1/4 格抖动）
//   BreakingItemParticle —— `tex % 16` / `tex / 16`（整数除法）+ uo/vo 抖动

const f = Math.fround;
const SEED = 20261004;
const RND = 0.75;

type Inner = {
  tex: number;
  size: number;
  lifetime: number;
  age: number;
  rCol: number;
  gCol: number;
  bCol: number;
  gravity: number;
  oSize: number;
  uo: number;
  vo: number;
};
const inner = (p: object) => p as unknown as Inner;

/** 收粒子的监听器（LavaParticle 会往 level 里撒 smoke） */
class Recorder extends LevelListener {
  particles: Array<[string | number, number, number, number]> = [];
  override addParticle(
    name: string | number,
    x: number,
    y: number,
    z: number,
    _xa: number,
    _ya: number,
    _za: number,
    _data: number,
  ): void {
    this.particles.push([name, x, y, z]);
  }
}

let level: Level;

beforeAll(() => {
  createFlatLevel();
  initItems(); // BreakingItemParticle 要 Item.getIcon
});

beforeEach(() => {
  glSetContext(new GLES1(null));
  level = createFlatLevel();
  prepareLevel(level);
  Entity.sharedRandom.setSeed(SEED);
  vi.spyOn(Math, 'random').mockReturnValue(RND);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 同种子同参数下的裸 Particle —— 用来拿"基类算出来的 size"当参照 */
function baseParticle(xa: number, ya: number, za: number): Particle {
  Entity.sharedRandom.setSeed(SEED);
  return new Particle(level, 8.5, 70.5, 8.5, xa, ya, za);
}

/** 从 sharedRandom 流里跳过 `skip` 个，返回接下来 `count` 个 */
function draws(skip: number, count: number): number[] {
  const r = new Random(SEED);
  for (let i = 0; i < skip; i++) r.nextFloat();
  return Array.from({ length: count }, () => r.nextFloat());
}

describe('LavaParticle（E4）', () => {
  it('tex = 49、三通道全 1、noPhysics = false、oSize 存下来', () => {
    const p = new LavaParticle(level, 8.5, 70.5, 8.5);
    expect(inner(p).tex).toBe(49);
    expect([inner(p).rCol, inner(p).gCol, inner(p).bCol]).toEqual([1, 1, 1]);
    expect(p.noPhysics).toBe(false);
    expect(inner(p).oSize).toBe(inner(p).size);
  });

  it('getBrightness 恒为 1（岩浆粒子满亮）', () => {
    expect(new LavaParticle(level, 8.5, 70.5, 8.5).getBrightness(0)).toBe(1);
    expect(new LavaParticle(level, 8.5, 70.5, 8.5).getBrightness(99)).toBe(1);
  });

  it('yd 被下一句整个覆盖（前面那句 ×0.8f 白做）；size 乘 (rand*2 + 0.2f)', () => {
    // 基类吃掉前 4 个 sharedRandom，接着是 yd 那次、size 那次
    const d = draws(4, 2);
    // 参照物：同种子同参数的**裸 Particle**，拿它的 size（LavaParticle 的 size 在它之上乘）
    Entity.sharedRandom.setSeed(SEED);
    const base = new Particle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    Entity.sharedRandom.setSeed(SEED);
    const p = new LavaParticle(level, 8.5, 70.5, 8.5);
    expect(p.yd, 'yd 最终就是覆盖后的值，和前面那次 ×0.8f 无关').toBe(
      f(f(d[0]! * f(0.4)) + f(0.05)),
    );
    expect(inner(p).size).toBe(f(inner(base).size * f(f(d[1]! * 2) + f(0.2))));
  });

  it('⚠ lifetime 那句是 **double** 运算（16 / (r*0.8 + 0.2)，0.8/0.2 无 f 后缀）', () => {
    // 这个 r 是搜出来的：double 给 34、float 给 33，能把两种算法分开
    const r = 0.33823528944940673;
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(r);
    Entity.sharedRandom.setSeed(SEED);
    const p = new LavaParticle(level, 8.5, 70.5, 8.5);
    const dbl = Math.trunc(16 / (r * 0.8 + 0.2));
    const flt = Math.trunc(f(16 / f(f(r * f(0.8)) + f(0.2))));
    expect(dbl, '前提：这个 r 确实能分开两种算法').not.toBe(flt);
    expect(inner(p).lifetime).toBe(dbl);
  });

  it('tick：年轻时（odds 小）会往 level 里撒一颗 smoke，坐标是自己', () => {
    const rec = new Recorder();
    level.addListener(rec);
    const p = new LavaParticle(level, 8.5, 70.5, 8.5);
    p.noPhysics = true;
    inner(p).lifetime = 1000; // odds = 1/1000 → 几乎必然撒
    // ⚠ 撒粒子那句在 move() **之前**，所以传的是**移动前**的坐标
    const before = [p.x, p.y, p.z];
    p.tick();
    expect(rec.particles.length).toBe(1);
    expect(rec.particles[0]![0], 'C++ 传的是字符串 "smoke"').toBe('smoke');
    expect(rec.particles[0]!.slice(1)).toEqual(before);
    expect(p.x, '前提：这一刻它确实挪了').not.toBe(before[0]);
  });

  it('tick：odds ≥ 1（快死了）时一颗都不撒', () => {
    const rec = new Recorder();
    level.addListener(rec);
    const p = new LavaParticle(level, 8.5, 70.5, 8.5);
    p.noPhysics = true;
    inner(p).lifetime = 10;
    inner(p).age = 100; // age++ 之后 odds = 101/10 > 1
    p.tick();
    expect(rec.particles.length).toBe(0);
  });

  it('tick：yd -= 0.03f，阻力 0.999f（三个方向都乘）', () => {
    const p = new LavaParticle(level, 8.5, 70.5, 8.5);
    p.noPhysics = true;
    p.xd = f(1);
    p.yd = f(1);
    p.zd = f(1);
    inner(p).lifetime = 1000;
    p.tick();
    expect(p.xd).toBe(f(f(1) * f(0.999)));
    expect(p.yd).toBe(f(f(f(1) - f(0.03)) * f(0.999)));
    expect(p.zd).toBe(f(f(1) * f(0.999)));
  });

  it('render：size = oSize * (1 - s*s)，**没有 *0.5f 也不夹**', () => {
    const p = new LavaParticle(level, 8.5, 70.5, 8.5);
    const t = new Tesselator(64 * 36);
    inner(p).age = 1;
    inner(p).lifetime = 2;
    t.begin();
    p.render(t, 0, 1, 0, 0, 0, 1); // s = 0.5
    expect(inner(p).size).toBe(inner(p).oSize * (1 - 0.5 * 0.5));
    inner(p).age = 100;
    t.begin();
    p.render(t, 0, 1, 0, 0, 0, 1);
    expect(inner(p).size, '不夹的话会跑到负数').toBeLessThan(0);
  });
});

describe('TerrainParticle（E4）', () => {
  it('tex / gravity / 颜色 / 尺寸都从方块来', () => {
    const tile = Tile.snow;
    const p = new TerrainParticle(level, 8.5, 70.5, 8.5, 0, 0, 0, tile, 0);
    expect(inner(p).tex).toBe(tile.getTexture(2, 0));
    expect(inner(p).gravity).toBe(tile.gravity);
    expect([inner(p).rCol, inner(p).gCol, inner(p).bCol]).toEqual([f(0.6), f(0.6), f(0.6)]);
    // size 是"基类结果再除以 2" —— 拿裸 Particle 当参照物（不能拍脑袋写阈值）
    expect(inner(p).size).toBe(f(inner(baseParticle(0, 0, 0)).size / 2));
  });

  it('getParticleTexture 是 TERRAIN_TEXTURE(1) —— 碎屑贴 terrain.png', () => {
    const p = new TerrainParticle(level, 8.5, 70.5, 8.5, 0, 0, 0, Tile.snow, 0);
    expect(p.getParticleTexture()).toBe(1);
  });

  it('init() 乘方块颜色；**草方块直接返回、不乘**', () => {
    const dirt = Tile.dirt;
    const p = new TerrainParticle(level, 8.5, 70.5, 8.5, 0, 0, 0, dirt, 0);
    const before = { r: inner(p).rCol, g: inner(p).gCol, b: inner(p).bCol };
    expect(p.init(8, 70, 8)).toBe(p); // 返回 this，供链式
    const col = dirt.getColor(level, 8, 70, 8);
    expect(inner(p).rCol).toBe(f(before.r * f(((col >> 16) & 0xff) / f(255.0))));
    expect(inner(p).gCol).toBe(f(before.g * f(((col >> 8) & 0xff) / f(255.0))));
    expect(inner(p).bCol).toBe(f(before.b * f((col & 0xff) / f(255.0))));

    const grass = new TerrainParticle(level, 8.5, 70.5, 8.5, 0, 0, 0, Tile.grass, 0);
    const g0 = { r: inner(grass).rCol, g: inner(grass).gCol, b: inner(grass).bCol };
    expect(grass.init(8, 70, 8)).toBe(grass);
    expect([inner(grass).rCol, inner(grass).gCol, inner(grass).bCol]).toEqual([
      g0.r,
      g0.g,
      g0.b,
    ]);
  });

  it('render 的 UV 用 `tex & 15` / `tex >> 4` 取格号，再加 uo/vo 的 1/4 抖动', () => {
    const t = new Tesselator(64 * 36);
    const p = new TerrainParticle(level, 8.5, 70.5, 8.5, 0, 0, 0, Tile.snow, 0);
    p.x = p.xo = 0;
    p.y = p.yo = 0;
    p.z = p.zo = 0;
    inner(p).size = 1;
    inner(p).tex = 33; // 33 = 第 2 行第 1 格（33 & 15 = 1，33 >> 4 = 2）
    inner(p).uo = f(4.0); // 抖动正好一格 → u0 = (1 + 4/4)/16 = 2/16
    inner(p).vo = f(0);
    t.begin();
    p.render(t, 1, 1, 0, 0, 0, 1);
    const v = t._vertexForTest(0).slice(3, 5); // 第一个顶点用 (u0, v1)
    expect(v[0]).toBe(f(((33 & 15) + f(4.0) / f(4.0)) / f(16.0)));
    expect(v[1]).toBe(f(f(((33 >> 4) + 0 / f(4.0)) / f(16.0)) + f(0.999) / f(16.0) / 4));
  });

  it('⚠ 顶点顺序和基类不同：第一个顶点是 (u0, v1) 而不是 (u1, v1)', () => {
    const t = new Tesselator(64 * 36);
    const p = new TerrainParticle(level, 8.5, 70.5, 8.5, 0, 0, 0, Tile.snow, 0);
    inner(p).tex = 0;
    inner(p).uo = f(0);
    inner(p).vo = f(0);
    t.begin();
    p.render(t, 1, 1, 0, 0, 0, 1);
    const v0 = t._vertexForTest(0).slice(3, 5);
    const v2 = t._vertexForTest(2).slice(3, 5);
    expect(v0[0], '左下角是 u0（基类那边是 u1）').toBe(0);
    expect(v2[0], '右上角是 u1').toBe(f(f(0.999) / f(16.0) / 4));
    expect(v0[1]!).toBeGreaterThan(v2[1]!);
  });
});

describe('BreakingItemParticle（E4）', () => {
  it('四参构造：tex = item.getIcon(0)，gravity 取的是**雪**的，size 减半', () => {
    const item = Item.snowBall;
    const p = new BreakingItemParticle(level, 8.5, 70.5, 8.5, item);
    expect(inner(p).tex).toBe(item.getIcon(0));
    expect(inner(p).gravity).toBe(Tile.snow.gravity);
    expect(inner(p).size).toBe(f(inner(baseParticle(0, 0, 0)).size / 2));
    expect([inner(p).rCol, inner(p).gCol, inner(p).bCol]).toEqual([1, 1, 1]);
  });

  it('getParticleTexture 是 ITEM_TEXTURE(2) —— 碎屑贴 gui/items.png', () => {
    const p = new BreakingItemParticle(level, 8.5, 70.5, 8.5, Item.snowBall);
    expect(p.getParticleTexture()).toBe(2);
  });

  it('七参构造在 _init 之后还要 ×0.1f 再加形参', () => {
    // 两个构造都 `super(...,0,0,0)`，所以基类初速一样；拿四参那个当参照
    Entity.sharedRandom.setSeed(SEED);
    const base = new BreakingItemParticle(level, 8.5, 70.5, 8.5, Item.snowBall);
    Entity.sharedRandom.setSeed(SEED);
    const p = new BreakingItemParticle(level, 8.5, 70.5, 8.5, f(0.5), f(0.25), f(-0.5), Item.snowBall);
    expect(p.xd).toBe(f(f(base.xd * f(0.1)) + f(0.5)));
    expect(p.yd).toBe(f(f(base.yd * f(0.1)) + f(0.25)));
    expect(p.zd).toBe(f(f(base.zd * f(0.1)) + f(-0.5)));
  });

  it('render 的 UV 用 `tex % 16` / `tex / 16`（**整数除法**）加 uo/vo 抖动', () => {
    const t = new Tesselator(64 * 36);
    const p = new BreakingItemParticle(level, 8.5, 70.5, 8.5, Item.snowBall);
    p.x = p.xo = 0;
    p.y = p.yo = 0;
    p.z = p.zo = 0;
    inner(p).size = 1;
    inner(p).tex = 33;
    inner(p).uo = f(4.0);
    inner(p).vo = f(0);
    t.begin();
    p.render(t, 1, 1, 0, 0, 0, 1);
    const v0 = t._vertexForTest(0).slice(3, 5);
    expect(v0[0]).toBe(f(((33 % 16) + f(4.0) / f(4.0)) / f(16.0)));
    expect(v0[1]).toBe(f(f((Math.trunc(33 / 16) + 0 / f(4.0)) / f(16.0)) + f(0.999) / f(16.0) / 4));
  });

  it('四参构造的 render 里，顶点顺序也是 (u0, v1) 打头（和 TerrainParticle 一致）', () => {
    const t = new Tesselator(64 * 36);
    const p = new BreakingItemParticle(level, 8.5, 70.5, 8.5, Item.snowBall);
    inner(p).tex = 0;
    inner(p).uo = f(0);
    inner(p).vo = f(0);
    t.begin();
    p.render(t, 1, 1, 0, 0, 0, 1);
    expect(t._vertexForTest(0).slice(3, 5)[0], '左下角是 u0').toBe(0);
    expect(t._vertexForTest(2).slice(3, 5)[0], '右上角是 u1').toBe(f(f(0.999) / f(16.0) / 4));
  });
});
