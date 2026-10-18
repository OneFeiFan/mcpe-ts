import { describe, expect, it } from 'vitest';
import { HitResult, Vec3, type Entity } from '@mcpe/world';

// 全量审核（第 2 批：world/phys/HitResult）：W6、W7 的“先红后绿”测试。
//   W6：`HitResult(Entity*)` 的 pos 在 C++ 里走 `Vec3(entity->x, entity->y, entity->z)`
//       构造函数（-0 → +0）；TS 以前用 `pos.set()`，会把 -0 留下来。
//   W7：`HitResult::distanceTo`（TS 名 `distanceToSqr`）在 C++ 里每一步都是 float，
//       TS 以前整段用 double 算。
// 另外两条对照：tile 构造与拷贝构造在 C++ 里是逐成员拷贝（Vec3 的隐式拷贝构造 / set），
// -0 要原样保留——防止以后把两种语义“统一”掉。

const f = Math.fround;

/** HitResult(Entity*) 只读 x / y / z 三个字段（与现有测试里的 fakeTarget 同风格）。 */
function fakeEntity(x: number, y: number, z: number): Entity {
  return { x, y, z } as unknown as Entity;
}

describe('HitResult（全量审核 W6/W7）', () => {
  it('W6：HitResult(Entity*) 的 pos 经由 Vec3 构造函数，-0 变成 +0', () => {
    const r = new HitResult(fakeEntity(-0, -0, -0));
    expect(Object.is(r.pos.x, 0)).toBe(true);
    expect(Object.is(r.pos.y, 0)).toBe(true);
    expect(Object.is(r.pos.z, 0)).toBe(true);
  });

  it('对照：tile 构造与拷贝构造保留 -0（C++ 是逐成员拷贝）', () => {
    const tile = new HitResult(0, 0, 0, 0, new Vec3().set(-0, -0, -0));
    expect(Object.is(tile.pos.x, -0)).toBe(true);

    const copy = new HitResult(tile);
    expect(Object.is(copy.pos.x, -0)).toBe(true);
  });

  it('W7：distanceTo 按 float 逐步舍入，而不是整段 double', () => {
    // xd = 1e8、yd = zd = 1：C++ 的 xd*xd 先舍入成 float（1e16 的 float 近似），
    // 再加 1 两次都不会改变它；整段 double 会得到精确的 1e16，两者不同。
    const r = new HitResult(0, 0, 0, 0, new Vec3(1e8, 1, 1));
    const e = fakeEntity(0, 0, 0);
    const expected = f(f(f(f(1e8 * 1e8)) + f(1 * 1)) + f(1 * 1));

    expect(r.distanceToSqr(e)).toBe(expected);
    expect(r.distanceToSqr(e)).not.toBe(1e8 * 1e8 + 1 + 1);
  });

  it('isHit：只有 NO_HIT 是 false', () => {
    expect(new HitResult().isHit()).toBe(false);
    expect(new HitResult(0, 0, 0, 0, new Vec3()).isHit()).toBe(true);
    expect(new HitResult(fakeEntity(0, 0, 0)).isHit()).toBe(true);
  });
});
