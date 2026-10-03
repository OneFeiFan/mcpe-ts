// 1:1 移植自 src/world/item/StoneSlabTileItem.h（S3；useOn 与按 ItemInstance 取描述的重载在 S11 阶段 A 补上）。
// useOn 里的 level->isUnobstructed（检查实体是否挡住）在 S12 阶段 C 恢复。
import type { Player } from '../entity/player/Player';
import { Facing } from '../Facing';
import type { Level } from '../level/Level';
import { StoneSlabTile } from '../level/tile/StoneSlabTile';
import { Tile } from '../level/tile/Tile';
import type { ItemInstance } from './ItemInstance';
import { TileItem } from './TileItem';

export class StoneSlabTileItem extends TileItem {
  constructor(id: number) {
    super(id);
    this.setMaxDamage(0);
    this.setStackedByData(true);
  }

  override getIconForAux(itemAuxValue: number): number {
    return Tile.stoneSlabHalf.getTexture(2, itemAuxValue);
  }

  override getLevelDataForAuxValue(auxValue: number): number {
    return auxValue;
  }

  override getDescriptionIdForInstance(instance: ItemInstance | null): string {
    let auxValue = instance!.getAuxValue();
    if (auxValue < 0 || auxValue >= StoneSlabTile.SLAB_NAMES_COUNT) auxValue = 0;
    return super.getDescriptionIdForItem() + '.' + StoneSlabTile.SLAB_NAMES[auxValue]!;
  }

  override useOnByPlayer(
    instance: ItemInstance,
    player: Player,
    level: Level,
    x: number,
    y: number,
    z: number,
    face: number,
    clickX: number,
    clickY: number,
    clickZ: number,
  ): boolean {
    if (instance.count === 0) return false;
    const currentTile = level.getTile(x, y, z);
    const currentData = level.getData(x, y, z);
    const slabType = currentData & StoneSlabTile.TYPE_MASK;
    const isUpper = (currentData & StoneSlabTile.TOP_SLOT_BIT) !== 0;
    if (
      ((face === Facing.UP && !isUpper) || (face === Facing.DOWN && isUpper)) &&
      currentTile === Tile.stoneSlabHalf.id &&
      slabType === instance.getAuxValue()
    ) {
      const unobstructed = level.isUnobstructed(Tile.stoneSlab.getAABB(level, x, y, z)!);
      if (unobstructed && level.setTileAndData(x, y, z, Tile.stoneSlab.id, slabType)) {
        level.playSound(
          x + 0.5,
          y + 0.5,
          z + 0.5,
          Tile.stoneSlab.soundType.getStepSound(),
          (Tile.stoneSlab.soundType.getVolume() + 1) / 2,
          Tile.stoneSlab.soundType.getPitch() * 0.8,
        );
        instance.count--;
      }
      return true;
    } else {
      return super.useOnByPlayer(instance, player, level, x, y, z, face, clickX, clickY, clickZ);
    }
  }
}
