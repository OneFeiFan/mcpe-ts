/**
 * 全量审核 W55：ChunkCache.ts（14 个工作表函数逐行对照）。
 * 本文件没有 float / 整数除法 / 随机数；测试锁定的是 C++ 的怪癖与调用顺序：
 * 范围外区块视为“存在”、槽里的 emptyChunk 短路 isAt、postProcess 的 clearUpdateMap
 * 只在 source != NULL 分支里执行、替换旧区块时 unload → save → saveEntities。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ChunkCache,
  ChunkSource,
  ChunkStorage,
  LevelChunk,
  LevelConstants,
  LightLayer,
  MobCategory,
  type Biome,
  type Level,
} from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';

class RecordingStorage extends ChunkStorage {
  readonly chunks = new Map<string, LevelChunk>();
  readonly loads: string[] = [];
  readonly events: string[] = [];
  saved: LevelChunk[] = [];

  override load(_level: Level, x: number, z: number): LevelChunk | null {
    this.loads.push(`${x},${z}`);
    return this.chunks.get(`${x},${z}`) ?? null;
  }

  override save(_level: Level, levelChunk: LevelChunk): void {
    this.events.push(`save:${levelChunk.x},${levelChunk.z}`);
  }

  override saveEntities(_level: Level, levelChunk: LevelChunk | null): void {
    this.events.push(`saveEntities:${levelChunk?.x},${levelChunk?.z}`);
  }

  override saveAll(_level: Level, levelChunks: LevelChunk[]): void {
    this.saved = levelChunks.slice();
  }

  override tick(): void {
    this.events.push('storage.tick');
  }
}

class RecordingSource extends ChunkSource {
  readonly chunks = new Map<string, LevelChunk>();
  readonly events: string[] = [];
  readonly mobList: Biome.MobList = [];
  mobArgs: number[] = [];
  tickResult = true;

  override hasChunk(x: number, z: number): boolean {
    return this.chunks.has(`${x},${z}`);
  }

  override getChunk(x: number, z: number): LevelChunk {
    const chunk = this.chunks.get(`${x},${z}`);
    if (chunk === undefined) throw new Error(`RecordingSource 没有区块 ${x},${z}`);
    return chunk;
  }

  override create(x: number, z: number): LevelChunk {
    return this.getChunk(x, z);
  }

  override postProcess(_parent: ChunkSource, x: number, z: number): void {
    this.events.push(`post:${x},${z}`);
  }

  override tick(): boolean {
    this.events.push('source.tick');
    return this.tickResult;
  }

  override shouldSave(): boolean {
    return true;
  }

  override getMobsAt(_mobCategory: MobCategory, x: number, y: number, z: number): Biome.MobList {
    this.mobArgs = [x, y, z];
    return this.mobList;
  }

  override gatherStats(): string {
    return 'RecordingSource';
  }
}

/** saveAll 只用到 level.getChunk；FakeLevel 默认返回的替身没有 shouldSave，这里换成真区块。 */
class SaveAllLevel extends FakeLevel {
  readonly chunkCalls: string[] = [];
  readonly chunk: LevelChunk;

  constructor() {
    super();
    this.chunk = new LevelChunk(this, 0, 0);
  }

