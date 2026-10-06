import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockMthRandom } from '../../helpers/mthRandom';
import { Random } from '@mcpe/util';
import { Entity, type Level } from '@mcpe/world';
import {
  ExplodeParticle,
  GLES1,
  Particle,
  RedDustParticle,
  SmokeParticle,
  Tesselator,
  glSetContext,
} from '@mcpe/client';
import { createFlatLevel } from '../../helpers/headlessLevel';

// E2：三个共用 `tex = 7 - age * 8 / lifetime` 的粒子 —— SmokeParticle（69 行）、
// ExplodeParticle（51 行）、RedDustParticle（73 行）。
//
// 【怎么断言的】构造函数里基类先吃掉了 5 次 `Mth::random()` 和 4 次 `sharedRandom`，
// 子类再在结果上动手脚。与其在测试里把基类那串公式**抄第二遍**（抄错了测试和实现就一起错），
// 不如**先造一个裸 `Particle` 当参照物**：同一组随机数喂进去，拿到基类的 xd/size，
// 再断言子类对它做了什么。参照物用的是 E1 已经钉过的实现。
//
// 【三个"藏得深"的差异，各有一条测试盯着】
//   - RedDust 的 lifetime 那句 `0.8`/`0.2` **没有 f 后缀** → 是 double 运算；
//   - RedDust 的 tick 里**没有** `yd += 0.004f`（Smoke/Explode 有）；
//   - `tex` 那句是**整数除法**，用 age=1/lifetime=3 这种能区分开的值来钉。

const f = Math.fround;
const SEED = 20261004;

type Inner = {
  tex: number;
  size: number;
  lifetime: number;
  age: number;
  rCol: number;
  gCol: number;
  bCol: number;
};
const inner = (p: Particle) => p as unknown as Inner;

let level: Level;

beforeEach(() => {
  glSetContext(new GLES1(null));
  level = createFlatLevel();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 同一组随机数下的**裸 Particle**，当基类结果的参照物 */
function reference(rnd: number): Particle {
  Entity.sharedRandom.setSeed(SEED);
  mockMthRandom(rnd);
  return new Particle(level, 8.5, 70.5, 8.5, 0, 0, 0);
}

function resetRandom(rnd: number): void {
  Entity.sharedRandom.setSeed(SEED);
  mockMthRandom(rnd);
}

describe('SmokeParticle（E2）', () => {
  it('基类收全 0 速度，然后 ×0.1f 再把形参加上去 —— 不是直接把形参传进去', () => {
    const base = reference(0.75);
    resetRandom(0.75);
    const s = new SmokeParticle(level, 8.5, 70.5, 8.5, f(0.3), f(-0.2), f(0.1));
    expect(s.xd).toBe(f(f(base.xd * f(0.1)) + f(0.3)));
    expect(s.yd).toBe(f(f(base.yd * f(0.1)) + f(-0.2)));
    expect(s.zd).toBe(f(f(base.zd * f(0.1)) + f(0.1)));
  });

  it('size：基类结果 ×0.75f ×scale，oSize 存下来给 render 用', () => {
    const base = reference(0.75);
    resetRandom(0.75);
    const s = new SmokeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0, f(2.5)); // largesmoke
    expect(inner(s).size).toBe(f(f(inner(base).size * f(0.75)) * f(2.5)));
    expect(s.oSize, 'oSize 就是那一步之后的 size').toBe(inner(s).size);
  });

  it('scale 默认 1.0f（不传就是普通烟雾）', () => {
    const base = reference(0.75);
    resetRandom(0.75);
    const s = new SmokeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(s).size).toBe(f(f(inner(base).size * f(0.75)) * f(1.0)));
  });

  it('lifetime = (int)(scale * 8.0f / (r * 0.8f + 0.2f))，r 走 **Mth::random()**（不是 sharedRandom）', () => {
    const r = 0.75; // Math.random 定死
    resetRandom(r);
    const s = new SmokeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0, f(2.0));
    // scale=2 → 16 / (0.5*0.8f + 0.2f) = 16/0.6f ≈ 26.67 → 26
    expect(inner(s).lifetime).toBe(
      Math.trunc(f(f(f(2.0) * f(8.0)) / f(f(r * f(0.8)) + f(0.2)))),
    );
    expect(inner(s).lifetime, '手算：16 / 0.8f ≈ 19.9999994 截断').toBe(20);
  });

  it('tick：tex = 7 - age * 8 / lifetime 是**整数除法**（age=2, lifetime=3 → tex=2，不是 1.67）', () => {
    resetRandom(0.75);
    const s = new SmokeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    s.noPhysics = true;
    inner(s).age = 1; // tick 里 age++ 之后是 2
    inner(s).lifetime = 3;
    s.tick();
    // 2*8/3：整数除法 = 5 → tex = 2；浮点除法 = 5.333… → tex = 1.67（会被看出区别）
    expect(inner(s).tex).toBe(2);
  });

  it('tick：yd += 0.004f（**没有重力**），然后再吃 0.96f 阻力', () => {
    resetRandom(0.75);
    const s = new SmokeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    s.noPhysics = true;
    s.yd = f(0);
    s.tick();
    expect(s.yd).toBe(f(f(f(0) + f(0.004)) * f(0.96)));
  });

  it('tick：y 没动过（y === yo）时 xd/zd 会 ×1.1f 散开', () => {
    resetRandom(0.75);
    const s = new SmokeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    s.noPhysics = true;
    s.xd = f(1);
    s.zd = f(1);
    // ⚠ tick 会先 `yd += 0.004f` 再 move()，所以想让 y 一动不动，
    //   得把 yd 设成 **-0.004f**（+0.004f 之后恰好是 0），不是 0
    s.yd = f(-0.004);
    s.tick();
    expect(s.y, '前提：这一步 y 确实没动').toBe(s.yo);
    expect(s.xd, '先 ×1.1f 再 ×0.96f，每次乘法都过 f()').toBe(f(f(f(1) * f(1.1)) * f(0.96)));
    expect(s.zd).toBe(f(f(f(1) * f(1.1)) * f(0.96)));
  });

  it('render：size = oSize * l，l 夹在 [0,1]（这是**渲染改状态**，照抄）', () => {
    resetRandom(0.75);
    const s = new SmokeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    const t = new Tesselator(64 * 36);
    // age 远大于 lifetime → l 会被夹到 1
    inner(s).lifetime = 1;
    inner(s).age = 100;
    t.begin();
    s.render(t, 1, 1, 0, 0, 0, 1);
    expect(inner(s).size).toBe(s.oSize * 1);
    // a 为负 → l 夹到 0
    t.begin();
    s.render(t, -1000, 1, 0, 0, 0, 1);
    expect(inner(s).size).toBe(s.oSize * 0);
  });
});

