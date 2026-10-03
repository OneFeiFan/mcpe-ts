// 1:1 移植自 src/world/level/tile/LiquidTileDynamic.h（S3）
import type { Random } from '@mcpe/util';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { LiquidTile } from './LiquidTile';
import { Tile } from './Tile';

export class LiquidTileDynamic extends LiquidTile {
  private static readonly NumDirections = 4;

  private maxCount = 0;
  private readonly result: boolean[] = new Array<boolean>(LiquidTileDynamic.NumDirections).fill(
    false,
  );
  private readonly dist = new Int32Array(LiquidTileDynamic.NumDirections);

  constructor(id: number, material: Material) {
    super(id, material);
  }

  override tick(level: Level, x: number, y: number, z: number, random: Random): void {
    let depth = this.getDepth(level, x, y, z);
    let dropOff = 1;
    if (this.material === Material.lava && !level.dimension.ultraWarm) dropOff = 2;
    let becomeStatic = true;
    if (depth > 0) {
      let highest = -100;
      this.maxCount = 0;
      highest = this.getHighest(level, x - 1, y, z, highest);
      highest = this.getHighest(level, x + 1, y, z, highest);
      highest = this.getHighest(level, x, y, z - 1, highest);
      highest = this.getHighest(level, x, y, z + 1, highest);
      let newDepth = highest + dropOff;
      if (newDepth >= 8 || highest < 0) {
        newDepth = -1;
      }
      if (this.getDepth(level, x, y + 1, z) >= 0) {
        const above = this.getDepth(level, x, y + 1, z);
        if (above >= 8) newDepth = above;
        else newDepth = above + 8;
      }
      if (this.maxCount >= 2 && this.material === Material.water) {
        if (level.isSolidBlockingTile(x, y - 1, z)) {
          newDepth = 0;
        } else if (
          level.getMaterial(x, y - 1, z) === this.material &&
          level.getData(x, y, z) === 0
        ) {
          newDepth = 0;
        }
      }
      if (this.material === Material.lava) {
        if (depth < 8 && newDepth < 8) {
          if (newDepth > depth) {
            if (random.nextInt(4) !== 0) {
              newDepth = depth;
              becomeStatic = false;
            }
          }
        }
      }
      if (newDepth !== depth) {
        depth = newDepth;
        if (depth < 0) {
          level.setTile(x, y, z, 0);
        } else {
          level.setData(x, y, z, depth);
          level.addToTickNextTick(x, y, z, this.id, this.getTickDelay());
          level.updateNeighborsAt(x, y, z, this.id);
        }
      } else {
        if (becomeStatic) this.setStatic(level, x, y, z);
      }
    } else {
      this.setStatic(level, x, y, z);
    }
    if (this.canSpreadTo(level, x, y - 1, z)) {
      if (depth >= 8) level.setTileAndData(x, y - 1, z, this.id, depth);
      else level.setTileAndData(x, y - 1, z, this.id, depth + 8);
    } else if (depth >= 0 && (depth === 0 || this.isWaterBlocking(level, x, y - 1, z))) {
      const spreads = this.getSpread(level, x, y, z);
      let neighbor = depth + dropOff;
      if (depth >= 8) {
        neighbor = 1;
      }
      if (neighbor >= 8) return;
      if (spreads[0]) this.trySpreadTo(level, x - 1, y, z, neighbor);
      if (spreads[1]) this.trySpreadTo(level, x + 1, y, z, neighbor);
      if (spreads[2]) this.trySpreadTo(level, x, y, z - 1, neighbor);
      if (spreads[3]) this.trySpreadTo(level, x, y, z + 1, neighbor);
    }
  }

  /*protected*/
  getHighest(level: Level, x: number, y: number, z: number, current: number): number {
    let d = this.getDepth(level, x, y, z);
    if (d < 0) return current;
    if (d === 0) this.maxCount++;
    if (d >= 8) {
      d = 0;
    }
    return current < 0 || d < current ? d : current;
  }

  override onPlace(level: Level, x: number, y: number, z: number): void {
    super.onPlace(level, x, y, z);
    if (level.getTile(x, y, z) === this.id) {
      level.addToTickNextTick(x, y, z, this.id, this.getTickDelay());
    }
  }

