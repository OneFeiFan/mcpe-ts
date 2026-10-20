import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chicken, initItems, Item, ItemEntity, type Level, LevelListener, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核 W28（packages/world/src/entity/animal/Chicken.ts）。
//
// 本文件只钉审核关心的四处细节，其余行为已由 chicken.test.ts（D10b）覆盖：
//   1. 下蛋音高里两个 `random.nextFloat()` 的读取顺序（C++ 未指定 → DEFERRED(待确认)，
//      现行选择从左到右，与 Entity/Mob/ItemEntity/Player 的先例一致）；
//   2. 同一个表达式每步都按 float 舍入（`(a-b)*0.2f+1.0f`，不是整段 double 最后再舍入）；
//      其中“差先舍入”单独用一对能让两种写法结果不同的值锁定（W28）；
//   3. 重置 eggTime 用的是 `this.random.nextInt(6000) + 6000`，不是别的随机源/常量；
//   4. 空中时 oFlap/oFlapSpeed 存旧值、flapping 的抬回与衰减、flap 的累加顺序。

const f = Math.fround;
const X = 130;
const Y = 64;
const Z = 130;

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  for (let x = X - 4; x <= X + 4; x++)
    for (let z = Z - 4; z <= Z + 4; z++) {
      level.setTileNoUpdate(x, Y - 1, z, Tile.grass.id);
      for (let y = Y; y <= Y + 8; y++) level.setTileNoUpdate(x, y, z, 0);
    }
});

/** 收声音的监听器（下蛋那句 playSound） */
class RecordingListener extends LevelListener {
  sounds: Array<[string, number, number]> = [];
  override playSound(
    name: string,
    _x: number,
    _y: number,
    _z: number,
    volume: number,
    pitch: number,
  ): void {
    this.sounds.push([name, volume, pitch]);
  }
}

/**
 * `Mob::aiStep` 会先跑 `updateAi()`，那里面也用 `random.nextFloat()`。
 * 审核要数下蛋那一句抽了几个随机数，所以在测试子类里把它关掉。
 */
class AuditChicken extends Chicken {
  protected override updateAi(): void {}
}

function makeAuditChicken(y: number): AuditChicken {
  const c = new AuditChicken(level);
  c.setPos(X + 0.5, y, Z + 0.5);
  level.addEntity(c);
  return c;
}

describe('Chicken 审核（W28）', () => {
  it('下蛋音高：两个 nextFloat 从左到右读取，且每步按 float 舍入', () => {
    const rec = new RecordingListener();
    level.addListener(rec);
    const c = makeAuditChicken(Y);

    // 左操作数先取 0.75，右操作数再取 0.25
    const nextFloat = vi
      .spyOn(c.random, 'nextFloat')
      .mockReturnValueOnce(f(0.75))
      .mockReturnValueOnce(f(0.25));

    c.eggTime = 1; // 把下蛋那一刻提前
    c.aiStep();

    expect(nextFloat, '下蛋这一句恰好抽两个 nextFloat').toHaveBeenCalledTimes(2);
    expect(rec.sounds.length).toBe(1);
    const [name, volume, pitch] = rec.sounds[0]!;
    expect(name).toBe('mob.chickenplop');
    expect(volume, '1.0f').toBe(f(1.0));
    // C++ 原句：(a - b) * 0.2f + 1.0f —— 先减、再乘、再加，每步 float。
    // 若将来用黄金样本确认 GCC 实际是右到左，这里应改成先取 0.25 再取 0.75。
    expect(pitch).toBe(f(f(f(f(0.75) - f(0.25)) * f(0.2)) + f(1.0)));
    expect(pitch).toBe(f(1.1));
  });

  it('重置 eggTime：this.random.nextInt(6000) + 6000', () => {
    const c = makeAuditChicken(Y);
    const nextInt = vi.spyOn(c.random, 'nextInt');

    c.eggTime = 1;
    c.aiStep();

    expect(nextInt, '参数是 TicksPerSecond * 60 * 5 = 6000').toHaveBeenCalledWith(6000);
    expect(c.eggTime, '结果落在 [5 分钟, 10 分钟) 的刻数里').toBeGreaterThanOrEqual(6000);
    expect(c.eggTime).toBeLessThan(12000);
    const dropped = level.entities.filter((e) => e instanceof ItemEntity).pop()! as ItemEntity;
    expect(dropped.item.id, '同一帧还掉了一个蛋').toBe(Item.egg.id);
    expect(dropped.item.count).toBe(1);
  });

  it('W28：两个 nextFloat 的差先舍入成 float，再乘 0.2f（不是整段 double）', () => {
    const rec = new RecordingListener();
    level.addListener(rec);
    const c = makeAuditChicken(Y);

    // 这对值能让“差先 f()”和“差按 double 直接乘”得到不同的 float 结果。
    const a = f(0.032417189329862595);
    const b = f(0.22629961371421814);
    vi.spyOn(c.random, 'nextFloat').mockReturnValueOnce(a).mockReturnValueOnce(b);

    c.eggTime = 1;
    c.aiStep();

    const pitch = rec.sounds[0]![2];
    expect(pitch).toBe(f(f(f(f(a - b)) * f(0.2)) + f(1.0)));
    expect(pitch).not.toBe(f(f((a - b) * f(0.2)) + f(1.0)));
  });

  it('空中：oFlap/oFlapSpeed 先存旧值，flapping 抬回 1 再 ×0.9f，flap += flapping * 2', () => {
    const c = makeAuditChicken(Y + 4);
    c.onGround = false;
    c.flap = f(0.7);
    c.flapSpeed = f(0.5);
    c.flapping = f(0.5);
    c.yd = 0;

    c.aiStep();

    expect(c.onGround, '前置条件：还在空中').toBe(false);
    expect(c.oFlap, '改 flap 之前的值').toBe(f(0.7));
    expect(c.oFlapSpeed, '改 flapSpeed 之前的值').toBe(f(0.5));
    expect(c.flapSpeed, '0.5 + 4 * 0.3f 后夹到上界').toBe(1);
    expect(c.flapping, '先被抬回 1，再乘 0.9f').toBe(f(0.9));
    expect(c.flap).toBe(f(f(0.7) + f(f(0.9) * 2)));
  });
});
