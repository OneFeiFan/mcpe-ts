import type { Player } from "../entity/player/Player";
import type { Level } from "../level/Level";
import { Item } from "./Item";
import { ItemInstance } from "./ItemInstance";

export class SeedItem extends Item {
  private readonly resultId: number;
  private readonly targetLand: number;

  /** C++ SeedItem::SeedItem(int id, int resultId, int targetLand) */
  constructor(id: number, resultId: number, targetLand: number) {
    super(id);
    this.resultId = resultId;
    this.targetLand = targetLand;
  }

  /** C++ SeedItem::useOn(ItemInstance*, Player*, Level*, int, int, int, int, float, float, float) */
  override useOnByPlayer(
    itemInstance: ItemInstance,
    _player: Player,
    level: Level,
    x: number, y: number, z: number,
    face: number,
    _clickX: number, _clickY: number, _clickZ: number,
  ): boolean {
    if (face !== 1) return false;
    // C++ 里 player.mayBuild 检查被注释掉了，不要加

    const targetType = level.getTile(x, y, z);
    if (targetType === this.targetLand && level.isEmptyTile(x, y + 1, z)) {
      level.setTile(x, y + 1, z, this.resultId);
      itemInstance.count--;
      return true;
    }
    return false;
  }
}