describe('ExplodeParticle（E2）', () => {
  it('速度用**形参**重算一遍（不是 this->xd），抖动幅度是 0.05f', () => {
    resetRandom(0.75);
    const e = new ExplodeParticle(level, 8.5, 70.5, 8.5, f(0.5), f(0.25), f(-0.5));
    const jitter = f(f(f(0.75 * f(2.0)) - f(1.0)) * f(0.05));
    expect(e.xd).toBe(f(f(0.5) + jitter));
    expect(e.yd).toBe(f(f(0.25) + jitter));
    expect(e.zd).toBe(f(f(-0.5) + jitter));
  });

  it('size 是**两次** nextFloat 相乘 ×6.0f +1.0f（少抽一次后面全错位）', () => {
    const replay = new Random(SEED);
    replay.nextFloat();
    replay.nextFloat();
    replay.nextFloat();
    replay.nextFloat(); // 基类那 4 次
    replay.nextFloat(); // 颜色 r=g=b 一次
    const a = replay.nextFloat();
    const b = replay.nextFloat();

    resetRandom(0.75);
    const e = new ExplodeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(e).size).toBe(f(f(a * b * f(6.0)) + f(1.0)));
  });

  it('lifetime = (int)(16.0f/(r*0.8f+0.2f)) **+ 2**（+2 在截断之后）', () => {
    const replay = new Random(SEED);
    for (let i = 0; i < 4; i++) replay.nextFloat();
    replay.nextFloat(); // 颜色
    replay.nextFloat();
    replay.nextFloat(); // size 的两次
    const r = replay.nextFloat();

    resetRandom(0.75);
    const e = new ExplodeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    expect(inner(e).lifetime).toBe(
      Math.trunc(f(f(16.0) / f(f(r * f(0.8)) + f(0.2)))) + 2,
    );
  });

  it('tick：阻力是 0.90f（不是烟的 0.96f），yd 一样 +0.004f', () => {
    resetRandom(0.75);
    const e = new ExplodeParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    e.noPhysics = true;
    e.xd = f(1);
    e.yd = f(0);
    e.tick();
    expect(e.xd).toBe(f(f(1) * f(0.9)));
    expect(e.yd).toBe(f(f(f(0) + f(0.004)) * f(0.9)));
  });
});

