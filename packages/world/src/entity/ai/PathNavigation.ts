/**
 * 1:1 移植自 src/world/entity/ai/PathNavigation.h（任务单 H11）：新 AI 的寻路导航。
 * 生成路径（Level.findPathToTile / findPathToEntity）、沿路径前进（交给 MoveControl）、跳过能直线走到的路点、
 * 每 100 刻检查一次是否卡住（1.5 格内没动就放弃路径）、避开阳光时截短路径。
 * C++ 的路径所有权（deletePath / navIsPathOwner、析构里 delete）在 JS 里没有意义：只保留“放弃路径 = path 置空”的语义。
 * 原样保留：trimPathFromSun 在第 0 个路点就见天时 `setSize(i - 1)` 会设成 -1；`refPath` 声明了但从未使用；
 *   canMoveDirectly 里 dirX / dirZ 为 0 时除出 ±Infinity（与 C++ 的 IEEE float 相同）。
 * R10：createPath(x, y, z) / createPath(Mob*) → createPathToPos / createPathToMob；
 *   moveTo(x, y, z, speed) / moveTo(Mob*, speed) / moveTo(Path*, speed, owner) → moveToPos / moveToMob / moveToPath。
 */
import { Mth } from '@mcpe/util';
import type { Level } from '../../level/Level';
import { Material } from '../../level/material/Material';
import { Path } from '../../level/pathfinder/Path';
import { Tile } from '../../level/tile/Tile';
import { Vec3 } from '../../phys/Vec3';
import type { Mob } from '../Mob';
import type { MoveControl } from './control/MoveControl';

const f = Math.fround;

export class PathNavigation {
  private mob: Mob;
  private level: Level;
  private path: Path | null = null;
  private speed = 0;
  private maxDist: number;
  private _tick = 0;
  private lastStuckCheck = 0;
  private lastStuckCheckPos = new Vec3(0, 0, 0);
  avoidWater = false;
  avoidSun = false;
  canOpenDoors = false;

  constructor(mob: Mob, level: Level, maxDist: number) {
    this.mob = mob;
    this.level = level;
    this.maxDist = f(maxDist);
  }

  setSpeed(speed: number): void {
    this.speed = f(speed);
  }

  createPathToPos(x: number, y: number, z: number): Path | null {
    if (!this.canUpdatePath()) return null;
    const p = new Path();
    this.level.findPathToTile(
      p,
      this.mob,
      Mth.floor(x),
      Math.trunc(y),
      Mth.floor(z),
      this.maxDist,
      this.canOpenDoors,
      this.avoidWater,
    );
    return p;
  }

  moveToPos(x: number, y: number, z: number, speed: number): boolean {
    const newPath = this.createPathToPos(x, y, z);
    return this.moveToPath(newPath, speed, true);
  }

  createPathToMob(target: Mob): Path | null {
    if (!this.canUpdatePath()) return null;
    const p = new Path();
    this.level.findPathToEntity(
      p,
      this.mob,
      target,
      this.maxDist,
      this.canOpenDoors,
      this.avoidWater,
    );
    return p;
  }

  moveToMob(target: Mob, speed: number): boolean {
    const newPath = this.createPathToMob(target);
    if (newPath) return this.moveToPath(newPath, speed, true);
    else return false;
  }

  moveToPath(newPath: Path | null, speed: number, _navIsPathOwner: boolean): boolean {
    if (newPath === null) {
      this.path = null; // deletePathIfNeeded
      return false;
    }
    newPath.last(); // C++ 取了 last 却没用（if (last) {} 是空的）
    this.path = newPath;
    if (this.avoidSun) this.trimPathFromSun();
    if (this.path.getSize() === 0) return false;
    this.speed = f(speed);
    const mobPos = this.getTempMobPos();
    this.lastStuckCheck = this._tick;
    this.lastStuckCheckPos.x = mobPos.x;
    this.lastStuckCheckPos.y = mobPos.y;
    this.lastStuckCheckPos.z = mobPos.z;
    return true;
  }

