import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import { Entity, Explosion, ParticleType, Tile, type Level } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核（第 2 批：world/level）：W64。只写 Explosion.ts 的修复与怪癖测试。
//
// 四条“先红后绿”对应审核确认的四处错误：
//   W64-1 构造函数没把 float 形参收成 float；
//   W64-2 getSeenPercent 返回 double，pow 少收一次 float；
//   W64-3 getExplosionResistance 返回 double，能量衰减少收一次 float；
//   W64-4 `(int)` 用了 Math.trunc，应走 f2i（NaN / 越界 → INT_MIN）。
const f = Math.fround;

class PlainEntity extends Entity {
  getEntityTypeId(): number {
    return 1;
  }
  protected readAdditionalSaveData(_tag: CompoundTag): void {}
  protected addAdditonalSaveData(_tag: CompoundTag): void {}
}

let level: Level;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  prepareLevel(level);
  level.random.setSeed(12345);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('W64-1 构造函数按 float 收口', () => {
  it('0.1/0.2/0.3/3.1 存成 f() 之后的值', () => {
    // 前置条件：这四个 double 本来就不是 float；值不变的话这条测试抓不到问题
    expect(f(0.1)).not.toBe(0.1);
    expect(f(0.2)).not.toBe(0.2);
    expect(f(0.3)).not.toBe(0.3);
    expect(f(3.1)).not.toBe(3.1);

    const e = new Explosion(level, null, 0.1, 0.2, 0.3, 3.1);
    expect(e.x).toBe(f(0.1));
    expect(e.y).toBe(f(0.2));
    expect(e.z).toBe(f(0.3));
    expect(e.r).toBe(f(3.1));
  });
});

describe('W64-2 getSeenPercent 的返回值按 float 收口', () => {
  it('pow 用的是 f(seen)，不是 seen 的 double 原值', () => {
    const cx = 8.5;
    const cy = 108.5;
    const cz = 8.5;
    const e = new PlainEntity(level);
    e.setPos(9, 108.5, 8.5); // 距离 0.5；r 翻倍后是 8 → dist = 0.0625（都精确）

    // 在 [0,1] 里找一个 seen，使“先收成 float”与“不收”最终写进 e.xd 的值不同。
    const dist = f(0.5 / 8);
    const oneMinusDist = f(1 - dist);
    const xa0 = f(e.x - cx);
    const ya0 = f(e.y - cy);
    const za0 = f(e.z - cz);
    const ida = Mth.invSqrt(f(f(f(xa0 * xa0) + f(ya0 * ya0)) + f(za0 * za0)));
    const xa = f(xa0 * ida);
    let seen = -1;
    let rawXd = 0;
    let floatXd = 0;
    for (let k = 1; k < 200000; k++) {
      const s = k * 1e-7;
      const rawPow = f(oneMinusDist * s);
      const floatPow = f(oneMinusDist * f(s));
      rawXd = f(0 + f(xa * rawPow)); // e.xd 从 0 开始；+= 是 float 加法
      floatXd = f(0 + f(xa * floatPow));
      if (rawXd !== floatXd) {
        seen = s;
        break;
      }
    }
    expect(seen, '前置条件：找到一个能区分 double/float 的 seen').toBeGreaterThanOrEqual(0);
    expect(rawXd).not.toBe(floatXd);

    vi.spyOn(level, 'getEntities').mockReturnValue([e]);
    vi.spyOn(level, 'getSeenPercent').mockReturnValue(seen);
    const hurt = vi.spyOn(e, 'hurt').mockReturnValue(true);
    new Explosion(level, null, cx, cy, cz, 4).explode();

    expect(hurt).toHaveBeenCalledTimes(1);
    expect(e.xd, '修复前这里等于 rawXd').toBe(floatXd);
  });
});

