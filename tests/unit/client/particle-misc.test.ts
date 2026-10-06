import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockMthRandom } from '../../helpers/mthRandom';
import { Random } from '@mcpe/util';
import { Entity, Material, type Level } from '@mcpe/world';
import {
  BubbleParticle,
  CritParticle2,
  FlameParticle,
  GLES1,
  Particle,
  Tesselator,
  glSetContext,
} from '@mcpe/client';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// E3：三个"不靠 Tile/Item"的粒子 —— FlameParticle（73 行）、CritParticle2（74）、BubbleParticle（51）。
//
// 【⚠ 随机值一律用 0.75，不要用 0.5】0.5 会让基类的抖动恰好为 0 →
// `mul = 0.4f*speed/0` → NaN，而 NaN 之间用 `toBe` 是相等的，断言会静默失效。
// 详见 particle.test.ts 里 `make()` 的注释。
//
// 【参照物手法】同上一个文件：先造裸 `Particle` 拿基类结果，再断言子类对它做了什么。

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
  oSize: number;
  visible: boolean;
};
const inner = (p: Particle) => p as unknown as Inner;

let level: Level;

beforeEach(() => {
  glSetContext(new GLES1(null));
  level = createFlatLevel();
  prepareLevel(level);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function resetRandom(rnd = RND): void {
  Entity.sharedRandom.setSeed(SEED);
  mockMthRandom(rnd);
}

/**
 * 同随机数下的裸 Particle，当基类结果的参照物。
 * ⚠ **速度必须和被测子类传进 super 的一样** —— 基类的 `mul = 0.4f*speed/dd`
 * 依赖速度大小，传 0 得到的 base.xd 不是子类内部那个（踩过）。
 */
function reference(xa = 0, ya = 0, za = 0): Particle {
  resetRandom();
  return new Particle(level, 8.5, 70.5, 8.5, xa, ya, za);
}

/** 从 sharedRandom 流里跳过 `skip` 个，返回接下来的 `count` 个 */
function draws(skip: number, count: number): number[] {
  const r = new Random(SEED);
  for (let i = 0; i < skip; i++) r.nextFloat();
  return Array.from({ length: count }, () => r.nextFloat());
}

describe('FlameParticle（E3）', () => {
  it('tex = 48、三通道全 1、noPhysics = true（火苗不撞地形）', () => {
    resetRandom();
    const p = new FlameParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(p).tex).toBe(48);
    expect([inner(p).rCol, inner(p).gCol, inner(p).bCol]).toEqual([1, 1, 1]);
    expect(p.noPhysics).toBe(true);
  });

  it('oSize 存的是**基类算出来的** size（火苗不缩放）', () => {
    const base = reference();
    resetRandom();
    const p = new FlameParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(p).oSize).toBe(inner(base).size);
    expect(inner(p).size).toBe(inner(base).size);
  });

  it('lifetime = (int)(8.0f/(r*0.8f+0.2f)) **+ 4**', () => {
    // 构造期 Mth::random 的调用顺序：基类 5 次（3 抖动 + 2 speed），然后就是这一次
    resetRandom();
    const p = new FlameParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    const r = RND;
    expect(inner(p).lifetime).toBe(Math.trunc(f(f(8.0) / f(f(r * f(0.8)) + f(0.2)))) + 4);
    expect(inner(p).lifetime).toBeGreaterThanOrEqual(4);
  });

  it('速度 = 基类速度 ×0.01f，再加形参', () => {
    const base = reference(f(0.5), f(0.25), f(-0.5)); // ⚠ Flame 把形参原样传给了 super
    resetRandom();
    const p = new FlameParticle(level, 8.5, 70.5, 8.5, f(0.5), f(0.25), f(-0.5));
    expect(p.xd).toBe(f(f(base.xd * f(0.01)) + f(0.5)));
    expect(p.yd).toBe(f(f(base.yd * f(0.01)) + f(0.25)));
    expect(p.zd).toBe(f(f(base.zd * f(0.01)) + f(-0.5)));
  });

  it('⚠ 构造里直接改 x/y/z **不重设碰撞盒**（抽 6 个 sharedRandom，每轴两次相减）', () => {
    // 基类吃掉前 4 个，接着 6 个是 x/y/z 的抖动
    const d = draws(4, 6);
    resetRandom();
    const p = new FlameParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(p.x).toBe(f(8.5 + f(f(d[0]! - d[1]!) * f(0.05))));
    expect(p.y).toBe(f(70.5 + f(f(d[2]! - d[3]!) * f(0.05))));
    expect(p.z).toBe(f(8.5 + f(f(d[4]! - d[5]!) * f(0.05))));
    // 碰撞盒还停在 setPos 时那个位置 —— 这是 C++ 的行为，不是 bug
    expect(p.bb.x0 + p.bbWidth / 2).not.toBe(p.x);
  });

  it('getBrightness 恒为 1.0f（火苗永远满亮，覆盖了 Entity 的实现）', () => {
    resetRandom();
    const p = new FlameParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(p.getBrightness(0)).toBe(1);
    expect(p.getBrightness(123)).toBe(1);
  });

  it('render：size = oSize * (1 - s*s*0.5f)，**不夹** [0,1]', () => {
    resetRandom();
    const p = new FlameParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    const t = new Tesselator(64 * 36);
    inner(p).age = 1;
    inner(p).lifetime = 2;
    t.begin();
    p.render(t, 0, 1, 0, 0, 0, 1); // s = (1+0)/2 = 0.5
    expect(inner(p).size).toBe(inner(p).oSize * (1 - 0.5 * 0.5 * f(0.5)));
    // s > 1 时不夹：age 很大 → size 变负
    inner(p).age = 100;
    t.begin();
    p.render(t, 0, 1, 0, 0, 0, 1);
    expect(inner(p).size, '不夹的话会跑到负数去').toBeLessThan(0);
  });
});

