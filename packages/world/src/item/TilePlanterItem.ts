import { Item } from './Item';
import { ItemInstance } from './ItemInstance';
import { Level } from '../level/Level';
import { Tile } from '../level/tile/Tile';
import { Facing } from '../Facing';
import type { Player } from '../entity/player/Player';

export class TilePlanterItem extends Item {
  private readonly tileId: number;

  /** C++ TilePlanterItem::TilePlanterItem(int id, Tile* tile) */
  constructor(id: number, tile: Tile) {
    super(id);
    this.tileId = tile.id;
  }

  /** C++ TilePlanterItem::useOn(ItemInstance*, Player*, Level*, int, int, int, int, float, float, float) */
  override useOnByPlayer(
    instance: ItemInstance,
    player: Player,
    level: Level,
    x: number,
    y: number,
    z: number,
    face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
  ): boolean {
    if (level.getTile(x, y, z) === Tile.topSnow.id) {
      // 顶雪特判：face 改为 0，但坐标不变
      face = 0;
    } else {
      switch (face) {
        case Facing.DOWN:
          y--;
          break;
        case Facing.UP:
          y++;
          break;
        case Facing.NORTH:
          z--;
          break;
        case Facing.SOUTH:
          z++;
          break;
        case Facing.WEST:
          x--;
          break;
        case Facing.EAST:
          x++;
          break;
      }
    }

    if (instance.count === 0) return false;

    if (level.mayPlace(this.tileId, x, y, z, false, face)) {
      if (level.setTile(x, y, z, this.tileId)) {
        Tile.tiles[this.tileId]!.setPlacedBy(level, x, y, z, player);
        instance.count--;
      }
    }
    return true;
  }
}
