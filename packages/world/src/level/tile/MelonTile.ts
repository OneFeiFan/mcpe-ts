// 1:1 移植自 src/world/level/tile/MelonTile.h 与 MelonTile.cpp
import { Tile } from './Tile';
import { Material } from '../material/Material';
import type { LevelSource } from '../LevelSource';
import { Item } from '../../item/Item';
import { Facing } from '../../Facing';
import type { Random } from '@mcpe/util';

export class MelonTile extends Tile {
  private static readonly TEX = 8 + 8 * 16; // 136
  private static readonly TEX_TOP = 9 + 8 * 16; // 137

  /** C++ MelonTile::MelonTile(int id) */
  constructor(id: number) {
    super(id, Material.vegetable);
    this.tex = MelonTile.TEX;
  }

  /** C++ MelonTile::getTexture(LevelSource*, int, int, int, int) */
  override getTextureAt(
    _level: LevelSource,
    _x: number,
    _y: number,
    _z: number,
    face: number,
  ): number {
    return this.getTextureForFace(face);
  }

  /** C++ MelonTile::getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face === Facing.UP || face === Facing.DOWN) return MelonTile.TEX_TOP;
    return MelonTile.TEX;
  }

  /** C++ MelonTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Item.melon.id;
  }

  /** C++ MelonTile::getResourceCount(Random* random) */
  override getResourceCount(random: Random): number {
    return 3 + random.nextInt(5);
  }
}
