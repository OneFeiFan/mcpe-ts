import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Item } from '../../item/Item';
import type { Random } from '@mcpe/util';

export class BookshelfTile extends Tile {
  /** C++ BookshelfTile::BookshelfTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.wood);
  }

  /** C++ BookshelfTile::getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face <= 1) return 4;
    return this.tex;
  }

  /** C++ BookshelfTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 3;
  }

  /** C++ BookshelfTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Item.book.id;
  }
}
