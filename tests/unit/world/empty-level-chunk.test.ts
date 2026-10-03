import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EmptyLevelChunk, LevelChunk, LightLayer } from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles();
  LevelChunk.ChunkBlockCount = 32768;
});

describe('EmptyLevelChunk', () => {
  it('ChunkCache 的创建方式：blocks 传 null', () => {
    const c = new EmptyLevelChunk(new FakeLevel(), null, 0, 0);
    expect([c.dontSave, c.isEmpty(), c.shouldSave(true)]).toEqual([true, true, false]);
    expect(c.getBlockData()).toBeNull();
  });

  it('读到的全是 invisible_bedrock，写入一律忽略但返回 true', () => {
    const c = new EmptyLevelChunk(new FakeLevel(), null, 0, 0);
    expect([c.getTile(3, 64, 3), c.getData(3, 64, 3), c.getHeightmap(3, 3)]).toEqual([95, 0, 0]);
    expect([c.setTile(3, 64, 3, 1), c.setTileAndData(3, 64, 3, 1, 2), c.getTile(3, 64, 3)]).toEqual(
      [true, true, 95],
    );
    expect([
      c.getBrightness(LightLayer.Sky, 0, 0, 0),
      c.getRawBrightness(0, 0, 0, 15),
      c.isSkyLit(0, 100, 0),
    ]).toEqual([7, 7, false]);
  });

  it('getBlocksAndData 全部填 95，返回长度而不是 p + len（与 C++ 相同）', () => {
    const c = new EmptyLevelChunk(new FakeLevel(), null, 0, 0);
    const buf = new Uint8Array(40);
    const n = c.getBlocksAndData(buf, 0, 0, 0, 2, 2, 2, 10); // s = 8，len = 8 + 4 * 3 = 20
    expect(n).toBe(20);
    expect([buf[9], buf[10], buf[29], buf[30]]).toEqual([0, 95, 95, 0]);
    expect(c.setBlocksAndData(buf, 0, 0, 0, 2, 2, 2, 10)).toBe(20);
  });

  it('getRandom 与 LevelChunk 的结果相同', () => {
    const lv = new FakeLevel();
    lv.seed = 123456789;
    const a = new EmptyLevelChunk(lv, null, 5, -7).getRandom(99);
    const b = new LevelChunk(lv, 5, -7).getRandom(99);
    expect([a.nextInt(), a.nextInt()]).toEqual([b.nextInt(), b.nextInt()]);
  });
});
