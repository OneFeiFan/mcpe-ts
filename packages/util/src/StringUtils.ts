/**
 * 1:1 移植自 src/util/StringUtils.h 与 StringUtils.cpp（C++ namespace Util 的字符串部分）。
 * 对外统一经 Util 对象调用（见 Util.ts）：Util.startsWith(s, p)、Util.hashCode(s)、Util.stringTrim(s) …
 *
 * 按手册的三档规则：
 *  - 精确：hashCode 与 stringTrim。文字种子先 stringTrim 再 hashCode（SimpleChooseLevelScreen、TouchSelectWorldScreen），
 *    存档目录名也经过 stringTrim；换成 JS 的 trim() 或 UTF-16 的 hash 会让同一个种子生成不同的世界。
 *  - 保留原算法：stringReplace 每次从头重新查找，removeAll（string 版）基于它。JS 的 replaceAll 只扫一遍，结果不同。
 *  - 直接用 JS：startsWith（与 s.startsWith 完全等价）。
 *
 * 与 C++ 的差异（ADAPTED）：
 *  - C++ 里原地修改 std::string& 的函数（stringReplace、string 版 removeAll），TS 里返回新字符串：
 *      C++  Util::stringReplace(s, "a", "b");      TS  s = Util.stringReplace(s, "a", "b");
 *  - startsWith、stringReplace、stringTrim 按 UTF-16 码元处理（C++ 按字节），ASCII 范围内完全一致。
 *  - hashCode 例外：世界的文字种子（SimpleChooseLevelScreen、TouchSelectWorldScreen）用它算，
 *    所以按 UTF-8 字节计算，并且把字节当 signed char（x86 与 wasm 的语义；ARM 上 char 是 unsigned，结果会不同）。
 *
 *  - ADAPTED(Safety)：C++ 的 stringReplace 在 src 为空、或 dst 里包含 src 且 maxCount 为 -1 时会死循环。
 *    这里 src 为空时原样返回；dst 包含 src 时改为从左到右只替换一遍。其余情况保持“每次从头查找”。
 *
 * 保留的 C++ 行为：stringTrim(s, chars, …) 在 chars 为空、或 left 与 right 都为 false 时返回空串（不是原串）。
 */

/** @return true if <s> starts with <start>, false if not */
export function startsWith(s: string, start: string): boolean {
  return s.startsWith(start);
}

/**
 * Naive (e.g. slow and stupid) implementation.（C++ 原注释）
 * @return 替换后的字符串（C++ 返回对 s 的引用）
 */
export function stringReplace(s: string, src: string, dst: string, maxCount = -1): string {
  // ADAPTED(Safety)：这两种情况 C++ 会死循环
  if (src.length === 0) return s;
  if (maxCount < 0 && dst.includes(src)) return s.split(src).join(dst);
  const srcLength = src.length;
  while (maxCount-- !== 0) {
    const pos = s.indexOf(src);
    if (pos < 0) break;
    s = s.slice(0, pos) + dst + s.slice(pos + srcLength);
  }
  return s;
}

/** @return A string trimmed from white space characters on both ends */
export function stringTrim(s: string): string;
/** @return A string trimmed from given characters on any end */
export function stringTrim(s: string, chars: string, left?: boolean, right?: boolean): string;
export function stringTrim(s: string, chars = ' \t\n\r', left = true, right = true): string {
  const len = s.length;
  const lenChars = chars.length;
  if (len === 0 || lenChars === 0 || (left || right) === false) return '';
  let i = 0;
  let j = len - 1;
  if (left) {
    for (; i < len; ++i) if (chars.indexOf(s[i]!) < 0) break;
  }
  if (right) {
    for (; j >= i; --j) if (chars.indexOf(s[j]!) < 0) break;
  }
  return s.substring(i, j + 1); // s.substr(i, j - i + 1)
}

/** string 版 removeAll：依次把 rep[0..repCount) 全部删掉。经 Util.removeAll(s, rep, repCount) 调用 */
export function removeAllString(s: string, rep: readonly string[], repCount: number): string {
  for (let i = 0; i < repCount; ++i) s = stringReplace(s, rep[i]!, '');
  return s;
}

let _encoder: TextEncoder | undefined;

/** @return The "Java" implementation for string hash codes（按 UTF-8 字节、signed char） */
export function hashCode(s: string): number {
  // 纯 ASCII 快路径：字节就是码元，不用分配
  const len = s.length;
  let hash = 0;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x80) return hashCodeUtf8(s);
    hash = ((hash << 5) - hash + c) | 0; // hash = ((hash << 5) - hash) + s[i];
  }
  return hash;
}

function hashCodeUtf8(s: string): number {
  const bytes = (_encoder ??= new TextEncoder()).encode(s);
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) hash = ((hash << 5) - hash + ((bytes[i]! << 24) >> 24)) | 0;
  return hash;
}
