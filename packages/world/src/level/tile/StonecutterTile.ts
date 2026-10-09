// 1:1 移植自 src/world/level/tile/StonecutterTile.h
import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { Facing } from '../../Facing';
import type { Player } from '../../entity/player/Player';

export class StonecutterTile extends Tile {
  /** C++ StonecutterTile::StonecutterTile(int id) */
  constructor(id: number) {
    super(id, Material.stone);
    this.tex = 13 + 16 * 2;
  }

  /** C++ StonecutterTile::getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face === Facing.UP) return 9 + 10 * 16;
    if (face === Facing.DOWN) return 14 + 3 * 16;
    if (face === Facing.NORTH || face === Facing.SOUTH) return 8 + 10 * 16;
    return this.tex;
  }

  /** C++ StonecutterTile::use(Level*, int, int, int, Player*) */
  override use(_level: Level, x: number, y: number, z: number, player: Player): boolean {
    player.startStonecutting(x, y, z);
    return true;
  }
}
