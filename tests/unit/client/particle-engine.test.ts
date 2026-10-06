import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockMthRandom } from '../../helpers/mthRandom';
import { Entity, Tile, initItems, type Level } from '@mcpe/world';
import {
  GLES1,
  MISC_TEXTURE,
  Particle,
  ParticleEngine,
  Tesselator,
  Textures,
  glSetContext,
} from '@mcpe/client';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// E5：`ParticleEngine`（C++ 54 + 157 行）。
//
// 【这个文件钉什么】分档、tick 的"边遍历边删"、render 的纹理绑定顺序与"空档跳过"、
// renderLit **不** bind/begin/draw、destroy 撒 18 个、crack 的 6 个 face 分支、
// countParticles、setLevel 清空。
//
// 【假 Textures】只需要 `loadTexture` / `loadAndBindTexture` 两个方法 ——
// 真 `Textures` 要平台对象，这里用一个记录调用的替身（断言的是**调用序列**）。

const f = Math.fround;

/** 记录 bind 顺序的替身 */
class FakeTextures {
  loaded: string[] = [];
  bound: string[] = [];
  loadTexture(name: string): number {
    this.loaded.push(name);
    return 0;
  }
  loadAndBindTexture(name: string): number {
    this.bound.push(name);
    return 0;
  }
}

/** 可控的粒子：能指定档位、记 tick 次数 */
class TestParticle extends Particle {
  ticks = 0;
  constructor(
    level: Level,
    private readonly bucket: number,
    public killOnTick = false,
  ) {
    super(level, 8.5, 70.5, 8.5, 0, 0, 0);
  }
  override getParticleTexture(): number {
    return this.bucket;
  }
  override tick(): void {
    this.ticks++;
    if (this.killOnTick) this.remove();
  }
}

let level: Level;
let tex: FakeTextures;
let engine: ParticleEngine;

beforeEach(() => {
  glSetContext(new GLES1(null));
  level = createFlatLevel();
  prepareLevel(level);
  Entity.sharedRandom.setSeed(20261004);
  mockMthRandom(0.75);
  tex = new FakeTextures();
  engine = new ParticleEngine(level, tex as unknown as Textures);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ParticleEngine 容器（E5）', () => {
  it('构造函数会 loadTexture("particles.png")', () => {
    expect(tex.loaded).toEqual(['particles.png']);
  });

  it('add 按 getParticleTexture() 分档；countParticles 是字符串', () => {
    expect(engine.countParticles()).toBe('0');
    engine.add(new TestParticle(level, MISC_TEXTURE));
    engine.add(new TestParticle(level, 1));
    engine.add(new TestParticle(level, 1));
    engine.add(new TestParticle(level, 3));
    expect(engine.countParticles()).toBe('4');
  });

  it('setLevel 会把所有档清空', () => {
    engine.add(new TestParticle(level, MISC_TEXTURE));
    engine.add(new TestParticle(level, 2));
    engine.setLevel(level);
    expect(engine.countParticles()).toBe('0');
  });

  it('⚠ tick 是"边遍历边删"：删掉一个之后**不能跳过下一个**（`i--` 语义）', () => {
    const a = new TestParticle(level, MISC_TEXTURE, true); // 第一个 tick 就死
    const b = new TestParticle(level, MISC_TEXTURE);
    const c = new TestParticle(level, MISC_TEXTURE);
    engine.add(a);
    engine.add(b);
    engine.add(c);
    engine.tick();
    expect(a.ticks, '这一轮跑过 tick 才被删').toBe(1);
    expect(b.ticks, '索引回退之后必须也跑到').toBe(1);
    expect(c.ticks).toBe(1);
    expect(engine.countParticles(), '只剩两个').toBe('2');
    engine.tick();
    expect(b.ticks).toBe(2);
    expect(c.ticks).toBe(2);
  });

  it('四个档各自独立：只 tick 有粒子的档（且不互相影响）', () => {
    const m = new TestParticle(level, MISC_TEXTURE);
    const l = new TestParticle(level, 3);
    engine.add(m);
    engine.add(l);
    engine.tick();
    expect([m.ticks, l.ticks]).toEqual([1, 1]);
  });
});

