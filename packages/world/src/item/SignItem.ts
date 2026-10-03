import { Item } from './Item';
import { ItemInstance } from './ItemInstance';
import { Level } from '../level/Level';
import { Tile } from '../level/tile/Tile';
import { SignTileEntity } from '../level/tile/entity/SignTileEntity';
import type { Player } from '../entity/player/Player';
import { Mth } from '@mcpe/util';

export class SignItem extends Item {
  /** C++ SignItem::SignItem(int id) */
  constructor(id: number) {
    super(id);
    this.maxStackSize = 16;
  }

  /** C++ SignItem::useOn(ItemInstance*, Player*, Level*, int, int, int, int, float, float, float) */
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
    if (face === 0) return false;
    if (!level.getMaterial(x, y, z)!.isSolid()) return false;

    if (face === 1) y++;
    if (face === 2) z--;
    if (face === 3) z++;
    if (face === 4) x--;
    if (face === 5) x++;

    // C++ 里 player->mayUseItemAt 检查被注释掉了，不要加
    if (!Tile.sign.mayPlace(level, x, y, z)) return false;

    if (face === 1) {
      // 立牌：16 方向，注意 *16 / 360 + 0.5 & 15
      const rot = Mth.floor(((player.yRot + 180) * 16) / 360 + 0.5) & 15;
      level.setTileAndData(x, y, z, Tile.sign.id, rot);
    } else {
      // 挂墙牌：data = face (2..5)
      level.setTileAndData(x, y, z, Tile.wallSign.id, face);
    }

    instance.count--;

    // 读刚放置的 tile entity，打开编辑界面
    const ste = level.getTileEntity(x, y, z) as SignTileEntity | null;
    if (ste !== null) player.openTextEdit(ste);

    return true;
  }
}
