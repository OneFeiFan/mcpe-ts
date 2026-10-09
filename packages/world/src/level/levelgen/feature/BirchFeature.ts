// 1:1 移植自 src/world/level/levelgen/feature/BirchFeature.h：白桦（5–7 格高），树冠形状同橡树
import type { Random } from '@mcpe/util';
import { LevelConstants } from '../../LevelConstants';
import type { Level } from '../../Level';
import { LeafTile } from '../../tile/LeafTile';
import { Tile } from '../../tile/Tile';
import { TreeTile } from '../../tile/TreeTile';
import { Feature } from './Feature';

const DEPTH = LevelConstants.LEVEL_HEIGHT; // Level::DEPTH

export class BirchFeature extends Feature {
  constructor(doUpdate = false) {
    super(doUpdate);
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    const treeHeight = random.nextInt(3) + 5;
    let free = true;
    if (y < 1 || y + treeHeight + 1 > DEPTH) return false;
    for (let yy = y; yy <= y + 1 + treeHeight; yy++) {
      let r = 1;
      if (yy === y) r = 0;
      if (yy >= y + 1 + treeHeight - 2) r = 2;
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
    for (let yy = y - 3 + treeHeight; yy <= y + treeHeight; yy++) {
      const yo = yy - (y + treeHeight);
      const offs = 1 - Math.trunc(yo / 2);
      for (let xx = x - offs; xx <= x + offs; xx++) {
        const xo = xx - x;
        for (let zz = z - offs; zz <= z + offs; zz++) {
          const zo = zz - z;
          if (
            Math.abs(xo) === offs &&
            Math.abs(zo) === offs &&
            (random.nextInt(2) === 0 || yo === 0)
          )
            continue;
          if (!Tile.solid[level.getTile(xx, yy, zz)])
            this.placeBlock(level, xx, yy, zz, Tile.leaves.id, LeafTile.BIRCH_LEAF);
        }
      }
    }
    for (let hh = 0; hh < treeHeight; hh++) {
      const t = level.getTile(x, y + hh, z);
      if (t === 0 || t === Tile.leaves.id)
        this.placeBlock(level, x, y + hh, z, Tile.treeTrunk.id, TreeTile.BIRCH_TRUNK);
    }
    return true;
  }
}
