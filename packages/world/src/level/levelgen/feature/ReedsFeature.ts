// 1:1 移植自 src/world/level/levelgen/feature/ReedsFeature.h：水边随机 20 次，放 2–4 节甘蔗
import type { Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { Material } from '../../material/Material';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

export class ReedsFeature extends Feature {
  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    for (let i = 0; i < 20; i++) {
      const x2 = x + random.nextInt(4) - random.nextInt(4);
      const y2 = y;
      const z2 = z + random.nextInt(4) - random.nextInt(4);
      if (level.isEmptyTile(x2, y2, z2)) {
        if (
          level.getMaterial(x2 - 1, y2 - 1, z2) === Material.water ||
          level.getMaterial(x2 + 1, y2 - 1, z2) === Material.water ||
          level.getMaterial(x2, y2 - 1, z2 - 1) === Material.water ||
          level.getMaterial(x2, y2 - 1, z2 + 1) === Material.water
        ) {
          const h = 2 + random.nextInt(random.nextInt(3) + 1);
          for (let yy = 0; yy < h; yy++) {
            if (Tile.reeds.canSurvive(level, x2, y2 + yy, z2)) {
              level.setTileNoUpdate(x2, y2 + yy, z2, Tile.reeds.id);
            }
          }
        }
      }
    }
    return true;
  }
}
