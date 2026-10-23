// 1:1 移植自 src/world/level/chunk/ChunkSource.h（S4）：区块来源的抽象基类（ChunkCache、RandomLevelSource、FlatChunkSource 继承它）
// 部分语句省略，见文件内的 OMIT 标记。
import type { MobCategory } from '../../entity/MobCategory';
import type { Biome } from '../biome/Biome';
import type { LevelChunk } from './LevelChunk';

export abstract class ChunkSource {
  isChunkCache = false;

  // OMIT(ChunkSource): ~ChunkSource() {}  ChunkSource.h:21 —— 空虚析构函数，R3 不移植。

  abstract hasChunk(x: number, y: number): boolean;
  abstract getChunk(x: number, z: number): LevelChunk;
  abstract create(x: number, z: number): LevelChunk;
  abstract postProcess(parent: ChunkSource, x: number, z: number): void;
  abstract tick(): boolean;
  abstract shouldSave(): boolean;

  saveAll(_onlyUnsaved: boolean): void {}

  abstract getMobsAt(mobCategory: MobCategory, x: number, y: number, z: number): Biome.MobList;

  /** Returns some stats that are rendered when the user holds F3. */
  abstract gatherStats(): string;
}
