// 1:1 移植自 src/world/item/StoneSlabTileItem.h（S3）。
// 叠放台阶的 useOn（Player）与按 ItemInstance 取描述的重载本轮 OMIT，所以这里不依赖 StoneSlabTile。
import { Tile } from '../level/tile/Tile';
import { TileItem } from './TileItem';

export class StoneSlabTileItem extends TileItem {
  constructor(id: number) {
    super(id);
    this.setMaxDamage(0);
    this.setStackedByData(true);
  }

  override getIcon(itemAuxValue: number): number {
    return Tile.stoneSlabHalf.getTexture(2, itemAuxValue);
  }

  override getLevelDataForAuxValue(auxValue: number): number {
    return auxValue;
  }

  // OMIT(ItemInstance): getDescriptionId(instance)  StoneSlabTileItem.h:35
  // OMIT(Player): useOn(instance, player, level, x, y, z, face, clickX, clickY, clickZ)  StoneSlabTileItem.h:43
}
