/**
 * 1:1 移植自 src/world/level/pathfinder/PathFinder.h（任务单 H2；C++ 整个实现写在头文件里）。A* 寻路。
 * 原样保留的行为：
 *   - isFree 里的 `walkable` 算了却从不返回，TYPE_WALKABLE 永远不会出现；
 *   - 门那一段先取了 data 却没用，判断开关用的是 `entity->level`（不是寻路用的 Region）；
 *   - 起点在水里时 avoidWater 被置 false，`resetAvoidWater` 记下了旧值却从不恢复；
 *   - 节点表按 createHash 查（std::map<int, TNode>），哈希相同的不同坐标会被当成同一个节点。
 * 省略：FreeCache（声明了但没有任何代码使用）、Stopwatch 计时、节点池 `_nodes[MAX_NODES]` 与 `_pending` 的内存管理
 *   （C++ 复用数组里的节点、超过 2048 个才 new；JS 里每次新建，行为相同）。
 * R10：findPath 的四个重载 → findPathToEntity(path, from, to, maxDist)、findPathToTile(path, from, x, y, z, maxDist)（公开），
 *   私有的 findPathToPoint(path, e, xt, yt, zt, maxDist) 与 findPathBetween(path, e, from, to, size, maxDist)；
 *   getNode 的两个重载 → getNodeFor(entity, x, y, z, size, jumpSize) 与 getNode(x, y, z)。
 */
import { LOGI } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import type { Entity } from '../../entity/Entity';
import type { LevelSource } from '../LevelSource';
import { Material } from '../material/Material';
import { DoorTile } from '../tile/DoorTile';
import { Tile } from '../tile/Tile';
import { BinaryHeap } from './BinaryHeap';
import { Node } from './Node';
import type { Path } from './Path';

const f = Math.fround;
/** PathFinder.h 的 static int __created、__maxCreated */
const stats = { created: 0, maxCreated: 0 };
const MAX_NODES = 2048;

export class PathFinder {
  static readonly TYPE_FENCE = 1;
  static readonly TYPE_LAVA = 2;
  static readonly TYPE_WATER = 3;
  static readonly TYPE_BLOCKED = 4;
  static readonly TYPE_OPEN = 5;
  static readonly TYPE_WALKABLE = 6;

  canOpenDoors = false;
  avoidWater = false;
  private level: LevelSource | null = null;
  private openSet = new BinaryHeap();
  private nodes = new Map<number, Node>();
  private _nodeIndex = 0;
  private neighbors: Node[] = new Array<Node>(32);

  constructor(level: LevelSource | null = null) {
    if (level) this.setLevelSource(level);
  }

  setLevelSource(level: LevelSource): void {
    this.level = level;
  }

  findPathToEntity(path: Path, from: Entity, to: Entity, maxDist: number): boolean {
    return this.findPathToPoint(path, from, to.x, to.bb.y0, to.z, maxDist);
  }

  findPathToTile(path: Path, from: Entity, x: number, y: number, z: number, maxDist: number): boolean {
    return this.findPathToPoint(path, from, f(x + 0.5), f(y + 0.5), f(z + 0.5), maxDist);
  }

