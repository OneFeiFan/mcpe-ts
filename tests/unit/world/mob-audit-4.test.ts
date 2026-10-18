import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mth, Random } from '@mcpe/util';
import { Mob, Vec3, type Level } from '@mcpe/world';

// 全量审核（第 2 批：world/entity/Mob 第 4 组）：W15 的“先红后绿”测试。
//   - lookAt/rotlerp/getPos/getViewVector/pick/getAttackAnim 的 float 逐步舍入；
//   - checkDespawn 的距离平方按 float（阈值恰好卡在 96² / 32² 的边界）；
//   - setYya/setSpeed 的 float 形参。

const f = Math.fround;

// Mth.sin/cos 是 65536 项查表，必须先初始化（应用启动时会调；单测里没有）。
Mth.initMth();

const canon = (v: number): number => (v === 0 ? 0 : v);

function makeLevel(): Level {
  return {
    random: new Random(12345),
    isClientSide: false,
    addParticle: () => {},
    playSound: () => {},
    broadcastEntityEvent: () => {},
    getEntities: () => [],
    getTile: () => 0,
  } as unknown as Level;
}

/** 与修复后的 Mob.rotlerp 相同的 float 参考实现。 */
function rotlerpRef(a0: number, b0: number, max0: number): number {
  const a = f(a0);
  const b = f(b0);
  const max = f(max0);
  let diff = f(b - a);
  while (diff < -180) diff = f(diff + 360);
  while (diff >= 180) diff = f(diff - 360);
  if (diff > max) diff = max;
  if (diff < -max) diff = -max;
  return f(a + diff);
}

interface Vec3Parts {
  x: number;
  y: number;
  z: number;
}

function viewVectorRef(xRot: number, yRot: number): Vec3Parts {
  const argY = f(f(f(-yRot) * Mth.DEGRAD) - Mth.PI);
  const yCos = Mth.cos(argY);
  const ySin = Mth.sin(argY);
  const argX = f(f(-xRot) * Mth.DEGRAD);
  const xCos = -Mth.cos(argX);
  const xSin = Mth.sin(argX);
  return { x: canon(f(ySin * xCos)), y: canon(xSin), z: canon(f(yCos * xCos)) };
}

