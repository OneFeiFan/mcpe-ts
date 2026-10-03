import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SEEK_END, SEEK_SET, VirtualFS, setVfs } from '@mcpe/platform';
import { BitStream } from '@mcpe/util';
import { RegionFile } from '@mcpe/world';

// G14-1：RegionFile 写出的 chunks.dat 逐字节比对。
// 夹具由 tools/golden/harness_regionfile.cpp 用参考 C++ 的 RegionFile 生成，禁止手改。
interface Fixture {
  fileSize: number;
  hex: string;
  reads: { x: number; z: number; ok: number; hex: string }[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/regionfile.json', import.meta.url), 'utf8'),
) as Fixture;

const hex = (u: Uint8Array): string => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

/** 与 harness_regionfile.cpp 的 makeChunk 逐字对应：`(i * seed + seed * 7 + 11) & 0xff` */
function makeChunk(len: number, seed: number): Uint8Array {
  const v = new Uint8Array(len);
  for (let i = 0; i < len; i++) v[i] = (i * seed + seed * 7 + 11) & 0xff;
  return v;
}

const TMP_LEVEL = '/w';

/**
 * 按 harness 里那个固定序列写一遍，返回 chunks.dat 的字节。
 * 场景覆盖：新建文件 + 追加扇区、等长原地覆写、变长后重新分配扇区、复用被释放的扇区。
 * （最后一步是我原先手算漏掉的：写第 6 个区块时复用了第 5 步刚释放的扇区，文件不会再变长。）
 */
function writeLikeHarness(): Uint8Array {
  const vfs = new VirtualFS();
  setVfs(vfs);
  vfs.mkdir(TMP_LEVEL);

  const rf = new RegionFile(TMP_LEVEL);
  expect(rf.open()).toBe(true);

  const mk = (len: number, seed: number): BitStream => {
    const d = makeChunk(len, seed);
    return new BitStream(d, d.length, false);
  };
  rf.writeChunk(0, 0, mk(100, 3)); // 第一个区块：占 1 个扇区，文件被加长
  rf.writeChunk(1, 0, mk(200, 5)); // 第二个区块
  rf.writeChunk(0, 0, mk(100, 7)); // 等长覆写：原地改写，扇区数不变
  rf.writeChunk(0, 0, mk(10000, 11)); // 变长：要 3 个扇区，重新分配
  rf.writeChunk(5, 7, mk(50, 13)); // 换个位置，复用刚释放的扇区
  rf.close(); // TS 没有析构函数，必须显式关

  // 把 chunks.dat 整个读出来：先 seek 到末尾取长度，再读（对应 C++ FolderMethods::getFileSize 的做法）
  const f = vfs.open(TMP_LEVEL + '/chunks.dat', 'rb')!;
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

describe('golden/G14-1 RegionFile 文件字节', () => {
  it('chunks.dat 的字节与参考 C++ 写出的完全一致', () => {
    const bytes = writeLikeHarness();
    expect(bytes.length).toBe(fixture.fileSize);
    expect(hex(bytes)).toBe(fixture.hex);
  });

  it('读回来的内容与参考 C++ 一致（含读不到的坐标返回 null）', () => {
    writeLikeHarness(); // 先把文件写好

    const rf = new RegionFile(TMP_LEVEL);
    expect(rf.open()).toBe(true);
    try {
      for (const r of fixture.reads) {
        const got = rf.readChunk(r.x, r.z);
        if (r.ok === 0) {
          expect(got, `readChunk(${r.x},${r.z}) 应该读不到`).toBeNull();
        } else {
          expect(got, `readChunk(${r.x},${r.z}) 应该读得到`).not.toBeNull();
          expect(hex(got!.getData()), `readChunk(${r.x},${r.z}) 的内容`).toBe(r.hex);
        }
      }
    } finally {
      rf.close();
    }
  });

  it('重新 open 之后索引仍然认得原来的区块（走的是从文件头重建 sectorFree 的路径）', () => {
    writeLikeHarness();

    // 第二个实例：open() 里的 "r+b" 分支会 fread 文件头、重建 sectorFree
    const rf = new RegionFile(TMP_LEVEL);
    rf.open();
    try {
      const ok = rf.readChunk(1, 0);
      expect(ok).not.toBeNull();
      expect(ok!.getNumberOfBytesUsed()).toBe(200);
      expect(hex(ok!.getData())).toBe(hex(makeChunk(200, 5)));
    } finally {
      rf.close();
    }
  });
});
