// 1:1 移植自 src/world/level/levelgen/feature/FlowerFeature.h：在 ±8 范围内随机 64 次，空格子且这种花能活就放（花、玫瑰、两种蘑菇共用）
import type { Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

export class FlowerFeature extends Feature {
  tile: number;

  constructor(tile: number) {
    super();
    this.tile = tile;
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    for (let i = 0; i < 64; i++) {
      const x2 = x + random.nextInt(8) - random.nextInt(8);
      const y2 = y + random.nextInt(4) - random.nextInt(4);
      const z2 = z + random.nextInt(8) - random.nextInt(8);
      if (level.isEmptyTile(x2, y2, z2)) {
        if (Tile.tiles[this.tile]!.canSurvive(level, x2, y2, z2)) { // C++ (Bush*) 强转后调 canSurvive（虚函数）
          level.setTileNoUpdate(x2, y2, z2, this.tile);
        }
      }
    }
    return true;
  }
}
