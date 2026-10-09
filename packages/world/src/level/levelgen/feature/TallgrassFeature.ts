// 1:1 移植自 src/world/level/levelgen/feature/TallgrassFeature.h：先往下找到地面（跳过空气与树叶），再随机 128 次放草丛或蕨
import type { Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

export class TallgrassFeature extends Feature {
  private tile: number;
  private type: number;

  constructor(tile: number, type: number) {
    super(false);
    this.tile = tile;
    this.type = type;
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    let t = 0;
    while (((t = level.getTile(x, y, z)) === 0 || t === Tile.leaves.id) && y > 0) y--;
    for (let i = 0; i < 128; i++) {
      const x2 = x + random.nextInt(8) - random.nextInt(8);
      const y2 = y + random.nextInt(4) - random.nextInt(4);
      const z2 = z + random.nextInt(8) - random.nextInt(8);
      if (level.isEmptyTile(x2, y2, z2)) {
        if (Tile.tiles[this.tile]!.canSurvive(level, x2, y2, z2)) {
          level.setTileAndDataNoUpdate(x2, y2, z2, this.tile, this.type);
        }
      }
    }
    return true;
  }
}
