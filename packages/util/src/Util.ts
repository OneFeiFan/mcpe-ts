/**
 * ADAPTED：C++ 的 namespace Util 分散在两个头文件里——Mth.h（vector/set 工具模板 removeAll、remove）
 * 与 StringUtils.h（字符串函数）。TS 在这里汇总成一个冻结对象，调用方式与 C++ 一致：
 *   C++  Util::remove(players, p)   Util::startsWith(key, path)   Util::hashCode(name)
 *   TS   Util.remove(players, p)    Util.startsWith(key, path)    Util.hashCode(name)
 * 以后若再有头文件往 namespace Util 里加函数，也并到这里，不要另起同名导出（barrel 会冲突）。
 *
 * 按手册的三档规则：vector 版 removeAll、remove 与 JS 内置方法语义不同，保留原实现；
 * 字符串函数各自的处理见 StringUtils.ts（hashCode、stringTrim 精确，startsWith 直接用 JS）。
 *
 * removeAll 在 C++ 里有两个重载，这里按第一个参数的类型分派：
 *   Util.removeAll(list, toRemove)        vector 版，返回删除个数
 *   s = Util.removeAll(s, rep, repCount)  string 版，C++ 原地修改，TS 返回新字符串
 */
import { utilRemove, utilRemoveAll } from './Mth.js';
import { hashCode, removeAllString, startsWith, stringReplace, stringTrim } from './StringUtils.js';

function removeAll<T>(superset: T[], toRemove: readonly T[]): number;
function removeAll(s: string, rep: readonly string[], repCount: number): string;
function removeAll(a: unknown, b: unknown, c?: number): number | string {
  return typeof a === 'string'
    ? removeAllString(a, b as readonly string[], c ?? 0)
    : utilRemoveAll(a as unknown[], b as readonly unknown[]);
}

export const Util = Object.freeze({
  // Mth.h
  removeAll,
  remove: utilRemove,
  // StringUtils.h
  startsWith,
  stringReplace,
  stringTrim,
  hashCode,
});
