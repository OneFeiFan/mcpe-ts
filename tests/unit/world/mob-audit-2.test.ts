import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mth, Random } from '@mcpe/util';
import { Entity, Mob, type Level } from '@mcpe/world';

// 全量审核（第 2 批：world/entity/Mob 第 2 组）：W13 的“先红后绿”测试。
//   - tick 的 lSteps 插值、walk/run/yBodyRot/animStep 都按 C++ 的 float 逐步舍入；
//   - baseTick 的气泡/死亡粒子坐标与网络阈值按 float；
//   - updateWalkAnim、aiStep、lerpTo、jumpFromGround、getVoicePitch 的 float 语义。

const f = Math.fround;

interface CapturedParticle {
  type: string;
  args: number[];
}

function makeLevel(particles: CapturedParticle[]): Level {
  return {
    random: new Random(12345),
    isClientSide: false,
    addParticle: (type: string, ...args: number[]) => {
      particles.push({ type, args });
    },
    playSound: () => {},
    broadcastEntityEvent: () => {},
    getEntities: () => [],
  } as unknown as Level;
}

class TestMob extends Mob {
  override getEntityTypeId(): number {
    return 1;
  }
  getXxa(): number {
    return this.xxa;
  }
  getYya(): number {
    return this.yya;
  }
  getYRotA(): number {
    return this.yRotA;
  }
  setXxa(v: number): void {
    this.xxa = v;
  }
  assignYya(v: number): void {
    this.yya = v;
  }
  setYRotA(v: number): void {
    this.yRotA = v;
  }
  getWalkingSpeed(): number {
    return this.walkingSpeed;
  }
  setWalkingSpeed(v: number): void {
    this.walkingSpeed = v;
  }
  getFlyingSpeed(): number {
    return this.flyingSpeed;
  }
  setFlyingSpeed(v: number): void {
    this.flyingSpeed = v;
  }
  setAirSupply(v: number): void {
    this.airSupply = v;
  }
  doJump(): void {
    this.jumpFromGround();
  }
}

/** tick 测试用：隔离 baseTick/aiStep/updateWalkAnim，并截获 setPos/setRot 的实参。 */
class TickMob extends TestMob {
  posCalls: number[][] = [];
  rotCalls: number[][] = [];
  override baseTick(): void {}
  override aiStep(): void {}
  override updateWalkAnim(): void {}
  override setPos(x: number, y: number, z: number): void {
    this.posCalls.push([x, y, z]);
  }
  override setRot(yRot: number, xRot: number): void {
    this.rotCalls.push([yRot, xRot]);
  }
}

/** aiStep 测试用：跳过 AI、固定水中/岩浆状态，截获 travel 时的速度。 */
class AiMob extends TestMob {
  walkAtTravel = 0;
  flyAtTravel = 0;
  override isImmobile(): boolean {
    return false;
  }
  override interpolateOnly(): boolean {
    return true;
  }
  override isInWater(): boolean {
    return true;
  }
  override isInLava(): boolean {
    return false;
  }
  override getWalkingSpeedModifier(): number {
    return f(0.5);
  }
  override travel(_xa: number, _ya: number): void {
    this.walkAtTravel = this.walkingSpeed;
    this.flyAtTravel = this.flyingSpeed;
  }
}

/** baseTick 测试用：液体/墙判定可控。 */
class BaseTickMob extends TestMob {
  inWall = false;
  underWater = false;
  override isInWall(): boolean {
    return this.inWall;
  }
  override isUnderLiquid(): boolean {
    return this.underWater;
  }
  override isWaterMob(): boolean {
    return false;
  }
  override isInWater(): boolean {
    return false;
  }
  override isInLava(): boolean {
    return false;
  }
}

