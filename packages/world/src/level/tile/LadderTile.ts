// 1:1 移植自 src/world/level/tile/LadderTile.h
import { Tile } from './Tile';
import { Material } from '../material/Material';
import { AABB } from '../../phys/AABB';
import { Level } from '../Level';
import { ItemInstance } from '../../item/ItemInstance';
import type { Random } from '@mcpe/util';

export class LadderTile extends Tile {
  /** C++ LadderTile::LadderTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.decoration);
  }

  /** C++ LadderTile::getAABB(Level*, int, int, int) */
  override getAABB(level: Level, x: number, y: number, z: number): AABB {
    const dir = level.getData(x, y, z);
    const r = 2 / 16.0;

    if (dir === 2) this.setShape(0, 0, 1 - r, 1, 1, 1);
    if (dir === 3) this.setShape(0, 0, 0, 1, 1, r);
    if (dir === 4) this.setShape(1 - r, 0, 0, 1, 1, 1);
    if (dir === 5) this.setShape(0, 0, 0, r, 1, 1);

    return super.getAABB(level, x, y, z)!;
  }

  /** C++ LadderTile::getTileAABB(Level*, int, int, int) */
  override getTileAABB(level: Level, x: number, y: number, z: number): AABB {
    const dir = level.getData(x, y, z);
    const r = 2 / 16.0;

    if (dir === 2) this.setShape(0, 0, 1 - r, 1, 1, 1);
    if (dir === 3) this.setShape(0, 0, 0, 1, 1, r);
    if (dir === 4) this.setShape(1 - r, 0, 0, 1, 1, 1);
    if (dir === 5) this.setShape(0, 0, 0, r, 1, 1);

    return super.getTileAABB(level, x, y, z)!;
  }

  /** C++ LadderTile::blocksLight() */
  blocksLight(): boolean {
    return false;
  }

  /** C++ LadderTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ LadderTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ LadderTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_LADDER;
  }

  /** C++ LadderTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ LadderTile::mayPlace(Level*, int, int, int, unsigned char) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face?: number): boolean {
    if (level.isSolidBlockingTile(x - 1, y, z)) return true;
    else if (level.isSolidBlockingTile(x + 1, y, z)) return true;
    else if (level.isSolidBlockingTile(x, y, z - 1)) return true;
    else if (level.isSolidBlockingTile(x, y, z + 1)) return true;
    return false;
  }

  /** C++ LadderTile::getPlacedOnFaceDataValue(Level*, int, int, int, int, float, float, float, int) */
  override getPlacedOnFaceDataValue(
    level: Level,
    x: number,
    y: number,
    z: number,
    face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
    itemValue: number,
  ): number {
    let dir = itemValue;

    if ((dir === 0 || face === 2) && level.isSolidBlockingTile(x, y, z + 1)) dir = 2;
    if ((dir === 0 || face === 3) && level.isSolidBlockingTile(x, y, z - 1)) dir = 3;
    if ((dir === 0 || face === 4) && level.isSolidBlockingTile(x + 1, y, z)) dir = 4;
    if ((dir === 0 || face === 5) && level.isSolidBlockingTile(x - 1, y, z)) dir = 5;

    return dir;
  }

  /** C++ LadderTile::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    const face = level.getData(x, y, z);
    let ok = false;

    if (face === 2 && level.isSolidBlockingTile(x, y, z + 1)) ok = true;
    if (face === 3 && level.isSolidBlockingTile(x, y, z - 1)) ok = true;
    if (face === 4 && level.isSolidBlockingTile(x + 1, y, z)) ok = true;
    if (face === 5 && level.isSolidBlockingTile(x - 1, y, z)) ok = true;

    if (!ok) {
      this.popResource(level, x, y, z, new ItemInstance(Tile.ladder));
      level.setTile(x, y, z, 0);
    }

    super.neighborChanged(level, x, y, z, type);
  }

  /** C++ LadderTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 1;
  }
}
