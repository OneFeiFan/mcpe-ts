/**
 * 审核性能：CFile.write 以前每次追加都整块重新分配再拷贝（O(n²)），进 demo 世界 48 秒里 92% 耗在这里。
 * 现在底层内存按两倍扩容、交给 VirtualFS 的是恰为文件长度的视图。这里钉住语义不变：
 * 内容与长度正确、越过末尾写入时空洞补 0、读回与 SEEK_END 看到的是文件长度、持久化只存文件长度的字节；并且大量小写入很快。
 */
import { describe, expect, it } from 'vitest';
import { SEEK_END, SEEK_SET, VirtualFS } from '@mcpe/platform';

describe('CFile 的写入扩容', () => {
  it('大量 4 字节追加：内容、长度正确，耗时为线性', () => {
    const vfs = new VirtualFS();
    const f = vfs.open('/a.bin', 'w')!;
    const n = 200_000;
    const four = new Uint8Array(4);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      new DataView(four.buffer).setInt32(0, i, true);
      f.write(four, 4, 1);
    }
    const ms = performance.now() - t0;
    f.close();
    const buf = vfs.getBuffer('/a.bin')!;
    expect(buf.length).toBe(n * 4);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (const i of [0, 1, 12345, n - 1]) expect(dv.getInt32(i * 4, true)).toBe(i);
    expect(ms).toBeLessThan(2000); // 以前是平方级：20 万次追加要几十秒
  });

  it('越过末尾写入：空洞补 0；SEEK_END 与读回都是文件长度', () => {
    const vfs = new VirtualFS();
    const f = vfs.open('/b.bin', 'w')!;
    f.write(new Uint8Array([1, 2, 3]), 1, 3);
    expect(f.seek(10, SEEK_SET)).toBe(0);
    f.write(new Uint8Array([9]), 1, 1);
    expect(f.seek(0, SEEK_END)).toBe(0);
    f.close();
    expect(Array.from(vfs.getBuffer('/b.bin')!)).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 9]);
  });

  it('持久化只存文件长度的字节（不把扩容出来的整块内存存进去）', async () => {
    const stored = new Map<string, Uint8Array>();
    const backend = {
      put: async (p: string, d: Uint8Array) => void stored.set(p, d),
      remove: async () => {},
      setDirs: async () => {},
      loadAll: async () => ({ files: new Map<string, Uint8Array>(), dirs: [] as string[] }),
    };
    const vfs = new VirtualFS();
    await vfs.load(backend as never);
    const f = vfs.open('/c.bin', 'w')!;
    for (let i = 0; i < 100; i++) f.write(new Uint8Array([i]), 1, 1);
    f.close();
    await vfs.flush();
    const d = stored.get('/c.bin')!;
    expect(d.length).toBe(100);
    expect(d.buffer.byteLength).toBe(100);
  });
});