  private setStatic(level: Level, x: number, y: number, z: number): void {
    const d = level.getData(x, y, z);
    level.setTileAndDataNoUpdate(x, y, z, this.id + 1, d);
    level.setTilesDirty(x, y, z, x, y, z);
    level.sendTileUpdated(x, y, z);
  }

  private canSpreadTo(level: Level, x: number, y: number, z: number): boolean {
    const target = level.getMaterial(x, y, z);
    if (target === this.material) return false;
    if (target === Material.lava) return false;
    return !this.isWaterBlocking(level, x, y, z);
  }

  private isWaterBlocking(level: Level, x: number, y: number, z: number): boolean {
    const t = level.getTile(x, y, z);
    if (t === 0) return false;
    // ADAPTED(DeferredTile): 原句为 t == Tile::door_wood->id /*|| t == Tile::door_iron->id */ || t == Tile::sign->id
    //   || t == Tile::ladder->id || t == Tile::reeds->id。四个方块都未注册：每次液体流动都会走到这里，
    //   直接读 .id 会报错；未注册的方块不会出现在世界里，按“不等于”处理。
    if (
      t === Tile.door_wood.id ||
      t === Tile.sign.id ||
      t === Tile.ladder.id ||
      t === Tile.reeds.id
    ) {
      return true;
    }
    const m = Tile.tiles[t]!.material;
    if (m.blocksMotion()) return true;
    if (m.isSolid()) return true;
    return false;
  }

  private getSpread(level: Level, x: number, y: number, z: number): boolean[] {
    const dist = this.dist;
    for (let d = 0; d < 4; d++) {
      dist[d] = 1000;
      let xx = x;
      const yy = y;
      let zz = z;
      if (d === 0) xx--;
      if (d === 1) xx++;
      if (d === 2) zz--;
      if (d === 3) zz++;
      if (this.isWaterBlocking(level, xx, yy, zz)) {
        continue;
      } else if (
        level.getMaterial(xx, yy, zz) === this.material &&
        level.getData(xx, yy, zz) === 0
      ) {
        continue;
      } else {
        if (!this.isWaterBlocking(level, xx, yy - 1, zz)) {
          dist[d] = 0;
        } else {
          dist[d] = this.getSlopeDistance(level, xx, yy, zz, 1, d);
        }
      }
    }
    let lowest = dist[0]!;
    for (let d = 1; d < 4; d++) {
      if (dist[d]! < lowest) lowest = dist[d]!;
    }
    for (let d = 0; d < 4; d++) {
      this.result[d] = dist[d] === lowest;
    }
    return this.result; // 与 C++ 一样返回成员数组（复用）
  }

  private trySpreadTo(level: Level, x: number, y: number, z: number, neighbor: number): void {
    if (this.canSpreadTo(level, x, y, z)) {
      const old = level.getTile(x, y, z);
      if (old > 0) {
        if (this.material === Material.lava) {
          this.fizz(level, x, y, z);
        } else {
          Tile.tiles[old]!.spawnResources(level, x, y, z, level.getData(x, y, z));
        }
      }
      level.setTileAndData(x, y, z, this.id, neighbor);
    }
  }

  private getSlopeDistance(
    level: Level,
    x: number,
    y: number,
    z: number,
    pass: number,
    from: number,
  ): number {
    let lowest = 1000;
    for (let d = 0; d < 4; d++) {
      if (d === 0 && from === 1) continue;
      if (d === 1 && from === 0) continue;
      if (d === 2 && from === 3) continue;
      if (d === 3 && from === 2) continue;
      let xx = x;
      const yy = y;
      let zz = z;
      if (d === 0) xx--;
      if (d === 1) xx++;
      if (d === 2) zz--;
      if (d === 3) zz++;
      if (this.isWaterBlocking(level, xx, yy, zz)) {
        continue;
      } else if (
        level.getMaterial(xx, yy, zz) === this.material &&
        level.getData(xx, yy, zz) === 0
      ) {
        continue;
      } else {
        if (!this.isWaterBlocking(level, xx, yy - 1, zz)) {
          return pass;
        } else {
          if (pass < 4) {
            const v = this.getSlopeDistance(level, xx, yy, zz, pass + 1, d);
            if (v < lowest) lowest = v;
          }
        }
      }
    }
    return lowest;
  }
}
