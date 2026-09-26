// 1:1 移植自 src/world/level/tile/LiquidTileStatic.h（S3）
import type { Random } from '@mcpe/util';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { LiquidTile } from './LiquidTile';

export class LiquidTileStatic extends LiquidTile {
  constructor(id: number, material: Material) {
    super(id, material);
    this.setTicking(false);
    if (material === Material.lava) this.setTicking(true);
  }

  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    super.neighborChanged(level, x, y, z, type);
    if (level.getTile(x, y, z) === this.id) {
      this.setDynamic(level, x, y, z);
    }
  }

  override tick(_level: Level, _x: number, _y: number, _z: number, _random: Random): void {
    return;
    // 分支在 tick 开头直接 return，下面原本会让静止的熔岩点燃周围可燃方块。不可达，原样保留在注释里供对照：
    // if (material == Material::lava) {
    //     int h = random->nextInt(3);
    //     for (int i = 0; i < h; i++) {
    //         x += random->nextInt(3) - 1;
    //         y++;
    //         z += random->nextInt(3) - 1;
    //         int t = level->getTile(x, y, z);
    //         if (t == 0) {
    //             if (isFlammable(level, x - 1, y, z) || isFlammable(level, x + 1, y, z) || isFlammable(level, x, y, z - 1)
    //                 || isFlammable(level, x, y, z + 1) || isFlammable(level, x, y - 1, z) || isFlammable(level, x, y + 1, z)) {
    //                 level->setTile(x, y, z, Tile::fire->id);
    //                 return;
    //             }
    //         } else if (Tile::tiles[t]->material->blocksMotion()) {
    //             return;
    //         }
    //     }
    // }
  }

  /** 只被上面那段不可达的代码调用，照原样保留 */
  protected isFlammable(level: Level, x: number, y: number, z: number): boolean {
    return level.getMaterial(x, y, z).isFlammable();
  }

  private setDynamic(level: Level, x: number, y: number, z: number): void {
    const d = level.getData(x, y, z);
    level.noNeighborUpdate = true;
    level.setTileAndDataNoUpdate(x, y, z, this.id - 1, d);
    level.setTilesDirty(x, y, z, x, y, z);
    level.addToTickNextTick(x, y, z, this.id - 1, this.getTickDelay());
    level.noNeighborUpdate = false;
  }
}
