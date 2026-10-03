/**
 * 1:1 移植自 src/world/level/storage/ExternalFileLevelStorageSource.cpp/.h（193 行）。
 * 一个存档"来源"：管着一整个世界目录（列举、挑一个进来、删掉、改名）。
 *
 * 【ADAPTED(Web)：目录操作】C++ 这里用的是 POSIX 的 `opendir`/`readdir`/`closedir`、
 * `dirent::d_type == DT_DIR`、C 的 `remove`，以及 `platform/file.h` 里的 `DeleteDirectory`。
 * 浏览器没有这些，全都落到 VirtualFS 上：
 *   - `DeleteDirectory(path)` → `vfs.deleteDirectory(path)`（**B1 就照它的语义造好了**，
 *     包括"不是真递归、删不掉非空子目录"那条怪癖 —— deleteLevel 的兜底分支正靠它）
 *   - `opendir/readdir` → `vfs.listDir(path)` + `vfs.isDirectory`（见 getLevelList 里那条注释）
 *   - `remove(p)` → `vfs.remove(p)`
 *   - `_access(p, 0)` → `vfs.exists(p)`（mode 0 就是查存在性，B5a-1 已经这么对过一次）
 *
 * 【两处偏离，都是 ADAPTED(Web) 逼出来的，不是"顺手改"】
 *   1. `_errno()`：VirtualFS 用返回值表示成败、没有错误码可取，所以那句日志里少了错误码。
 *      （FolderMethods 里同样标了 `OMIT(Web): int _errno()`。）
 *   2. readdir 会把 `.` 和 `..` 也交出来（它们也是目录），C++ 就照样拿它们去拼路径 ——
 *      `<basePath>/./level.dat` 由**操作系统**解析回 `<basePath>/level.dat`。VirtualFS 的
 *      路径规范化明确不解析 `.` / `..`，所以那两次探测在这里必然打不开、什么也不会加。
 *      结果一样（真实条目里不会出现 `.`），但机制不同。见 getLevelList 里那段注释。
 */
import { LOGI, getVfs } from '@mcpe/platform';
import { Util } from '@mcpe/util';
import { createTree } from './FolderMethods';
import { ExternalFileLevelStorage } from './ExternalFileLevelStorage';
import { LevelData } from './LevelData';
import type { LevelStorage } from './LevelStorage';
import {
  LevelStorageSource,
  type LevelSummaryList,
  type ProgressListener,
} from './LevelStorageSource';

/**
 * C++ 的 `static const char ILLEGAL_FILE_CHARACTERS[]`（ExternalFileLevelStorageSource.cpp:3）。
 *
 * 【注意有 16 项，不是 15】初始列表里写了 15 个字符，但 C++ 的数组还会自动补一个结尾的 `'\0'`，
 * 所以 `sizeof(...)/sizeof(char)` 是 **16**，那个循环跑 16 次 —— 最后一次把字符串里的
 * 内嵌 NUL 也替换掉（`std::string(1, '\0')` 是长度 1、内容为 NUL 的字符串）。
 * 这里显式写出第 16 个，免得"少一项"看不出来。
 */
const ILLEGAL_FILE_CHARACTERS = [
  '/',
  '\n',
  '\r',
  '\t',
  '\0',
  '\f',
  '`',
  '?',
  '*',
  '\\',
  '<',
  '>',
  '|',
  '"',
  ':',
  '\0', // ← C++ 数组自动补的那个结尾符，循环会跑到它
];

/**
 * C++ 的 `static std::string getUniqueLevelName(const LevelSummaryList& levels, const std::string& level)`
 * （文件内的自由函数，不是成员）。重名就一直加 `-`：`foo` → `foo-` → `foo--` …
 */
function getUniqueLevelName(levels: LevelSummaryList, level: string): string {
  const set = new Set<string>();
  for (let i = 0; i < levels.length; ++i) set.add(levels[i]!.id);
  let s = level;
  while (set.has(s)) s += '-';
  return s;
}

export class ExternalFileLevelStorageSource extends LevelStorageSource {
  private basePath: string;
  private tmpBasePath: string;
  private _hasTempDirectory: boolean;

  constructor(externalPath: string, temporaryFilesPath: string) {
    super();
    this._hasTempDirectory = temporaryFilesPath !== externalPath;

    const p0 = '/games';
    const p1 = '/com.mojang';
    const p2 = '/minecraftWorlds';
    const tree = [p0, p1, p2];
    const treeLength = tree.length;
    createTree(externalPath, tree, treeLength);
    if (this.hasTempDirectory()) createTree(temporaryFilesPath, tree, treeLength);

    this.basePath = externalPath + p0 + p1 + p2;
    this.tmpBasePath = temporaryFilesPath + p0 + p1 + p2;
  }