  getPath(): Path | null {
    return this.path;
  }

  tick(): void {
    ++this._tick;
    if (this.isDone()) return;
    if (this.canUpdatePath()) this.updatePath();
    if (this.isDone()) return;
    const target = this.path!.currentPos(this.mob);
    (this.mob.getMoveControl() as MoveControl).setWantedPosition(
      target.x,
      target.y,
      target.z,
      this.speed,
    );
  }

  isDone(): boolean {
    return !this.path || this.path.isDone();
  }

  stop(): void {
    this.path = null; // deletePathIfNeeded
  }

  private updatePath(): void {
    const mobPos = this.getTempMobPos();
    const path = this.path!;
    let firstElevation = path.getSize();
    for (let i = path.getIndex(); i < path.getSize(); ++i)
      if (path.get(i).y !== Math.trunc(mobPos.y)) {
        firstElevation = i;
        break;
      }
    const waypointRadiusSqr = f(this.mob.bbWidth * this.mob.bbWidth);
    for (let i = path.getIndex(); i < firstElevation; ++i) {
      const wp = path.getPos(this.mob, i);
      if (mobPos.distanceToSqr(wp.x, wp.y, wp.z) < waypointRadiusSqr) {
        path.setIndex(i + 1);
      }
    }
    const sx = Math.trunc(Math.ceil(this.mob.bbWidth));
    const sy = Math.trunc(this.mob.bbHeight) + 1;
    const sz = sx;
    for (let i = firstElevation - 1; i >= path.getIndex(); --i) {
      if (this.canMoveDirectly(mobPos, path.getPos(this.mob, i), sx, sy, sz)) {
        path.setIndex(i);
        break;
      }
    }
    if (this._tick - this.lastStuckCheck > 100) {
      const lp = this.lastStuckCheckPos;
      if (mobPos.distanceToSqr(lp.x, lp.y, lp.z) < 1.5 * 1.5) this.stop();
      this.lastStuckCheck = this._tick;
      this.lastStuckCheckPos.x = mobPos.x;
      this.lastStuckCheckPos.y = mobPos.y;
      this.lastStuckCheckPos.z = mobPos.z;
    }
  }

  private getTempMobPos(): Vec3 {
    return new Vec3(this.mob.x, this.getSurfaceY(), this.mob.z);
  }

  private getSurfaceY(): number {
    const mob = this.mob;
    if (!mob.isInWater()) return Math.trunc(mob.bb.y0 + 0.5);
    let surface = Math.trunc(mob.bb.y0);
    let tileId = this.level.getTile(Mth.floor(mob.x), surface, Mth.floor(mob.z));
    let steps = 0;
    while (tileId === Tile.water.id || tileId === Tile.calmWater.id) {
      ++surface;
      tileId = this.level.getTile(Mth.floor(mob.x), surface, Mth.floor(mob.z));
      if (++steps > 16) return Math.trunc(mob.bb.y0);
    }
    return surface;
  }

  private canUpdatePath(): boolean {
    return this.mob.onGround || this.isInLiquid();
  }

  private isInLiquid(): boolean {
    return this.mob.isInWater() || this.mob.isInLava();
  }

  private trimPathFromSun(): void {
    const mob = this.mob;
    if (this.level.canSeeSky(Mth.floor(mob.x), Math.trunc(mob.bb.y0 + 0.5), Mth.floor(mob.z)))
      return;
    const path = this.path!;
    for (let i = 0; i < path.getSize(); ++i) {
      const n = path.get(i);
      if (this.level.canSeeSky(n.x, n.y, n.z)) {
        path.setSize(i - 1);
        return;
      }
    }
  }

