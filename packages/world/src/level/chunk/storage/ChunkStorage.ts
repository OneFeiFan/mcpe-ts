// 1:1 移植自 src/world/level/chunk/storage/ChunkStorage.h（S4 前置）。C++ 注明 was-interface，方法都有默认实现。
// 部分语句省略，见文件内的 OMIT 标记。
import type { Level } from '../../Level';
import type { LevelChunk } from '../LevelChunk';

export class ChunkStorage {
  // OMIT(ChunkStorage): virtual ~ChunkStorage() {}  ChunkStorage.h:16 —— 空虚析构函数，R3 不移植。
  load(_level: Level, _x: number, _z: number): LevelChunk | null {
    return null;
  }

  save(_level: Level, _levelChunk: LevelChunk): void {}

  // ADAPTED(Cpp)：C++ 形参是 LevelChunk*，ExternalFileLevelStorage 的 tick/saveGame 传的是 NULL；
  // 函数体从没读过它，TS 用 LevelChunk | null 表达同样的空指针实参。
  saveEntities(_level: Level, _levelChunk: LevelChunk | null): void {}

  saveAll(level: Level, levelChunks: LevelChunk[]): void {
    for (let i = 0; i < levelChunks.length; ++i) this.save(level, levelChunks[i]!);
  }

  tick(): void {}

  flush(): void {}
}
