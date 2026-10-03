// 1:1 移植自 src/world/level/tile/StoneSlabTile.h 与 StoneSlabTile.cpp（S3）
import type { Random } from '@mcpe/util';
import { Facing } from '../../Facing';
import type { AABB } from '../../phys/AABB';
import type { Level } from '../Level';
import type { LevelSource } from '../LevelSource';
import { Material } from '../material/Material';
import { Tile } from './Tile';

/** StoneSlabTile.cpp 里的文件内静态函数 */
function isHalfSlab(tileId: number): boolean {
  return tileId === Tile.stoneSlabHalf.id; // || tileId == Tile::woodSlabHalf->id;
}

export class StoneSlabTile extends Tile {
  static readonly STONE_SLAB = 0;
  static readonly SAND_SLAB = 1;
  static readonly WOOD_SLAB = 2;
  static readonly COBBLESTONE_SLAB = 3;
  static readonly BRICK_SLAB = 4;
  static readonly SMOOTHBRICK_SLAB = 5;
  static readonly TYPE_MASK = 7;
  static readonly TOP_SLOT_BIT = 8;
  static readonly SLAB_NAMES: readonly string[] = [
    'stone',
    'sand',
    'wood',
    'cobble',
    'brick',
    'smoothStoneBrick',
  ];
  static readonly SLAB_NAMES_COUNT = StoneSlabTile.SLAB_NAMES.length;

  private fullSize: boolean;

  constructor(id: number, fullSize: boolean) {
    super(id, 6, Material.stone);
    this.fullSize = fullSize;
    if (!fullSize) {
      this.setShape(0, 0, 0, 1, 0.5, 1);
    }
    this.setLightBlock(255);
  }

  override updateShape(level: LevelSource, x: number, y: number, z: number): void {
    if (this.fullSize) {
      this.setShape(0, 0, 0, 1, 1, 1);
    } else {
      const upper = (level.getData(x, y, z) & StoneSlabTile.TOP_SLOT_BIT) !== 0;
      if (upper) {
        this.setShape(0, 0.5, 0, 1, 1, 1);
      } else {
        this.setShape(0, 0, 0, 1, 0.5, 1);
      }
    }
  }

  override updateDefaultShape(): void {
    if (this.fullSize) {
      this.setShape(0, 0, 0, 1, 1, 1);
    } else {
      this.setShape(0, 0, 0, 1, 0.5, 1);
    }
  }

  /** C++ getTexture(int face, int data) */
  override getTextureForData(face: number, data: number): number {
    data = data & StoneSlabTile.TYPE_MASK;
    if (data === StoneSlabTile.STONE_SLAB) {
      if (face <= 1) return 6;
      return 5;
    } else if (data === StoneSlabTile.SAND_SLAB) {
      if (face === Facing.DOWN) return 13 * 16;
      if (face === Facing.UP) return 11 * 16;
      return 12 * 16;
    } else if (data === StoneSlabTile.WOOD_SLAB) {
      return 4;
    } else if (data === StoneSlabTile.COBBLESTONE_SLAB) {
      return 16;
    } else if (data === StoneSlabTile.BRICK_SLAB) {
      return Tile.redBrick.tex;
    } else if (data === StoneSlabTile.SMOOTHBRICK_SLAB) {
      return Tile.stoneBrickSmooth.tex; // 依赖未注册：stoneBrickSmooth（只有 data 为 5 的台阶才会走到）
    }
    return 6;
  }

  /** C++ getTexture(int face) */
  override getTextureForFace(face: number): number {
    return this.getTextureForData(face, 0);
  }

  override isSolidRender(): boolean {
    return this.fullSize;
  }

  override getPlacedOnFaceDataValue(
    _level: Level,
    _x: number,
    _y: number,
    _z: number,
    face: number,
    _clickX: number,
    clickY: number,
    _clickZ: number,
    itemValue: number,
  ): number {
    if (this.fullSize) return itemValue;
    if (face === Facing.DOWN || (face !== Facing.UP && clickY > 0.5)) {
      return itemValue | StoneSlabTile.TOP_SLOT_BIT;
    }
    return itemValue;
  }

  // C++ 里 onPlace 整个被注释掉了（StoneSlabTile.cpp:85-102），这里同样不写

  override getResource(_data: number, _random: Random): number {
    return Tile.stoneSlabHalf.id;
  }

  override getResourceCount(_random: Random): number {
    if (this.fullSize) {
      return 2;
    }
    return 1;
  }

  override isCubeShaped(): boolean {
    return this.fullSize;
  }

  override addAABBs(level: Level, x: number, y: number, z: number, box: AABB, boxes: AABB[]): void {
    this.updateShape(level, x, y, z);
    super.addAABBs(level, x, y, z, box, boxes);
  }

  override shouldRenderFace(
    level: LevelSource,
    x: number,
    y: number,
    z: number,
    face: number,
  ): boolean {
    if (this.fullSize) return super.shouldRenderFace(level, x, y, z, face);
    if (
      face !== Facing.UP &&
      face !== Facing.DOWN &&
      !super.shouldRenderFace(level, x, y, z, face)
    ) {
      return false;
    }
    let ox = x,
      oy = y,
      oz = z;
    ox += Facing.STEP_X[Facing.OPPOSITE_FACING[face]!]!;
    oy += Facing.STEP_Y[Facing.OPPOSITE_FACING[face]!]!;
    oz += Facing.STEP_Z[Facing.OPPOSITE_FACING[face]!]!;
    const isUpper = (level.getData(ox, oy, oz) & StoneSlabTile.TOP_SLOT_BIT) !== 0;
    if (isUpper) {
      if (face === Facing.DOWN) return true;
      if (face === Facing.UP && super.shouldRenderFace(level, x, y, z, face)) return true;
      return !(
        isHalfSlab(level.getTile(x, y, z)) &&
        (level.getData(x, y, z) & StoneSlabTile.TOP_SLOT_BIT) !== 0
      );
    } else {
      if (face === Facing.UP) return true;
      if (face === Facing.DOWN && super.shouldRenderFace(level, x, y, z, face)) return true;
      return !(
        isHalfSlab(level.getTile(x, y, z)) &&
        (level.getData(x, y, z) & StoneSlabTile.TOP_SLOT_BIT) === 0
      );
    }
  }

  protected override getSpawnResourcesAuxValue(data: number): number {
    return data & StoneSlabTile.TYPE_MASK;
  }
}