  private findPathToPoint(path: Path, e: Entity, xt: number, yt: number, zt: number, maxDist: number): boolean {
    const level = this.level!;
    this.nodes.clear();
    this._nodeIndex = 0;
    let resetAvoidWater = this.avoidWater;
    let startY: number;
    if (e.isInWater()) {
      startY = Math.trunc(e.bb.y0);
      let tileId = level.getTile(Mth.floor(e.x), startY, Mth.floor(e.z));
      while (tileId === Tile.water.id || tileId === Tile.calmWater.id) {
        ++startY;
        tileId = level.getTile(Mth.floor(e.x), startY, Mth.floor(e.z));
      }
      resetAvoidWater = this.avoidWater;
      this.avoidWater = false;
    } else startY = Mth.floor(f(e.bb.y0 + 0.5));
    void resetAvoidWater; // C++ 记下了却从不恢复（见文件头）
    const from = this.getNode(Mth.floor(e.bb.x0), startY, Mth.floor(e.bb.z0));
    const xx0 = Mth.floor(f(xt - f(e.bbWidth / 2)));
    const yy0 = Mth.floor(yt);
    const zz0 = Mth.floor(f(zt - f(e.bbWidth / 2)));
    let to: Node | null = null;
    if (level.getTile(xx0, yy0 - 1, zz0)) {
      to = this.getNode(xx0, yy0, zz0);
    } else {
      const xx1 = Mth.floor(f(xt + f(e.bbWidth / 2)));
      const zz1 = Mth.floor(f(zt + f(e.bbWidth / 2)));
      for (let xx = xx0; xx <= xx1; ++xx)
        for (let zz = zz0; zz <= zz1; ++zz) {
          if (level.getTile(xx, yy0 - 1, zz) !== 0) {
            to = this.getNode(xx, yy0, zz);
            break; // C++ 的 break 只跳出内层循环
          }
        }
      if (!to) {
        let yy = yy0;
        while (!level.getTile(xx0, yy - 1, zz0) && yy > 0) --yy;
        to = this.getNode(xx0, yy, zz0);
      }
    }
    const size = new Node(Mth.floor(f(e.bbWidth + 1)), Mth.floor(f(e.bbHeight + 1)), Mth.floor(f(e.bbWidth + 1)));
    return this.findPathBetween(path, e, from, to, size, maxDist);
  }

  private findPathBetween(path: Path, e: Entity, from: Node, to: Node, size: Node, maxDist: number): boolean {
    stats.created = 0;
    from.g = 0;
    from.h = from.distanceTo(to);
    from.f = from.h;
    this.openSet.clear();
    this.openSet.insert(from);
    let closest = from;
    while (!this.openSet.isEmpty()) {
      const x = this.openSet.pop();
      if (x.equals(to)) {
        this.logMax();
        this.reconstruct_path(path, from, to);
        return true;
      }
      if (x.distanceTo(to) < closest.distanceTo(to)) {
        closest = x;
      }
      x.closed = true;
      const neighborCount = this.getNeighbors(e, x, size, to, maxDist);
      for (let i = 0; i < neighborCount; i++) {
        const y = this.neighbors[i]!;
        if (y.closed) continue;
        const tentative_g_score = f(x.g + x.distanceTo(y));
        if (!y.inOpenSet() || tentative_g_score < y.g) {
          y.cameFrom = x;
          y.g = tentative_g_score;
          y.h = y.distanceTo(to);
          if (y.inOpenSet()) {
            this.openSet.changeCost(y, f(y.g + y.h));
          } else {
            y.f = f(y.g + y.h);
            this.openSet.insert(y);
          }
        }
      }
    }
    this.logMax();
    if (closest === from) return false;
    this.reconstruct_path(path, from, closest);
    return true;
  }

  private logMax(): void {
    if (stats.created > stats.maxCreated) {
      stats.maxCreated = stats.created;
      LOGI(`\tNEW MAX: Created ${stats.created} nodes\n`);
    }
  }

  private getNeighbors(entity: Entity, pos: Node, size: Node, target: Node, maxDist: number): number {
    let p = 0;
    let jumpSize = 0;
    if (this.isFree(entity, pos.x, pos.y + 1, pos.z, size) === PathFinder.TYPE_OPEN) jumpSize = 1;
    const n = this.getNodeFor(entity, pos.x, pos.y, pos.z + 1, size, jumpSize);
    const w = this.getNodeFor(entity, pos.x - 1, pos.y, pos.z, size, jumpSize);
    const e = this.getNodeFor(entity, pos.x + 1, pos.y, pos.z, size, jumpSize);
    const s = this.getNodeFor(entity, pos.x, pos.y, pos.z - 1, size, jumpSize);
    if (n !== null && !n.closed && n.distanceTo(target) < maxDist) this.neighbors[p++] = n;
    if (w !== null && !w.closed && w.distanceTo(target) < maxDist) this.neighbors[p++] = w;
    if (e !== null && !e.closed && e.distanceTo(target) < maxDist) this.neighbors[p++] = e;
    if (s !== null && !s.closed && s.distanceTo(target) < maxDist) this.neighbors[p++] = s;
    return p;
  }

