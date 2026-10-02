// 1:1 移植自 src/world/level/tile/TntTile.h（S11 阶段 A，部分移植）。
// 部分：生成点燃的 TNT 实体（PrimedTnt，计划外）的语句 DEFERRED(Entity)；wasExploded 里的随机数调用要用 PrimedTnt 的 life，一并延后。
import type { Random } from '@mcpe/util';
import type { Player } from '../../entity/player/Player';
import { Item } from '../../item/Item';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class TntTile extends Tile {
  private static readonly EXPLODE_BIT = 1;

  constructor(id: number, tex: number) {
    super(id, tex, Material.explosive);
  }

  /** C++ getTexture(int face) */
  override getTexture$1(face: number): number {
    if (face === 0) return this.tex + 2;
    if (face === 1) return this.tex + 1;
    return this.tex;
  }

  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    if (type > 0 && Tile.tiles[type]!.isSignalSource()) {
      if (level.hasNeighborSignal(x, y, z)) {
        this.destroy(level, x, y, z, TntTile.EXPLODE_BIT);
        level.setTile(x, y, z, 0);
      }
    }
  }

  override getResourceCount(_random: Random): number {
    return 1;
  }

  override wasExploded(_level: Level, _x: number, _y: number, _z: number): void {
    // DEFERRED(Entity): PrimedTnt* primed = new PrimedTnt(level, x + 0.5f, y + 0.5f, z + 0.5f);
    // DEFERRED(Entity): primed->life = level->random.nextInt(primed->life / 4) + primed->life / 8;
    // DEFERRED(Entity): level->addEntity(primed);
  }

  override destroy(level: Level, _x: number, _y: number, _z: number, data: number): void {
    if (level.isClientSide) return;
    if ((data & TntTile.EXPLODE_BIT) === 1) {
      // DEFERRED(Entity): PrimedTnt* tnt = new PrimedTnt(level, x + 0.5f, y + 0.5f, z + 0.5f);
      // DEFERRED(Entity): level->addEntity(tnt);
      // DEFERRED(Entity): level->playSound(tnt, "random.fuse", 1, 1.0f);
    }
  }

  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    const carried = player.getSelectedItem();
    if (carried && carried.id === Item.flintAndSteel.id) {
      carried.hurt(1);
      this.destroy(level, x, y, z, TntTile.EXPLODE_BIT);
      level.setTile(x, y, z, 0);
      return true;
    }
    return super.use(level, x, y, z, player);
  }
}
