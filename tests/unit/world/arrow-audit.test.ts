/**
 * 全量审核 Arrow（W22）：
 * - `atan2 * Mth::RADDEG`（不是 `* 180 / Mth::PI`，末位不同）；
 * - `shoot` / `lerpMotion` / 构造函数的 float 形参入口舍入；
 * - `yRot += 180` / `yRotO += 180` 按 float 字段加法；
 * - `(int) std::ceil` 用 f2i；
 * - 构造函数用 moveTo 之后的 this.yRot / this.xRot。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Mth } from '@mcpe/util';
import { Arrow, type Level, type Mob, initItems } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel();
  initItems();
  level = createFlatLevel();
  prepareLevel(level);
});

describe('Arrow 的 RADDEG（W22）', () => {
  it('shoot 的朝向用 atan2 * RADDEG，与 * 180 / PI 差末位', () => {
    // 实测：atan2(-5, -4.9) * RADDEG = -134.4212646484375，旧写法 = -134.42127990722656
    const a = new Arrow(level, 0, 0, 0);
    a.shoot(-5, 0, -4.9, 1, 0);
    const rad = f(Mth.atan2(f(-5), f(-4.9)));
    expect(a.yRot).toBe(f(rad * Mth.RADDEG));
    expect(a.yRot).not.toBe(f(f(rad * 180) / Mth.PI));
  });
});

describe('Arrow 的 float 形参入口（W22）', () => {
  it('shoot 的 pow / uncertainty 先转 float', () => {
    const a = new Arrow(level, 0, 0, 0);
    const pow = 1.0000002; // f(pow) != pow
    a.shoot(1, 0, 1, pow, 0);
    const xd0 = f(1 / f(Mth.sqrt(f(f(1 * 1) + f(1 * 1)))));
    expect(a.xd).toBe(f(xd0 * f(pow)));
  });

  it('shoot 的 uncertainty 先转 float（radius = 0.0075f * f(u)）', () => {
    const a = new Arrow(level, 0, 0, 0);
    const u = 1.0000002;
    // 用固定 gaussian 把扰动钉死
    const g = 1;
    vi.spyOn(Arrow.sharedRandom, 'nextGaussian').mockReturnValue(g);
    a.shoot(0, 0, 1, 1, u);
    const radius = f(f(0.0075) * f(u));
    expect(a.zd).toBe(f(1 + f(g * radius)));
    vi.restoreAllMocks();
  });

  it('lerpMotion 的三个形参先转 float', () => {
    const a = new Arrow(level, 0, 0, 0);
    const v = 1.0000002;
    a.lerpMotion(v, 0, 0);
    expect(a.xd).toBe(f(v));
    expect(a.xd).not.toBe(v);
  });
});

// 注：tick 里 `yRot += 180; yRotO += 180;`（反弹分支）—— `yRot` 随即被下面的 atan2 重算覆盖，
// `yRotO` 则会进入 while 回绕与插值，确实可观测。W22 按 float 字段加法补了 f()；
// 要精确钉住它需要构造"命中实体 + hurt 返回 false + 下一帧角度插值"的全套场景，
// 现有 arrow.test.ts 已覆盖该分支的行为（反弹方向/速度），这里不再重复。

describe('Arrow 构造函数的 yRot 来源（W22）', () => {
  it('cos/sin 用的是 moveTo 之后的 this.yRot（float），不是 mob 的原始 double', () => {
    const mob = {
      entityId: 1,
      x: 0,
      y: 64,
      z: 0,
      // 实测这组值：未舍入时 Mth.cos 查表下标不同（0.99984270… vs 0.99984097…）
      yRot: 1.0217231,
      xRot: 0,
      heightOffset: 0,
      getHeadHeight: () => f(1.6),
      isPlayer: () => false,
    } as unknown as Mob;
    const a = new Arrow(level, mob, 1);
    // moveTo 把 yRot 舍入成 float；C++ 后面读的是自己的字段
    const yRot = f(mob.yRot);
    const dx = f(Mth.cos(f(yRot * Mth.DEGRAD)));
    expect(a.x).toBe(f(f(0) - f(dx * f(0.16))));
    // 反证：用未舍入的值算出来不一样
    const dxRaw = f(Mth.cos(f(mob.yRot * Mth.DEGRAD)));
    expect(dx).not.toBe(dxRaw);
  });
});
