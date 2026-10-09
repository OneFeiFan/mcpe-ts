// 1:1 移植自 src/world/item/FlintAndSteelItem.h
import { Item } from './Item';
import { ItemInstance } from './ItemInstance';
import { Level } from '../level/Level';
import { Tile } from '../level/tile/Tile';
import type { Player } from '../entity/player/Player';

export class FlintAndSteelItem extends Item {
  /** C++ FlintAndSteelItem::FlintAndSteelItem(int id) */
  constructor(id: number) {
    super(id);
    this.setMaxStackSize(1);
    this.setMaxDamage(64);
  }

  /** C++ FlintAndSteelItem::useOn(ItemInstance*, Player*, Level*, int, int, int, int, float, float, float) */
  override useOnByPlayer(
    instance: ItemInstance,
    _player: Player,
    level: Level,
    x: number,
    y: number,
    z: number,
    face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
  ): boolean {
    // face -> 相邻位置：点击位置 + 面法线方向
    if (face === 0) y--;
    if (face === 1) y++;
    if (face === 2) z--;
    if (face === 3) z++;
    if (face === 4) x--;
    if (face === 5) x++;

    const targetType = level.getTile(x, y, z);
    if (targetType === 0) {
      // playSound 用的是坐标版本，不是 Entity* 版本
      level.playSound(
        x + 0.5,
        y + 0.5,
        z + 0.5,
        'fire.ignite',
        1,
        FlintAndSteelItem.random.nextFloat() * 0.4 + 0.8,
      );
      level.setTile(x, y, z, Tile.fire.id);
    }

    // 无条件扣耐久、无条件返回 true（即使没点火）
    instance.hurt(1);
    return true;
  }
}
