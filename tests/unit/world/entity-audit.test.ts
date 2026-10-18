import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag, ListTagFloatAdder } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import {
  AABB,
  Entity,
  ItemEntity,
  ItemInstance,
  LevelConstants,
  Vec3,
  registerItemEntityClass,
  type Level,
} from '@mcpe/world';

// 全量审核（第 2 批：world/entity/Entity）：W8 的“先红后绿”测试。
// Entity 的 float 字段在 C++ 里每一步都舍入；这里钉住构造 / 位置 / 旋转 / 距离 / 推挤几条链。
// 用假 Level（这些函数不碰 level），与现有测试里的 duck-typed 替身同风格。

const f = Math.fround;

class PlainEntity extends Entity {
  getEntityTypeId(): number {
    return 1;
  }
  protected readAdditionalSaveData(_tag: CompoundTag): void {}
  protected addAdditonalSaveData(_tag: CompoundTag): void {}

  // 把 protected 暴露给测试
  callSetSize(w: number, h: number): void {
    this.setSize(w, h);
  }
  callSetRot(yRot: number, xRot: number): void {
    this.setRot(yRot, xRot);
  }
  callResetPos(clearMore = false): void {
    this.resetPos(clearMore);
  }
  // baseTick 的落水分支要用
  setFirstTick(v: boolean): void {
    this.firstTick = v;
  }
  setWasInWater(v: boolean): void {
    this.wasInWater = v;
  }
}

