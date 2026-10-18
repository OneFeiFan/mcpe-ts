import { beforeEach, describe, expect, it } from 'vitest';
import type { CompoundTag } from '@mcpe/nbt';
import { AABB, Entity, type Level } from '@mcpe/world';

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
}

function makeEntity(): PlainEntity {
  return new PlainEntity({} as unknown as Level);
}

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
