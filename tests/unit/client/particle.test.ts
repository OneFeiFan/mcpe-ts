import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockMthRandom } from '../../helpers/mthRandom';
import { Random } from '@mcpe/util';
import { CompoundTag } from '@mcpe/nbt';
import { Entity, type Level } from '@mcpe/world';
import { GLES1, Particle, Tesselator, glSetContext } from '@mcpe/client';
import { createFlatLevel } from '../../helpers/headlessLevel';

// E1：`Particle` 基类（C++ Particle.h 46 行 + Particle.cpp 99 行）。
//
// 【这个文件钉什么】构造函数那串初速度公式（含两个随机源的**用量与顺序**）、
// tick 的重力/阻力/生命周期、render 的 4 个顶点与 UV，以及四条"照抄"的性质：
// tick 不调 super、getEntityTypeId 恒为 0、getParticleTexture 恒为 MISC、NBT 方法是空的。
//
// 【两个随机源怎么分开控制】
//   - 初速度抖动用 `Mth::random()` → TS 就是 `Math.random()`，用 `vi.spyOn` 定死；
//   - `uo/vo/size/lifetime` 用 `Entity.sharedRandom`，`setSeed` 定死，再拿一个**同种子的新
//     `Random` 回放**，钉住"抽了 4 次、按 uo, vo, size, lifetime 这个顺序"。
//
// 【浮点两档】构造函数 / tick / setPower / scale 是物理，每个运算都过 `f()`，
// 所以断言里也逐字写 `f()`；render 是画面（第三档），C++ 没逐步 fround，断言里也不写。
//
// 【tick 的测试都开 `noPhysics`】这样 `move()` 只挪 AABB、不去问地形要碰撞，
// 免得测速度公式时被下沉/着地干扰。

const f = Math.fround;

/** 拿 protected 字段来看（只读用途） */
type ParticleInternals = {
  tex: number;
  uo: number;
  vo: number;
  age: number;
  lifetime: number;
  size: number;
  gravity: number;
  rCol: number;
  gCol: number;
  bCol: number;
  makeStepSound: boolean;
};
function inner(p: Particle): ParticleInternals {
  return p as unknown as ParticleInternals;
}

let level: Level;

