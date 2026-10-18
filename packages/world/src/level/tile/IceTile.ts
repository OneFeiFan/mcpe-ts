// 1:1 移植自 src/world/level/tile/IceTile.h
import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import type { Player } from '../../entity/player/Player';
import { LightLayer } from '../LightLayer';
import type { Random } from '@mcpe/util';

export class IceTile extends Tile {
  /** C++ IceTile::IceTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.ice);
    this.friction = Math.fround(0.98); // C++：friction = 0.98f
    this.setTicking(true);
  }

  /** C++ IceTile::playerDestroy(Level*, Player*, int, int, int, int) */
  override playerDestroy(
    level: Level,
    _player: Player,
    x: number,
    y: number,
    z: number,
    _data: number,
  ): void {
    const below = level.getMaterial(x, y - 1, z);
    // C++ 里 below 未判空，null 是 UB；TS 里抛 TypeError，属已知差异
    if (below.blocksMotion() || below.isLiquid()) {
      level.setTile(x, y, z, Tile.water.id);
    }
  }

  /** C++ IceTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 0;
  }

  /** C++ IceTile::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (level.getBrightness(LightLayer.Block, x, y, z) > 11 - Tile.lightBlock[this.id]!) {
      this.spawnResources(level, x, y, z, level.getData(x, y, z));
      level.setTile(x, y, z, Tile.calmWater.id);
    }
  }
}
