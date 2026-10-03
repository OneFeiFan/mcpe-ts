// 1:1 移植自 src/world/level/tile/NetherReactor.h 与 NetherReactor.cpp（S12 阶段 C；原为你的单元，因方块实体的依赖改由 Claude 完成）
import type { Player } from '../../entity/player/Player';
import { GameType } from '../LevelSettings';
import type { Level } from '../Level';
import { LevelConstants } from '../LevelConstants';
import type { Material } from '../material/Material';
import { EntityTile } from './EntityTile';
import type { NetherReactorTileEntity } from './entity/NetherReactorTileEntity';
import { type TileEntity, TileEntityFactory, TileEntityType } from './entity/TileEntity';
import { NetherReactorPattern } from './NetherReactorPattern';

export class NetherReactor extends EntityTile {
  constructor(id: number, tex: number, material: Material) {
    super(id, tex, material);
  }

  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    if (level.getLevelData().getGameType() !== GameType.Survival) return false;
    const pattern = new NetherReactorPattern();
    for (let checkLevel = 0; checkLevel <= 2; ++checkLevel) {
      for (let checkX = -1; checkX <= 1; ++checkX) {
        for (let checkZ = -1; checkZ <= 1; ++checkZ) {
          if (level.getTile(x + checkX, y + checkLevel - 1, z + checkZ) !== pattern.getTileAt(checkLevel, checkX + 1, checkZ + 1)) {
            player.displayClientMessage('Not the correct pattern!');
            return false;
          }
        }
      }
    }
    if (!this.canSpawnStartNetherReactor(level, x, y, z, player)) return false;
    player.displayClientMessage('Active!');
    const reactor = level.getTileEntity(x, y, z) as NetherReactorTileEntity | null;
    if (reactor !== null) {
      reactor.lightItUp(x, y, z);
    }
    return true;
  }

  override newTileEntity(): TileEntity {
    return TileEntityFactory.createTileEntity(TileEntityType.NetherReactor)!;
  }

  static setPhase(level: Level, x: number, y: number, z: number, phase: number): void {
    const curPhase = level.getData(x, y, z);
    if (curPhase !== phase) {
      level.setData(x, y, z, phase);
    }
  }

  /** C++ getTexture(int face, int data) */
  override getTextureForData(_face: number, data: number): number {
    switch (data) {
      case 1: return this.tex - 1;
      case 2: return this.tex - 2;
      default: return this.tex;
    }
  }

  canSpawnStartNetherReactor(level: Level, x: number, y: number, z: number, player: Player): boolean {
    if (!this.allPlayersCloseToReactor(level, x, y, z)) {
      player.displayClientMessage('All players need to be close to the reactor.');
      return false;
    } else if (y > LevelConstants.LEVEL_HEIGHT - 28) {
      player.displayClientMessage('The nether reactor needs to be built lower down.');
      return false;
    } else if (y < 2) {
      player.displayClientMessage('The nether reactor needs to be built higher up.');
      return false;
    }
    return true;
  }

  allPlayersCloseToReactor(level: Level, x: number, y: number, z: number): boolean {
    for (const currentPlayer of level.players) {
      if (!(currentPlayer.x >= x - 5 && currentPlayer.x <= x + 5)) return false;
      if (!(currentPlayer.y - currentPlayer.heightOffset >= y - 1 && currentPlayer.y - currentPlayer.heightOffset <= y + 1)) return false;
      if (!(currentPlayer.z >= z - 5 && currentPlayer.z <= z + 5)) return false;
    }
    return true;
  }
}
