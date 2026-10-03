import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SharedConstants } from '@mcpe/core';
import { SEEK_END, SEEK_SET, VirtualFS, setVfs } from '@mcpe/platform';
import { ExternalFileLevelStorage, GameType, LevelData } from '@mcpe/world';

// G14-4：saveLevelData 的"写临时文件 → 挪旧的 → 改名"流程，逐文件比对结果。
// 夹具由 tools/golden/harness_saveleveldata.cpp 用参考 C++ 跑出来，禁止手改。
//
// 这个函数的可观测结果全在文件系统上，所以夹具记的是每次调用之后**目录里有哪些文件、
// 各自什么字节**。两次保存的清单不一样（第一次还没有 level.dat，第二份会留下 level.dat_old），
// 这正是要钉住的。
interface FixtureFile {
  name: string;
  tsOffset: number;
  hex: string;
}
interface Case {
  name: string;
  dirExisted: number;
  inputStorageVersion: number;
  afterStorageVersion: number;
  files: FixtureFile[];
}
interface Fixture {
  storageVersion: number;
  cases: Case[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/saveleveldata.json', import.meta.url), 'utf8'),
) as Fixture;

const hex = (u: Uint8Array): string => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

const DIR = '/w';

/** 与 harness_saveleveldata.cpp 的 fill() 逐字段对应 */
function fill(saveNo: number): LevelData {
  const ld = new LevelData();
  ld.setSeed(123456789);
  ld.setSpawn(11, 22, 33);
  ld.setTime(1000000 + saveNo * 111111);
  ld.setGameType(GameType.Creative);
  ld.setLevelName('GoldenWorld');
  ld.setSizeOnDisk(4096);
  ld.setAllowCheats(true);
  ld.setStorageVersion(1); // 故意设个"错"的：saveLevelData 会把它改成 SharedConstants.StorageVersion
  return ld;
}

function freshVfs(): VirtualFS {
  const vfs = new VirtualFS();
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

/** 断言目录里留下的文件清单与字节，与夹具的某个 case 一致 */
function expectDir(vfs: VirtualFS, dir: string, c: Case): void {
  const names = vfs.exists(dir) ? vfs.listDir(dir) : [];
  expect(names, `${c.name} 的文件清单`).toEqual(c.files.map((f) => f.name));

  for (const f of c.files) {
    const got = readAll(vfs, dir + '/' + f.name);
    // 时间戳是实时时钟，两边都清零再比
    const mine = got.slice();
    if (f.tsOffset >= 0) mine.fill(0, f.tsOffset, f.tsOffset + 8);
    expect(hex(mine), `${c.name}/${f.name} 的字节`).toBe(f.hex);
  }
}

describe('golden/G14-4 saveLevelData 的文件系统结果', () => {
  it('夹具记的 storageVersion 与 TS 的常量一致', () => {
    expect(SharedConstants.StorageVersion).toBe(fixture.storageVersion);
  });

  it('空目录存一次 → 只有 level.dat；再存一次 → 多出 level.dat_old（里面是上一份）', () => {
    // 【为什么两个 case 要写在同一个用例里】夹具里的 first-save / second-save 不是两个独立场景，
    // 而是**在同一个目录上连着跑两次**的结果 —— 第二次的行为（把已有的 level.dat 挪成
    // level.dat_old）本来就依赖于第一次留下的文件。分开跑就复现不出来（第一版就栽在这上面：
    // 每个 case 都从空 VFS 开始，于是第二次也走"目录是空的"那条路，清单里当然没有 _old）。
    const vfs = freshVfs();
    vfs.mkdir(DIR);
    const [c1, c2] = fixture.cases as [Case, Case];

    const ld1 = fill(1);
    expect(ld1.getStorageVersion()).toBe(c1.inputStorageVersion); // 传进去的确实是那个"错"的版本
    ExternalFileLevelStorage.saveLevelDataTo(DIR, ld1, null);
    expect(ld1.getStorageVersion()).toBe(c1.afterStorageVersion);
    expectDir(vfs, DIR, c1);

    const ld2 = fill(2);
    ExternalFileLevelStorage.saveLevelDataTo(DIR, ld2, null);
    expect(ld2.getStorageVersion()).toBe(c2.afterStorageVersion);
    expectDir(vfs, DIR, c2);
  });

  it('目录不存在时 writeLevelData 就失败，整段直接返回、什么都不留下', () => {
    const vfs = freshVfs();
    const c = fixture.cases[2] as Case;
    const ld = fill(3);

    ExternalFileLevelStorage.saveLevelDataTo('/nope/w', ld, null);

    // 版本是在试着写**之前**改的，所以失败路径上它也是 3
    expect(ld.getStorageVersion()).toBe(c.afterStorageVersion);
    expect(vfs.exists('/nope/w')).toBe(false); // 没有凭空建出目录
    expectDir(vfs, '/nope/w', c); // 也不该有任何文件
  });
});
