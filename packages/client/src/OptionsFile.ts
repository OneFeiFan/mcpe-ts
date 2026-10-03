/**
 * 1:1 移植自 src/client/OptionsFile.h 与 OptionsFile.cpp（B9a）：选项文件的读写。
 *
 * 文件就是一行一个 `键:值`（`Options::save` 攒出来的字符串），非常朴素。
 * 值是原样存的 —— 里面再有 `:` 也不管，读的时候只认**第一个** `:`（C++ 用的 `strchr`）。
 *
 * 【几处 C 的细节，照着抄】
 * - `fopen(path, "w")`：**每次 save 都整个重写**（不是追加）。
 * - 打不开而且没这个目录时，C++ 会**自己把父目录一级一级建出来**再开一次
 *   （`OptionsFile.cpp:18-35`）。网页版没有 errno，`vfs.open(path,'w') === null`
 *   就等价于 C 的 ENOENT（写模式下只有"父目录不存在"会让它失败）。
 * - 读的那侧靠 `fgets` 配合 `strlen`/`strchr`，规则不少，逐条写在 `getOptionStrings` 上面。
 */
import { LOGI, SEEK_END, SEEK_SET, getVfs } from '@mcpe/platform';

/**
 * C++ 的 `typedef std::vector<std::string> StringVector`。
 * 这里用 `string[]` 直接对应 —— 它只是个别名。
 */

/** 缓存的编解码器：C++ 是按字节写的，JS 字符串要先转成 UTF-8 字节 */
let _encoder: TextEncoder | undefined;
let _decoder: TextDecoder | undefined;

export class OptionsFile {
  private settingsPath: string;

  constructor() {
    this.settingsPath = 'options.txt';
  }

  /** C++ 的 `void OptionsFile::setOptionsPath(const std::string& path)` */
  setOptionsPath(path: string): void {
    this.settingsPath = path;
  }

  /** C++ 的 `std::string OptionsFile::getOptionsPath() const` */
  getOptionsPath(): string {
    return this.settingsPath;
  }

  /**
   * C++ 的 `void OptionsFile::save(const StringVector& settings)`。
   *
   * 每一行都是 `fprintf(pFile, "%s\n", s.c_str())` —— 逐行写、每行补一个 `\n`。
   * 文件末尾**也会有换行**（最后一行也补），所以是个"每行都以 \n 结尾"的文本。
   */
  save(settings: readonly string[]): void {
    const vfs = getVfs();
    let pFile = vfs.open(this.settingsPath, 'w');
    if (pFile === null) {
      // C++：`if (!pFile && errno == ENOENT)` → 把父目录逐级建出来再试一次
      const dir = this.settingsPath;
      const fpos = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'));
      if (fpos !== -1) {
        const parent = dir.slice(0, fpos);
        let toCreate = '';
        for (let i = 0; i <= parent.length; ++i) {
          if (i === parent.length || parent[i] === '/' || parent[i] === '\\') {
            // C++ 用的是 mkdir 的返回值被忽略：已经存在的目录会 EEXIST，无所谓
            if (toCreate !== '') vfs.mkdir(toCreate);
          }
          if (i < parent.length) toCreate += parent[i]!;
        }
      }
      pFile = vfs.open(this.settingsPath, 'w');
    }
    if (pFile === null) {
      // C++：LOGI("OptionsFile::save failed: %s", strerror(errno)) —— 网页版没有 errno，只报路径
      LOGI(`OptionsFile::save failed: ${this.settingsPath}`);
      return;
    }
    const encoder = (_encoder ??= new TextEncoder());
    for (const s of settings) {
      // `%s` 遇到字符串里的 '\0' 就停（c_str() 的终止符），这里照做
      const nul = s.indexOf('\0');
      const line = nul === -1 ? s : s.slice(0, nul);
      const bytes = encoder.encode(line + '\n');
      pFile.write(bytes, 1, bytes.length);
    }
    pFile.close();
  }

  /**
   * C++ 的 `StringVector OptionsFile::getOptionStrings()`。
   *
   * 文件不存在时**安静地返回空表**（C++ 只在 errno != ENOENT 时才打日志）。
   *
   * 【读的规则逐条抄自 C++】循环体是
   * ```
   *   char lineBuff[128];
   *   while (fgets(lineBuff, sizeof lineBuff, pFile)) { ... }
   * ```
   * 1. `fgets` **最多读 127 字节**（`sizeof lineBuff - 1`），读满或碰到 `\n` 就停。
   *    所以**超长的行会被切成好几段**，后面那些段自己当成一行参与下面的判断。
   * 2. `strlen` 取到第一个 `\0` 为止 —— 上一轮遗留的内容不会影响（fgets 会补 `\0`），
   *    但**行内如果本来就有 `\0`**，长度就截止在那儿。这里按字节做，才和 C 一致。
   * 3. 尾部连续的 `\n` / `\r` 全部剥掉（`while`，所以 `\r\n` 两个都去）。**只剥尾部**。
   * 4. 剥完之后**短于 3 个字节的整行丢掉**（`if (len < 3) continue;`）。
   * 5. 找**第一个** `:`（`strchr`）。没有就跳过；有就切成长度各半的两项依次入表。
   *
   * 【一处实现上的等价改写】C++ 是反复调用 `fgets`（每次最多 127 字节）流式读的；
   * 这里先把整个文件一次读进内存，再照上面那几条规则切。**切法逐条相同**，只是不分次读盘 ——
   * `CFile.read` 没有"读到换行为止"的语义（那是 `fgets` 的），逐字节调用既慢又没更忠实。
   */
  getOptionStrings(): string[] {
    const vfs = getVfs();
    const returnVector: string[] = [];
    const pFile = vfs.open(this.settingsPath, 'r');
    if (pFile === null) {
      // C++：`if (errno != ENOENT) LOGI(...)` —— 文件不存在是正常情况（第一次启动），不打日志
      return returnVector;
    }
    pFile.seek(0, SEEK_END);
    const size = pFile.tell();
    pFile.seek(0, SEEK_SET);
    const data = new Uint8Array(size);
    if (size > 0) pFile.read(data, 1, size);
    pFile.close();

    const decoder = (_decoder ??= new TextDecoder());
    let pos = 0;
    for (;;) {
      // ---- fgets(lineBuff, 128, pFile) ----
      if (pos >= data.length) break; // 文件读完了，fgets 返回 NULL
      const start = pos;
      let end = start;
      const limit = start + 127; // 最多 127 个字节
      while (end < data.length && end < limit) {
        const c = data[end]!;
        end++;
        if (c === 0x0a) break; // 读到 '\n' 就停
      }
      pos = end;

      // ---- strlen(lineBuff)：第一个 '\0' 之前 ----
      let len = end - start;
      for (let i = start; i < end; ++i) {
        if (data[i] === 0) {
          len = i - start;
          break;
        }
      }

      // ---- 剥掉尾部的 '\n' / '\r' ----
      while (len > 0 && (data[start + len - 1] === 0x0a || data[start + len - 1] === 0x0d)) {
        len--;
      }
      if (len < 3) continue;

      // ---- strchr(lineBuff, ':') ----
      let colon = -1;
      for (let i = 0; i < len; ++i) {
        if (data[start + i] === 0x3a) {
          colon = i;
          break;
        }
      }
      if (colon === -1) continue;
      returnVector.push(decoder.decode(data.subarray(start, start + colon)));
      returnVector.push(decoder.decode(data.subarray(start + colon + 1, start + len)));
    }
    return returnVector;
  }
}
