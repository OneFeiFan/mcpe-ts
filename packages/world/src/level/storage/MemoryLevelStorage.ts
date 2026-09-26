/**
 * 1:1 移植自 src/world/level/storage/MemoryLevelStorage.h（S4）：什么都不存的存档，demo 用它创建 Level。
 *
 * ADAPTED(Demo)：C++ 的 MemoryLevelStorage 没有实现 LevelStorage 的两个纯虚函数 savePlayer、loadPlayer
 *   （它写的是 save、load 两个同样为空的函数），所以在 C++ 里其实是抽象类，分支里唯一 new 它的
 *   MemoryLevelStorageSource.h 没有被任何源文件包含。TS 里补上这两个函数：与 save、load 一样什么都不做，
 *   loadPlayer 返回 false（没有可读的玩家数据），这样 demo 才能实例化它。
 */
import { LOGW } from '@mcpe/platform';
import type { Player } from '../../entity/player/Player';
import type { ChunkStorage } from '../chunk/storage/ChunkStorage';
import { MemoryChunkStorage } from '../chunk/storage/MemoryChunkStorage';
import type { Dimension } from '../dimension/Dimension';
import type { Level } from '../Level';
import type { LevelData } from './LevelData';
import { LevelStorage } from './LevelStorage';

export class MemoryLevelStorage extends LevelStorage {
  _storage: MemoryChunkStorage | null = null;

  prepareLevel(_level: Level): LevelData | null {
    return null;
  }

  checkSession(): void {} //throws LevelConflictException

  createChunkStorage(_dimension: Dimension): ChunkStorage {
    if (this._storage) {
      LOGW('>WARNING< Creating a MemoryChunkStorage over another. A memory leak will occur.');
    }
    return (this._storage = new MemoryChunkStorage());
  }

  saveLevelData$2(_levelData: LevelData, _players: Player[] | null): void {}

  closeAll(): void {}

  save(_player: Player): void {}

  load(_player: Player): void {}

  /** ADAPTED(Demo)：见文件头 */
  savePlayer(_player: Player): void {}

  /** ADAPTED(Demo)：见文件头 */
  loadPlayer(_player: Player): boolean {
    return false;
  }
}
