import { Tile } from "./Tile";
import { Material } from "../material/Material";

export class MultiTextureTile extends Tile {
  protected readonly _textures: readonly number[];
  protected readonly _textureCount: number;

  /** C++ MultiTextureTile::MultiTextureTile(int id, const int* textures, int texCount, const Material* material) */
  constructor(
    id: number,
    textures: readonly number[],
    texCount: number,
    material: Material,
  ) {
    super(id, textures[0]!, material);
    this._textures = textures;
    this._textureCount = texCount;
  }

  /** C++ MultiTextureTile::getTexture(int face, int data) */
  override getTextureForData(_face: number, data: number): number {
    if (data >= 0 && data < this._textureCount) {
      return this._textures[data]!;
    }
    return this.tex;
  }

  /** C++ MultiTextureTile::getTileDataForItemAuxValue(int auxValue) */
  static getTileDataForItemAuxValue(auxValue: number): number {
    return auxValue & 0xf;
  }

  /** C++ MultiTextureTile::getSpawnResourcesAuxValue(int data) */
  protected override getSpawnResourcesAuxValue(data: number): number {
    return data;
  }

  /** C++ MultiTextureTile::getItemAuxValueForTileData(int data) */
  protected static getItemAuxValueForTileData(data: number): number {
    return data;
  }
}