import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mth, Random } from '@mcpe/util';
import { Entity, Mob, Vec3, type Level } from '@mcpe/world';

// 全量审核（第 2 批：world/entity/Mob 第 3 组）：W14 的“先红后绿”测试。
//   - 速度修正 0.7f、头高 bbHeight*0.85f；
//   - heal 的 int 除法、护甲吸收的 int 除法；
//   - hurt/knockback/causeFallDamage/travel 的 float 逐步舍入。

const f = Math.fround;

interface ClipCall {
  from: Vec3;
  to: Vec3;
}

function makeLevel(clipCalls: ClipCall[] = []): Level {
  return {
    random: new Random(12345),
    isClientSide: false,
    addParticle: () => {},
    playSound: () => {},
    broadcastEntityEvent: () => {},
    getEntities: () => [],
    getTile: () => 0,
    clip: (from: Vec3, to: Vec3) => {
      clipCalls.push({ from, to });
      return { isHit: () => false };
    },
  } as unknown as Level;
}

class TestMob extends Mob {
  override getEntityTypeId(): number {
    return 1;
  }
  modifier(): number {
    return this.getWalkingSpeedModifier();
  }
  headHeight(): number {
    return this.getHeadHeight();
  }
  armorAbsorb(damage: number): number {
    return this.getDamageAfterArmorAbsorb(damage);
  }
  fall(distance: number): void {
    this.causeFallDamage(distance);
  }
  setWalkingSpeed(v: number): void {
    this.walkingSpeed = v;
  }
  doKnockback(source: Entity | null, dmg: number, xd: number, zd: number): void {
    this.knockback(source, dmg, xd, zd);
  }
}

