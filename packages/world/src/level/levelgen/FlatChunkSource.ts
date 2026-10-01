/**
 * NEW（S5）：demo 的平坦世界。区块坐标 7–9 是 3×3 的平台，0–15 内的其余区块全是空气。
 * 0–15 之外由 ChunkCache 返回 EmptyLevelChunk（隐形基岩），不会走到这里。
 *
 * create() 参照 RandomLevelSource.cpp 末尾被注释掉的 PerformanceTestChunkSource::create
 * （那个模板类没实现 getMobsAt，是抽象类，所以原作者一直把它注释着）；getMobsAt 照搬 RandomLevelSource::getMobsAt。
 * 缓存由 ChunkCache 负责，所以 getChunk 每次都新建。
 */
import type { MobCategory } from '../../entity/MobCategory';
import type { Biome } from '../biome/Biome';
import { ChunkSource } from '../chunk/ChunkSource';
import { LevelChunk } from '../chunk/LevelChunk';
import type { Level } from '../Level';

export class FlatChunkSource extends ChunkSource {
  static readonly PLATFORM_MIN = 7;
  static readonly PLATFORM_MAX = 9;

  constructor(private readonly level: Level) {
    super();
  }

  hasChunk(_x: number, _z: number): boolean {
    return true;
  }

  getChunk(x: number, z: number): LevelChunk {
    return this.create(x, z);
  }

  create(x: number, z: number): LevelChunk {
    const blocks = new Uint8Array(LevelChunk.ChunkBlockCount);
    const onPlatform = x >= FlatChunkSource.PLATFORM_MIN && x <= FlatChunkSource.PLATFORM_MAX && z >= FlatChunkSource.PLATFORM_MIN && z <= FlatChunkSource.PLATFORM_MAX;
    if (onPlatform) {
      for (let xx = 0; xx < 16; xx++)
        for (let zz = 0; zz < 16; zz++) {
          const p = (xx << 11) | (zz << 7); // LevelChunk 的布局：x << 11 | z << 7 | y
          blocks[p] = 7; // 基岩
          for (let y = 1; y <= 59; y++) blocks[p + y] = 1; // 石头
          for (let y = 60; y <= 62; y++) blocks[p + y] = 3; // 泥土
          blocks[p + 63] = 2; // 草（y 63 = SEA_LEVEL）
        }
    }
    const c = new LevelChunk(this.level, blocks, x, z);
    c.recalcHeightmap();
    return c;
  }

  postProcess(_parent: ChunkSource, _x: number, _z: number): void {}

  tick(): boolean {
    return false;
  }

  shouldSave(): boolean {
    return false;
  }

  /** 照搬 RandomLevelSource::getMobsAt（RandomLevelSource.cpp:725） */
  getMobsAt(mobCategory: MobCategory, x: number, _y: number, z: number): Biome.MobList {
    const biomeSource = this.level.getBiomeSource();
    if (biomeSource == null) {
      return [];
    }
    const biome = biomeSource.getBiome(x, z);
    if (biome == null) {
      return [];
    }
    return biome.getMobs(mobCategory);
  }

  gatherStats(): string {
    return 'FlatChunkSource';
  }
}