function makeEntity(): PlainEntity {
  return new PlainEntity({} as unknown as Level);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Entity（全量审核 W8）', () => {
  it('W8：构造与 setSize/setRot/setPos 的 float 语义', () => {
    const e = makeEntity();
    expect(e.bbWidth).toBe(f(0.6));
    expect(e.bbHeight).toBe(f(1.8));

    e.callSetSize(0.1, 0.2);
    expect(e.bbWidth).toBe(f(0.1));
    expect(e.bbHeight).toBe(f(0.2));

    e.callSetRot(0.3, 0.4);
    expect([e.yRot, e.yRotO, e.xRot, e.xRotO]).toEqual([f(0.3), f(0.3), f(0.4), f(0.4)]);

    e.heightOffset = f(0.1);
    e.ySlideOffset = f(0.2);
    e.setPos(0.1, 0.2, 0.3);
    expect([e.x, e.y, e.z]).toEqual([f(0.1), f(0.2), f(0.3)]);

    const w = f(e.bbWidth / 2);
    const yBase = f(f(f(0.2) - f(0.1)) + f(0.2));
    expect(e.bb.x0).toBe(f(f(0.1) - w));
    expect(e.bb.y0).toBe(yBase);
    expect(e.bb.z0).toBe(f(f(0.3) - w));
    expect(e.bb.x1).toBe(f(f(0.1) + w));
    expect(e.bb.y1).toBe(f(yBase + f(0.2)));
    expect(e.bb.z1).toBe(f(f(0.3) + w));
  });

  it('W8：构造函数里的 setPos 只调 Entity 的版本（子类重写不参与）', () => {
    let calls = 0;
    class OverridingEntity extends PlainEntity {
      override setPos(x: number, y: number, z: number): void {
        calls++;
        super.setPos(x, y, z);
      }
    }
    calls = 0;
    new OverridingEntity({} as unknown as Level);
    expect(calls).toBe(0);
  });

  it('W8：moveTo 的 y 加上 heightOffset 按 float', () => {
    const e = makeEntity();
    e.heightOffset = f(0.1);
    e.moveTo(f(0.1), f(0.2), f(0.3), f(0.4), f(0.5));

    const y = f(f(0.2) + f(0.1));
    expect([e.x, e.y, e.z]).toEqual([f(0.1), y, f(0.3)]);
    expect([e.xOld, e.xo]).toEqual([f(0.1), f(0.1)]);
    expect([e.yOld, e.yo]).toEqual([y, y]);
    expect([e.yRot, e.yRotO]).toEqual([f(0.4), f(0.4)]);
    expect([e.xRot, e.xRotO]).toEqual([f(0.5), f(0.5)]);
  });

  it('W8：turn 的每一步 float', () => {
    const e = makeEntity();
    e.yRot = f(0.1);
    e.xRot = f(0.2);
    e.yRotO = f(0.3);
    e.xRotO = f(0.4);

    e.turn(0.7, 0.9);

    const xo = f(0.7);
    const yo = f(0.9);
    const xRotOld = f(0.2);
    const yRotOld = f(0.1);
    const yRot = f(f(0.1) + f(xo * f(0.15)));
    let xRot = f(f(0.2) - f(yo * f(0.15)));
    if (xRot < -90) xRot = -90;
    if (xRot > 90) xRot = 90;

    expect(e.yRot).toBe(yRot);
    expect(e.xRot).toBe(xRot);
    expect(e.xRotO).toBe(f(f(0.4) + f(xRot - xRotOld)));
    expect(e.yRotO).toBe(f(f(0.3) + f(yRot - yRotOld)));
  });

  it('W8：distanceTo / distanceToSqr 逐步 float（两个重载）', () => {
    const a = makeEntity();
    const b = makeEntity();
    a.x = f(1e8);
    a.y = f(1);
    a.z = f(1);
    b.x = 0;
    b.y = 0;
    b.z = 0;

    const xd = f(f(1e8) - 0);
    const wantSqr = f(f(f(xd * xd) + f(1)) + f(1));
    expect(a.distanceToSqr(b)).toBe(wantSqr);
    expect(a.distanceToSqr(0, 0, 0)).toBe(wantSqr);

    const want = f(Math.sqrt(wantSqr));
    expect(a.distanceTo(b)).toBe(want);
    expect(a.distanceTo(0, 0, 0)).toBe(want);
  });

  it('W8：push 的数值重载与实体重载都按 float', () => {
    const a = makeEntity();
    a.xd = f(0.1);
    a.yd = f(0.2);
    a.zd = f(0.3);
    a.push(0.2, 0.3, 0.4);
    expect(a.xd).toBe(f(f(0.1) + f(0.2)));
    expect(a.yd).toBe(f(f(0.2) + f(0.3)));
    expect(a.zd).toBe(f(f(0.3) + f(0.4)));

    const p = makeEntity();
    const q = makeEntity();
    q.x = f(3);
    q.z = f(4);
    p.push(q);

    let xa = f(q.x - p.x);
    let za = f(q.z - p.z);
    const dd = f(Math.sqrt(Math.max(Math.abs(xa), Math.abs(za))));
    xa = f(xa / dd);
    za = f(za / dd);
    let pow = f(1 / dd);
    if (pow > 1) pow = 1;
    xa = f(xa * pow);
    za = f(za * pow);
    xa = f(xa * f(0.05));
    za = f(za * f(0.05));
    const k = f(1 - p.pushthrough);
    xa = f(xa * k);
    za = f(za * k);

    expect(p.xd).toBe(f(0 - xa));
    expect(p.zd).toBe(f(0 - za));
    expect(q.xd).toBe(xa);
    expect(q.zd).toBe(za);
  });

  it('W8：getPickRadius / getShadowHeightOffs / lerpMotion 保持 float', () => {
    const e = makeEntity();
    expect(e.getPickRadius()).toBe(f(0.1));

    e.bbHeight = f(1.8);
    expect(e.getShadowHeightOffs()).toBe(f(f(1.8) / 2));

    e.lerpMotion(0.1, 0.2, 0.3);
    expect([e.xd, e.yd, e.zd]).toEqual([f(0.1), f(0.2), f(0.3)]);
  });

  it('W8：resetPos 的 y += 1 按 float', () => {
    let calls = 0;
    const level = {
      getCubes: () => {
        calls++;
        return calls === 1 ? [new AABB()] : [];
      },
    } as unknown as Level;
    const e = new PlainEntity(level);
    e.y = f(1e8);
    e.callResetPos();

    expect(e.y).toBe(f(1e8));
    expect([e.xd, e.yd, e.zd]).toEqual([0, 0, 0]);
    expect(e.xRot).toBe(0);
  });
});