  override getChunk(x: number, z: number): LevelChunk {
    this.chunkCalls.push(`${x},${z}`);
    return this.chunk;
  }
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ChunkCache 审核（W55）', () => {
  it('构造：gatherStats 与 C++ stringstream 同串、shouldSave 恒 true、LOGI 文字一致', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logSpy.mockClear();
    const cache = new ChunkCache(new FakeLevel(), null, null);
    expect(logSpy).toHaveBeenCalledWith('[I]', 'Chunks allocated.');
    expect(LevelConstants.CHUNK_CACHE_WIDTH).toBe(16);
    expect(cache.gatherStats()).toBe('ChunkCache: 256');
    expect(cache.shouldSave()).toBe(true);
  });

  it('fits 四边界；范围外 hasChunk 恒 true、getChunk 返回同一 emptyChunk（怪癖保留）', () => {
    const cache = new ChunkCache(new FakeLevel(), null, null);
    expect([
      cache.fits(0, 0),
      cache.fits(15, 15),
      cache.fits(-1, 0),
      cache.fits(16, 0),
      cache.fits(0, -1),
      cache.fits(0, 16),
    ]).toEqual([true, true, false, false, false, false]);

    expect(cache.hasChunk(16, 0)).toBe(true);
    expect(cache.hasChunk(-1, -1)).toBe(true);
    const empty = cache.getChunk(16, 0);
    expect(empty).toBe(cache.getChunk(-1, 0));
    expect(empty.isEmpty()).toBe(true);

    expect(cache.hasChunk(0, 0)).toBe(false); // 范围内、槽还是 null
    expect(cache.getChunk(0, 0)).toBe(empty); // storage 与 source 都为 null
    expect(cache.hasChunk(0, 0)).toBe(true); // 槽里是 emptyChunk 时不再比对 isAt
  });

  it('load 命中：设 lastSaveTime、逐列更新两层光照、load() 后缓存命中不再读 storage', () => {
    const level = new FakeLevel();
    level.time = 42;
    const chunk = new LevelChunk(level, 0, 0);
    const storage = new RecordingStorage();
    storage.chunks.set('0,0', chunk);
    const cache = new ChunkCache(level, storage, null);

    expect(cache.getChunk(0, 0)).toBe(chunk);
    expect([chunk.lastSaveTime, chunk.loaded, cache.xLast, cache.zLast]).toEqual([42, true, 0, 0]);

    // FakeLevel.getHeightmap 恒为 0 → 每列 cy 只跑 0 一次，Sky + Block 各一条
    expect(level.lightUpdates.length).toBe(256 * 2);
    expect(level.lightUpdates[0]).toEqual([LightLayer.Sky, 0, 0, 0, 0, 0, 0]);
    expect(level.lightUpdates[1]).toEqual([LightLayer.Block, -1, 0, -1, 1, 0, 1]);
    expect(level.lightUpdates[510]).toEqual([LightLayer.Sky, 15, 0, 15, 15, 0, 15]);
    expect(level.lightUpdates[511]).toEqual([LightLayer.Block, 14, 0, 14, 16, 0, 16]);

    storage.loads.length = 0;
    expect(cache.getChunk(0, 0)).toBe(chunk);
    expect(storage.loads).toEqual([]);
  });

  it('storage 未命中而 source 提供区块时不做光照；getMobsAt 原样转发', () => {
    const level = new FakeLevel();
    const source = new RecordingSource();
    const chunk = new LevelChunk(level, 0, 0);
    source.chunks.set('0,0', chunk);
    const cache = new ChunkCache(level, new RecordingStorage(), source);

    expect(cache.getChunk(0, 0)).toBe(chunk);
    expect(level.lightUpdates).toEqual([]);
    expect(chunk.loaded).toBe(true);
    expect(cache.getMobsAt(MobCategory.monster, 1, 2, 3)).toBe(source.mobList);
    expect(source.mobArgs).toEqual([1, 2, 3]);
  });

  it('postProcess 怪癖：clearUpdateMap 只在 source != NULL 的分支里执行', () => {
    const levelA = new FakeLevel();
    const chunkA = new LevelChunk(levelA, 0, 0);
    const storageA = new RecordingStorage();
    storageA.chunks.set('0,0', chunkA);
    const cacheA = new ChunkCache(levelA, storageA, null);
    cacheA.getChunk(0, 0);
    chunkA.markUnsaved();
    cacheA.postProcess(cacheA, 0, 0);
    expect([chunkA.terrainPopulated, chunkA.unsaved]).toEqual([true, true]);

    const levelB = new FakeLevel();
    const chunkB = new LevelChunk(levelB, 0, 0);
    const storageB = new RecordingStorage();
    storageB.chunks.set('0,0', chunkB);
    const sourceB = new RecordingSource();
    const cacheB = new ChunkCache(levelB, storageB, sourceB);
    cacheB.getChunk(0, 0);
    chunkB.markUnsaved();
    cacheB.postProcess(cacheB, 0, 0);
    expect([chunkB.terrainPopulated, chunkB.unsaved]).toEqual([true, false]);
    expect(sourceB.events).toEqual(['post:0,0']);
  });

  it('替换旧区块：先 unload，再 save（写 lastSaveTime）与 saveEntities', () => {
    const level = new FakeLevel();
    level.time = 7;
    const storage = new RecordingStorage();
    const wrong = new LevelChunk(level, 1, 1); // 故意让槽 0 里的区块坐标不符
    storage.chunks.set('0,0', wrong);
    const cache = new ChunkCache(level, storage, null);

    expect(cache.getChunk(0, 0)).toBe(wrong); // 第一次装入；缓存快路径不校验 isAt
    level.time = 9;
    cache.getChunk(1, 0); // 把 last 挪走，下一次 getChunk(0,0) 才会走 hasChunk
    storage.chunks.delete('0,0');
    const got = cache.getChunk(0, 0);

    expect(got).toBe(cache.getChunk(0, 0)); // storage 未命中、source 为 null → emptyChunk
    expect(storage.loads).toEqual(['0,0', '1,0', '0,0']);
    expect(storage.events).toEqual(['save:1,1', 'saveEntities:1,1']);
    expect([wrong.loaded, wrong.lastSaveTime]).toEqual([false, 9]);
  });

  it('tick 先 storage 后 source；saveAll 按 z 外 x 内遍历，onlyUnsaved 短路 shouldSave', () => {
    const level = new SaveAllLevel();
    const storage = new RecordingStorage();
    const source = new RecordingSource();
    const cache = new ChunkCache(level, storage, source);

    expect(cache.tick()).toBe(true);
    expect(storage.events).toEqual(['storage.tick']);
    expect(source.events).toEqual(['source.tick']);

    const shouldSave = vi.spyOn(level.chunk, 'shouldSave');
    cache.saveAll(false);
    expect(shouldSave).not.toHaveBeenCalled();
    expect(level.chunkCalls.length).toBe(256);
    expect(level.chunkCalls.slice(0, 3)).toEqual(['0,0', '1,0', '2,0']);
    expect(level.chunkCalls[16]).toBe('0,1');
    expect(level.chunkCalls[255]).toBe('15,15');
    expect(storage.saved).toEqual(new Array<LevelChunk>(256).fill(level.chunk));

    shouldSave.mockClear();
    cache.saveAll(true);
    expect(shouldSave).toHaveBeenCalledTimes(256);
    expect(storage.saved).toEqual([]); // LevelChunk.unsaved 默认 false
  });
});
