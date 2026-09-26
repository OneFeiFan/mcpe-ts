// 1:1 移植自 src/world/level/tile/DirectionalTile.h（S3，BedTile 的基类）
import type { Material } from '../material/Material';
import { Tile } from './Tile';

export class DirectionalTile extends Tile {
  static readonly DIRECTION_MASK = 0x3;
  static readonly DIRECTION_INV_MASK = 0xc;

  static getDirection(data: number): number {
    return data & DirectionalTile.DIRECTION_MASK;
  }

  // C++ 的两个 protected 构造函数
  protected constructor(id: number, tex: number, material: Material);
  protected constructor(id: number, material: Material);
  protected constructor(id: number, a: number | Material, b?: Material) {
    if (typeof a === 'number') super(id, a, b!);
    else super(id, a);
  }
}
