import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SEEK_END, SEEK_SET, VirtualFS, setVfs } from '@mcpe/platform';
import { ExternalFileLevelStorage, GameType, LevelData } from '@mcpe/world';

// G14-2：level.dat 的字节逐字节比对。
// 夹具由 tools/golden/harness_leveldata.cpp 用参考 C++ 的 writeLevelData 生成，禁止手改。
interface Case {
  version: number;
  size: number;
  tsOffset: number;
  tsLen: number;
  hex: string;
}
interface Fixture {
  v1: Case;
  nbt: Case;
  readBack: {
    ok: number;
    seed: number;
    xSpawn: number;
    ySpawn: number;
    zSpawn: number;
    time: number;
    gameType: number;
    levelName: string;
    sizeOnDisk: number;
    storageVersion: number;
    allowCheats: number;
  };
}

const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/leveldata.json', import.meta.url), 'utf8'),
) as Fixture;

const hex = (u: Uint8Array): string => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const bytesOf = (h: string): Uint8Array =>
  new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

const DIR = '/w';
const DAT = DIR + '/level.dat';

/** 与 harness_leveldata.cpp 里那个固定 LevelData 逐字段对应 */
function sample(storageVersion: number): LevelData {
  const d = new LevelData();
  d.setSeed(123456789);
  d.setSpawn(11, 22, 33);
  d.setTime(987654321);
  d.setGameType(GameType.Creative);
  d.setLevelName('GoldenWorld');
  d.setSizeOnDisk(4096);
  d.setAllowCheats(true);
  d.setStorageVersion(storageVersion);
  return d;
}

function freshVfs(): VirtualFS {
  const vfs = new VirtualFS();
  vfs.mkdir(DIR);
  setVfs(vfs);
  return vfs;
}

function readAll(vfs: VirtualFS, path: string): Uint8Array {
  const f = vfs.open(path, 'rb')!;
  f.seek(0, SEEK_END);
  const size = f.tell();
  f.seek(0, SEEK_SET);
  const out = new Uint8Array(size);
  f.read(out, 1, size);
  f.close();
  return out;
}

afterEach(() => {
  setVfs(null); // 模块级状态，用例之间必须清掉
});

describe('golden/G14-2 level.dat 字节', () => {
  it('v1 路径（storageVersion=1）写出的字节与参考 C++ 一致', () => {
    const vfs = freshVfs();
    expect(ExternalFileLevelStorage.writeLevelData(DAT, sample(1), null)).toBe(true);

    const got = readAll(vfs, DAT);
    expect(got.length).toBe(fixture.v1.hex.length / 2);
    expect(got.length).toBe(fixture.v1.size + 8); // 文件头两个 int + 载荷

    // 文件头：int version + int size（都按小端）
    const dv = new DataView(got.buffer, got.byteOffset, got.byteLength);
    expect(dv.getInt32(0, true)).toBe(fixture.v1.version);
    expect(dv.getInt32(4, true)).toBe(fixture.v1.size);

    // 时间戳两边都清零后再比
    const mine = got.slice();
    mine.fill(0, fixture.v1.tsOffset, fixture.v1.tsOffset + fixture.v1.tsLen);
    expect(hex(mine)).toBe(fixture.v1.hex);
  });

  it('NBT 路径（storageVersion=3，也就是默认值）写出的字节与参考 C++ 一致', () => {
    const vfs = freshVfs();
    expect(ExternalFileLevelStorage.writeLevelData(DAT, sample(3), null)).toBe(true);

    const got = readAll(vfs, DAT);
    expect(got.length).toBe(fixture.nbt.hex.length / 2);

    const dv = new DataView(got.buffer, got.byteOffset, got.byteLength);
    expect(dv.getInt32(0, true)).toBe(fixture.nbt.version);
    expect(dv.getInt32(4, true)).toBe(fixture.nbt.size);

    // 夹具说时间戳在这几个字节上；先确认 TS 这边同一位置确实是"像时间戳的值"，
    // 再清零比对。位置要是错了，后面整段都会对不上。
    const at = new DataView(got.buffer, got.byteOffset + fixture.nbt.tsOffset, 8);
    const tsLo = at.getUint32(0, true);
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(tsLo - now), '时间戳位置上的值应该是个当前时间戳').toBeLessThan(86400);
    expect(at.getUint32(4, true), 'long 的高 4 字节应该是 0').toBe(0);

    const mine = got.slice();
    mine.fill(0, fixture.nbt.tsOffset, fixture.nbt.tsOffset + fixture.nbt.tsLen);
    expect(hex(mine)).toBe(fixture.nbt.hex);
  });

  it('readLevelData 把参考 C++ 写出的文件读回来，字段一致', () => {
    const vfs = freshVfs();
    // 直接把夹具的字节放进虚拟文件系统，读的完全是参考 C++ 的产物
    const f = vfs.open(DAT, 'wb')!;
    const raw = bytesOf(fixture.nbt.hex);
    f.write(raw, 1, raw.length);
    f.close();

    const back = new LevelData();
    expect(ExternalFileLevelStorage.readLevelData(DIR, back)).toBe(true);

    const r = fixture.readBack;
    expect(r.ok).toBe(1);
    expect(back.getSeed()).toBe(r.seed);
    expect(back.getXSpawn()).toBe(r.xSpawn);
    expect(back.getYSpawn()).toBe(r.ySpawn);
    expect(back.getZSpawn()).toBe(r.zSpawn);
    expect(back.getTime()).toBe(r.time);
    expect(back.getGameType()).toBe(r.gameType);
    expect(back.getLevelName()).toBe(r.levelName);
    expect(back.getSizeOnDisk()).toBe(r.sizeOnDisk);
    expect(back.getStorageVersion()).toBe(r.storageVersion);
    expect(back.getAllowCheats()).toBe(r.allowCheats === 1);
  });

  it('两个文件都打不开时返回 false（不抛）', () => {
    freshVfs();
    expect(ExternalFileLevelStorage.readLevelData('/nope', new LevelData())).toBe(false);
  });

  it('level.dat 打不开时回退读 level.dat_old', () => {
    const vfs = freshVfs();
    const f = vfs.open(DIR + '/level.dat_old', 'wb')!;
    const raw = bytesOf(fixture.nbt.hex);
    f.write(raw, 1, raw.length);
    f.close();

    const back = new LevelData();
    expect(ExternalFileLevelStorage.readLevelData(DIR, back)).toBe(true);
    expect(back.getLevelName()).toBe(fixture.readBack.levelName);
  });
});