beforeEach(() => {
  glSetContext(new GLES1(null)); // 无头 GL：Tesselator 要它
  level = createFlatLevel();
  Entity.sharedRandom.setSeed(20261004);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 固定 `Mth.random()`（= Math.random）造一颗粒子。
 *
 * ⚠ **别把 rnd 取成 0.5**：那时抖动 `(rnd*2-1)*0.4f` 恰好是 0，
 * 三个方向的速度全为 0 → `dd = 0` → `mul = 0.4f*speed/0 = Infinity` → `0 * Infinity = NaN`，
 * 于是 xd/yd/zd 全是 **NaN**（C++ 同样如此，除法没有保护）。
 * NaN 之间用 `toBe`（Object.is）**是相等的**，断言会静默变成"什么都没测"
 * —— 写 E2 时就是这么栽的：一条"漏掉 *0.1f"的变异没让测试变红。
 */
function make(rnd: number, xa = 0, ya = 0, za = 0): Particle {
  mockMthRandom(rnd);
  return new Particle(level, 8.5, 70.5, 8.5, xa, ya, za);
}

describe('Particle 构造（E1）', () => {
  it('setSize(0.2f, 0.2f) 之后 heightOffset = bbHeight / 2.0f', () => {
    const p = make(0.5);
    expect(p.bbWidth).toBe(f(0.2));
    expect(p.bbHeight).toBe(f(0.2));
    expect(p.heightOffset).toBe(f(f(0.2) / f(2.0)));
  });

  it('成员初始化列表：age/gravity = 0，rCol/gCol/bCol = 1，tex = 0', () => {
    const p = inner(make(0.5));
    expect(p.age).toBe(0);
    expect(p.gravity).toBe(0);
    expect(p.rCol).toBe(1);
    expect(p.gCol).toBe(1);
    expect(p.bCol).toBe(1);
    expect(p.tex).toBe(0);
  });

  it('makeStepSound = false（粒子不触发脚步声）', () => {
    expect(inner(make(0.5)).makeStepSound).toBe(false);
  });

  it('初速度：抖动 + speed/dd 缩放，只有 yd 多 0.1f', () => {
    const rnd = 0.75;
    const p = make(rnd);

    // 抖动 = (float)(Mth::random() * 2 - 1) * 0.4f；rnd=0.75 时手算 = 0.5 * 0.4f
    const jitter = f(f(0.5) * f(0.4));
    expect(jitter, 'rnd=0.75 → (0.5*2-1)*0.4f').toBe(f(f(f(rnd * 2) - 1) * f(0.4)));

    const speed = f(f(rnd + rnd + 1) * f(0.15));
    const dd = f(Math.sqrt(f(f(f(jitter * jitter) + f(jitter * jitter)) + f(jitter * jitter))));
    const mul = f(f(f(0.4) * speed) / dd);

    expect(p.xd).toBe(f(jitter * mul));
    expect(p.zd).toBe(f(jitter * mul));
    expect(p.yd).toBe(f(f(jitter * mul) + f(0.1)));
    // 三条手算得出的（不依赖上面那几个中间量）：
    expect(p.xd, 'xa=za=0 且三个抖动相同 → 两个方向分量逐位相等').toBe(p.zd);
    expect(f(p.yd - p.zd), '只有 yd 多了一个 f(0.1)，逐位减回来必须是它').toBe(f(0.1));
    expect(p.xd, '抖动是正的 → 速度方向也跟着为正').toBeGreaterThan(0);
  });

  it('初速度：xa/ya/za 参与计算（给定 +x 速度后 xd 明显更大）', () => {
    const rnd = 0.75;
    const jitter = f(f(0.5) * f(0.4));
    const speed = f(f(rnd + rnd + 1) * f(0.15));
    const xd0 = f(1 + jitter);
    const dd = f(Math.sqrt(f(f(f(xd0 * xd0) + f(jitter * jitter)) + f(jitter * jitter))));
    const mul = f(f(f(0.4) * speed) / dd);

    const withX = make(rnd, 1, 0, 0);
    const without = make(rnd, 0, 0, 0);
    expect(withX.xd).toBe(f(xd0 * mul));
    expect(withX.yd).toBe(f(f(jitter * mul) + f(0.1)));
    expect(withX.xd).toBeGreaterThan(without.xd);
  });

  it('uo/vo/size/lifetime 走 sharedRandom，恰好抽 4 次、顺序是 uo → vo → size → lifetime', () => {
    const p = make(0.5);

    // 同种子的新 Random 回放：前 4 个 nextFloat 就该是粒子抽走的那 4 个
    const replay = new Random(20261004);
    const uoR = replay.nextFloat();
    const voR = replay.nextFloat();
    const sizeR = replay.nextFloat();
    const lifeR = replay.nextFloat();

    const q = inner(p);
    expect(q.uo).toBe(f(uoR * 3));
    expect(q.vo).toBe(f(voR * 3));
    expect(q.size).toBe(f(f(f(sizeR * f(0.5)) + f(0.5)) * 2));
    // lifetime = (int)(4.0f / (r * 0.9f + 0.1f))
    expect(q.lifetime).toBe(Math.trunc(f(f(4.0) / f(f(lifeR * f(0.9)) + f(0.1)))));
  });

  it('lifetime 是整数（trunc），落在 [4, 40] —— 4.0f/(r*0.9f+0.1f) 的值域', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      Entity.sharedRandom.setSeed(seed);
      const p = inner(make(0.3));
      expect(Number.isInteger(p.lifetime), `seed=${seed}`).toBe(true);
      expect(p.lifetime).toBeGreaterThanOrEqual(4);
      expect(p.lifetime).toBeLessThanOrEqual(40);
    }
  });
});

describe('Particle.setPower / scale（E1）', () => {
  it('setPower 返回 this（C++ 链式调用），xd/zd 直接乘、yd 绕一圈再加回 0.1f', () => {
    const p = make(0.5);
    p.xd = f(1);
    p.yd = f(1);
    p.zd = f(1);
    expect(p.setPower(f(0.5))).toBe(p);
    expect(p.xd).toBe(f(f(1) * f(0.5)));
    expect(p.yd).toBe(f(f(f(f(1) - f(0.1)) * f(0.5)) + f(0.1)));
    expect(p.zd).toBe(f(f(1) * f(0.5)));
  });

  it('scale 同时改碰撞盒（0.2f*scale）和绘制尺寸（size *= scale），并返回 this', () => {
    const p = make(0.5);
    const before = inner(p).size;
    expect(p.scale(f(2.0))).toBe(p);
    expect(p.bbWidth).toBe(f(f(0.2) * f(2.0)));
    expect(p.bbHeight).toBe(f(f(0.2) * f(2.0)));
    expect(inner(p).size).toBe(f(before * f(2.0)));
  });

  it('scale 的链式调用：setPower 之后接 scale 能一路 next 下去', () => {
    const p = make(0.5);
    const r = p.setPower(f(2.0)).scale(f(0.5));
    expect(r).toBe(p);
  });
});

