/**
 * 1:1 移植自 src/world/level/storage/LevelStorage.h（S4）：存档的抽象接口。
 * C++ 的纯虚函数写成 abstract；有默认实现的 virtual 照原样写出实现。
 * saveLevelData 有两个重载（带不带 players），按 Tile.ts 的约定：同名分派方法 + 按参数个数加后缀：
 *   saveLevelData(levelData, players) 与 saveLevelData(levelData)：一个可选参数的抽象方法（R10 情形 A）
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

  /**
   * C++ 的两个重载：纯虚的 saveLevelData(levelData, players) 与 saveLevelData(levelData)（以 players = NULL 转调前者）。
   * 写成一个可选参数的抽象方法（R10 情形 A）：子类实现时把省略的 players 当作 null。
   */
  abstract saveLevelData(levelData: LevelData, players?: Player[] | null): void;

  abstract closeAll(): void;

  saveGame(_level: Level): void {}

  /** C++ 的参数是指针，Level::loadEntities 传的是 NULL */
  loadEntities(_level: Level, _levelChunk: LevelChunk | null): void {}

  abstract savePlayer(player: Player): void;

  abstract loadPlayer(player: Player): boolean;
}