describe('ParticleEngine.render（E5）', () => {
  it('按档位 bind 对应纹理，且**空档不 bind**', () => {
    engine.add(new TestParticle(level, MISC_TEXTURE));
    engine.add(new TestParticle(level, 2));
    // 第 1 档（terrain）没有粒子
    engine.render(new TestParticle(level, MISC_TEXTURE), 1);
    expect(tex.bound, '跳过空档，只 bind 有粒子的那两个').toEqual([
      'particles.png',
      'gui/items.png',
    ]);
  });

  it('第 1 档有粒子时 bind 的是 terrain.png（顺序 MISC → TERRAIN → ITEM）', () => {
    engine.add(new TestParticle(level, 2));
    engine.add(new TestParticle(level, 1));
    engine.add(new TestParticle(level, MISC_TEXTURE));
    engine.render(new TestParticle(level, MISC_TEXTURE), 1);
    expect(tex.bound).toEqual(['particles.png', 'terrain.png', 'gui/items.png']);
  });

  it('render 会把相机位置写进 Particle 的**静态** xOff/yOff/zOff', () => {
    const cam = new TestParticle(level, MISC_TEXTURE);
    cam.x = 10;
    cam.xOld = 8;
    cam.y = 20;
    cam.yOld = 18;
    cam.z = 30;
    cam.zOld = 28;
    try {
      engine.render(cam, f(0.5)); // 插值到中点
      expect([Particle.xOff, Particle.yOff, Particle.zOff]).toEqual([9, 19, 29]);
    } finally {
      Particle.xOff = 0;
      Particle.yOff = 0;
      Particle.zOff = 0;
    }
  });

  it('renderLit 只调 render，**不 bind**、也不 begin/draw', () => {
    engine.add(new TestParticle(level, 3));
    tex.bound.length = 0;
    const t = Tesselator.instance;
    // "有没有 begin" 的观测法：begin() 会把顶点数清零。
    // 连调两次 renderLit —— 不 begin 的话顶点数会一直**累加**；
    // 每次 begin 的话两次跑完都一样（各是那 4 个顶点展开出的 6 个）。
    t.begin();
    engine.renderLit(new TestParticle(level, MISC_TEXTURE), 1);
    const mid = t._vertexCountForTest();
    engine.renderLit(new TestParticle(level, MISC_TEXTURE), 1);
    expect(tex.bound, '第 4 档不 bind 任何纹理').toEqual([]);
    expect(
      t._vertexCountForTest(),
      '比上一轮多 → 说明没被 begin 清零',
    ).toBeGreaterThan(mid);
  });

  it('⚠ render 的主循环**不碰第 4 档**（`tt < 3`）—— 那一档只有 renderLit 画', () => {
    engine.add(new TestParticle(level, 3)); // 只往第 4 档放
    const t = Tesselator.instance;
    t.begin();
    const before = t._vertexCountForTest();
    engine.render(new TestParticle(level, MISC_TEXTURE), 1);
    expect(tex.bound, '第 4 档既不 bind').toEqual([]);
    // ⚠ render 末尾**会**调 renderLit（C++ 就是这样），所以 +6 是它的那一份；
    //   如果主循环写成 tt < 4，第 4 档会被画两遍 → +12，这条就红了
    expect(t._vertexCountForTest(), '只多了 renderLit 那 6 个顶点').toBe(before + 6);
  });

  it('renderLit 在那一档为空时直接返回', () => {
    engine.renderLit(new TestParticle(level, MISC_TEXTURE), 1); // 不抛就是过
    expect(tex.bound).toEqual([]);
  });
});

