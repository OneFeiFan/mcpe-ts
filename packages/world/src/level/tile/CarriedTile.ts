import { Tile } from './Tile';
import { Material } from '../material/Material';
import type { Random } from '@mcpe/util';

export class CarriedTile extends Tile {
  private readonly texDefault: number;
  private readonly texTop: number;

  /** C++ CarriedTile::CarriedTile(int id, int texDefault, int texTop = -1) */
  constructor(id: number, texDefault: number, texTop: number = -1) {
    // C++ 原代码写的是 super(id, tex, ...)，tex 未定义，无法编译。
    // 按语义应传 texDefault。
    super(id, texDefault, Material.dirt);

    this.texDefault = texDefault;
    this.texTop = texTop >= 0 ? texTop : texDefault;
  }

  /** C++ CarriedTile::getTexture(int face, int data) */
  override getTextureForData(face: number, _data: number): number {
    if (face === 1) return this.texTop;
    return this.texDefault;
  }

  /** C++ CarriedTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return 0;
  }

  /** C++ CarriedTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 0;
  }
}