  private hasTempDirectory(): boolean {
    return this._hasTempDirectory;
  }

  /**
   * 看 `basePath/<dirName>` 下有没有能读的 level.dat，有就往 dest 里塞一条。
   *
   * 【读坏了也会塞】`readLevelData` 是"两个文件都打不开才返回 false"，所以"目录在、level.dat
   * 有但内容是坏的"这条路会塞进去一条**全默认值**的摘要（名字空、lastPlayed 0）。照抄。
   */
  private addLevelSummaryIfExists(dest: LevelSummaryList, dirName: string): void {
    const directory = this.basePath + '/' + dirName;
    const levelData = new LevelData();
    if (ExternalFileLevelStorage.readLevelData(directory, levelData)) {
      dest.push({
        id: dirName,
        name: levelData.levelName,
        lastPlayed: levelData.getLastPlayed(),
        sizeOnDisk: levelData.getSizeOnDisk(),
        gameType: levelData.getGameType(),
      });
    }
  }

  /**
   * 把 basePath 下的每个子目录都当成一个世界试一次。
   *
   * 【C++ 那边连 `.` 和 `..` 也试】`readdir` 会把这两个项交出来，而它们同样是目录
   * （`d_type == DT_DIR`），于是 C++ 会去拼 `<basePath>/./level.dat` 和 `<basePath>/../level.dat`
   * —— 由**操作系统**把这俩解析成 `<basePath>/level.dat` 和它的上一级。理论上如果有人把
   * level.dat 直接放在 minecraftWorlds 那一层，C++ 会多列出一个 id 叫 `"."` 的世界。
   * VirtualFS 的路径规范化不解析 `.` / `..`，那两次探测必然打不开、什么都不会加，
   * 所以这里干脆不试 —— 结果一样，机制不同（见文件头那处偏离）。
   *
   * 【顺序不定】C++ 用的是文件系统的 readdir 顺序，本来就不保证。要稳定的顺序得自己排
   * （`levelSummaryLess` 就是干这个的，倒序）。
   */
  override getLevelList(dest: LevelSummaryList): void {
    const vfs = getVfs();
    if (!vfs.isDirectory(this.basePath)) {
      // ADAPTED(Web): LOGI("Error listing base folder %s: %d", basePath, _errno()); —— 少了错误码
      //   VirtualFS 用返回值表示成败、没有 errno 可取（见 FolderMethods 里那条 OMIT(Web)）。
      LOGI(`Error listing base folder ${this.basePath}: \n`);
      return;
    }
    // ADAPTED(Web): C++ 的 readdir 还会交出 "." 和 ".."，它们同样是目录、照样被送去
    //   addLevelSummaryIfExists，由操作系统把 `<basePath>/./level.dat` 解析回
    //   `<basePath>/level.dat`。VirtualFS 的路径规范化明确不解析 . 和 ..，那两次探测在这里
    //   必然打不开、什么也不会加 —— 结果一样（真实条目里不会出现 "."），所以不试。
    for (const dirName of vfs.listDir(this.basePath)) {
      // C++ 是 `dirp->d_type == DT_DIR` —— 只认目录
      if (vfs.isDirectory(this.basePath + '/' + dirName)) {
        this.addLevelSummaryIfExists(dest, dirName);
      }
    }
  }

  /**
   * C++ 的 `selectLevel(levelId, createPlayerDir)`。
   *
   * 【createPlayerDir 从头到尾没被读过】真正建 players/ 的是 ExternalFileLevelStorage 的构造函数。
   * 照抄。
   */
  override selectLevel(levelId: string, _createPlayerDir: boolean): LevelStorage {
    return new ExternalFileLevelStorage(levelId, this.getFullPath(levelId));
  }

  /**
   * 删掉整个世界目录；`DeleteDirectory` 失败就退而求其次，逐个删三个文件。
   *
   * 【兜底分支不是死代码】`DeleteDirectory` **不是真递归**（见 VirtualFS 里那段注释）：
   * 它把目录里每一项交给 `remove`，而 `remove` 删不掉非空子目录。所以只要世界目录里还有
   * 像 `region/` 这种带文件的子目录，整目录删就会失败，走到下面三个 remove。
   * 注意这三个 remove **不会删掉那些子目录**，所以这种情况下是"删了一部分"。
   */
  override deleteLevel(levelId: string): void {
    const path = this.getFullPath(levelId);
    const vfs = getVfs();
    if (!vfs.deleteDirectory(path)) {
      vfs.remove(path + '/chunks.dat');
      vfs.remove(path + '/player.dat');
      vfs.remove(path + '/level.dat');
    }
  }