  private canMoveDirectly(
    startPos: Vec3,
    stopPos: Vec3,
    sx: number,
    sy: number,
    sz: number,
  ): boolean {
    let gridPosX = Mth.floor(startPos.x);
    let gridPosZ = Mth.floor(startPos.z);
    let dirX = f(stopPos.x - startPos.x);
    let dirZ = f(stopPos.z - startPos.z);
    const distSqr = f(f(dirX * dirX) + f(dirZ * dirZ));
    if (distSqr < f(0.00001)) return false;
    const nf = Mth.invSqrt(distSqr);
    dirX = f(dirX * nf);
    dirZ = f(dirZ * nf);
    sx += 2;
    sz += 2;
    if (
      !this.canWalkOn(gridPosX, Math.trunc(startPos.y), gridPosZ, sx, sy, sz, startPos, dirX, dirZ)
    )
      return false;
    sx -= 2;
    sz -= 2;
    const deltaX = f(1 / Mth.abs(dirX));
    const deltaZ = f(1 / Mth.abs(dirZ));
    let maxX = f(gridPosX * 1 - startPos.x);
    let maxZ = f(gridPosZ * 1 - startPos.z);
    if (dirX >= 0) maxX = f(maxX + 1);
    if (dirZ >= 0) maxZ = f(maxZ + 1);
    maxX = f(maxX / dirX);
    maxZ = f(maxZ / dirZ);
    const stepX = dirX < 0 ? -1 : 1;
    const stepZ = dirZ < 0 ? -1 : 1;
    const gridGoalX = Mth.floor(stopPos.x);
    const gridGoalZ = Mth.floor(stopPos.z);
    let currentDirX = gridGoalX - gridPosX;
    let currentDirZ = gridGoalZ - gridPosZ;
    while (currentDirX * stepX > 0 || currentDirZ * stepZ > 0) {
      if (maxX < maxZ) {
        maxX = f(maxX + deltaX);
        gridPosX += stepX;
        currentDirX = gridGoalX - gridPosX;
      } else {
        maxZ = f(maxZ + deltaZ);
        gridPosZ += stepZ;
        currentDirZ = gridGoalZ - gridPosZ;
      }
      if (
        !this.canWalkOn(
          gridPosX,
          Math.trunc(startPos.y),
          gridPosZ,
          sx,
          sy,
          sz,
          startPos,
          dirX,
          dirZ,
        )
      )
        return false;
    }
    return true;
  }

  private canWalkOn(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    startPos: Vec3,
    goalDirX: number,
    goalDirZ: number,
  ): boolean {
    const startX = x - Math.trunc(sx / 2);
    const startZ = z - Math.trunc(sz / 2);
    if (!this.canWalkAbove(startX, y, startZ, sx, sy, sz, startPos, goalDirX, goalDirZ))
      return false;
    for (let xx = startX; xx < startX + sx; xx++) {
      for (let zz = startZ; zz < startZ + sz; zz++) {
        const dirX = f(f(xx + 0.5) - startPos.x);
        const dirZ = f(f(zz + 0.5) - startPos.z);
        if (f(f(dirX * goalDirX) + f(dirZ * goalDirZ)) < 0) continue;
        const tile = this.level.getTile(xx, y - 1, zz);
        if (tile <= 0) return false;
        const m = Tile.tiles[tile]!.material;
        if (m === Material.water && !this.mob.isInWater()) return false;
        if (m === Material.lava) return false;
      }
    }
    return true;
  }

  private canWalkAbove(
    startX: number,
    startY: number,
    startZ: number,
    sx: number,
    sy: number,
    sz: number,
    startPos: Vec3,
    goalDirX: number,
    goalDirZ: number,
  ): boolean {
    for (let xx = startX; xx < startX + sx; xx++) {
      for (let yy = startY; yy < startY + sy; yy++) {
        for (let zz = startZ; zz < startZ + sz; zz++) {
          const dirX = f(f(xx + 0.5) - startPos.x);
          const dirZ = f(f(zz + 0.5) - startPos.z);
          if (f(f(dirX * goalDirX) + f(dirZ * goalDirZ)) < 0) continue;
          const tile = this.level.getTile(xx, yy, zz);
          if (tile <= 0) continue;
          if (Tile.tiles[tile]!.material.blocksMotion()) return false;
        }
      }
    }
    return true;
  }
}
