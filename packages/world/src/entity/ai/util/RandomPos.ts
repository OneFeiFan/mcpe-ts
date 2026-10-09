/**
 * 1:1 移植自 src/world/entity/ai/util/RandomPos.h（任务单 H11）：在生物周围随机取 10 个点，按 getWalkTargetValue 挑最好的。
 * C++ 用引用参数 Vec3& outPos 输出；这里返回 Vec3 或 null（ADAPTED(Cpp)）。
 */
import { Mth } from '@mcpe/util';
import { Vec3 } from '../../../phys/Vec3';
import type { PathfinderMob } from '../../PathfinderMob';

const f = Math.fround;
export class RandomPos {
  static getPos(mob: PathfinderMob, xzDist: number, yDist: number): Vec3 | null {
    return RandomPos.generateRandomPos(mob, xzDist, yDist, null);
  }

  static getPosTowards(
    mob: PathfinderMob,
    xzDist: number,
    yDist: number,
    towardsPos: Vec3,
  ): Vec3 | null {
    const tempDir = new Vec3(towardsPos.x, towardsPos.y, towardsPos.z);
    tempDir.subSelf(mob.x, mob.y, mob.z);
    return RandomPos.generateRandomPos(mob, xzDist, yDist, tempDir);
  }

  static getPosAvoid(
    mob: PathfinderMob,
    xzDist: number,
    yDist: number,
    avoidPos: Vec3,
  ): Vec3 | null {
    const tempDir = new Vec3(mob.x, mob.y, mob.z);
    tempDir.subSelf(avoidPos.x, avoidPos.y, avoidPos.z);
    return RandomPos.generateRandomPos(mob, xzDist, yDist, tempDir);
  }

  private static generateRandomPos(
    mob: PathfinderMob,
    xzDist: number,
    yDist: number,
    dir: Vec3 | null,
  ): Vec3 | null {
    const random = mob.random;
    let hasBest = false;
    let xBest = 0;
    let yBest = 0;
    let zBest = 0;
    let best = -99999;
    for (let i = 0; i < 10; i++) {
      let xt = random.nextInt(2 * xzDist) - xzDist;
      let yt = random.nextInt(2 * yDist) - yDist;
      let zt = random.nextInt(2 * xzDist) - xzDist;
      if (dir !== null && f(f(xt * dir.x) + f(zt * dir.z)) < 0) continue;
      xt += Mth.floor(mob.x);
      yt += Mth.floor(mob.y);
      zt += Mth.floor(mob.z);
      const value = mob.getWalkTargetValue(xt, yt, zt);
      if (value > best) {
        best = value;
        xBest = xt;
        yBest = yt;
        zBest = zt;
        hasBest = true;
      }
    }
    if (hasBest) {
      return new Vec3(xBest, yBest, zBest);
    }
    return null;
  }
}