describe('Particle.tick（E1）', () => {
  it('⚠ 不调 super.tick()：Entity.tick → baseTick 会 tickCount++，这里必须还是 0', () => {
    const p = make(0.5);
    p.noPhysics = true;
    p.tick();
    expect(p.tickCount, 'baseTick 一跑就会 ++，所以 0 证明没调 super').toBe(0);
  });

  it('tick 开头把 xo/yo/zo 快照成当前位置', () => {
    const p = make(0.5);
    p.noPhysics = true;
    p.x = 1.5;
    p.y = 70.5;
    p.z = 2.5;
    p.tick();
    expect([p.xo, p.yo, p.zo]).toEqual([1.5, 70.5, 2.5]);
  });

  it('⚠ `age++ >= lifetime` 是**后置递增**：要跑 lifetime + 1 刻才 remove', () => {
    const p = make(0.5);
    p.noPhysics = true;
    const life = inner(p).lifetime;
    // 第 1 刻判的是 age=0，第 life 刻判的是 age=life-1，都不成立；
    // 第 life+1 刻判 age=life 才成立 —— C++ 原样如此，不是 off-by-one
    for (let i = 1; i <= life; i++) {
      p.tick();
      expect(p.removed, `第 ${i} 刻 / lifetime=${life}，还没到`).toBe(false);
      expect(inner(p).age).toBe(i);
    }
    p.tick();
    expect(p.removed, `第 ${life + 1} 刻必须 remove`).toBe(true);
    expect(inner(p).age).toBe(life + 1);
  });

  it('重力 yd -= 0.04f * gravity；gravity 默认 0，改成 1 时按 0.04f 掉', () => {
    const p = make(0.5);
    p.noPhysics = true;
    p.yd = f(1);
    p.tick();
    expect(p.yd, 'gravity 默认 0 → 只剩 0.98f 阻力').toBe(f(f(1 - f(f(0.04) * 0)) * f(0.98)));

    const q = make(0.5);
    q.noPhysics = true;
    inner(q).gravity = 1;
    q.yd = f(1);
    q.tick();
    expect(q.yd).toBe(f(f(f(1) - f(f(0.04) * 1)) * f(0.98)));
    expect(q.yd).toBeLessThan(p.yd);
  });

  it('阻力 0.98f；落地时 xd/zd 再乘 0.7f（yd 不受 onGround 影响）', () => {
    const p = make(0.5);
    p.noPhysics = true;
    p.xd = f(1);
    p.yd = f(0);
    p.zd = f(1);
    p.onGround = true;
    p.tick();
    expect(p.xd).toBe(f(f(f(1) * f(0.98)) * f(0.7)));
    expect(p.zd).toBe(f(f(f(1) * f(0.98)) * f(0.7)));
    expect(p.yd).toBe(f(f(f(0) - f(f(0.04) * 0)) * f(0.98)));
  });
});

