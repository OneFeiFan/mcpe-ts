/**
 * 1:1 移植自 src/world/level/storage/FolderMethods.h/.cpp。
 *
 * 【ADAPTED(Web)】C++ 这一层是 POSIX 的薄封装（mkdir / access / errno / fopen / ftell），
 * 浏览器里没有这些，全部改走 VirtualFS。三个裸原语按 OMIT(Web) 处理（见下方注释）——
 * 它们没有对应物，调用方直接调 VirtualFS 的等价方法即可。
 *
 * 【getRemainingFileSize 的来历】B4c 移植 readLevelData 时先把它临时放进了
 * ExternalFileLevelStorage，注释里写着"B6 时再挪过去"。B5a 又要用到同文件里别的函数，
 * 就一并挪回它本来的位置了。
 */
import { LOGI, SEEK_END, SEEK_SET, getVfs, type CFile } from '@mcpe/platform';

// OMIT(Web): int _mkdir(const char* name)  FolderMethods.cpp:2
//   POSIX mkdir(2) 的包装。VirtualFS.mkdir 承担同样职责（单级、父目录不存在则失败）。
// OMIT(Web): int _access(const char* name, int mode)  FolderMethods.cpp:5
//   POSIX access(2)。存档代码只用到 mode == 0（查存在性），VirtualFS.exists 等价；
//   其余 mode 没有对应物，真用到时再说。
// OMIT(Web): int _errno()  FolderMethods.cpp:8
//   POSIX errno。VirtualFS 用返回值表示成败、没有错误码可取，所以下面
//   createFolderIfNotExists 的日志打不出具体错误码。

/** 对应 `bool exists(const char* name)`：`_access(name, 0) == 0`，只问存在性（文件或目录都算） */
export function exists(name: string): boolean {
  return getVfs().exists(name);
}

/** 对应 `bool createFolderIfNotExists(const char* name)`：已存在就返回 true，否则建一级 */
export function createFolderIfNotExists(name: string): boolean {
  if (exists(name)) return true;
  if (!getVfs().mkdir(name)) {
    // C++ 这里还打了 _errno()，VirtualFS 没有错误码可取（见上方 OMIT）
    LOGI(`FAILED to create folder ${name}! Escape plan?\n`);
    return false;
  }
  LOGI(`Created folder ${name}\n`);
  return true;
}

/**
 * 对应 `int getRemainingFileSize(FILE* fp)`：从当前位置到文件末尾还有多少字节，
 * 且**不改动当前位置**。C++ 是 ftell → seek(END) → ftell → seek 回去（SEEK_SET，不是 SEEK_CUR）。
 */
export function getRemainingFileSize(fp: CFile | null): number {
  if (!fp) return 0;
  const current = fp.tell();
  fp.seek(0, SEEK_END);
  const end = fp.tell();
  fp.seek(current, SEEK_SET);
  return end - current;
}

/**
 * 对应 `int getFileSize(const char* filename)`：文件字节数；打不开返回 -1。
 *
 * 【原样保留】与 getRemainingFileSize 不同，这里**不恢复**读指针 —— C++ 反正马上就 fclose
 * 了。所以别把它当成"顺手查个大小"来用。
 */
export function getFileSize(filename: string): number {
  const fp = getVfs().open(filename, 'rb');
  if (!fp) return -1;
  fp.seek(0, SEEK_END);
  const size = fp.tell();
  fp.close();
  return size;
}

/**
 * 对应 `bool createTree(const char* base, const char* tree[], int treeLength)`：
 * 从 base 起逐级拼上 tree 的每一项并建目录。tree 的每一项**自带前导 `/`、不带尾随 `/`**
 * （调用点 ExternalFileLevelStorageSource.cpp:25-33 就是这么写的：`"/com.mojang"`、
 * `"/minecraftWorlds"`），所以 `p += tree[i]` 拼出来才是合法路径。
 *
 * 【C++ 里那个自增是废的】原文写的是
 *     for (int i = 0; i < treeLength; ++i && tree[i])
 * —— 条件只有 `i < treeLength`，而自增表达式 `++i && tree[i]` 的**值会被丢弃**（for 的自增
 * 就是拿值当语句用）。所以 `tree[i]` 那半截：① 拦不住空指针，② 不影响循环次数，
 * ③ 反而在最后一轮多读一次 `tree[treeLength]`（越界读，UB）。这里只复刻**有效行为**
 * （走 0..treeLength-1，逐级拼路径、逐级建目录），越界那次读不复刻 —— PITFALLS 第 20 条：
 * UB 不复刻。
 */
export function createTree(base: string, tree: string[], treeLength: number): boolean {
  if (!createFolderIfNotExists(base)) return false;
  let p = base;
  for (let i = 0; i < treeLength; i++) {
    p += tree[i]!;
    if (!createFolderIfNotExists(p)) return false;
  }
  return true;
}