class TravelMob extends TestMob {
  inWater = false;
  inLava = false;
  moveRelArgs: number[] = [];
  override isInWater(): boolean {
    return this.inWater;
  }
  override isInLava(): boolean {
    return this.inLava;
  }
  override onLadder(): boolean {
    return false;
  }
  override move(_xa: number, _ya: number, _za: number): void {}
  override moveRelative(xa: number, za: number, speed: number): void {
    this.moveRelArgs = [xa, za, speed];
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Mob（全量审核 W14：第 3 组）', () => {
  it('W14：getWalkingSpeedModifier 返回 0.7f', () => {
    const m = new TestMob(makeLevel());
    expect(m.modifier()).toBe(f(0.7));
  });

  it('W14：getHeadHeight = bbHeight * 0.85f', () => {
    const m = new TestMob(makeLevel());
    m.bbHeight = f(1.3);
    expect(m.headHeight()).toBe(f(f(1.3) * f(0.85)));
  });

  it('W14：heal 的 invulnerableDuration / 2 是整数除法', () => {
    const m = new TestMob(makeLevel());
    m.health = 10;
    m.invulnerableDuration = 7;
    m.heal(1);
    expect(m.health).toBe(11);
    expect(m.invulnerableTime).toBe(3);
  });

  it('W14：护甲吸收的 v / 25 是整数除法', () => {
    const m = new TestMob(makeLevel());
    m.dmgSpill = 7;
    expect(m.armorAbsorb(10)).toBe(10);
    expect(m.dmgSpill).toBe(7);
  });

  it('W14：knockback 按 float 逐步舍入', () => {
    const m = new TestMob(makeLevel());
    m.xd = 1;
    m.yd = 1;
    m.zd = 1;

    m.doKnockback(null, 0, 0.1, 0.2);

    const ax = f(0.1);
    const az = f(0.2);
    const dd = Mth.invSqrt(f(f(ax * ax) + f(az * az)));
    const pow = f(0.4);

    const exd = f(f(f(1) * f(0.5)) - f(f(ax * dd) * pow));
    let eyd = f(f(f(1) * f(0.5)) + f(0.4));
    if (eyd > f(0.4)) eyd = f(0.4);
    const ezd = f(f(f(1) * f(0.5)) - f(f(az * dd) * pow));

    expect(m.xd).toBe(exd);
    expect(m.yd).toBe(eyd);
    expect(m.zd).toBe(ezd);
  });

  it('W14：hurt 的 hurtDir 与击退参数按 float', () => {
    const level = makeLevel();
    const m = new TestMob(level);
    const source = new TestMob(level);

    m.health = 20;
    m.x = f(0.1);
    m.z = f(0.2);
    m.yRot = f(37);
    source.x = f(1.3);
    source.z = f(-0.7);

    expect(m.hurt(source, 3)).toBe(true);
    expect(m.health).toBe(17);

    const xd = f(source.x - m.x);
    const zd = f(source.z - m.z);
    const expected = f(f(Math.atan2(zd, xd) * Mth.RADDEG) - m.yRot);
    expect(m.hurtDir).toBe(expected);
  });

  it('W14：causeFallDamage 的 float 形参与落点高度按 float', () => {
    const plays: string[] = [];
    const level = makeLevel();
    (level as unknown as { playSound: (e: unknown, name: string) => void }).playSound = (
      _e: unknown,
      name: string,
    ) => plays.push(name);

    const m = new TestMob(level);
    m.health = 20;
    m.y = f(10.5);
    m.heightOffset = 0;

    // C++ 形参是 float：6.0000001 先舍入成 6.0f，dmg = ceil(3) = 3。
    m.fall(6.0000001);

    expect(m.health).toBe(17);
    expect(plays[0]).toBe('damage.fallsmall');
  });

  it('W14：travel 的地面摩擦与末速按 float', () => {
    const m = new TravelMob(makeLevel());
    m.onGround = true;
    m.setWalkingSpeed(f(0.1));
    m.xd = f(0.3);
    m.yd = f(0.5);
    m.zd = f(0.7);

    m.travel(f(0.1), 0);

    const c06 = f(0.6);
    const c091 = f(0.91);
    let num = f(c06 * c06);
    num = f(num * c091);
    num = f(num * c091);
    num = f(num * c06);
    num = f(num * c091);
    const friction = f(c06 * c091);
    const den = f(f(friction * friction) * friction);
    const friction2 = f(num / den);
    const speed = f(f(0.1) * friction2);

    expect(m.moveRelArgs).toEqual([f(0.1), 0, speed]);
    expect(m.xd).toBe(f(f(0.3) * friction));
    expect(m.yd).toBe(f(f(f(0.5) - f(0.08)) * f(0.98)));
    expect(m.zd).toBe(f(f(0.7) * friction));
  });

  it('W14：travel 的水中阻力与上浮条件按 float', () => {
    const m = new TravelMob(makeLevel());
    m.inWater = true;
    m.xd = f(0.3);
    m.yd = f(0.5);
    m.zd = f(0.7);

    m.travel(f(0.1), 0);

    expect(m.moveRelArgs[2]).toBe(f(0.02));
    expect(m.xd).toBe(f(f(0.3) * f(0.8)));
    expect(m.yd).toBe(f(f(f(0.5) * f(0.8)) - f(0.02)));
    expect(m.zd).toBe(f(f(0.7) * f(0.8)));
  });

  it('W14：canSee 的视点高度按 float', () => {
    const clipCalls: ClipCall[] = [];
    const m = new TestMob(makeLevel(clipCalls));
    const target = new TestMob(makeLevel());
    m.bbHeight = f(1.3);
    m.y = f(0.2);
    target.bbHeight = f(1.8);
    target.y = f(0.4);

    expect(m.canSee(target)).toBe(true);

    const headM = f(f(1.3) * f(0.85));
    const headT = f(f(1.8) * f(0.85));
    expect(clipCalls[0]!.from.y).toBe(f(f(0.2) + headM));
    expect(clipCalls[0]!.to.y).toBe(f(f(0.4) + headT));
  });
});
