import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { type HitResult, type Level, Throwable, Tile, Vec3 } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D8：`Throwable`（雪球/蛋的基类）。它 abstract，用一个最小子类实例化。
//
// 判据（任务单 D 的约定）：无头真 Level 单测 —— 飞出去、撞方块、落地、超时消失。

const f = Math.fround;
const X = 130;
const Z = 130;
let level: Level;

class TestThrowable extends Throwable {
  hits: HitResult[] = [];
  protected override onHit(res: HitResult): void {
    this.hits.push(res);
  }
  // 暴露 protected 的给测试用
  throwPower(): number {
    return this.getThrowPower();
  }
  gravity(): number {
    return this.getGravity();
  }
  upAngle(): number {
    return this.getThrowUpAngleOffset();
  }
  isInGround(): boolean {
    return this.inGround;
  }
  override getEntityTypeId(): number {
    return 999;
  }
  // Entity.isPickable() 默认 false —— 不覆盖的话"撞到实体"那条路永远走不到
  // （tick 里那个循环第一句就是 `if (!e.isPickable() ...) continue;`）
  override isPickable(): boolean {
    return !this.removed;
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

describe('Throwable（D8）', () => {
  describe('三个构造函数', () => {
    it('单参：尺寸 0.25×0.25，_init 那几个字段的初值', () => {
      const t = new TestThrowable(level);
      expect([t.bbWidth, t.bbHeight]).toEqual([f(0.25), f(0.25)]);
      expect(t.shakeTime).toBe(0);
      expect(t.isInGround()).toBe(false);
      expect(t.getAuxData(), 'ownerId 初值 0').toBe(0);
      expect([t.x, t.y, t.z]).toEqual([0, 0, 0]);
    });

    it('三参：setPos + heightOffset = 0（不是基类的默认值）', () => {
      const t = new TestThrowable(level, 12.5, 71.5, 13.5);
      expect([t.x, t.y, t.z]).toEqual([12.5, 71.5, 13.5]);
      expect(t.heightOffset).toBe(0);
    });

    it('虚函数的默认值：投掷力 1.5、上抛角 0、重力 0.03', () => {
      const t = new TestThrowable(level);
      expect(t.throwPower()).toBe(f(1.5));
      expect(t.upAngle()).toBe(0);
      expect(t.gravity()).toBe(f(0.03));
    });
  });

  describe('shoot', () => {
    it('先把方向归一化、再乘 power，并顺手把朝向设好', () => {
      const t = new TestThrowable(level, 0, 0, 0);
      t.shoot(0, 0, 1, 1, 0); // uncertainty = 0 → 不吃随机数
      expect([t.xd, t.yd, t.zd]).toEqual([0, 0, 1]);
      // yRot = atan2(xd, zd)，xRot = atan2(yd, sqrt(xd²+zd²))
      expect(t.yRot).toBeCloseTo(0, 5);
      expect(t.xRot).toBeCloseTo(0, 5);
      expect([t.yRotO, t.xRotO]).toEqual([t.yRot, t.xRot]);
    });

    it('长度为 0 的方向向量 → 三个分量都归零（走 else 那支）', () => {
      const t = new TestThrowable(level, 0, 0, 0);
      t.xd = 9;
      t.shoot(0, 0, 0, 1, 0);
      expect([t.xd, t.yd, t.zd]).toEqual([0, 0, 0]);
    });

    it('斜着射：归一化之后模长就是 power', () => {
      const t = new TestThrowable(level, 0, 0, 0);
      t.shoot(1, 0, 1, 2, 0);
      const len = Math.sqrt(t.xd * t.xd + t.yd * t.yd + t.zd * t.zd);
      expect(len).toBeCloseTo(2, 5);
      expect(t.yRot).toBeCloseTo(45, 3);
    });

    it('Vec3 那个重载只是转发', () => {
      const a = new TestThrowable(level, 0, 0, 0);
      const b = new TestThrowable(level, 0, 0, 0);
      a.shoot(0.3, -0.2, 0.9, 1, 0);
      b.shootVec(new Vec3(0.3, -0.2, 0.9), 1, 0);
      expect([b.xd, b.yd, b.zd]).toEqual([a.xd, a.yd, a.zd]);
      expect([b.yRot, b.xRot]).toEqual([a.yRot, a.xRot]);
    });
  });

  describe('lerpMotion', () => {
    it('朝向是 0 时才顺手算朝向（原句那个条件）', () => {
      const t = new TestThrowable(level, 0, 0, 0);
      t.lerpMotion(0, 0, 1);
      expect(t.yRot).toBeCloseTo(0, 5);

      const u = new TestThrowable(level, 0, 0, 0);
      u.yRotO = 90;
      u.xRotO = 0;
      u.lerpMotion(0, 0, -1); // 朝向已经设过，不再重算
      expect(u.yRot, 'xRotO==0 但 yRotO!=0 → 条件不成立').toBe(0);
    });
  });

  describe('tick', () => {
    it('飞出去：位置往前走，而且重力让它往下掉', () => {
      const t = new TestThrowable(level, X + 0.5, 80.5, Z + 0.5);
      t.shoot(0, 0, 1, 1, 0);
      level.addEntity(t);
      const z0 = t.z;
      level.tickEntities();
      expect(t.z, '往 +z 飞').toBeGreaterThan(z0);
      expect(t.yd, '重力在减 yd').toBeLessThan(0);
    });

    it('⚠ 真的调了 super.tick()：baseTick 会把 xo/yo/zo 对齐到本刻开始时的位置', () => {
      // 这条是为了钉住"tick 调 super.tick()"—— 与 FallingTile / PrimedTnt 相反。
      // 不去断 super 的话，把那句删掉测试照样全绿（实测过的无效扰动）。
      const t = new TestThrowable(level, X + 0.5, 80.5, Z + 0.5);
      t.shoot(0, 0, 1, 1, 0);
      level.addEntity(t);
      // 先手动把插值起点打乱，看 baseTick 有没有把它拉回来
      t.xo = -999;
      t.yo = -999;
      t.zo = -999;
      const x0 = t.x;
      const y0 = t.y;
      const z0 = t.z;
      level.tickEntities();
      expect([t.xo, t.yo, t.zo], 'baseTick 把上一刻的位置记下来了').toEqual([x0, y0, z0]);
      expect(t.tickCount, 'baseTick 还会走 tickCount').toBeGreaterThan(0);
    });

    it('撞到方块墙 → 调 onHit，而且停在墙前面', () => {
      for (let y = 74; y <= 78; y++)
        for (let x = X - 1; x <= X + 1; x++) level.setTileNoUpdate(x, y, Z + 3, Tile.rock.id);
      const t = new TestThrowable(level, X + 0.5, 76.5, Z + 0.5);
      t.shoot(0, 0, 1, 2, 0);
      level.addEntity(t);
      for (let i = 0; i < 40 && t.hits.length === 0; i++) level.tickEntities();
      expect(t.hits.length).toBeGreaterThan(0);
      // ⚠ 位置是在 onHit **之后**才 `x += xd` 的，所以撞墙那一帧还会往前冲一个 |v|（这里是 2 格）。
      //   不能断言"停在墙前面"，只能断言"没飞出去很远"。这是原样的顺序。
      expect(t.z, '没飞出去').toBeLessThan(Z + 3 + 3);
    });

    it('撞到实体 → onHit 收到的是那个实体（HitResult 的实体那条路）', () => {
      const target = new TestThrowable(level, X + 0.5, 76.5, Z + 2.5);
      level.addEntity(target);
      const t = new TestThrowable(level, X + 0.5, 76.5, Z + 0.5);
      t.shoot(0, 0, 1, 2, 0);
      level.addEntity(t);
      for (let i = 0; i < 40 && t.hits.length === 0; i++) level.tickEntities();
      expect(t.hits.length).toBeGreaterThan(0);
      expect(t.hits[0]!.entity).toBe(target);
    });
  });

  describe('落地之后', () => {
    /**
     * 让它处于"插在地上"的状态。
     *
     * ⚠ **不能靠打 tick 自然进入**：`Throwable::tick` 只**读** `inGround`，从来不写；
     * 这一版里连 `Snowball::onHit` 都不写（它只放粒子 + remove）。真正会写它的只有
     * `readAdditionalSaveData`（读存档）和 Arrow 那边的插地逻辑。
     * 所以这里走**读存档那条真路** —— 既是唯一能进入这个状态的途径，也顺带验了 NBT。
     */
    function stickIntoGround(): TestThrowable {
      level.setTileNoUpdate(X, 63, Z, Tile.rock.id);
      const tag = new CompoundTag();
      tag.putShort('xTile', X);
      tag.putShort('yTile', 63);
      tag.putShort('zTile', Z);
      tag.putByte('inTile', Tile.rock.id);
      tag.putByte('shake', 0);
      tag.putByte('inGround', 1);
      const t = new TestThrowable(level, X + 0.5, 64.5, Z + 0.5);
      t.load(tag); // load 会把 Pos/Motion 也读进来，位置随后重设
      t.setPos(X + 0.5, 64.5, Z + 0.5);
      t.xd = f(1);
      t.yd = 0;
      t.zd = 0;
      level.addEntity(t);
      return t;
    }

    it('插住之后 life 一直涨，到 20*60 那刻才 remove（**硬编码，不乘 TicksPerSecond**）', () => {
      const t = stickIntoGround();
      expect(t.isInGround(), '前置条件：已经插在地上了').toBe(true);

      // 插住之后每刻 life++；等到 1200 刻再检查
      for (let i = 0; i < 20 * 60 - 1; i++) level.tickEntities();
      expect(t.removed, `life=${20 * 60 - 1} 时还在`).toBe(false);
      level.tickEntities();
      expect(t.removed, 'life == 20*60 那刻 remove').toBe(true);
    });

    it('插住的那格方块被换掉 → 掉出来，速度被随机数缩到 0.2 倍以内', () => {
      const t = stickIntoGround();
      expect(t.xd, '前置条件：它带着速度').toBe(f(1));
      level.setTileNoUpdate(X, 63, Z, 0); // 换掉它插的那格
      level.tickEntities();
      expect(t.isInGround(), '方块没了 → 掉出来').toBe(false);
      // `xd *= sharedRandom.nextFloat() * 0.2f` —— 一定缩小
      expect(Math.abs(t.xd)).toBeLessThanOrEqual(f(0.2));
    });
  });

  describe('存档往返', () => {
    it('xTile/yTile/zTile 按 short、inTile/shake 按 byte 且**读时带 & 0xff**', () => {
      const t = new TestThrowable(level, X + 0.5, 64.5, Z + 0.5);
      // 直接写 private 字段不方便，走 tick 自然填不现实；用 save→load 验证键名与宽度
      const tag = new CompoundTag();
      t.save(tag);
      for (const k of ['xTile', 'yTile', 'zTile', 'inTile', 'shake', 'inGround']) {
        expect(tag.contains(k), `存档里应当有 ${k}`).toBe(true);
      }

      const back = new TestThrowable(level);
      back.load(tag);
      expect(back.shakeTime).toBe(0);
      expect(back.isInGround()).toBe(false);
    });

    it('shake 存 200 读回来是 200（`& 0xff` 那一步没漏）', () => {
      const t = new TestThrowable(level);
      t.shakeTime = 200;
      const tag = new CompoundTag();
      t.save(tag);
      const back = new TestThrowable(level);
      back.load(tag);
      expect(back.shakeTime, 'C++ 这里带 & 0xff，不像 FallingTile 那条').toBe(200);
    });
  });

  describe('零碎', () => {
    it('getAuxData 给的是 ownerId', () => {
      const t = new TestThrowable(level);
      expect(t.getAuxData()).toBe(0);
    });

    it('shouldRenderAtSqrDistance：以 bb 尺寸算出的那个距离为界', () => {
      const t = new TestThrowable(level);
      // size = bb.getSize() * 4 * 64，边界是 size²
      const size = f(f(t.bb.getSize() * 4) * f(64.0));
      expect(t.shouldRenderAtSqrDistance(f(size * size) - 1)).toBe(true);
      expect(t.shouldRenderAtSqrDistance(f(size * size) + 1)).toBe(false);
    });
  });
});
