/**
 * 全量审核 Throwable（W23，shoot 的 W5 之外）：
 * - 构造函数用 moveTo 之后的 this.yRot / this.xRot（float），不是 mob 的原始 double；
 * - lerpMotion 形参入口舍入；
 * - tick 结尾的四组 `±= 360` 回绕按 float 字段加法。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mth } from '@mcpe/util';
import { type HitResult, type Level, type Mob, Throwable } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

const f = Math.fround;
const X = 130;
const Z = 130;
let level: Level;

class TestThrowable extends Throwable {
  protected override onHit(_res: HitResult): void {}
  override isPickable(): boolean {
    return false;
  }
  override getEntityTypeId(): number {
    return 999;
  }
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  for (let y = 64; y <= 100; y++)
    for (let x = X - 8; x <= X + 8; x++)
      for (let z = Z - 8; z <= Z + 8; z++) level.setTileNoUpdate(x, y, z, 0);
});

describe('Throwable 构造函数的朝向来源（W23）', () => {
  it('rcos/rsin 用 moveTo 之后的 this.yRot（float），不是 mob 的原始 double', () => {
    const mob = {
      entityId: 7,
      x: 0,
      y: 64,
      z: 0,
      // 实测这组值：舍入前后 Mth.cos 查表结果不同（0.99984097… vs 0.99984270…）
      yRot: 1.0217231,
      xRot: 0,
      heightOffset: 0,
      aimDirection: { x: 0, y: 0, z: 1 },
      getHeadHeight: () => f(1.6),
      isPlayer: () => false,
    } as unknown as Mob;
    const t = new TestThrowable(level, mob);
    const rcos = f(Mth.cos(f(f(f(mob.yRot) / 180) * Mth.PI)));
    expect(t.x).toBe(f(f(0) - f(rcos * f(0.16))));
    // 反证：用未舍入的 mob.yRot 算出来不一样
    const rcosRaw = f(Mth.cos(f(f(mob.yRot / 180) * Mth.PI)));
    expect(rcos).not.toBe(rcosRaw);
  });
});

describe('Throwable.lerpMotion 的形参入口（W23）', () => {
  it('三个 float 形参先舍入再存字段', () => {
    const t = new TestThrowable(level);
    const v = 1.0000002;
    t.lerpMotion(v, 0, 0);
    expect(t.xd).toBe(f(v));
    expect(t.xd).not.toBe(v);
  });
});

describe('Throwable.tick 的角度回绕（W23）', () => {
  it('yRotO 的 ±360 按 float 字段加法（撤掉 f() 时末位不同）', () => {
    const t = new TestThrowable(level);
    t.setPos(X + 0.5, 70, Z + 0.5);
    // 朝向约 +179.94°，配合 tick 开头的 yRotO = yRot = -0.2 → 差值约 180.14，触发一次 += 360
    t.shoot(0.001, 0, -1, 1, 0);
    const y0 = f(-0.2);
    // baseTick 会把 yRotO 覆盖成 yRot，所以改 yRot
    t.yRot = y0;
    level.addEntity(t);
    level.tickEntities();
    expect(f(y0 + 360)).not.toBe(y0 + 360); // 这组值确实能区分
    expect(t.yRotO).toBe(f(y0 + 360));
  });
});
