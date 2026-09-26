// 1:1 移植自 src/world/level/chunk/storage/ChunkStorage.h（S4 前置）。C++ 注明 was-interface，方法都有默认实现。
import type { Level } from '../../Level';
import type { LevelChunk } from '../LevelChunk';

export class ChunkStorage {
  load(_level: Level, _x: number, _z: number): LevelChunk | null {
    return null;
  }

  save(_level: Level, _levelChunk: LevelChunk): void {}

  saveEntities(_level: Level, _levelChunk: LevelChunk): void {}

  saveAll(level: Level, levelChunks: LevelChunk[]): void {
    for (let i = 0; i < levelChunks.length; ++i) this.save(level, levelChunks[i]!);
  }

  tick(): void {}

  flush(): void {}
}
