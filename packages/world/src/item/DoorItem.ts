import { Item } from './Item';
import { ItemInstance } from './ItemInstance';
import { Level } from '../level/Level';
import { Material } from '../level/material/Material';
import { Tile } from '../level/tile/Tile';
import { Facing } from '../Facing';
import type { Player } from '../entity/player/Player';
import { Mth } from '@mcpe/util';

export class DoorItem extends Item {
  private readonly material: Material;

  /** C++ DoorItem::DoorItem(int id, const Material* material) */
  constructor(id: number, material: Material) {
    super(id);
    this.material = material;
    this.maxDamage = 64;
    this.maxStackSize = 1;
  }

  /** C++ DoorItem::useOn(ItemInstance*, Player*, Level*, int, int, int, int, float, float, float) */
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
    if (face !== Facing.UP) return false;
    y++;

    const tile = this.material === Material.wood ? Tile.door_wood : Tile.door_iron;

    // C++ 里 player->mayUseItemAt 检查被注释掉了，不要加
    if (!tile.mayPlace(level, x, y, z)) return false;

    // 注意：是 -0.5，不是 +0.5（和 BedItem 不同）
    const dir = Mth.floor(((player.yRot + 180) * 4) / 360 - 0.5) & 3;

    DoorItem.place(level, x, y, z, dir, tile);

    instance.count--;
    return true;
  }

  /** C++ DoorItem::place(Level*, int, int, int, int, Tile*) — static */
  static place(level: Level, x: number, y: number, z: number, dir: number, tile: Tile): void {
    let xra = 0;
    let zra = 0;
    if (dir === 0) zra = +1;
    if (dir === 1) xra = -1;
    if (dir === 2) zra = -1;
    if (dir === 3) xra = +1;

    const solidLeft =
      (level.isSolidBlockingTile(x - xra, y, z - zra) ? 1 : 0) +
      (level.isSolidBlockingTile(x - xra, y + 1, z - zra) ? 1 : 0);
    const solidRight =
      (level.isSolidBlockingTile(x + xra, y, z + zra) ? 1 : 0) +
      (level.isSolidBlockingTile(x + xra, y + 1, z + zra) ? 1 : 0);

    const doorLeft =
      level.getTile(x - xra, y, z - zra) === tile.id ||
      level.getTile(x - xra, y + 1, z - zra) === tile.id;
    const doorRight =
      level.getTile(x + xra, y, z + zra) === tile.id ||
      level.getTile(x + xra, y + 1, z + zra) === tile.id;

    let flip = false;
    if (doorLeft && !doorRight) flip = true;
    else if (solidRight > solidLeft) flip = true;

    level.noNeighborUpdate = true;
    level.setTileAndData(x, y, z, tile.id, dir);
    level.setTileAndData(x, y + 1, z, tile.id, 8 | (flip ? 1 : 0));
    level.noNeighborUpdate = false;
    level.updateNeighborsAt(x, y, z, tile.id);
    level.updateNeighborsAt(x, y + 1, z, tile.id);
  }
}