describe('Particle.render（E1）', () => {
  /** 把位置/插值起点都摆好，render 只读这些字段 */
  function placed(p: Particle, x: number, y: number, z: number): void {
    p.x = p.xo = x;
    p.y = p.yo = y;
    p.z = p.zo = z;
  }

  // ⚠ Tesselator 写进的是 **Float32Array**，`_vertexForTest` 读回来**已经是 float32**
  //   （C++ 的顶点缓冲同理）。所以期望值要在算式之后再 `f()` 一次。
  it('UV 取自 16×16 的一格：u0=(tex%16)/16f，u1 = u0 + 0.999f/16f', () => {
    const t = new Tesselator(64 * 36);
    const p = make(0.5);
    placed(p, 0, 0, 0);
    inner(p).tex = 17; // u0 = 1/16；v0 = trunc(17/16)/16 = 1/16（**整数除法**）
    const u1 = f(f(1 / 16) + f(0.999) / f(16));
    t.begin();
    p.render(t, 1, 1, 0, 0, 0, 1);
    expect(t._vertexForTest(0).slice(3, 5), '左下角用 (u1, v1)').toEqual([u1, u1]);
    expect(t._vertexForTest(2).slice(3, 5), '右上角用 (u0, v0)').toEqual([f(1 / 16), f(1 / 16)]);
  });

  it('tex / 16 必须是**整数除法**（tex=16 → v0 = 1/16，不是 16/16.0 之外的数）', () => {
    const t = new Tesselator(64 * 36);
    const p = make(0.5);
    placed(p, 0, 0, 0);
    inner(p).tex = 0;
    t.begin();
    p.render(t, 1, 1, 0, 0, 0, 1);
    expect(t._vertexForTest(2).slice(3, 5), 'tex=0 → 第一格').toEqual([0, 0]);

    const t2 = new Tesselator(64 * 36);
    const q = make(0.5);
    placed(q, 0, 0, 0);
    inner(q).tex = 16;
    t2.begin();
    q.render(t2, 1, 1, 0, 0, 0, 1);
    expect(t2._vertexForTest(2).slice(3, 5), 'tex=16 → 第二行第一格').toEqual([0, f(1 / 16)]);
  });

  it('4 个顶点摊成 billboard：(-r,0,-r) (-r,0,+r) (+r,0,+r) (+r,0,-r)', () => {
    const t = new Tesselator(64 * 36);
    const p = make(0.5);
    placed(p, 0, 0, 0);
    inner(p).size = 1; // r = 0.1f * size = f(0.1)
    const r = f(0.1);
    t.begin();
    // xa=1, ya=0, za=0（水平方向）, xa2=0, za2=1（竖直方向）
    p.render(t, 1, 1, 0, 0, 0, 1);
    // ⚠ QUADS 会拆成 6 个顶点：索引 0..5 = v0, v1, v2, v0, v2, v3
    //   所以第 4 个顶点在索引 **5** 上（索引 3 是 v0 的重复，别写错）
    const v = (i: number) => t._vertexForTest(i).slice(0, 3);
    expect(v(0)).toEqual([-r, 0, -r]);
    expect(v(1)).toEqual([-r, 0, r]);
    expect(v(2)).toEqual([r, 0, r]);
    expect(v(5)).toEqual([r, 0, -r]);
    expect(v(3), 'QUADS 的第四个顶点槽是 v0 的重复').toEqual(v(0));
    expect(v(4), '第五个槽是 v2 的重复').toEqual(v(2));
    expect(t._vertexCountForTest(), 'QUADS 拆成两个三角形 = 6 个顶点').toBe(6);
  });

  it('xOff/yOff/zOff 是**静态**的：render 会把世界坐标减掉它们', () => {
    const t = new Tesselator(64 * 36);
    const p = make(0.5);
    placed(p, 10, 20, 30);
    inner(p).size = 1;
    Particle.xOff = 10;
    Particle.yOff = 20;
    Particle.zOff = 30;
    try {
      t.begin();
      p.render(t, 1, 1, 0, 0, 0, 1);
      expect(t._vertexForTest(0).slice(0, 3), '减掉偏移后回到原点附近').toEqual([
        0 - f(0.1),
        0 - 0,
        0 - f(0.1),
      ]);
    } finally {
      Particle.xOff = 0;
      Particle.yOff = 0;
      Particle.zOff = 0;
    }
  });

  it('插值：a=0 用 xo，a=1 用 x', () => {
    const t = new Tesselator(64 * 36);
    const p = make(0.5);
    p.xo = 10;
    p.x = 20;
    p.yo = p.y = 0;
    p.zo = p.z = 0;
    inner(p).size = 1;
    t.begin();
    p.render(t, 0, 1, 0, 0, 0, 1);
    expect(t._vertexForTest(0)[0], 'a=0 → 停在 xo').toBe(f(10 - f(0.1)));
    const t2 = new Tesselator(64 * 36);
    t2.begin();
    p.render(t2, 1, 1, 0, 0, 0, 1);
    expect(t2._vertexForTest(0)[0], 'a=1 → 走到 x').toBe(f(20 - f(0.1)));
  });
});

describe('Particle 的四条"照抄"性质（E1）', () => {
  it('getParticleTexture() 恒为 MISC_TEXTURE(0)', () => {
    expect(make(0.5).getParticleTexture()).toBe(0);
  });

  it('getEntityTypeId() 硬编码返回 0', () => {
    expect(make(0.5).getEntityTypeId()).toBe(0);
  });

  it('两个 NBT 方法是空实现（不抛错、也不往 tag 里写东西）', () => {
    const p = make(0.5);
    const tag = new CompoundTag();
    expect(() => {
      p.addAdditonalSaveData(tag);
      p.readAdditionalSaveData(tag);
    }).not.toThrow();
    expect(tag.isEmpty(), 'C++ 里函数体就是空的').toBe(true);
  });
});