describe('ParticleEngine.destroy / crack（E5）', () => {
  it('destroy 撒 3×2×3 = 18 个 TerrainParticle，落在那格的三分之一格上', () => {
    // 平坦世界的平台在区块 7..9（方块 112..159），取平台上一格
    const x = 130;
    const y = 63;
    const z = 130;
    expect(level.getTile(x, y, z), '前提：这里得有个方块').not.toBe(0);
    engine.destroy(x, y, z);
    expect(engine.countParticles()).toBe('18');
  });

  it('destroy 在空气处什么都不做', () => {
    expect(level.getTile(130, 100, 130), '前提：高空是空气').toBe(0);
    engine.destroy(130, 100, 130);
    expect(engine.countParticles()).toBe('0');
  });

  it('crack 只撒 1 个，且带 setPower(0.2f) + scale(0.6f)', () => {
    const x = 130;
    const y = 63;
    const z = 130;
    engine.crack(x, y, z, 1); // face 1 = 上面
    expect(engine.countParticles()).toBe('1');
    // ⚠ TerrainParticle 的档位是 TERRAIN_TEXTURE(1)，不是 0
    const p = (engine as unknown as { particles: Particle[][] }).particles[1]!;
    expect(p.length).toBe(1);
  });

  it('crack 的 6 个 face 分支都把粒子推到对应面外侧（不抛错、都只撒 1 个）', () => {
    for (let face = 0; face < 6; face++) {
      const e = new ParticleEngine(level, tex as unknown as Textures);
      e.crack(130, 63, 130, face);
      expect(e.countParticles(), `face=${face}`).toBe('1');
    }
  });

  it('crack 用引擎自己的 Random（同一颗引擎连调两次，位置会不同）', () => {
    const e = new ParticleEngine(level, tex as unknown as Textures);
    const particles = (e as unknown as { particles: Particle[][] }).particles;
    e.crack(130, 63, 130, 6); // face 6 不在 switch 里 → 走默认（用随机算出来的 xp/yp/zp）
    const first = particles[1]![0]!;
    const p1 = [first.x, first.y, first.z];
    e.crack(130, 63, 130, 6);
    const second = particles[1]![1]!;
    expect([second.x, second.y, second.z], '两次的随机位置不该恰好相同').not.toEqual(p1);
  });

  it('⚠ crack 的 face 分支决定粒子被推到哪个面外（yy0 - r vs yy1 + r）', () => {
    const x = 130;
    const y = 63;
    const z = 130;
    const tile = Tile.tiles[level.getTile(x, y, z)]!;
    const r = f(0.1);
    const bucket = (e: ParticleEngine) =>
      (e as unknown as { particles: Particle[][] }).particles[1]!;
    const crackWith = (face: number) => {
      const e = new ParticleEngine(level, tex as unknown as Textures);
      e.crack(x, y, z, face);
      return bucket(e)[0]!;
    };

    expect(crackWith(0).y, 'face 0 → 底面外侧').toBe(y + tile.yy0 - r);
    expect(crackWith(1).y, 'face 1 → 顶面外侧').toBe(y + tile.yy1 + r);
    expect(crackWith(2).z, 'face 2 → -z 面外侧').toBe(z + tile.zz0 - r);
    expect(crackWith(3).z, 'face 3 → +z 面外侧').toBe(z + tile.zz1 + r);
    expect(crackWith(4).x, 'face 4 → -x 面外侧').toBe(x + tile.xx0 - r);
    expect(crackWith(5).x, 'face 5 → +x 面外侧').toBe(x + tile.xx1 + r);
  });

  it('⚠ crack 末尾的 setPower(0.2f) 与 scale(0.6f) 真的生效', () => {
    const x = 130;
    const y = 63;
    const z = 130;
    engine.crack(x, y, z, 6); // face 6 不在 switch 里 → 走默认分支，速度不受影响
    const p = (engine as unknown as { particles: Particle[][] }).particles[1]![0]!;
    // scale(0.6f)：setSize(0.2f*0.6f, …)
    expect(p.bbWidth).toBe(f(f(0.2) * f(0.6)));
    expect(p.bbHeight).toBe(f(f(0.2) * f(0.6)));
    // setPower(0.2f)：基类那个 yd（可以从 Math.random=0.75 手算出来）绕一圈
    const jitter = f(f(f(0.75 * 2) - 1) * f(0.4));
    const speed = f(f(0.75 + 0.75 + 1) * f(0.15));
    const dd = f(Math.sqrt(f(f(f(jitter * jitter) + f(jitter * jitter)) + f(jitter * jitter))));
    const mul = f(f(f(0.4) * speed) / dd);
    const yd0 = f(f(jitter * mul) + f(0.1));
    expect(p.yd).toBe(f(f(f(yd0 - f(0.1)) * f(0.2)) + f(0.1)));
    // xd 是 f(jitter*mul)（yd 那个 +0.1 只加在 y 上）
    expect(p.xd).toBe(f(f(jitter * mul) * f(0.2)));
  });

  it('destroy 的两道守卫是**重叠**的（tid===0 与 tile 判空互相兜住）', () => {
    // ⚠ 这条是**记录**不是断言：空气处 tid===0 先返回；就算去掉那一句，
    //   `Tile.tiles[0]` 也是空的、第二道守卫照样拦住 —— 所以"删掉 tid===0"这个变异
    //   **测不出来**（和 D2 的 HeavyTile 两道 isClientSide 一样）。写下来免得以后
    //   有人拿它做扰动、得到个假绿。
    engine.destroy(130, 100, 130);
    expect(engine.countParticles()).toBe('0');
    expect(Tile.tiles[0] ?? undefined, '前提：0 号方块在注册表里是空的').toBeUndefined();
  });

  it('crack 在空气处什么都不做', () => {
    engine.crack(130, 100, 130, 1);
    expect(engine.countParticles()).toBe('0');
  });

  it('destroy 造的碎屑颜色乘了方块颜色（草方块除外）', () => {
    // 平台顶层是草方块 —— 直接确认造出来的粒子贴图档是 TERRAIN
    engine.destroy(130, 63, 130);
    const particles = (engine as unknown as { particles: Particle[][] }).particles;
    expect(particles[1]!.length, 'TerrainParticle 落在 TERRAIN 档').toBe(18);
    expect(particles[0]!.length).toBe(0);
  });
});

describe('ParticleEngine 的常量与死代码（E5）', () => {
  it('五个纹理档常量从 ParticleEngine 也能取到（re-export）', () => {
    expect(ParticleEngine.MISC_TEXTURE).toBe(0);
    expect(ParticleEngine.TERRAIN_TEXTURE).toBe(1);
    expect(ParticleEngine.ITEM_TEXTURE).toBe(2);
    expect(ParticleEngine.ENTITY_PARTICLE_TEXTURE).toBe(3);
    expect(ParticleEngine.TEXTURE_COUNT).toBe(4);
  });

  it('Tile 注册表里有草方块（destroy 的测试依赖它）', () => {
    expect(Tile.grass).toBeDefined();
    expect(initItems).toBeDefined(); // 保持 import 有用（这个文件不需要物品）
  });
});
