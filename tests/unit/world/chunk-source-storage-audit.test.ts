/**
 * 全量审核 W58–W60：ChunkSource / ChunkStorage / MemoryChunkStorage。
 * 三个类都没有数值、随机数与容器逻辑，测试锁定的是 C++ 的默认实现和虚调用行为。
 */
import { describe, expect, it } from 'vitest';
import {
  ChunkSource,
  ChunkStorage,
  LevelChunk,
  MemoryChunkStorage,
  type Biome,
  type Level,
  type MobCategory,
} from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';

class StubSource extends ChunkSource {
  override hasChunk(_x: number, _y: number): boolean {
    return false;
  }

  override getChunk(_x: number, _z: number): LevelChunk {
    throw new Error('StubSource.getChunk 没有被调用');
  }

  override create(_x: number, _z: number): LevelChunk {
    throw new Error('StubSource.create 没有被调用');
  }

  override postProcess(_parent: ChunkSource, _x: number, _z: number): void {}

  override tick(): boolean {
    return false;
  }

  override shouldSave(): boolean {
    return false;
  }

  override getMobsAt(_mobCategory: MobCategory, _x: number, _y: number, _z: number): Biome.MobList {
    return [];
  }

  override gatherStats(): string {
    return 'StubSource';
  }
}

class RecordingStorage extends ChunkStorage {
  readonly calls: { level: Level; chunk: LevelChunk }[] = [];

  override save(level: Level, levelChunk: LevelChunk): void {
    this.calls.push({ level, chunk: levelChunk });
  }
}

class RecordingMemoryStorage extends MemoryChunkStorage {
  readonly saved: LevelChunk[] = [];

  override save(_level: Level, levelChunk: LevelChunk): void {
    this.saved.push(levelChunk);
  }
}

describe('W58 ChunkSource', () => {
  it('构造函数把 isChunkCache 初始化成 false，字段是 public 可写的', () => {
    const source = new StubSource();
    expect(source.isChunkCache).toBe(false);
    source.isChunkCache = true;
    expect(source.isChunkCache).toBe(true);
  });

  it('saveAll(bool) 的默认实现是空操作', () => {
    const source = new StubSource();
    expect(source.saveAll(false)).toBeUndefined();
    expect(source.saveAll(true)).toBeUndefined();
  });

  it('纯虚函数不生成桩函数体；C++ 里注释掉的 save 也没有复制过来', () => {
    expect(Object.getOwnPropertyNames(ChunkSource.prototype).sort()).toEqual([
      'constructor',
      'saveAll',
    ]);
  });
});

describe('W59 ChunkStorage', () => {
  const level = new FakeLevel();

  it('load 默认返回 NULL；save/saveEntities/tick/flush 都是空操作', () => {
    const storage = new ChunkStorage();
    expect(storage.load(level, 0, 0)).toBeNull();
    expect(storage.save(level, new LevelChunk(level, 0, 0))).toBeUndefined();
    expect(storage.saveEntities(level, null)).toBeUndefined();
    expect(storage.tick()).toBeUndefined();
    expect(storage.flush()).toBeUndefined();
  });

  it('saveAll 按传入顺序对每个区块调用虚函数 save', () => {
    const storage = new RecordingStorage();
    const a = new LevelChunk(level, 0, 0);
    const b = new LevelChunk(level, 1, -1);
    storage.saveAll(level, [a, b, a]);
    expect(storage.calls.map((call) => call.chunk)).toEqual([a, b, a]);
    expect(storage.calls.every((call) => call.level === level)).toBe(true);
  });

  it('saveEntities 的形参允许 NULL（ADAPTED(Cpp)：C++ 的 LevelChunk* 可以为 NULL）', () => {
    const storage: ChunkStorage = new ChunkStorage();
    expect(() => storage.saveEntities(level, null)).not.toThrow();
  });
});

describe('W60 MemoryChunkStorage', () => {
  const level = new FakeLevel();

  it('C++ 类体为空：TS 也没有新增任何原型方法', () => {
    expect(Object.getOwnPropertyNames(MemoryChunkStorage.prototype)).toEqual(['constructor']);
  });

  it('继承 ChunkStorage 的默认实现；saveAll 仍然派发到子类重写的 save', () => {
    const storage = new MemoryChunkStorage();
    expect(storage).toBeInstanceOf(ChunkStorage);
    expect(storage.load(level, 0, 0)).toBeNull();
    expect(storage.saveEntities(level, null)).toBeUndefined();
    expect(storage.tick()).toBeUndefined();
    expect(storage.flush()).toBeUndefined();

    const recording = new RecordingMemoryStorage();
    const chunk = new LevelChunk(level, 0, 0);
    recording.saveAll(level, [chunk]);
    expect(recording.saved).toEqual([chunk]);
  });
});