class BabyMob extends TestMob {
  override isBaby(): boolean {
    return true;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Mob（全量审核 W13：第 2 组）', () => {
  it('W13：tick 的 lSteps 插值与朝向按 float 逐步舍入', () => {
    const m = new TickMob(makeLevel([]));
    const x0 = f(-8.417648315429688);
    const y0 = f(0);
    const z0 = f(0);
    const lx = f(29.027700424194336);
    const yRot0 = f(-74.45494842529297);
    const lyr = f(79.81724548339844);
    const xRot0 = f(150.37368774414062);
    const lxr = f(19.297584533691406);

    m.x = x0;
    m.y = y0;
    m.z = z0;
    m.lx = lx;
    m.ly = y0;
    m.lz = z0;
    m.yRot = yRot0;
    m.lyr = lyr;
    m.xRot = xRot0;
    m.lxr = lxr;
    m.yBodyRot = yRot0;
    m.lSteps = 3;

    m.tick();

    const xt = f(x0 + f(f(lx - x0) / 3));
    const yt = f(y0 + f(f(y0 - y0) / 3));
    const zt = f(z0 + f(f(z0 - z0) / 3));
    expect(m.posCalls[0]).toEqual([xt, yt, zt]);

    let yrd = f(lyr - yRot0);
    while (yrd < -180) yrd = f(yrd + 360);
    while (yrd >= 180) yrd = f(yrd - 360);
    const yRot1 = f(yRot0 + f(yrd / 3));
    const xRot1 = f(xRot0 + f(f(lxr - xRot0) / 3));

    expect(m.yRot).toBe(yRot1);
    expect(m.xRot).toBe(xRot1);
    expect(m.rotCalls[0]).toEqual([yRot1, xRot1]);
  });

  it('W13：tick 的 walkSpeed/run/yBodyRot/animStep 按 float 逐步舍入', () => {
    const m = new TickMob(makeLevel([]));
    m.x = 0;
    m.y = 0;
    m.z = 0;
    m.xo = f(-0.1);
    m.zo = 0;
    m.onGround = true;
    m.attackAnim = 1;
    m.yRot = 100;
    m.yBodyRot = 0;
    m.run = 0;
    m.animStep = 0;
    m.lSteps = 0;

    m.tick();

    const xd = f(0 - f(-0.1));
    const zd = f(0);
    const sideDist = Mth.sqrt(f(f(xd * xd) + f(zd * zd)));
    const walkSpeed = f(sideDist * 3);

    expect(m.run).toBe(f(0 + f(f(1 - 0) * f(0.3))));
    expect(m.animStep).toBe(f(0 + walkSpeed));

    let d = f(100 - 0);
    while (d < -180) d = f(d + 360);
    while (d >= 180) d = f(d - 360);
    let body = f(0 + f(d * f(0.3)));

    let head = f(100 - body);
    while (head < -180) head = f(head + 360);
    while (head >= 180) head = f(head - 360);
    if (head < -75) head = -75;
    if (head >= 75) head = 75;
    body = f(100 - head);
    if (f(head * head) > 50 * 50) {
      body = f(body + f(head * f(0.2)));
    }
    expect(m.yBodyRot).toBe(body);
  });

  it('W13：updateWalkAnim 全程 float', () => {
    const m = new TestMob(makeLevel([]));
    m.x = 0;
    m.xo = f(-0.1);
    m.z = 0;
    m.zo = 0;
    m.walkAnimSpeed = 0;
    m.walkAnimPos = 0;

    m.updateWalkAnim();

    const xxd = f(0 - f(-0.1));
    const zzd = f(0);
    let wst = f(Mth.sqrt(f(f(xxd * xxd) + f(zzd * zzd))) * 4);
    if (wst > 1) wst = 1;
    const speed = f(0 + f(f(wst - 0) * f(0.4)));

    expect(m.walkAnimSpeed).toBe(speed);
    expect(m.walkAnimPos).toBe(f(0 + speed));
  });

  it('W13：aiStep 的跳跃加速度、输入衰减与速度倍率按 float', () => {
    const m = new AiMob(makeLevel([]));
    m.jumping = true;
    m.yd = 1;
    m.setXxa(1);
    m.assignYya(1);
    m.setYRotA(1);
    m.setWalkingSpeed(f(0.3));
    m.setFlyingSpeed(f(0.02));

    m.aiStep();

    expect(m.yd).toBe(f(1 + f(0.04)));
    expect(m.getXxa()).toBe(f(f(1) * f(0.98)));
    expect(m.getYya()).toBe(f(f(1) * f(0.98)));
    expect(m.getYRotA()).toBe(f(f(1) * f(0.9)));
    expect(m.walkAtTravel).toBe(f(f(0.3) * f(0.5)));
    expect(m.flyAtTravel).toBe(f(f(0.02) * f(0.5)));
    // travel 之后恢复原值
    expect(m.getWalkingSpeed()).toBe(f(0.3));
    expect(m.getFlyingSpeed()).toBe(f(0.02));
  });

  it('W13：lerpTo 的插值目标按 float', () => {
    const m = new TestMob(makeLevel([]));
    m.lerpTo(0.1, 0.2, 0.3, 0.4, 0.5, 4);
    expect(m.lx).toBe(f(0.1));
    expect(m.ly).toBe(f(0.2 + m.heightOffset));
    expect(m.lz).toBe(f(0.3));
    expect(m.lyr).toBe(f(0.4));
    expect(m.lxr).toBe(f(0.5));
    expect(m.lSteps).toBe(4);
  });

  it('W13：jumpFromGround 的 0.42f 是 float', () => {
    const m = new TestMob(makeLevel([]));
    m.doJump();
    expect(m.yd).toBe(f(0.42));
  });

  it('W13：getVoicePitch 的公式按 float（含幼年体 1.5f 分支）', () => {
    const m = new TestMob(makeLevel([]));
    vi.spyOn(m.random, 'nextFloat').mockReturnValueOnce(0.75).mockReturnValueOnce(0.25);
    expect(m.getVoicePitch()).toBe(f(f(f(f(0.75) - f(0.25)) * f(0.2)) + 1.0));

    const baby = new BabyMob(makeLevel([]));
    vi.spyOn(baby.random, 'nextFloat').mockReturnValueOnce(0.75).mockReturnValueOnce(0.25);
    expect(baby.getVoicePitch()).toBe(f(f(f(f(0.75) - f(0.25)) * f(0.2)) + 1.5));
  });

  it('W13：baseTick 的气泡坐标按 float', () => {
    const particles: CapturedParticle[] = [];
    const m = new BaseTickMob(makeLevel(particles));
    vi.spyOn(Entity.prototype, 'baseTick').mockImplementation(() => {});

    m.health = 10;
    m.underWater = true;
    m.setAirSupply(-19);
    m.x = f(10.1);
    m.y = f(20.2);
    m.z = f(30.3);

    const seq = [0.75, 0.1];
    let i = 0;
    vi.spyOn(m.random, 'nextFloat').mockImplementation(() => f(seq[i++ % seq.length]!));

    m.baseTick();

    const xo = f(f(0.75) - f(0.1));
    const bubble = particles.find((p) => p.type === 'bubble');
    expect(bubble).toBeDefined();
    expect(bubble!.args.slice(0, 3)).toEqual([f(m.x + xo), f(m.y + xo), f(m.z + xo)]);
  });

  it('W13：baseTick 的死亡粒子坐标与初速按 float', () => {
    const particles: CapturedParticle[] = [];
    const m = new BaseTickMob(makeLevel(particles));
    vi.spyOn(Entity.prototype, 'baseTick').mockImplementation(() => {});

    m.health = 0;
    m.deathTime = 160;
    m.x = f(100.5);
    m.y = f(64.25);
    m.z = f(-3.75);
    m.bbWidth = f(0.6);
    m.bbHeight = f(1.8);

    const r = f(0.6);
    vi.spyOn(m.random, 'nextFloat').mockReturnValue(r);

    m.baseTick();

    const explode = particles.filter((p) => p.type === 'explode');
    expect(explode.length).toBe(20);

    const a = f(f(2 * r) - 1);
    const speed = f(f(a * a) * f(0.02));
    const px = f(f(m.x + f(f(r * m.bbWidth) * 2)) - m.bbWidth);
    const py = f(m.y + f(r * m.bbHeight));
    const pz = f(f(m.z + f(f(r * m.bbWidth) * 2)) - m.bbWidth);
    expect(explode[0]!.args).toEqual([px, py, pz, speed, speed, speed]);
  });

  it('W13：baseTick 的位置同步阈值按 float 比较', () => {
    const m = new BaseTickMob(makeLevel([]));
    vi.spyOn(Entity.prototype, 'baseTick').mockImplementation(() => {});

    m.autoSendPosRot = true;
    m.x = f(0.1);
    m.y = 0;
    m.z = 0;
    m.sentX = 0;
    m.sentY = 0;
    m.sentZ = 0;
    m.xRot = 0;
    m.yRot = 0;
    m.sentRotX = 0;
    m.sentRotY = 0;

    m.baseTick();

    // C++: abs(x - sentX) 是 float 减法，结果恰好等于 0.1f，`> 0.1f` 为假。
    expect(m.sentX).toBe(0);
    expect(m.sentY).toBe(0);
    expect(m.sentZ).toBe(0);
  });
});
