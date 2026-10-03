import { beforeEach, describe, expect, it } from 'vitest';
import { OptionsFile } from '@mcpe/client';
import { VirtualFS, setVfs } from '@mcpe/platform';

// OptionsFile（B9a）：选项文件的读写。
//
// ⚠ 这里只钉**规则明确**的那几条。`fgets` 的 127 字节切行之类靠读 C 推出来的行为，
// 留给 B9b 的黄金样本（那边是参考 C++ 真跑出来的结果），别在这里把"我以为"写成断言。

let vfs: VirtualFS;

/** 直接读文件原始字节，用来验证 save 写出来的到底是几个字节 —— 不经过 getOptionStrings */
function rawBytes(path: string): number[] {
  const f = vfs.open(path, 'rb');
  if (f === null) return [];
  f.seek(0, 2); // SEEK_END
  const n = f.tell();
  f.seek(0, 0);
  const buf = new Uint8Array(n);
  if (n > 0) f.read(buf, 1, n);
  f.close();
  return [...buf];
}

function writeRaw(path: string, text: string): void {
  const f = vfs.open(path, 'w')!;
  const bytes = new TextEncoder().encode(text);
  f.write(bytes, 1, bytes.length);
  f.close();
}

beforeEach(() => {
  vfs = new VirtualFS();
  setVfs(vfs);
});

describe('client/OptionsFile', () => {
  it('默认路径是 options.txt，setOptionsPath 能改', () => {
    const of = new OptionsFile();
    expect(of.getOptionsPath()).toBe('options.txt');
    of.setOptionsPath('/games/com.mojang/options.txt');
    expect(of.getOptionsPath()).toBe('/games/com.mojang/options.txt');
  });

  describe('save', () => {
    it('一行一条，每行末尾一个 \\n（**最后一行也有**）', () => {
      const of = new OptionsFile();
      of.setOptionsPath('/options.txt');
      of.save(['options.a:1', 'options.b:hello']);
      expect(rawBytes('/options.txt')).toEqual([
        ...new TextEncoder().encode('options.a:1\noptions.b:hello\n'),
      ]);
    });

    it('是「整个重写」而不是追加：第二次 save 只剩第二次的内容', () => {
      const of = new OptionsFile();
      of.setOptionsPath('/options.txt');
      of.save(['options.a:1', 'options.b:2']);
      of.save(['options.c:3']);
      expect(of.getOptionStrings()).toEqual(['options.c', '3']);
    });

    it('空表也能存，存出来是个空文件', () => {
      const of = new OptionsFile();
      of.setOptionsPath('/options.txt');
      of.save([]);
      expect(rawBytes('/options.txt')).toEqual([]);
      expect(of.getOptionStrings()).toEqual([]);
    });

    it('父目录不存在时自己一级一级建出来（照 C++ 那段 mkdir 循环）', () => {
      const of = new OptionsFile();
      of.setOptionsPath('/a/b/c/options.txt');
      expect(vfs.exists('/a')).toBe(false);
      of.save(['options.a:1']);
      expect(vfs.exists('/a/b/c/options.txt')).toBe(true);
      expect(of.getOptionStrings()).toEqual(['options.a', '1']);
    });

    it('非 ASCII 按 UTF-8 写（和 C++ 的 %s 落字节一样）', () => {
      const of = new OptionsFile();
      of.setOptionsPath('/options.txt');
      of.save(['options.username:张三']);
      expect(rawBytes('/options.txt')).toEqual([
        ...new TextEncoder().encode('options.username:张三\n'),
      ]);
      expect(of.getOptionStrings()).toEqual(['options.username', '张三']);
    });
  });

  describe('getOptionStrings', () => {
    const read = (text: string): string[] => {
      writeRaw('/options.txt', text);
      const of = new OptionsFile();
      of.setOptionsPath('/options.txt');
      return of.getOptionStrings();
    };

    it('文件不存在时安静地返回空表（第一次启动就是这种情况）', () => {
      const of = new OptionsFile();
      of.setOptionsPath('/options.txt');
      expect(() => of.getOptionStrings()).not.toThrow();
      expect(of.getOptionStrings()).toEqual([]);
    });

    it('正常的 键:值 一行两项依次入表', () => {
      expect(read('options.a:1\noptions.b:2\n')).toEqual(['options.a', '1', 'options.b', '2']);
    });

    it('剥掉行尾的 \\n 和 \\r（两种都剥，所以 CRLF 文件也读得对）', () => {
      expect(read('options.a:1\r\noptions.b:2\r\n')).toEqual(['options.a', '1', 'options.b', '2']);
      expect(read('options.a:1\r')).toEqual(['options.a', '1']);
    });

    it('剥完短于 3 个字节的整行丢掉（这条在冒号判断之前）', () => {
      // 'a:' 剥完剩 2 字节 → 丢；'ab' 没冒号也丢；只有第三行留下
      expect(read('a:\nab\noptions.a:1\n')).toEqual(['options.a', '1']);
    });

    it('没有冒号的行直接跳过', () => {
      expect(read('options.a\noptions.b:2\n')).toEqual(['options.b', '2']);
    });

    it('只认第一个冒号：值里再有冒号也算值的一部分', () => {
      expect(read('options.ip:1.2.3.4:8080\n')).toEqual(['options.ip', '1.2.3.4:8080']);
    });

    it('值可以是空的（冒号后面什么都没有）', () => {
      expect(read('options.a:\n')).toEqual(['options.a', '']);
    });

    it('不裁空白：键和值都是原样切的', () => {
      expect(read('   options.a : 1  \n')).toEqual(['   options.a ', ' 1  ']);
    });

    it('最后一行没有换行符也照样读出来（fgets 读到 EOF 会连内容一起返回）', () => {
      expect(read('options.a:1\noptions.b:2')).toEqual(['options.a', '1', 'options.b', '2']);
    });
  });
});
