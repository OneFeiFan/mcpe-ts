/**
 * 全量审核第 2 批（world/entity/ai）：W43–W47。
 * - W43 MoveControl：`(float)(std::atan2(zd, xd) * 180 / Mth::PI) - 90` 每一步都按 float 舍入；
 *   旧写法把 atan2 结果、×180、÷π 留在 double 里只舍入一次，末位不同。
 * - W44 JumpControl、W45 Control、W46 Sensing、W47 RandomPos：逐行核对一致，测试钉住行为。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Control,
  initItems,
  initTileEntities,
  JumpControl,
  MoveControl,
  RandomPos,
  Sensing,
  Vec3,
  Zombie,
  type Level,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

describe('MoveControl（W43）', () => {
  it('W43：朝向按 std::atan2（float）→ ×180 → ÷Mth::PI → −90 逐步 f()', () => {
    const z = new Zombie(level);
    z.moveTo(0, 64, 0, 0, 0);
    const mc = z.getMoveControl() as MoveControl;
    mc.setWantedPosition(0.5, 64, 1.502, 0.5);

    mc.tick();

    // C++：yRotD = (float)(std::atan2(zd, xd) * 180 / Mth::PI) - 90，每步 float。
    // 这组输入下 C++ 得 -18.41205596923828；旧写法（atan2×180÷π 留在 double、只舍入一次）
    // 得 -18.412063598632812。mob.yRot 初值 0 且 |yRotD| < 30，rotlerp 不再改动它。
    expect(z.yRot).toBe(-18.41205596923828);
  });

  it('每刻最多转 30°；hasWanted 消费后清零；速度原样交给 mob', () => {
    const z = new Zombie(level);
    z.moveTo(128.5, 64, 128.5, 0, 0);
    const mc = z.getMoveControl() as MoveControl;
    mc.setWantedPosition(140.5, 64, 128.5, 0.5);
    expect(mc.hasWanted()).toBe(true);
    expect(mc.getSpeed()).toBe(0.5);

    mc.tick();

    expect(z.yRot).toBe(-30);
    expect(mc.hasWanted()).toBe(false);
  });
});

describe('JumpControl（W44）', () => {
  it('jump() 只置 _jump；tick() 交给 mob 后清零', () => {
    const z = new Zombie(level);
    const jc = z.getJumpControl() as JumpControl;
    z.jumping = false;

    jc.jump();
    expect(z.jumping).toBe(false);

    jc.tick();
    expect(z.jumping).toBe(true);

    jc.tick();
    expect(z.jumping).toBe(false);
  });
});

describe('Control（W45）', () => {
  it('控制位常量与 C++ 一致：Move=1、Look=2、Jump=4', () => {
    expect(Control.MoveControlFlag).toBe(1);
    expect(Control.LookControlFlag).toBe(2);
    expect(Control.JumpControlFlag).toBe(4);
  });
});

describe('Sensing（W46）', () => {
  it('同一目标在同一刻只问一次 mob.canSee；tick() 清空 seen/unseen', () => {
    const mob = new Zombie(level);
    const target = new Zombie(level);
    const canSee = vi.spyOn(mob, 'canSee').mockReturnValue(true);
    const sensing = new Sensing(mob);

    expect(sensing.canSee(target)).toBe(true);
    expect(sensing.canSee(target)).toBe(true);
    expect(canSee).toHaveBeenCalledTimes(1);

    sensing.tick();
    expect(sensing.canSee(target)).toBe(true);
    expect(canSee).toHaveBeenCalledTimes(2);

    canSee.mockReturnValue(false);
    sensing.tick();
    expect(sensing.canSee(target)).toBe(false);
    expect(sensing.canSee(target)).toBe(false);
    expect(canSee).toHaveBeenCalledTimes(3);
  });
});

describe('RandomPos（W47）', () => {
  it('getPos：每轮按 nextInt(20)→nextInt(14)→nextInt(20) 抽三次，10 轮取 getWalkTargetValue 最大者', () => {
    const z = new Zombie(level);
    z.moveTo(0.5, 64, 0.5, 0, 0);
    const queue: number[] = [];
    for (let i = 0; i < 10; i++) queue.push(i, 0, 0);
    const nextInt = vi
      .spyOn(z.random, 'nextInt')
      .mockImplementation((_n: number) => queue.shift() ?? 0);
    const walk = vi.spyOn(z, 'getWalkTargetValue').mockImplementation((x: number) => x);

    const pos = RandomPos.getPos(z, 10, 7);

    expect(nextInt).toHaveBeenCalledTimes(30);
    expect(nextInt).toHaveBeenNthCalledWith(1, 20);
    expect(nextInt).toHaveBeenNthCalledWith(2, 14);
    expect(nextInt).toHaveBeenNthCalledWith(3, 20);
    expect(walk).toHaveBeenCalledTimes(10);
    // 第 10 轮 xt = 9 - 10 = -1 最大；y = floor(64) - 7；z = floor(0.5) - 10。
    expect(pos).toBeInstanceOf(Vec3);
    expect([pos?.x, pos?.y, pos?.z]).toEqual([-1, 57, -10]);
  });

  it('getPosTowards / getPosAvoid：点积 < 0 的点在抽完三个随机数后跳过', () => {
    const towards = new Vec3(10, 64, 0); // dir = towards - mob = (10, 0, 0)
    const zt = new Zombie(level);
    zt.moveTo(0, 64, 0, 0, 0);
    const qt = [20, 0, 0, ...Array<number>(27).fill(0)];
    const nextTowards = vi
      .spyOn(zt.random, 'nextInt')
      .mockImplementation((_n: number) => qt.shift() ?? 0);
    const walkTowards = vi.spyOn(zt, 'getWalkTargetValue').mockReturnValue(1);

    const posTowards = RandomPos.getPosTowards(zt, 10, 7, towards);

    expect(nextTowards).toHaveBeenCalledTimes(30); // 跳过前已抽完 x/y/z
    expect(walkTowards).toHaveBeenCalledTimes(1); // 只有被接受的点问值
    expect([posTowards?.x, posTowards?.y, posTowards?.z]).toEqual([10, 57, -10]);

    const avoid = new Vec3(10, 64, 0); // dir = mob - avoid = (-10, 0, 0)，同一批随机数方向相反
    const za = new Zombie(level);
    za.moveTo(0, 64, 0, 0, 0);
    const qa = [20, 0, 0, ...Array<number>(27).fill(0)];
    vi.spyOn(za.random, 'nextInt').mockImplementation((_n: number) => qa.shift() ?? 0);
    const walkAvoid = vi.spyOn(za, 'getWalkTargetValue').mockReturnValue(1);

    const posAvoid = RandomPos.getPosAvoid(za, 10, 7, avoid);

    expect(walkAvoid).toHaveBeenCalledTimes(9);
    expect([posAvoid?.x, posAvoid?.y, posAvoid?.z]).toEqual([-10, 57, -10]);
  });

  it('所有点都被 dir 过滤掉时返回 null（C++ 不写 outPos、返回 false）', () => {
    const z = new Zombie(level);
    z.moveTo(0, 64, 0, 0, 0);
    vi.spyOn(z.random, 'nextInt').mockReturnValue(0); // 每轮 xt = zt = -10
    const walk = vi.spyOn(z, 'getWalkTargetValue');

    expect(RandomPos.getPosTowards(z, 10, 7, new Vec3(10, 64, 0))).toBeNull();
    expect(walk).not.toHaveBeenCalled();
  });
});
