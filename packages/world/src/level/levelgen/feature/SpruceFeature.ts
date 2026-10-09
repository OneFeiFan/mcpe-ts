// 1:1 移植自 src/world/level/levelgen/feature/SpruceFeature.h：云杉（6–9 格高），树冠一圈圈收放
import type { Random } from '@mcpe/util';
import { LevelConstants } from '../../LevelConstants';
import type { Level } from '../../Level';
import { LeafTile } from '../../tile/LeafTile';
import { Tile } from '../../tile/Tile';
import { TreeTile } from '../../tile/TreeTile';
import { Feature } from './Feature';

const DEPTH = LevelConstants.LEVEL_HEIGHT; // Level::DEPTH

export class SpruceFeature extends Feature {
  constructor(doUpdate = false) {
    super(doUpdate);
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    const treeHeight = random.nextInt(4) + 6;
    const trunkHeight = 1 + random.nextInt(2);
    const topHeight = treeHeight - trunkHeight;
    const leafRadius = 2 + random.nextInt(2);
    let free = true;
    if (y < 1 || y + treeHeight + 1 > DEPTH) {
      return false;
    }
    for (let yy = y; yy <= y + 1 + treeHeight && free; yy++) {
      let r = 1;
      if (yy - y < trunkHeight) {
        r = 0;
      } else {
        r = leafRadius;
      }
      for (let xx = x - r; xx <= x + r && free; xx++) {
        for (let zz = z - r; zz <= z + r && free; zz++) {
          if (yy >= 0 && yy < DEPTH) {
            const tt = level.getTile(xx, yy, zz);
            if (tt !== 0 && tt !== Tile.leaves.id) free = false;
          } else {
            free = false;
          }
        }
      }
    }
    if (!free) return false;
    const belowTile = level.getTile(x, y - 1, z);
    if ((belowTile !== Tile.grass.id && belowTile !== Tile.dirt.id) || y >= DEPTH - treeHeight - 1)
      return false;
    this.placeBlock(level, x, y - 1, z, Tile.dirt.id);
    let currentRadius = random.nextInt(2);
    let maxRadius = 1;
    let minRadius = 0;
    for (let heightPos = 0; heightPos <= topHeight; heightPos++) {
      const yy = y + treeHeight - heightPos;
      for (let xx = x - currentRadius; xx <= x + currentRadius; xx++) {
        const xo = xx - x;
        for (let zz = z - currentRadius; zz <= z + currentRadius; zz++) {
          const zo = zz - z;
          if (Math.abs(xo) === currentRadius && Math.abs(zo) === currentRadius && currentRadius > 0)
            continue;
          if (!Tile.solid[level.getTile(xx, yy, zz)])
            this.placeBlock(level, xx, yy, zz, Tile.leaves.id, LeafTile.EVERGREEN_LEAF);
        }
      }
      if (currentRadius >= maxRadius) {
        currentRadius = minRadius;
        minRadius = 1;
        maxRadius += 1;
        if (maxRadius > leafRadius) {
          maxRadius = leafRadius;
        }
      } else {
        currentRadius = currentRadius + 1;
      }
    }
    const topOffset = random.nextInt(3);
    for (let hh = 0; hh < treeHeight - topOffset; hh++) {
      const t = level.getTile(x, y + hh, z);
      if (t === 0 || t === Tile.leaves.id)
        this.placeBlock(level, x, y + hh, z, Tile.treeTrunk.id, TreeTile.DARK_TRUNK);
    }
    return true;
  }
}