  private getNodeFor(entity: Entity, x: number, y: number, z: number, size: Node, jumpSize: number): Node | null {
    let best: Node | null = null;
    const pathType = this.isFree(entity, x, y, z, size);
    if (pathType === PathFinder.TYPE_WALKABLE) return this.getNode(x, y, z);
    if (pathType === PathFinder.TYPE_OPEN) best = this.getNode(x, y, z);
    if (best === null && jumpSize > 0 && pathType !== PathFinder.TYPE_FENCE && this.isFree(entity, x, y + jumpSize, z, size) === PathFinder.TYPE_OPEN) {
      best = this.getNode(x, y + jumpSize, z);
      y += jumpSize;
    }
    if (best !== null) {
      let drop = 0;
      let cost = 0;
      while (y > 0) {
        cost = this.isFree(entity, x, y - 1, z, size);
        if (this.avoidWater && cost === PathFinder.TYPE_WATER) return null;
        if (cost !== PathFinder.TYPE_OPEN) break;
        if (++drop >= 4) return null;
        if (--y > 0) best = this.getNode(x, y, z);
      }
      if (cost === PathFinder.TYPE_LAVA) return null;
    }
    return best;
  }

  private getNode(x: number, y: number, z: number): Node {
    const i = Node.createHash(x, y, z);
    const found = this.nodes.get(i);
    if (found === undefined) {
      const node = this.new_Node(x, y, z);
      ++stats.created;
      this.nodes.set(i, node);
      return node;
    }
    return found;
  }

  private isFree(entity: Entity, x: number, y: number, z: number, size: Node): number {
    const level = this.level!;
    let walkable = false;
    for (let xx = x; xx < x + size.x; xx++) {
      for (let yy = y; yy < y + size.y; yy++) {
        for (let zz = z; zz < z + size.z; zz++) {
          const tileId = level.getTile(xx, yy, zz);
          if (tileId <= 0) continue;
          if (tileId === Tile.door_iron.id || tileId === Tile.door_wood.id) {
            if (tileId === Tile.door_wood.id && this.canOpenDoors) continue;
            level.getData(xx, yy, zz); // C++ 取了 data 却没用
            if (!DoorTile.isOpen(entity.level, xx, yy, zz)) {
              return PathFinder.TYPE_BLOCKED;
            } else continue;
          } else if (tileId === Tile.water.id || tileId === Tile.calmWater.id) {
            if (this.avoidWater) {
              return PathFinder.TYPE_WATER;
            }
            walkable = true;
          } else if (tileId === Tile.fence.id || tileId === Tile.fenceGate.id) {
            return PathFinder.TYPE_FENCE;
          }
          const m = Tile.tiles[tileId]!.material;
          if (m.blocksMotion()) {
            return PathFinder.TYPE_BLOCKED;
          } else walkable = true;
          if (m === Material.lava) {
            return PathFinder.TYPE_LAVA;
          }
        }
      }
    }
    void walkable; // C++ 算了却从不返回 TYPE_WALKABLE（见文件头）
    return PathFinder.TYPE_OPEN;
  }

  private reconstruct_path(path: Path, _from: Node, to: Node): void {
    let count = 1;
    let n = to;
    while (n.cameFrom !== null) {
      count++;
      n = n.cameFrom;
    }
    const size = count;
    const nodes = new Array<Node>(size);
    n = to;
    nodes[--count] = n;
    while (n.cameFrom !== null) {
      n = n.cameFrom;
      nodes[--count] = n;
    }
    path.copyNodes(nodes, size);
  }

  private new_Node(x: number, y: number, z: number): Node {
    ++this._nodeIndex; // C++：超过 MAX_NODES 才 new，否则复用池里的节点；结果相同
    void MAX_NODES;
    return new Node(x, y, z);
  }
}
