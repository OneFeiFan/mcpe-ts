// fake-indexeddb 必须在任何用到 indexedDB 的模块之前加载：它在全局补出 indexedDB / IDBKeyRange
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualFS } from '@mcpe/platform';
import { IndexedDbBackend } from '../../../apps/web/src/IndexedDbBackend';

// 与 IndexedDbBackend 里的常量保持一致
const DB_NAME = 'mcpe-ts';

const opened: IndexedDbBackend[] = [];

function openBackend(): IndexedDbBackend {
  const b = new IndexedDbBackend();
  opened.push(b);
  return b;
}

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    // 库不存在、或有连接没关时也会走 onerror/onblocked，这里只求清干净、不关心原因
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await deleteDb();
});

afterEach(async () => {
  // 必须先关连接：开着连接去 deleteDatabase 会被 blocked
  for (const b of opened) b.close();
  opened.length = 0;
  await deleteDb();
});

/** 模拟"刷新页面"：丢开当前 VirtualFS，从同一个库里重新 load 一个 */
async function reload(): Promise<VirtualFS> {
  const vfs = new VirtualFS();
  await vfs.load(openBackend());
  return vfs;
}

describe('web/indexeddb-backend', () => {
  it('写进去 → flush → 重新 load，字节一致（这就是"刷新后世界还在"的地基）', async () => {
    const vfs1 = await reload();
    vfs1.mkdir('/games');
    vfs1.mkdir('/games/w1');
    const f = vfs1.open('/games/w1/level.dat', 'wb')!;
    f.write(new Uint8Array([1, 2, 3, 4, 250]), 1, 5);
    f.close();
    await vfs1.flush();

    const vfs2 = await reload();
    expect(vfs2.exists('/games/w1/level.dat')).toBe(true);
    const r = vfs2.open('/games/w1/level.dat', 'rb')!;
    const buf = new Uint8Array(5);
    expect(r.read(buf, 1, 5)).toBe(5);
    expect([...buf]).toEqual([1, 2, 3, 4, 250]);
    r.close();
  });

  it('大一点的数据也走得通（走的是游标逐条读的路径）', async () => {
    const size = 8192;
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) data[i] = i & 0xff;

    const vfs1 = await reload();
    vfs1.mkdir('/w');
    const f = vfs1.open('/w/big.dat', 'wb')!;
    f.write(data, 1, size);
    f.close();
    await vfs1.flush();

    const vfs2 = await reload();
    const r = vfs2.open('/w/big.dat', 'rb')!;
    const buf = new Uint8Array(size);
    expect(r.read(buf, 1, size)).toBe(size);
    expect([...buf]).toEqual([...data]);
    r.close();
  });

  it('删掉的文件在 flush 后从库里真的没了（不然刷新会"复活"）', async () => {
    const vfs1 = await reload();
    vfs1.mkdir('/w');
    const f = vfs1.open('/w/a.dat', 'wb')!;
    f.write(new Uint8Array([7]), 1, 1);
    f.close();
    await vfs1.flush();

    expect(vfs1.remove('/w/a.dat')).toBe(true);
    await vfs1.flush();

    const vfs2 = await reload();
    expect(vfs2.exists('/w/a.dat')).toBe(false);
  });

  it('重命名之后：新路径读得到，旧路径不会残留', async () => {
    const vfs1 = await reload();
    vfs1.mkdir('/games');
    vfs1.mkdir('/games/w1');
    const f = vfs1.open('/games/w1/level.dat', 'wb')!;
    f.write(new Uint8Array([9, 8]), 1, 2);
    f.close();
    await vfs1.flush();

    expect(vfs1.rename('/games/w1', '/games/w2')).toBe(true);
    await vfs1.flush();

    const vfs2 = await reload();
    expect(vfs2.exists('/games/w1/level.dat')).toBe(false); // 旧 key 必须清掉
    const r = vfs2.open('/games/w2/level.dat', 'rb')!;
    const buf = new Uint8Array(2);
    expect(r.read(buf, 1, 2)).toBe(2);
    expect([...buf]).toEqual([9, 8]);
    r.close();
  });

  it('空目录活过"刷新"—— 目录是单独一个键存的，不靠文件路径反推', async () => {
    const vfs1 = await reload();
    vfs1.mkdir('/games');
    vfs1.mkdir('/games/w1');
    vfs1.mkdir('/games/w1/players'); // 从没往里写过文件
    await vfs1.flush();

    const vfs2 = await reload();
    expect(vfs2.exists('/games/w1/players')).toBe(true);
    expect(vfs2.isDirectory('/games/w1/players')).toBe(true);
    expect(vfs2.listDir('/games/w1')).toEqual(['players']);
  });

  it('没有改动时 flush 是空操作，不会把同一份数据反复写库', async () => {
    const vfs = await reload();
    vfs.mkdir('/w');
    const f = vfs.open('/w/a.dat', 'wb')!;
    f.write(new Uint8Array([1]), 1, 1);
    f.close();
    await vfs.flush();

    // 再 flush 两次；如果实现把脏集合留着了，这里也不会报错，所以顺便断言内容没变
    await vfs.flush();
    await vfs.flush();

    const vfs2 = await reload();
    const r = vfs2.open('/w/a.dat', 'rb')!;
    const buf = new Uint8Array(1);
    expect(r.read(buf, 1, 1)).toBe(1);
    expect([...buf]).toEqual([1]);
    r.close();
  });

  it('同一个后端实例反复用：库里的旧内容不会盖住内存里已经删掉的目录', async () => {
    // setDirs 是整体替换而不是追加，这条钉住它
    const vfs1 = await reload();
    vfs1.mkdir('/a');
    vfs1.mkdir('/a/b');
    await vfs1.flush();

    const vfs2 = await reload();
    expect(vfs2.remove('/a/b')).toBe(true);
    await vfs2.flush();

    const vfs3 = await reload();
    expect(vfs3.exists('/a/b')).toBe(false);
    expect(vfs3.exists('/a')).toBe(true);
  });
});
