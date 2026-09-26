/**
 * 1:1 移植自 src/world/level/storage/LevelStorage.h（S4）：存档的抽象接口。
 * C++ 的纯虚函数写成 abstract；有默认实现的 virtual 照原样写出实现。
 * saveLevelData 有两个重载（带不带 players），按 Tile.ts 的约定：同名分派方法 + 按参数个数加后缀：
 *   saveLevelData(levelData, players) → saveLevelData$2（纯虚，子类实现）
 *   saveLevelData(levelData)          → saveLevelData$1（默认转给 $2，players 传 null）
 */
import type { Player } from '../../entity/player/Player';
import type { ChunkStorage } from '../chunk/storage/ChunkStorage';
import type { LevelChunk } from '../chunk/LevelChunk';
import type { Dimension } from '../dimension/Dimension';
import type { Level } from '../Level';
import type { LevelData } from './LevelData';

export abstract class LevelStorage {
  abstract prepareLevel(level: Level): LevelData | null;

  abstract createChunkStorage(dimension: Dimension): ChunkStorage;

  saveLevelData(levelData: LevelData): void;
  saveLevelData(levelData: LevelData, players: Player[] | null): void;
  saveLevelData(levelData: LevelData, players?: Player[] | null): void {
    if (players === undefined) this.saveLevelData$1(levelData);
    else this.saveLevelData$2(levelData, players);
  }

  /** C++ saveLevelData(LevelData& levelData, std::vector<Player*>* players) = 0 */
  abstract saveLevelData$2(levelData: LevelData, players: Player[] | null): void;

  /** C++ saveLevelData(LevelData& levelData) */
  saveLevelData$1(levelData: LevelData): void {
    this.saveLevelData$2(levelData, null);
  }

  abstract closeAll(): void;

  saveGame(_level: Level): void {}

  loadEntities(_level: Level, _levelChunk: LevelChunk): void {}

  abstract savePlayer(player: Player): void;

  abstract loadPlayer(player: Player): boolean;
}
