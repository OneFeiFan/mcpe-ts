// 1:1 移植自 src/world/item/TileItem.h（S3）。
// 放置方块的 useOn 会用到 Player 与网络包，本轮 OMIT；按 ItemInstance 取描述的重载同样 OMIT。
import { Tile } from '../level/tile/Tile';
import { Item } from './Item';

export class TileItem extends Item {
  private tileId: number;

  constructor(id_: number) {
    super(id_);
    this.tileId = id_ + 256;
    this.setIcon(Tile.tiles[id_ + 256]!.getTexture(2));
  }

  getTileId(): number {
    return this.tileId;
  }

  // OMIT(Player): useOn(instance, player, level, x, y, z, face, clickX, clickY, clickZ)  TileItem.h:34
  // OMIT(ItemInstance): getDescriptionId(instance)  TileItem.h:77

  override getDescriptionId(): string {
    return Tile.tiles[this.tileId]!.getDescriptionId();
  }
}