describe('CritParticle2（E3）', () => {
  it('⚠ 构造函数末尾那句 tick() 调的是**本类**的 tick（构造完 age 已经是 1）', () => {
    resetRandom();
    const p = new CritParticle2(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(p).age, '跑过一次 tick 才会是 1').toBe(1);
  });

  it('构造末尾那次 tick 已经把 gCol ×0.96f、bCol ×0.9f 各衰减过一次', () => {
    resetRandom();
    const p = new CritParticle2(level, 8.5, 70.5, 8.5, 0, 0, 0);
    const c = f(f(MthRandomValue() * f(0.3)) + f(0.6));
    expect(inner(p).rCol, '红通道 tick 里不动').toBe(c);
    expect(inner(p).gCol).toBe(f(c * f(0.96)));
    expect(inner(p).bCol).toBe(f(c * f(0.9)));
  });

  it('tex = 16 * 4 + 1（= 65），noPhysics = false', () => {
    resetRandom();
    const p = new CritParticle2(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(p).tex).toBe(65);
    expect(p.noPhysics).toBe(false);
  });

  it('速度：基类结果 ×0.1f，再加 形参 ×0.4f', () => {
    const base = reference();
    resetRandom();
    const p = new CritParticle2(level, 8.5, 70.5, 8.5, f(1), f(2), f(-1));
    // ⚠ 构造末尾跑过一次 tick，xd/yd/zd 已经被 ×0.7f（yd 还减了 0.02f）
    const xd0 = f(f(base.xd * f(0.1)) + f(f(1) * f(0.4)));
    const yd0 = f(f(base.yd * f(0.1)) + f(f(2) * f(0.4)));
    expect(p.xd).toBe(f(xd0 * f(0.7)));
    expect(p.yd).toBe(f(f(yd0 * f(0.7)) - f(0.02)));
  });

  it('lifetime = (int)(6 / (r*0.8f + 0.6f) * scale) —— float 除法，**不是**整数除法', () => {
    // ⚠ r 走的是 `Mth::random()`（= Math.random），**不是** sharedRandom ——
    //   所以这条路一次 sharedRandom 都不额外抽（基类的 4 次之后就没有了）
    resetRandom();
    const p = new CritParticle2(level, 8.5, 70.5, 8.5, 0, 0, 0, f(2.0));
    const r = RND;
    expect(inner(p).lifetime).toBe(Math.trunc(f(f(6 / f(f(r * f(0.8)) + f(0.6))) * f(2.0))));
    expect(inner(p).lifetime, '手算：6 / 1.2f = 5，再 ×2 → 10').toBe(10);
    // 反面对照：写成整数除法 `6 / (int)(...)` 会先得到 6，再 ×2 = 12（不一样，所以这条钉得住）
    expect(Math.trunc(f(6 / Math.trunc(f(f(r * f(0.8)) + f(0.6))) * f(2.0)))).toBe(12);
  });

  it('tick：阻力 0.7f（不是基类的 0.98f），然后 yd -= 0.02f', () => {
    resetRandom();
    const p = new CritParticle2(level, 8.5, 70.5, 8.5, 0, 0, 0);
    p.xd = f(1);
    p.yd = f(1);
    inner(p).age = 0;
    p.noPhysics = true;
    p.tick();
    expect(p.xd).toBe(f(f(1) * f(0.7)));
    expect(p.yd).toBe(f(f(f(1) * f(0.7)) - f(0.02)));
  });
});

