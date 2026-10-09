// 1:1 移植自 src/world/level/levelgen/feature/CactusFeature.h：随机 10 次，放 1–3 节仙人掌
import type { Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

export class CactusFeature extends Feature {
  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    for (let i = 0; i < 10; i++) {
      const x2 = x + random.nextInt(8) - random.nextInt(8);
      const y2 = y + random.nextInt(4) - random.nextInt(4);
      const z2 = z + random.nextInt(8) - random.nextInt(8);
      if (level.isEmptyTile(x2, y2, z2)) {
        const h = 1 + random.nextInt(random.nextInt(3) + 1);
        for (let yy = 0; yy < h; yy++) {
          if (Tile.cactus.canSurvive(level, x2, y2 + yy, z2)) {
            level.setTileNoUpdate(x2, y2 + yy, z2, Tile.cactus.id);
          }
        }
      }
    }
    return true;
  }
}
