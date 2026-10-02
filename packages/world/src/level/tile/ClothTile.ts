// 1:1 移植自 src/world/level/tile/ClothTile.h（S11 阶段 B）
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class ClothTile extends Tile {
  private static readonly COLOR_TEX_POS = 7 * 16 + 1;

  /** C++ 的两个构造函数 ClothTile(int id) 与 ClothTile(int id, int data)；第二个忽略 data */
  constructor(id: number, _data?: number) {
    super(id, 4 * 16, Material.cloth);
  }

  /** C++ getTexture(int face, int data) */
  override getTextureForData(_face: number, data: number): number {
    if (data === 0) {
      // un-colored cloth
      return this.tex;
    }
    // invert bits (so 1111 becomes black)
    data = ~(data & 0xf);
    return ClothTile.COLOR_TEX_POS + ((data & 8) >> 3) + (data & 7) * 16;
  }

  static getTileDataForItemAuxValue(auxValue: number): number {
    return ~auxValue & 0xf;
  }

  protected override getSpawnResourcesAuxValue(data: number): number {
    return data;
  }

  protected static getItemAuxValueForTileData(data: number): number {
    return ~data & 0xf;
  }
}