describe('RedDustParticle（E2）', () => {
  it('形参 rCol == 0 时按 1 算（判的是**形参**不是成员）', () => {
    resetRandom(0.75);
    const d = new RedDustParticle(level, 8.5, 70.5, 8.5, 0, 0, 0);
    // 全 0 的输入被换成 (1, 0, 0)，所以仍然只有红通道有值：g/b 的系数是 0 → 结果 0
    resetRandom(0.75);
    const d2 = new RedDustParticle(level, 8.5, 70.5, 8.5, 1, 0, 0);
    expect(inner(d).rCol).toBe(inner(d2).rCol);
    expect(inner(d).gCol).toBe(0);
    expect(inner(d).bCol).toBe(0);
  });

  it('颜色 = (random*0.2f + 0.8f) * 分量 * brr，brr = random*0.4f + 0.6f（全走 Mth::random）', () => {
    // 这条路一次 sharedRandom 都不用，所以 Math.random 定死后四个系数都能手算
    const brr = f(f(f(0.75) * f(0.4)) + f(0.6)); // 第一次 Mth::random 是 brr
    const kR = f(f(f(0.75) * f(0.2)) + f(0.8)); // 后三次是三个通道的系数（定死所以全相等）

    resetRandom(0.75);
    const d = new RedDustParticle(level, 8.5, 70.5, 8.5, f(0.2), f(0.4), f(0.6));
    expect(inner(d).rCol).toBe(f(f(kR * f(0.2)) * brr));
    expect(inner(d).gCol).toBe(f(f(kR * f(0.4)) * brr));
    expect(inner(d).bCol).toBe(f(f(kR * f(0.6)) * brr));
  });

  it('⚠ lifetime 那一句是 **double** 运算（C++ 的 0.8 / 0.2 没有 f 后缀）', () => {
    // ⚠ 这个 r 不是随便挑的：绝大多数取值下 float 版和 double 版**结果相同**，
    //   这条断言就钉不住任何东西（第一版拿 0.5 试，两边都是 13，等于没测）。
    //   这个值是搜出来的 —— double 给 10，float 给 11，能把两种算法分开。
    const r = 0.6590909191166341;
    resetRandom(r);
    const d = new RedDustParticle(level, 8.5, 70.5, 8.5, f(1), f(1), f(1));
    const dbl = Math.trunc(8 / (r * 0.8 + 0.2));
    const flt = Math.trunc(f(8 / f(f(r * f(0.8)) + f(0.2))));
    expect(dbl, '前提：这个 r 确实能分开两种算法').not.toBe(flt);
    expect(inner(d).lifetime, 'C++ 是 double 那一支').toBe(dbl);
    expect(inner(d).lifetime).toBe(10);
  });

  it('⚠ tick 里**没有** `yd += 0.004f`（和 Smoke/Explode 不一样）', () => {
    resetRandom(0.75);
    const d = new RedDustParticle(level, 8.5, 70.5, 8.5, f(1), f(1), f(1));
    d.noPhysics = true;
    d.yd = f(0);
    d.tick();
    expect(d.yd, '只剩阻力，没有 +0.004f').toBe(f(f(0) * f(0.96)));
  });

  it('tick 的阻力是 0.96f，tex 走同一套整数除法', () => {
    resetRandom(0.75);
    const d = new RedDustParticle(level, 8.5, 70.5, 8.5, f(1), f(1), f(1));
    d.noPhysics = true;
    d.xd = f(1);
    inner(d).age = 1;
    inner(d).lifetime = 3;
    d.tick();
    expect(d.xd).toBe(f(f(1) * f(0.96)));
    expect(inner(d).tex).toBe(2);
  });

  it('size 走和 SmokeParticle 一样的 ×0.75f ×scale，并记进 oSize', () => {
    const base = reference(0.75);
    resetRandom(0.75);
    const d = new RedDustParticle(level, 8.5, 70.5, 8.5, f(1), f(1), f(1), f(4.0));
    expect(inner(d).size).toBe(f(f(inner(base).size * f(0.75)) * f(4.0)));
    expect(d.oSize).toBe(inner(d).size);
  });
});