class TestMob extends Mob {
  override getEntityTypeId(): number {
    return 1;
  }
  despawnFrom(other: Mob): void {
    this.checkDespawnFrom(other);
  }
  getNoActionTime(): number {
    return this.noActionTime;
  }
  setNoActionTime(v: number): void {
    this.noActionTime = v;
  }
  getYyaValue(): number {
    return this.yya;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Mob（全量审核 W15：第 4 组）', () => {
  it('W15：lookAt 的夹角计算与 rotlerp 结果按 float', () => {
    const m = new TestMob(makeLevel());
    const target = new TestMob(makeLevel());

    m.x = f(0.5);
    m.y = f(0.5);
    m.z = f(0.5);
    m.bbHeight = f(1.8);
    m.xRot = f(10);
    m.yRot = f(20);
    target.x = f(3.1);
    target.z = f(-2.7);
    target.bb.y0 = f(0.5);
    target.bb.y1 = f(2.5);

    const xRot0 = m.xRot;
    const yRot0 = m.yRot;
    m.lookAt(target, f(30), f(20));

    const headM = f(f(1.8) * f(0.85));
    const xd = f(target.x - m.x);
    const zd = f(target.z - m.z);
    const yd = f(f(f(target.bb.y0 + target.bb.y1) / 2) - f(m.y + headM));
    const sd = Mth.sqrt(f(f(xd * xd) + f(zd * zd)));
    const yRotD = f(f((Math.atan2(zd, xd) * 180) / Mth.PI) - 90);
    const xRotD = f((Math.atan2(yd, sd) * 180) / Mth.PI);

    expect(m.xRot).toBe(-rotlerpRef(xRot0, xRotD, f(20)));
    expect(m.yRot).toBe(rotlerpRef(yRot0, yRotD, f(30)));
  });

  it('W15：getAttackAnim 按 float', () => {
    const m = new TestMob(makeLevel());
    m.attackAnim = f(0.3);
    m.oAttackAnim = f(0.1);
    const a = f(0.5);
    let diff = f(m.attackAnim - m.oAttackAnim);
    if (diff < 0) diff = f(diff + 1);
    expect(m.getAttackAnim(a)).toBe(f(m.oAttackAnim + f(diff * a)));
  });

  it('W15：getPos 插值按 float', () => {
    const m = new TestMob(makeLevel());
    m.xo = f(1.1);
    m.x = f(3.3);
    m.yo = f(-0.7);
    m.y = f(0.9);
    m.zo = f(2.2);
    m.z = f(-4.4);
    const a = f(0.7);
    const p = m.getPos(a);
    expect(p.x).toBe(f(m.xo + f(f(m.x - m.xo) * a)));
    expect(p.y).toBe(f(m.yo + f(f(m.y - m.yo) * a)));
    expect(p.z).toBe(f(m.zo + f(f(m.z - m.zo) * a)));
  });

  it('W15：getViewVector 的角度与插值按 float', () => {
    const m = new TestMob(makeLevel());
    // 这组角度让 float 分步的 y 轴夹角与 double 一次算完落在不同的查表项上。
    m.xRot = f(20);
    m.yRot = f(-22.456056594848633);
    m.xRotO = f(20);
    m.yRotO = f(-22.456056594848633);

    const v1 = m.getViewVector(1);
    const e1 = viewVectorRef(m.xRot, m.yRot);
    expect([v1.x, v1.y, v1.z]).toEqual([e1.x, e1.y, e1.z]);

    const a = f(0.5);
    const xRot = f(m.xRotO + f(f(m.xRot - m.xRotO) * a));
    const yRot = f(m.yRotO + f(f(m.yRot - m.yRotO) * a));
    const v = m.getViewVector(a);
    const e = viewVectorRef(xRot, yRot);
    expect([v.x, v.y, v.z]).toEqual([e.x, e.y, e.z]);
  });

  it('W15：pick 的终点按 float 计算', () => {
    const clipCalls: { from: Vec3; to: Vec3 }[] = [];
    const level = makeLevel();
    (level as unknown as { clip: (a: Vec3, b: Vec3) => unknown }).clip = (from: Vec3, to: Vec3) => {
      clipCalls.push({ from, to });
      return { isHit: () => false };
    };
    const m = new TestMob(level);
    m.x = f(1);
    m.y = f(2);
    m.z = f(3);
    m.xRot = f(20);
    m.yRot = f(37);

    // 这组视角下，这个 range 能让“先乘后加”和“double 一次算完”的 float 结果不同。
    const range = f(14.813958168029785);
    m.pick(range, 1);

    const v = viewVectorRef(m.xRot, m.yRot);
    expect(clipCalls[0]!.to.x).toBe(f(m.x + f(v.x * range)));
    expect(clipCalls[0]!.to.y).toBe(f(m.y + f(v.y * range)));
    expect(clipCalls[0]!.to.z).toBe(f(m.z + f(v.z * range)));
  });

  it('W15：checkDespawn 的 96² 阈值按 float（恰好等于时不删除）', () => {
    const m = new TestMob(makeLevel());
    const other = new TestMob(makeLevel());
    m.setNoActionTime(0);
    other.x = f(96);
    other.y = f(1e-4); // 平方在 float 里加不回 96²，double 会略大于 96²
    other.z = 0;

    m.despawnFrom(other);
    expect(m.removed).toBe(false);
  });

  it('W15：checkDespawn 的 32² 阈值按 float（恰好等于时不删除）', () => {
    const m = new TestMob(makeLevel());
    const other = new TestMob(makeLevel());
    m.setNoActionTime(30 * 20 + 1);
    vi.spyOn(m.random, 'nextInt').mockReturnValue(0);
    other.x = f(32);
    other.y = f(1e-4);
    other.z = 0;

    m.despawnFrom(other);
    expect(m.removed).toBe(false);
    expect(m.getNoActionTime()).toBe(0);
  });

  it('W15：setYya / setSpeed 的形参先转 float', () => {
    const m = new TestMob(makeLevel());
    m.setYya(0.1);
    expect(m.getYyaValue()).toBe(f(0.1));
    m.setSpeed(0.2);
    expect(m.getSpeed()).toBe(f(0.2));
    expect(m.getYyaValue()).toBe(f(0.2));
  });
});