  /**
   * 改世界的名字（目录改名 + 把 level.dat 里的 LevelName 换掉）。
   *
   * 【原样保留：那个 if 是个空块】C++ 原文是
   *     bool couldRename = false;
   *     if (hasTempDirectory() && isTempFile) {
   *     }
   *       couldRename = couldRename || rename(_renFULLPATH(oldLevelId_), _renFULLPATH(levelId)) == 0;
   * 花括号里**什么都没有** —— 缩进看着像"改名在 if 里面"，其实它在外面，无条件执行。
   * 所以临时世界（`_LastJoinedServer`，B7 联网存档用的）也一样走 `basePath`：
   * `_renFULLPATH` 这个宏只拼 basePath，**根本不看 tmpBasePath**。上面那个 `isTempFile`
   * 算了但除了这个空条件没人用。照抄，别"顺手补上" tmpBasePath 那一支。
   *
   * 【名字的两套处理】目录名走 `stringTrim` + 剔非法字符 + 去重（`levelId`），而写回 level.dat 的
   * 显示名用的是**原封不动的** `newLevelName_` —— 前后空格、斜杠都留着。照抄。
   */
  override renameLevel(oldLevelId: string, newLevelName: string): void {
    const isTempFile = LevelStorageSource.TempLevelId === oldLevelId;
    const oldFolder = this.getFullPath(oldLevelId);
    const vfs = getVfs();
    if (!vfs.exists(oldFolder)) {
      // C++ 是 `_access(oldFolder.c_str(), 0) != 0`
      LOGI(`Couldn't access ${oldFolder}\n`);
      return;
    }

    const levelName = Util.stringTrim(newLevelName);
    let levelId = levelName;
    for (let i = 0; i < ILLEGAL_FILE_CHARACTERS.length; ++i)
      levelId = Util.stringReplace(levelId, ILLEGAL_FILE_CHARACTERS[i]!, '');

    const levels: LevelSummaryList = [];
    this.getLevelList(levels);
    levelId = getUniqueLevelName(levels, levelId);

    let couldRename = false;
    if (this.hasTempDirectory() && isTempFile) {
      // 【空块，原样保留】见函数头。这里原本可能想对临时世界做点别的（比如搬到 tmpBasePath），
      // 但 C++ 里就是空的，改名在下面无条件跑。
    }
    couldRename =
      couldRename || vfs.rename(this.renFullPath(oldLevelId), this.renFullPath(levelId));

    if (!couldRename) levelId = oldLevelId;

    const levelData = new LevelData();
    ExternalFileLevelStorage.readLevelData(this.renFullPath(levelId), levelData);
    levelData.setLevelName(newLevelName);
    ExternalFileLevelStorage.saveLevelDataTo(this.renFullPath(levelId), levelData, null);
  }

  override getName(): string {
    return 'External File Level Storage';
  }

  /** C++ 恒返回 NULL */
  override getDataTagFor(_levelId: string): LevelData | null {
    return null;
  }

  /** C++ 恒返回 true —— 取名字合不合法完全不管 */
  override isNewLevelIdAcceptable(_levelId: string): boolean {
    return true;
  }

  /** C++ 的空实现：`void clearAll() {}` */
  override clearAll(): void {}

  /** C++ 恒返回 false（这个来源不需要转换） */
  override isConvertible(_levelId: string): boolean {
    return false;
  }

  /** C++ 恒返回 false */
  override requiresConversion(_levelId: string): boolean {
    return false;
  }

  /** C++ 恒返回 false */
  override convertLevel(_levelId: string, _progress: ProgressListener | null): boolean {
    return false;
  }

  /** C++ 的 `std::string getFullPath(const std::string& levelId)` */
  private getFullPath(levelId: string): string {
    return (
      (LevelStorageSource.TempLevelId === levelId ? this.tmpBasePath : this.basePath) +
      '/' +
      levelId
    );
  }

  /**
   * C++ 的 `#define _renFULLPATH(s) ((basePath + "/" + s).c_str())`。
   * **只用 basePath** —— 跟上面的 getFullPath 不是一回事。
   */
  private renFullPath(s: string): string {
    return this.basePath + '/' + s;
  }
}
