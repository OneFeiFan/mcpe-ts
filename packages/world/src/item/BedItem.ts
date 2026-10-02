import { Item } from "./Item";
import { ItemInstance } from "./ItemInstance";
import { Level } from "../level/Level";
import { BedTile } from "../level/tile/BedTile";
import { Direction } from "../Direction";
import { Facing } from "../Facing";
import type { Player } from "../entity/player/Player";
import { Mth } from "@mcpe/util";
import { Tile } from "../level/tile/Tile";

export class BedItem extends Item {
  /** C++ BedItem::BedItem(int id) */
  constructor(id: number) {
    super(id);
  }

  /** C++ BedItem::useOn(ItemInstance*, Player*, Level*, int, int, int, int, float, float, float) */
  override useOnByPlayer(
    itemInstance: ItemInstance,
    player: Player,
    level: Level,
    x: number, y: number, z: number,
    face: number,
    _clickX: number, _clickY: number, _clickZ: number,
  ): boolean {
    if (face !== Facing.UP) {
      return false;
    }
    y += 1;

    const tile = Tile.bed as BedTile;

    // dir = floor(yRot * 4 / 360 + 0.5) & 3
    // 运算顺序不能重排：先 * 4，再 / 360，再 + 0.5，再 floor，再 & 3
    const dir = Mth.floor(player.yRot * 4 / 360 + 0.5) & 3;

    let xra = 0;
    let zra = 0;

    if (dir === Direction.SOUTH) zra = 1;
    if (dir === Direction.WEST)  xra = -1;
    if (dir === Direction.NORTH) zra = -1;
    if (dir === Direction.EAST)  xra = 1;

    // C++ 里 player->mayBuild 检查被注释掉了，不要加

    if (
      level.isEmptyTile(x, y, z) &&
      level.isEmptyTile(x + xra, y, z + zra) &&
      level.isSolidBlockingTile(x, y - 1, z) &&
      level.isSolidBlockingTile(x + xra, y - 1, z + zra)
    ) {
      level.setTileAndData(x, y, z, tile.id, dir);

      // 双检：只有床脚被成功放置才放床头
      if (level.getTile(x, y, z) === tile.id) {
        level.setTileAndData(
          x + xra, y, z + zra,
          tile.id,
          dir + BedTile.HEAD_PIECE_DATA,
        );
      }

      itemInstance.count--;
      return true;
    }

    return false;
  }
}