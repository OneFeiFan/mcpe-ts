// 1:1 移植自 src/world/item/TileItem.h（S3；useOn 与按 ItemInstance 取描述的重载在 S11 阶段 A 补上）。
// useOn 里发送 PlaceBlockPacket 的一段在 C++ 里被注释掉了；调试用的 printf 写成 LOGI。
import { LOGI } from '@mcpe/platform';
import type { Player } from '../entity/player/Player';
import { Facing } from '../Facing';
import type { Level } from '../level/Level';
import { Material } from '../level/material/Material';
import { Tile } from '../level/tile/Tile';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';

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

  override useOnByPlayer(instance: ItemInstance, player: Player, level: Level, x: number, y: number, z: number, face: number, clickX: number, clickY: number, clickZ: number): boolean {
    if (level.adventureSettings.immutableWorld) {
      const tile = Tile.tiles[this.tileId]!;
      if (this.tileId !== Tile.leaves.id && tile.material !== Material.plant) {
        return false;
      }
    }
    if (level.getTile(x, y, z) === Tile.topSnow.id) {
      face = 0;
    } else {
      switch (face) {
        case Facing.DOWN: y--; break;
        case Facing.UP: y++; break;
        case Facing.NORTH: z--; break;
        case Facing.SOUTH: z++; break;
        case Facing.WEST: x--; break;
        case Facing.EAST: x++; break;
      }
    }
    if (instance.count === 0) return false;
    if (level.mayPlace(this.tileId, x, y, z, false, face)) {
      const tile = Tile.tiles[this.tileId]!;
      const data = tile.getPlacedOnFaceDataValue(level, x, y, z, face, clickX, clickY, clickZ, this.getLevelDataForAuxValue(instance.getAuxValue()));
      if (level.setTileAndData(x, y, z, this.tileId, data)) {
        Tile.tiles[this.tileId]!.setPlacedBy(level, x, y, z, player);
        level.playSound(x + 0.5, y + 0.5, z + 0.5, tile.soundType.getStepSound(), (tile.soundType.getVolume() + 1) / 2, tile.soundType.getPitch() * 0.8);
        LOGI(`${player.x} ${player.y} ${player.z}`); // printf("%f %f %f \n", player->x, player->y, player->z);
        instance.count--;
      }
      return true;
    }
    return false;
  }

  override getDescriptionIdForInstance(_instance: ItemInstance | null): string {
    return Tile.tiles[this.tileId]!.getDescriptionId();
  }

  override getDescriptionIdForItem(): string {
    return Tile.tiles[this.tileId]!.getDescriptionId();
  }
}
