import { EntityTile } from './EntityTile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { AABB } from '../../phys/AABB';
import { Item } from '../../item/Item';
import { TileEntity, TileEntityFactory } from './entity/TileEntity';
import type { Random } from '@mcpe/util';
import { Tile } from './Tile';
import type { LevelSource } from '../LevelSource';

export class SignTile extends EntityTile {
  private readonly tileEntityClassId: number;
  private readonly onGround: boolean;

  /** C++ SignTile::SignTile(int id, int tileEntityClassId, bool onGround) */
  constructor(id: number, tileEntityClassId: number, onGround: boolean) {
    super(id, Material.wood);
    this.tileEntityClassId = tileEntityClassId;
    this.onGround = onGround;

    this.tex = 4;
    const r = 4 / 16.0;
    const h = 16 / 16.0;
    this.setShape(0.5 - r, 0, 0.5 - r, 0.5 + r, h, 0.5 + r);
  }

  /** C++ SignTile::getAABB(Level*, int, int, int) */
  override getAABB(_level: Level, _x: number, _y: number, _z: number): AABB | null {
    return null;
  }

  /** C++ SignTile::getTileAABB(Level*, int, int, int) */
  override getTileAABB(level: Level, x: number, y: number, z: number): AABB {
    this.updateShape(level, x, y, z);
    return super.getTileAABB(level, x, y, z);
  }

  /** C++ SignTile::updateShape(LevelSource*, int, int, int) */
  override updateShape(level: LevelSource, x: number, y: number, z: number): void {
    if (this.onGround) return;

    const face = level.getData(x, y, z);

    const h0 = (4 + 0.5) / 16.0;
    const h1 = (12 + 0.5) / 16.0;
    const w0 = 0 / 16.0;
    const w1 = 16 / 16.0;
    const d0 = 2 / 16.0;

    this.setShape(0, 0, 0, 1, 1, 1);
    if (face === 2) this.setShape(w0, h0, 1 - d0, w1, h1, 1);
    if (face === 3) this.setShape(w0, h0, 0, w1, h1, d0);
    if (face === 4) this.setShape(1 - d0, h0, w0, 1, h1, w1);
    if (face === 5) this.setShape(0, h0, w0, d0, h1, w1);
  }

  /** C++ SignTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_INVISIBLE;
  }

  /** C++ SignTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ SignTile::isPathfindable(LevelSource*, int, int, int) */
  isPathfindable(_level: LevelSource, _x: number, _y: number, _z: number): boolean {
    return true;
  }

  /** C++ SignTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ SignTile::newTileEntity() */
  newTileEntity(): TileEntity {
    return TileEntityFactory.createTileEntity(this.tileEntityClassId)!;
  }

  /** C++ SignTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Item.sign.id;
  }

  /** C++ SignTile::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    let remove = false;

    if (this.onGround) {
      if (!level.getMaterial(x, y - 1, z).isSolid()) remove = true;
    } else {
      const face = level.getData(x, y, z);
      remove = true;
      if (face === 2 && level.getMaterial(x, y, z + 1).isSolid()) remove = false;
      if (face === 3 && level.getMaterial(x, y, z - 1).isSolid()) remove = false;
      if (face === 4 && level.getMaterial(x + 1, y, z).isSolid()) remove = false;
      if (face === 5 && level.getMaterial(x - 1, y, z).isSolid()) remove = false;
    }

    if (remove) {
      this.spawnResources(level, x, y, z, level.getData(x, y, z), 0);
      level.setTile(x, y, z, 0);
    }

    super.neighborChanged(level, x, y, z, type);
  }
}
