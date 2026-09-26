// 1:1 移植自 src/world/level/tile/TransparentTile.h（S3，LeafTile 的基类）
import type { LevelSource } from '../LevelSource';
import type { Material } from '../material/Material';
import { Tile } from './Tile';

export class TransparentTile extends Tile {
  allowSame: boolean; // /*protected*/

  constructor(id: number, tex: number, material: Material, allowSame: boolean) {
    super(id, tex, material);
    this.allowSame = allowSame;
  }

  override isSolidRender(): boolean {
    return false;
  }

  override shouldRenderFace(level: LevelSource, x: number, y: number, z: number, face: number): boolean {
    const id = level.getTile(x, y, z);
    if (!this.allowSame && id === this.id) return false;
    return super.shouldRenderFace(level, x, y, z, face);
  }

  /** C++ 在这里新增的非 virtual 方法（Tile 本身没有 blocksLight） */
  blocksLight(): boolean {
    return false;
  }
}
