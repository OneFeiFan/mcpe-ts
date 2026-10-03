import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { LeafTile } from './LeafTile';
import type { Random } from '@mcpe/util';

export class TreeTile extends Tile {
  static readonly NORMAL_TRUNK = 0;
  static readonly DARK_TRUNK = 1;
  static readonly BIRCH_TRUNK = 2;

  /** C++ TreeTile::TreeTile(int id) */
  constructor(id: number) {
    super(id, Material.wood);
    this.tex = 20;
  }

  /** C++ TreeTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 1;
  }

  /** C++ TreeTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Tile.treeTrunk.id;
  }

  /** C++ TreeTile::onRemove(Level*, int, int, int) */
  override onRemove(level: Level, x: number, y: number, z: number): void {
    const r = LeafTile.REQUIRED_WOOD_RANGE;
    const r2 = r + 1;

    if (level.hasChunksAt(x - r2, y - r2, z - r2, x + r2, y + r2, z + r2)) {
      for (let xo = -r; xo <= r; xo++) {
        for (let yo = -r; yo <= r; yo++) {
          for (let zo = -r; zo <= r; zo++) {
            const t = level.getTile(x + xo, y + yo, z + zo);
            if (t === Tile.leaves.id) {
              const currentData = level.getData(x + xo, y + yo, z + zo);
              if ((currentData & LeafTile.UPDATE_LEAF_BIT) === 0) {
                level.setDataNoUpdate(
                  x + xo,
                  y + yo,
                  z + zo,
                  currentData | LeafTile.UPDATE_LEAF_BIT,
                );
              }
            }
          }
        }
      }
    }
    // C++ 不调 super.onRemove
  }

  /** C++ TreeTile::getTexture(int face, int data) */
  override getTextureForData(face: number, data: number): number {
    if (face === 1) return 21;
    if (face === 0) return 21;
    if (data === TreeTile.DARK_TRUNK) return 4 + 7 * 16;
    if (data === TreeTile.BIRCH_TRUNK) return 5 + 7 * 16;
    return 20;
  }

  /** C++ TreeTile::getSpawnResourcesAuxValue(int data) */
  protected override getSpawnResourcesAuxValue(data: number): number {
    return data;
  }
}
