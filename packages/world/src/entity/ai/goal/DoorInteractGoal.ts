/**
 * 1:1 移植自 src/world/entity/ai/goal/DoorInteractGoal.h（任务单 H11）：撞墙时从路径起点到当前节点后一个
 * （共 min(index + 2, size) 个）路点里找木门，找不到再查 floor(mob.y + 1) 那一格；穿过门（方向反转）就结束。
 * 这一版里没有任何生物添加这个 goal（BreakDoorGoal 也没有），照抄。
 */
import { Mth } from '@mcpe/util';
import type { DoorTile } from '../../../level/tile/DoorTile';
import { Tile } from '../../../level/tile/Tile';
import type { Monster } from '../../monster/Monster';
import { Goal } from './Goal';

const f = Math.fround;

export class DoorInteractGoal extends Goal {
  // ADAPTED(Safety)：C++ 构造函数只初始化 mob，doorX/doorY/doorZ、doorTile、passed、
  // doorOpenDirX/Z 都未初始化（读它们是未定义行为）。这里按规则取 0 / null / false；
  // 正常流程在 canUse（doorX/Y/Z、doorTile）与 start（passed、doorOpenDirX/Z）里先赋值。
  protected mob: Monster;
  protected doorX = 0;
  protected doorY = 0;
  protected doorZ = 0;
  protected doorTile: DoorTile | null = null;
  private passed = false;
  private doorOpenDirX = 0;
  private doorOpenDirZ = 0;

  constructor(mob: Monster) {
    super();
    this.mob = mob;
  }

  canUse(): boolean {
    if (!this.mob.horizontalCollision) return false;
    const pathNav = this.mob.getNavigation()!;
    const path = pathNav.getPath();
    if (path === null || path.isDone() || !pathNav.canOpenDoors) return false;
    for (let i = 0; i < Mth.Min(path.getIndex() + 2, path.getSize()); ++i) {
      const n = path.get(i);
      this.doorX = n.x;
      this.doorY = n.y + 1;
      this.doorZ = n.z;
      if (this.mob.distanceToSqr(this.doorX, this.mob.y, this.doorZ) > f(1.5 * 1.5)) continue;
      this.doorTile = this.getDoorTile(this.doorX, this.doorY, this.doorZ);
      if (this.doorTile === null) continue;
      return true;
    }
    this.doorX = Mth.floor(this.mob.x);
    this.doorY = Mth.floor(this.mob.y + 1);
    this.doorZ = Mth.floor(this.mob.z);
    this.doorTile = this.getDoorTile(this.doorX, this.doorY, this.doorZ);
    return this.doorTile !== null;
  }

  override canContinueToUse(): boolean {
    return !this.passed;
  }

  override start(): void {
    this.passed = false;
    this.doorOpenDirX = f(f(this.doorX + 0.5) - this.mob.x);
    this.doorOpenDirZ = f(f(this.doorZ + 0.5) - this.mob.z);
  }

  override tick(): void {
    const newDoorDirX = f(f(this.doorX + 0.5) - this.mob.x);
    const newDoorDirZ = f(f(this.doorZ + 0.5) - this.mob.z);
    const dot = f(f(this.doorOpenDirX * newDoorDirX) + f(this.doorOpenDirZ * newDoorDirZ));
    if (dot < 0) {
      this.passed = true;
    }
  }

  private getDoorTile(x: number, y: number, z: number): DoorTile | null {
    const tileId = this.mob.level.getTile(x, y, z);
    if (tileId !== Tile.door_wood.id) return null;
    return Tile.tiles[tileId] as DoorTile;
  }
}
