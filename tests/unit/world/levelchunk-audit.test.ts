import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LevelChunk, TileEntity } from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

type Assert<T extends true> = T;

/**
 * W54：C++ 的 LevelChunk::tileEntities 在 protected 段。
 * keyof 只列出 public 成员；如果它重新变成 public，这个类型会立刻编译失败。
 */
export type TileEntitiesIsProtected = Assert<
  'tileEntities' extends keyof LevelChunk ? false : true
>;

class ProbeTileEntity extends TileEntity {
  constructor() {
    super(0);
  }

  override shouldSave(): boolean {
    return false;
  }
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles();
  LevelChunk.ChunkBlockCount = 32768;
});

describe('LevelChunk 全量审核（W54）', () => {
  it('W54a setBlocks 输出 C++ 的 LOGI（含换行）', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const chunk = new LevelChunk(new FakeLevel(), new Uint8Array(32768), 8, 8);
      chunk.setBlocks(new Uint8Array(128 * 16 * 4), 0);
      expect(spy.mock.calls).toContainEqual(['[I]', 'LevelChunk::setBlocks\n']);
    } finally {
      spy.mockRestore();
    }
  });

  it('W54b setTileEntity 的 LOGW 以换行结尾（与 C++ 格式串一致）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const chunk = new LevelChunk(new FakeLevel(), new Uint8Array(32768), 0, 0);
      chunk.setTileEntity(0, 0, 0, new ProbeTileEntity());
      expect(spy.mock.calls).toContainEqual([
        '[W]',
        'Attempted to place a tile entity where there was no entity tile! 0, 0, 0\n',
      ]);
    } finally {
      spy.mockRestore();
    }
  });
});
