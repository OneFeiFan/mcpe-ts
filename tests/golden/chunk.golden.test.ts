import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { VirtualFS, setVfs } from '@mcpe/platform';
import {
  ExternalFileLevelStorage,
  LevelChunk,
  LevelConstants,
  LevelData,
  RegionFile,
  type Level,
} from '@mcpe/world';
import { createFlatLevel } from '../helpers/headlessLevel';

// G14-5：区块存进 chunks.dat 的载荷格式，逐字节比对。
// 夹具由 tools/golden/harness_chunk.cpp 用参考 C++ 生成，禁止手改。
//
// 【为什么载荷的字节必须来自参考实现】save 和 load 是同一份代码里的两个函数 —— 万一两边都把
// 数组顺序写错了，**它们自己是一致的**（往返测试照样通过）。只有拿参考实现产出的字节比才行。
interface Loaded {
  unsaved: number;
  terrainPopulated: number;
  createdFromSave: number;
  /** 每条是 [下标, 写进去的值, 读回来的值] */
  blockOps: number[][];
}
interface Case {
  name: string;
  loaded: Loaded;
}
interface Fixture {
  constants: { chunkBlockCount: number; chunkColumns: number; x: number; z: number };
  ops: {
    block: number[][];
    data: number[][];
    sky: number[][];
    blockLight: number[][];
    update: number[][];
  };
  payloadLen: number;
  payloadHex: string;
  cases: Case[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/chunk.json', import.meta.url), 'utf8'),
) as Fixture;

const hex = (u: Uint8Array): string => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

const X = fixture.constants.x;
const Z = fixture.constants.z;
const DIR = '/w1'; // 没有 level.dat → loadedStorageVersion 保持 SharedConstants.StorageVersion
const LEGACY_DIR = '/w2'; // 放一份 storageVersion=1 的 level.dat → 读成 1

function freshVfs(): VirtualFS {
  const vfs = new VirtualFS();
  setVfs(vfs);
  return vfs;
}

/** 按夹具的 ops 表造一个区块（和 harness 里那套完全一样） */
function buildChunk(level: Level): LevelChunk {
  const blocks = new Uint8Array(fixture.constants.chunkBlockCount);
  for (const [i, v] of fixture.ops.block) blocks[i!] = v!;

  const c = new LevelChunk(level, blocks, X, Z);
  for (const [i, v] of fixture.ops.data) c.data.set(i!, v!);
  for (const [i, v] of fixture.ops.sky) c.skyLight.set(i!, v!);
  for (const [i, v] of fixture.ops.blockLight) c.blockLight.set(i!, v!);
  for (const [i, v] of fixture.ops.update) c.updateMap[i!] = v!;
  return c;
}

/** 把读回来的区块与夹具里某个用例的预期逐项对照 */
function expectCase(got: LevelChunk, c: Case): void {
  expect(got.unsaved, `${c.name} unsaved`).toBe(c.loaded.unsaved === 1);
  expect(got.terrainPopulated, `${c.name} terrainPopulated`).toBe(c.loaded.terrainPopulated === 1);
  expect(got.createdFromSave, `${c.name} createdFromSave`).toBe(c.loaded.createdFromSave === 1);

  const blocks = got.getBlockData()!;
  for (const [i, written, loaded] of c.loaded.blockOps) {
    expect(blocks[i!], `${c.name} 下标 ${i}（写进去的是 ${written}）`).toBe(loaded);
  }
}

const caseOf = (name: string): Case => fixture.cases.find((c) => c.name === name)!;

afterEach(() => {
  setVfs(null); // 模块级状态，用例之间必须清掉
});

describe('golden/G14-5 区块载荷', () => {
  it('常量与夹具一致，而且埋的下标都在范围内', () => {
    expect(LevelConstants.CHUNK_BLOCK_COUNT).toBe(fixture.constants.chunkBlockCount);
    expect(LevelConstants.CHUNK_COLUMNS).toBe(fixture.constants.chunkColumns);
    // 越界的下标会静默写到别的内存上（harness 那边第一版就是这么栽的），这里先挡住
    const limit: Record<string, number> = {
      block: LevelConstants.CHUNK_BLOCK_COUNT,
      data: LevelConstants.CHUNK_BLOCK_COUNT / 2,
      sky: LevelConstants.CHUNK_BLOCK_COUNT / 2,
      blockLight: LevelConstants.CHUNK_BLOCK_COUNT / 2,
      update: LevelConstants.CHUNK_COLUMNS,
    };
    for (const [name, ops] of Object.entries(fixture.ops)) {
      for (const [i] of ops) expect(i, `${name} 的下标 ${i}`).toBeLessThan(limit[name]!);
    }
  });

  it('save 写出的载荷与参考实现逐字节一致', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const level = createFlatLevel();
    const ext = new ExternalFileLevelStorage('w1', DIR);

    ext.save(level, buildChunk(level));

    // 另起一个 RegionFile 把载荷读回来。TS 的 VirtualFS 是内存的，没有 C++ 那边
    // stdio 缓冲没落盘的问题（harness 里就踩过那个）。
    const rf = new RegionFile(DIR);
    expect(rf.open()).toBe(true);
    const chunkData = rf.readChunk(X, Z);
    expect(chunkData).not.toBeNull();

    const got = chunkData!.getData();
    expect(got.length).toBe(fixture.payloadLen);
    expect(hex(got)).toBe(fixture.payloadHex);
  });

  it('current：未注册的方块 id 被换掉（ReplaceUnavailableBlocks 是无条件执行的）', () => {
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const level = createFlatLevel();
    const ext = new ExternalFileLevelStorage('w1', DIR);
    ext.save(level, buildChunk(level));

    const got = ext.load(level, X, Z);
    expect(got).not.toBeNull();
    expectCase(got!, caseOf('current'));
  });

  it('legacy：level.dat 是 storageVersion=1 时，老羊毛先被换成羊毛(35)', () => {
    const vfs = freshVfs();
    vfs.mkdir(LEGACY_DIR);
    // 先放一份 storageVersion=1 的 level.dat —— 构造函数读它，把 loadedStorageVersion 设成 1
    const ld = new LevelData();
    ld.setStorageVersion(1);
    expect(ExternalFileLevelStorage.writeLevelData(LEGACY_DIR + '/level.dat', ld, null)).toBe(true);

    const level = createFlatLevel();
    const ext = new ExternalFileLevelStorage('w2', LEGACY_DIR);
    ext.save(level, buildChunk(level));

    const got = ext.load(level, X, Z);
    expect(got).not.toBeNull();
    expectCase(got!, caseOf('legacy'));
  });
});