describe('W64-3 getExplosionResistance 的返回值按 float 收口', () => {
  it('能量衰减用的是 f(抗性)，正负号与 float 语义一致', () => {
    const cx = 8.5;
    const cy = 108.5;
    const cz = 8.5;
    level.setTileNoUpdate(8, 108, 8, Tile.rock.id);
    // 固定射线能量：nextFloat = 0.4 时 P = 4 * (0.7f + 0.4f * 0.6f)，衰减后的值落在 [2,4) 的浮点间距上
    const nextFloat = 0.4;
    vi.spyOn(level.random, 'nextFloat').mockReturnValue(nextFloat);
    const P = f(4 * f(f(0.7) + f(nextFloat * f(0.6))));
    const stepSize = f(0.3);

    // 找一块抗性 R：C++ 语义（先 f(R)）与 TS 现状（直接用 R）算出的剩余能量一个 >0 一个 <=0。
    const base = P / stepSize - f(0.3);
    let resistance = 0;
    let oldRemaining = 0;
    let floatRemaining = 0;
    for (let k = -500000; k <= 500000; k++) {
      const cand = base + k * 1e-7;
      const oldDecay = f(f(cand + f(0.3)) * stepSize);
      const floatDecay = f(f(f(cand) + f(0.3)) * stepSize);
      oldRemaining = f(P - oldDecay);
      floatRemaining = f(P - floatDecay);
      if (oldRemaining > 0 !== floatRemaining > 0) {
        resistance = cand;
        break;
      }
    }
    expect(resistance, '前置条件：找到一块能区分两种舍入的抗性').not.toBe(0);
    expect(oldRemaining > 0).not.toBe(floatRemaining > 0);

    vi.spyOn(Tile.tiles[Tile.rock.id]!, 'getExplosionResistance').mockReturnValue(resistance);
    const e = new Explosion(level, null, cx, cy, cz, 4);
    e.explode();

    const hit = e.toBlow.entries().some((tp) => tp.x === 8 && tp.y === 108 && tp.z === 8);
    expect(hit, '修复前这里等于 oldRemaining > 0').toBe(floatRemaining > 0);
  });
});

describe('W64-4 (int) 走 f2i', () => {
  it('NaN 伤害转成 INT_MIN（x86 cvttss2si），不是 NaN', () => {
    const cx = 8.5;
    const cy = 108.5;
    const cz = 8.5;
    const e = new PlainEntity(level);
    e.setPos(9, 108.5, 8.5);
    vi.spyOn(level, 'getEntities').mockReturnValue([e]);
    vi.spyOn(level, 'getSeenPercent').mockReturnValue(Number.NaN);
    const hurt = vi.spyOn(e, 'hurt').mockReturnValue(true);

    new Explosion(level, null, cx, cy, cz, 4).explode();

    expect(hurt).toHaveBeenCalledTimes(1);
    const damage = hurt.mock.calls[0]![1];
    expect(Number.isNaN(damage), '修复前 Math.trunc(NaN) 还是 NaN').toBe(false);
    expect(damage).toBe(-2147483648);
  });
});

describe('随机数：调用次数与顺序（level.random）', () => {
  it('每条表面射线 1 次；playSound 2 次 + 每个粒子 5 次；位置按 xa→ya→za 消耗', () => {
    const calls: number[] = [];
    const originalNextFloat = level.random.nextFloat.bind(level.random);
    vi.spyOn(level.random, 'nextFloat').mockImplementation(() => {
      const v = originalNextFloat();
      calls.push(v);
      return v;
    });
    const pitches: number[] = [];
    vi.spyOn(level, 'playSound').mockImplementation(
      (_x: number, _y: number, _z: number, _name: string, _volume: number, pitch: number) => {
        pitches.push(pitch);
      },
    );
    const particles: { id: string | ParticleType.Id; x: number; y: number; z: number }[] = [];
    vi.spyOn(level, 'addParticle').mockImplementation((id, x, y, z) => {
      particles.push({ id, x, y, z });
    });

    const e = new Explosion(level, null, 8.5, 108.5, 8.5, 4);
    e.explode();
    // 16³ - 14³ = 1352 条表面射线，每条恰好消耗 1 个 nextFloat（fire = false，没有别的调用）
    expect(calls.length, '每条表面射线 1 个 nextFloat').toBe(1352);

    calls.length = 0; // 只看 finalizeExplosion 消耗的随机数
    const entries = e.toBlow.entries();
    expect(entries.length, '前置条件：确实有格子进 toBlow').toBeGreaterThan(0);
    e.finalizeExplosion();

    // 每 8 格发一次粒子（j & 7 == 0），每次 3 个位置 + 2 个速度随机数；playSound 里 2 个
    const particleSlots = Math.ceil(entries.length / 8);
    expect(calls.length).toBe(2 + 5 * particleSlots);
    expect(pitches.length).toBe(1);
    expect(pitches[0]).toBe(f(f(1 + f(f(calls[0]! - calls[1]!) * f(0.2))) * f(0.7)));

    const first = entries[0]!;
    const xa = f(first.x + calls[2]!);
    const ya = f(first.y + calls[3]!);
    const za = f(first.z + calls[4]!);
    expect(particles.length).toBe(2 * particleSlots);
    expect(particles[0]!.id).toBe(ParticleType.explode);
    expect(particles[0]!.x).toBe(f(f(xa + 8.5 * 1) / 2));
    expect(particles[0]!.y).toBe(f(f(ya + 108.5 * 1) / 2));
    expect(particles[0]!.z).toBe(f(f(za + 8.5 * 1) / 2));
    expect(particles[1]!.id).toBe(ParticleType.smoke);
    expect(particles[1]!.x).toBe(xa);
    expect(particles[1]!.y).toBe(ya);
    expect(particles[1]!.z).toBe(za);
  });
});
