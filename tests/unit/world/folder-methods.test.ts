import { afterEach, describe, expect, it } from 'vitest';
import { VirtualFS, setVfs } from '@mcpe/platform';
import {
  createFolderIfNotExists,
  createTree,
  exists,
  getFileSize,
  getRemainingFileSize,
} from '@mcpe/world';

// FolderMethods 的对照物是 POSIX（mkdir/access/stat），浏览器里没有，全部走 VirtualFS。
// 这里逐个钉住移植后的语义，尤其是几个容易想当然的地方（见各条注释）。

function freshVfs(): VirtualFS {
  const vfs = new VirtualFS();
  setVfs(vfs);
  return vfs;
}

afterEach(() => {
  setVfs(null); // 模块级状态，用例之间必须清掉
});

describe('world/folder-methods', () => {
  describe('exists', () => {
    it('文件和目录都算存在（对应 access(name, 0) == 0）', () => {
      const vfs = freshVfs();
      vfs.mkdir('/w');
      const f = vfs.open('/w/a.dat', 'wb')!;
      f.write(new Uint8Array([1, 2, 3]), 1, 3);
      f.close();

      expect(exists('/w')).toBe(true);
      expect(exists('/w/a.dat')).toBe(true);
      expect(exists('/w/nope.dat')).toBe(false);
    });

    it('根目录永远存在', () => {
      freshVfs();
      expect(exists('/')).toBe(true);
    });
  });

  describe('createFolderIfNotExists', () => {
    it('不存在就建一级，返回 true', () => {
      freshVfs();
      expect(createFolderIfNotExists('/w')).toBe(true);
      expect(exists('/w')).toBe(true);
    });

    it('已存在直接返回 true，不报错', () => {
      freshVfs();
      expect(createFolderIfNotExists('/w')).toBe(true);
      expect(createFolderIfNotExists('/w')).toBe(true);
    });

    it('父目录不存在时失败 —— 它只建一级（照 C++ 的 mkdir 语义）', () => {
      freshVfs();
      expect(createFolderIfNotExists('/a/b')).toBe(false);
      expect(exists('/a/b')).toBe(false);
    });
  });

  describe('getRemainingFileSize', () => {
    it('从当前位置数到末尾，且**不改动**当前位置', () => {
      const vfs = freshVfs();
      vfs.mkdir('/w');
      const f = vfs.open('/w/a.dat', 'wb')!;
      f.write(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 1, 10);
      f.close();

      const r = vfs.open('/w/a.dat', 'rb')!;
      expect(getRemainingFileSize(r)).toBe(10); // 在开头：整份
      r.seek(4, 0); // SEEK_SET
      expect(getRemainingFileSize(r)).toBe(6);
      expect(r.tell()).toBe(4); // ← 关键：查完大小位置没动
      r.seek(0, 2); // SEEK_END
      expect(getRemainingFileSize(r)).toBe(0);
      r.close();
    });

    it('fp 为 null 时返回 0（对应 C++ 的 `if (!fp) return 0;`）', () => {
      freshVfs();
      expect(getRemainingFileSize(null)).toBe(0);
    });
  });

  describe('getFileSize', () => {
    it('返回文件字节数', () => {
      const vfs = freshVfs();
      vfs.mkdir('/w');
      const f = vfs.open('/w/a.dat', 'wb')!;
      f.write(new Uint8Array([1, 2, 3]), 1, 3);
      f.close();
      expect(getFileSize('/w/a.dat')).toBe(3);
    });

    it('打不开时返回 -1（不是 0 —— 0 是合法的空文件）', () => {
      freshVfs();
      expect(getFileSize('/nope.dat')).toBe(-1);
    });

    it('空文件返回 0', () => {
      const vfs = freshVfs();
      vfs.mkdir('/w');
      vfs.open('/w/empty.dat', 'wb')!.close();
      expect(getFileSize('/w/empty.dat')).toBe(0);
    });
  });

  describe('createTree', () => {
    it('从 base 起逐级拼路径建目录；tree 的每一项自带前导斜杠', () => {
      // 调用点写的就是 tree[] = { "/com.mojang", "/minecraftWorlds" }：
      // createTree 直接 p += tree[i]，所以前导斜杠是**调用方**给的
      const vfs = freshVfs();
      expect(createTree('/games', ['/com.mojang', '/minecraftWorlds'], 2)).toBe(true);

      expect(exists('/games')).toBe(true);
      expect(exists('/games/com.mojang')).toBe(true);
      expect(exists('/games/com.mojang/minecraftWorlds')).toBe(true);
      expect(vfs.isDirectory('/games/com.mojang/minecraftWorlds')).toBe(true);
    });

    it('base 就建不出来时直接失败，不去建下面的', () => {
      const vfs = freshVfs();
      // /a 不存在，所以 /a/b 建不出来
      expect(createTree('/a/b', ['/c'], 1)).toBe(false);
      expect(exists('/a/b/c')).toBe(false);
      expect(vfs.listDir('/')).toEqual([]);
    });

    it('treeLength 决定用前几项，多余的项不碰', () => {
      freshVfs();
      expect(createTree('/games', ['/p1', '/p2', '/p3'], 1)).toBe(true);
      expect(exists('/games/p1')).toBe(true);
      expect(exists('/games/p1/p2')).toBe(false);
    });

    it('长度给 0 时只建 base', () => {
      const vfs = freshVfs();
      expect(createTree('/games', [], 0)).toBe(true);
      expect(vfs.isDirectory('/games')).toBe(true);
    });
  });
});