describe('Entity（全量审核 W9：第 2 组）', () => {
  it('W9：baseTick 的落水音效与气泡按 float 分步', () => {
    const sounds: Array<{ name: string; volume: number; pitch: number }> = [];
    const particles: number[][] = [];
    const level = {
      isClientSide: false,
      checkAndHandleWater: () => true,
      containsMaterial: () => false,
      playSound: (_e: Entity, name: string, volume: number, pitch: number) => {
        sounds.push({ name, volume, pitch });
      },
      addParticle: (...args: number[]) => {
        particles.push(args);
      },
    } as unknown as Level;

    const e = new PlainEntity(level);
    e.x = f(0.1);
    e.y = f(0.2);
    e.z = f(0.3);
    e.xd = f(0.1);
    e.yd = f(0.2);
    e.zd = f(0.3);
    e.setFirstTick(false);
    e.setWasInWater(false);

    const rnd = vi.spyOn(Entity.sharedRandom, 'nextFloat');
    rnd.mockReturnValueOnce(0.1).mockReturnValueOnce(0.7);
    rnd.mockReturnValue(0.25);

    e.baseTick();

    // C++ `sqrt(xd*xd*0.2f + yd*yd + zd*zd*0.2f) * 0.2f`：内层逐项 float，::sqrt 按 double，
    // 乘 0.2f 后存回 float。
    const xd = f(0.1);
    const yd = f(0.2);
    const zd = f(0.3);
    const inner = f(f(f(f(xd * xd) * f(0.2)) + f(yd * yd)) + f(f(zd * zd) * f(0.2)));
    let speed = f(Math.sqrt(inner) * f(0.2));
    if (speed > 1) speed = 1;
    const pitch = f(1 + f(f(f(0.1) - f(0.7)) * f(0.4)));
    expect(sounds).toEqual([{ name: 'random.splash', volume: speed, pitch }]);

    // 循环上界 `1 + bbWidth * 20` 也是 float：0.6f*20 恰好在两个 float 中间，ties-to-even 取 12，
    // 所以是 13 个气泡（旧的 double 写法会得到 13.0000004…，多跑一个）。
    const count = f(1 + f(e.bbWidth * 20));
    expect(particles.length).toBe(count);
    const xo = f(f(f(f(0.25) * 2) - 1) * e.bbWidth);
    const zo = xo;
    expect(particles[0]!.slice(1, 4)).toEqual([
      f(e.x + xo),
      f(f(Math.floor(e.bb.y0)) + 1),
      f(e.z + zo),
    ]);
    expect(particles[0]![4]).toBe(xd);
    expect(particles[0]![5]).toBe(f(yd - f(f(0.25) * f(0.2))));
    expect(particles[0]![6]).toBe(zd);
  });

  it('W9：checkFallDamage 的 ya 与下落距离按 float', () => {
    const e = makeEntity();
    e.fallDistance = f(1e8);
    // C++ 只有 ya < 0（在下落）时才累加：fallDistance -= ya。
    e.checkFallDamage(f(-0.1), false);
    expect(e.fallDistance).toBe(f(f(1e8) - f(-0.1)));
    expect(e.fallDistance).toBe(f(1e8));

    e.fallDistance = f(0.5);
    e.checkFallDamage(0, true);
    expect(e.fallDistance).toBe(0);
  });

  it('W9：moveRelative 每步 float（含 Mth.PI 的 float 中间值）', () => {
    const e = makeEntity();
    e.yRot = f(0.7);
    const xa0 = f(0.1);
    const za0 = f(0.2);
    const speedArg = f(0.3);

    e.moveRelative(xa0, za0, speedArg);

    let dist = f(Math.sqrt(f(f(xa0 * xa0) + f(za0 * za0))));
    expect(dist, '前提：dist >= 0.01f').toBeGreaterThanOrEqual(f(0.01));
    if (dist < 1) dist = 1;
    dist = f(speedArg / dist);
    const xa = f(xa0 * dist);
    const za = f(za0 * dist);
    const sin_ = f(Math.sin(f(f(e.yRot * Mth.PI) / 180)));
    const cos_ = f(Math.cos(f(f(e.yRot * Mth.PI) / 180)));
    expect(e.xd).toBe(f(f(xa * cos_) - f(za * sin_)));
    expect(e.zd).toBe(f(f(za * cos_) + f(xa * sin_)));
  });

  it('W9：shouldRender 传给 shouldRenderAtSqrDistance 的距离按 float 分步', () => {
    const e = makeEntity();
    e.x = f(0.1);
    e.y = f(0.2);
    e.z = f(0.3);
    const spy = vi.spyOn(e, 'shouldRenderAtSqrDistance').mockReturnValue(true);

    expect(e.shouldRender(new Vec3(f(0.4), f(0.5), f(0.6)))).toBe(true);

    const xd = f(e.x - f(0.4));
    const yd = f(e.y - f(0.5));
    const zd = f(e.z - f(0.6));
    expect(spy).toHaveBeenCalledWith(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd)));
  });

  it('W9：shouldRenderAtSqrDistance 的 size 与阈值按 float（边界）', () => {
    const e = makeEntity();
    e.bb.set(0, 0, 0, f(0.1), f(0.2), f(0.3));
    e.viewScale = f(1.1);

    const size = f(e.bb.getSize());
    const t = f(size * f(64 * e.viewScale));
    const tNew = f(t * t);
    // 旧写法：size 不经过 float 乘法（`size *= 64.0 * viewScale` 是 double），阈值也不同。
    const tOld = size * (64 * e.viewScale);
    const tOld2 = tOld * tOld;
    expect(tNew).not.toBe(tOld2);

    // 取一个新旧阈值之间的 double：一侧旧写法 true、新写法 false，反之亦然。
    let d: number;
    let want: boolean;
    if (tNew < tOld2) {
      d = tNew;
      want = false; // 旧：tNew < tOld2 → true；新：tNew < tNew → false
    } else {
      // 旧阈值更低：取它本身（严格小于为 false），新写法会先舍入到 float。
      d = tOld2;
      expect(f(d), '前提：旧阈值舍入后仍低于新阈值').toBeLessThan(tNew);
      want = true; // 旧：tOld2 < tOld2 → false；新：f(tOld2) < tNew → true
    }
    expect(e.shouldRenderAtSqrDistance(d)).toBe(want);
  });

  it('W9：load 的 padding、clamp 上下界与 fmod 按 float', () => {
    const rot = f(370.1);
    const tag = new CompoundTag();
    tag.put('Pos', new ListTagFloatAdder(0).call(0).call(0).tag!);
    tag.put('Motion', new ListTagFloatAdder(0).call(0).call(0).tag!);
    tag.put('Rotation', new ListTagFloatAdder(rot).call(0).tag!);

    const e = makeEntity();
    expect(e.load(tag)).toBe(true);
    const padding = f(f(e.bbWidth * f(0.5)) + f(0.001));
    // load 里的 `xo = xOld = x = xx` 直接用 xx；只有随后的 setPos 才把 x 舍入到 float，
    // 所以要看 xo / xOld 才能区分 padding 是不是按 float 算的。
    expect(e.xo).toBe(padding);
    expect(e.xOld).toBe(padding);
    expect(e.x).toBe(padding);
    expect(e.z).toBe(padding);
    expect(e.y).toBe(0);
    expect(e.yRot).toBe(f(rot % f(360)));

    const tag2 = new CompoundTag();
    tag2.put('Pos', new ListTagFloatAdder(1e6).call(0).call(0).tag!);
    tag2.put('Motion', new ListTagFloatAdder(0).call(0).call(0).tag!);
    tag2.put('Rotation', new ListTagFloatAdder(0).call(0).tag!);
    const e2 = makeEntity();
    expect(e2.load(tag2)).toBe(true);
    const upper = f(f(LevelConstants.LEVEL_WIDTH) - padding);
    expect(e2.xOld).toBe(upper);
    expect(e2.x).toBe(upper);
    expect(e2.z).toBe(padding);
  });

  it('W9：spawnAtLocation 的 y + yOffs 按 float', () => {
    const captured: number[] = [];
    let added: unknown = null;
    class FakeItemEntity {
      throwTime = 0;
      constructor(_level: Level, x: number, y: number, z: number) {
        captured.push(x, y, z);
      }
    }
    registerItemEntityClass(
      FakeItemEntity as unknown as Parameters<typeof registerItemEntityClass>[0],
    );
    try {
      const level = {
        addEntity: (ie: unknown) => {
          added = ie;
        },
      } as unknown as Level;
      const e = new PlainEntity(level);
      e.x = f(1);
      e.y = f(1e8);
      e.z = f(2);

      const ie = e.spawnAtLocation(new ItemInstance(1, 1, 0), f(0.1));
      expect(captured[1]).toBe(f(f(1e8) + f(0.1)));
      expect(captured[1]).toBe(f(1e8));
      expect(added).toBe(ie);
    } finally {
      registerItemEntityClass(ItemEntity);
    }
  });
});
