import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Arrow, type Entity, initItems, type Level, Skeleton } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核 W38（packages/world/src/entity/monster/Skeleton.ts）。
//   1. checkHurtTarget(Entity*, float d) 的形参是 float，入口先舍入（同类：W32 Creeper、W33 Monster、W36 Spider）；
//   2. 着火粒子坐标 `x + random.nextFloat() * bbWidth * 2 - bbWidth` 按 C++ 左结合逐步舍入
//      （旧写法把 `nextFloat()*bbWidth*2` 整段按 double 算完再舍入，外层的加/减也没舍入）；
//   3. getUseDuration 在 C++ Skeleton.h 的 protected 段（只在 Skeleton 声明，无基类对应）。

const f = Math.fround;

class ExposedSkeleton extends Skeleton {
  hit(target: Entity, d: number): void {
    this.checkHurtTarget(target, d);
  }
}

describe('Skeleton 审核（W38）', () => {
  let level: Level;

  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    createFlatLevel();
    initItems(); // Skeleton 构造时 new ItemInstance(Item.bow, 1)，未注册会抛错
  });

  beforeEach(() => {
    level = createFlatLevel();
    prepareLevel(level);
  });

  it('W38：checkHurtTarget 的 float 形参入口舍入（d < 10 边界）', () => {
    const attacker = new ExposedSkeleton(level);
    const target = new Skeleton(level);
    attacker.moveTo(8.5, 64, 8.5, 0, 0);
    target.moveTo(14.5, 64, 8.5, 0, 0);
    level.addEntity(attacker);
    level.addEntity(target);

    // double 略小于 10，舍入成 float 正好是 10：C++ 里 `d < 10` 为假，不射箭。
    const d = 9.999999999999998;
    expect(f(d)).toBe(10);
    expect(d < 10).toBe(true);

    const arrowsBefore = level.entities.filter((e) => e instanceof Arrow).length;
    attacker.hit(target, d);

    expect(level.entities.filter((e) => e instanceof Arrow).length).toBe(arrowsBefore);
    expect(attacker.attackTime).toBe(0);
    expect(attacker.yRot).toBe(0);
  });

  it('W38：着火粒子坐标按 C++ 左结合逐步舍入', () => {
    const sk = new Skeleton(level);
    sk.moveTo(0.5, 64, 0.5, 0, 0);
    level.addEntity(sk);

    vi.spyOn(level, 'isDay').mockReturnValue(true);
    vi.spyOn(level, 'canSeeSky').mockReturnValue(true);
    vi.spyOn(sk, 'getBrightness').mockReturnValue(f(1));
    const particles: Array<[number, number, number]> = [];
    vi.spyOn(level, 'addParticle').mockImplementation((_id, x, y, z) => {
      particles.push([x, y, z]);
    });

    // 第一次 nextFloat 用于“是否着火”判定（0.1*3.5=0.35 < 1-0.4=0.6），其余全是 v。
    // v 能让“逐步舍入”和“整段 double 再舍入”得到不同的 float 结果（已用穷举脚本找到）。
    const v = 0.2360679774997898;
    vi.spyOn(sk.random, 'nextFloat').mockReturnValueOnce(0.1).mockReturnValue(v);

    sk.aiStep();

    expect(particles.length).toBe(5);
    const bw = sk.bbWidth;
    const bh = sk.bbHeight;
    const expectedX = f(f(sk.x + f(f(v * bw) * 2)) - bw);
    const expectedY = f(sk.y + f(v * bh));
    const expectedZ = f(f(sk.z + f(f(v * bw) * 2)) - bw);
    expect(particles[0]).toEqual([expectedX, expectedY, expectedZ]);
    // 旧写法（整段 double）会得到不同的值，确保这条断言能分辨两种实现
    expect(sk.x + f(v * bw * 2) - bw).not.toBe(expectedX);
  });

  it('W38：getUseDuration 按 C++ 收进 protected，返回值是 attackTime', () => {
    type SkeletonPublicKeys = keyof Skeleton;
    const isPublic: 'getUseDuration' extends SkeletonPublicKeys ? true : false = false;
    void isPublic;

    class Exposed extends Skeleton {
      duration(): number {
        return this.getUseDuration();
      }
    }
    const sk = new Exposed(level);
    level.addEntity(sk);
    sk.attackTime = 42;
    expect(sk.duration()).toBe(42);
  });
});
