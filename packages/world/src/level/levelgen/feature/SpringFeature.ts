/**
 * 1:1 移植自 src/world/level/levelgen/feature/SpringFeature.h：上下是石头、四周三面石头一面空的格子放一格水源/岩浆源，
 * 并立即 tick 一次（instaTick）让它马上流出去。
 */
import type { Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

export class SpringFeature extends Feature {
  private tile: number;

  constructor(tile: number) {
    super();
    this.tile = tile;
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    const rock = Tile.rock.id;
    if (level.getTile(x, y + 1, z) !== rock) return false;
    if (level.getTile(x, y - 1, z) !== rock) return false;
    if (level.getTile(x, y, z) !== 0 && level.getTile(x, y, z) !== rock) return false;
    let rockCount = 0;
    if (level.getTile(x - 1, y, z) === rock) rockCount++;
    if (level.getTile(x + 1, y, z) === rock) rockCount++;
    if (level.getTile(x, y, z - 1) === rock) rockCount++;
    if (level.getTile(x, y, z + 1) === rock) rockCount++;
    let holeCount = 0;
    if (level.isEmptyTile(x - 1, y, z)) holeCount++;
    if (level.isEmptyTile(x + 1, y, z)) holeCount++;
    if (level.isEmptyTile(x, y, z - 1)) holeCount++;
    if (level.isEmptyTile(x, y, z + 1)) holeCount++;
    if (rockCount === 3 && holeCount === 1) {
      level.setTile(x, y, z, this.tile);
      level.instaTick = true;
      Tile.tiles[this.tile]!.tick(level, x, y, z, random);
      level.instaTick = false;
    }
    return true;
  }
}