/** 构造期那一次 `Mth::random()` 的值（Math.random 被定死成 RND） */
function MthRandomValue(): number {
  return RND;
}

describe('BubbleParticle（E3）', () => {
  it('tex = 32、三通道全 1、碰撞盒缩到 0.02f', () => {
    resetRandom();
    const p = new BubbleParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(p).tex).toBe(32);
    expect([inner(p).rCol, inner(p).gCol, inner(p).bCol]).toEqual([1, 1, 1]);
    expect(p.bbWidth).toBe(f(0.02));
    expect(p.bbHeight).toBe(f(0.02));
  });

  it('size 再乘一个 (rand*0.6f + 0.2f)', () => {
    const base = reference();
    const d = draws(4, 1);
    resetRandom();
    const p = new BubbleParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(p).size).toBe(f(inner(base).size * f(d[0]! * f(0.6) + f(0.2))));
  });

  it('速度 = 形参 ×0.2f + 抖动（抖动幅度 0.02f）', () => {
    resetRandom();
    const p = new BubbleParticle(level, 8.5, 70.5, 8.5, f(1), f(-1), f(0.5));
    const j = f(f(f(RND * 2) - 1) * f(0.02));
    expect(p.xd).toBe(f(f(f(1) * f(0.2)) + j));
    expect(p.yd).toBe(f(f(f(-1) * f(0.2)) + j));
    expect(p.zd).toBe(f(f(f(0.5) * f(0.2)) + j));
  });

  it('⚠ lifetime 那句是 **double** 运算（和 RedDustParticle 同款），且这个 r 能区分开', () => {
    const r = 0.6590909191166341; // 搜出来的：double 给 10、float 给 11
    resetRandom(r);
    const p = new BubbleParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    const dbl = Math.trunc(8 / (r * 0.8 + 0.2));
    const flt = Math.trunc(f(8 / f(f(r * f(0.8)) + f(0.2))));
    expect(dbl).not.toBe(flt);
    expect(inner(p).lifetime).toBe(dbl);
  });

  it('tick：`yd += 0.002f` → 阻力 0.85f（xd/yd/zd 三个都乘）', () => {
    resetRandom();
    const p = new BubbleParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    p.noPhysics = true; // 别让 move() 撞地形
    p.xd = f(1);
    p.yd = f(0);
    p.zd = f(1);
    p.tick();
    // ⚠ 三个方向都要给非 0 初值才测得出来 —— 0 × 0.85 和 0 × 0.96 都是 0
    expect(p.xd).toBe(f(f(1) * f(0.85)));
    expect(p.yd).toBe(f(f(f(0) + f(0.002)) * f(0.85)));
    expect(p.zd).toBe(f(f(1) * f(0.85)));
    // 平地 demo 世界在 y=70.5 是空气 → 材质不是水 → 移除
    expect(p.removed, '气泡离开水就死，这是它的主要死法').toBe(true);
  });

  it('⚠ 寿命用 `lifetime-- <= 0`（后置递减）：lifetime=1 的那一刻**不该**死', () => {
    resetRandom();
    const p = new BubbleParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    p.noPhysics = true;
    // ⚠ 必须把"不是水就 remove"那条挡住，否则它先动手、removed 恒为 true，
    //   下面这条断言就废了（第一版就是这么写废的）
    vi.spyOn(level, 'getMaterial').mockReturnValue(Material.water);
    inner(p).lifetime = 1;
    p.tick();
    expect(inner(p).lifetime, '1 判完（不 ≤0）再减成 0').toBe(0);
    expect(p.removed, '后置递减 → 这一刻还活着；写成 --lifetime 这里就死了').toBe(false);
    // 再跑一刻：0 <= 0 成立 → 死
    p.tick();
    expect(inner(p).lifetime).toBe(-1);
    expect(p.removed).toBe(true);
    expect(inner(p).age, '这条路从不碰 age').toBe(0);
  });
});
