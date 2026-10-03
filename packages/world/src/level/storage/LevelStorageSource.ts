/**
 * 1:1 移植自 src/world/level/storage/LevelStorageSource.h/.cpp（约 40 行）。
 * "存档来源"的抽象接口：一个负责列举/新建/删除/重命名整个世界目录的对象。
 * 具体实现是 ExternalFileLevelStorageSource（B6 同批移植）；MemoryLevelStorageSource
 * 在 C++ 里没有任何源文件包含它，TS 也没建。
 *
 * 【LevelSummary 是值语义的】C++ 里它是 `struct`，`LevelSummaryList` 是 `std::vector<LevelSummary>`。
 * TS 对应成 interface + 数组。注意 C++ 那边是**按值拷贝**进 vector 的，所以调用方改了传进去的
 * 那个对象不影响 vector 里的；TS 这边是引用，往数组里 push 之后就别再动那个对象。
 */
import type { LevelData } from './LevelData';
import type { LevelStorage } from './LevelStorage';

/**
 * FORWARD-DECL(ProgressListener)：对应 C++ 的 `class ProgressListener`（进度条回调，还没移植）。
 * 这里只作为 `convertLevel` 的参数类型出现，而那是个"本类不做转换、恒返回 false"的实现，
 * 从头到尾没读过它。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 前向声明，只占位
export interface ProgressListener {}

/** C++ 的 `struct LevelSummary`：世界列表里的一行 */
export interface LevelSummary {
  /** 目录名（不是显示名） */
  id: string;
  name: string;
  lastPlayed: number;
  gameType: number;
  sizeOnDisk: number;
}

/** C++ 的 `typedef std::vector<LevelSummary> LevelSummaryList` */
export type LevelSummaryList = LevelSummary[];

/**
 * C++ 的 `bool LevelSummary::operator<(const LevelSummary& rhs)`。
 *
 * 【注意是倒序】`lastPlayed > rhs.lastPlayed` —— 名字叫"小于"，比较的却是"更晚玩过"。
 * 世界列表按它排序之后，最近玩的排在最前面。
 */
export function levelSummaryLess(a: LevelSummary, b: LevelSummary): boolean {
  return a.lastPlayed > b.lastPlayed;
}

export abstract class LevelStorageSource {
  /** C++ 的 `static const std::string LevelStorageSource::TempLevelId`（LevelStorageSource.cpp:3） */
  static readonly TempLevelId = '_LastJoinedServer';

  abstract getName(): string;

  /** C++ 的虚函数带空实现（只有 ExternalFileLevelStorageSource 覆盖它） */
  getLevelList(_dest: LevelSummaryList): void {}

  abstract getDataTagFor(levelId: string): LevelData | null;
  abstract selectLevel(levelId: string, createPlayerDir: boolean): LevelStorage;
  abstract isNewLevelIdAcceptable(levelId: string): boolean;
  abstract clearAll(): void;
  abstract deleteLevel(levelId: string): void;
  abstract renameLevel(levelId: string, newLevelName: string): void;
  abstract isConvertible(levelId: string): boolean;
  abstract requiresConversion(levelId: string): boolean;
  abstract convertLevel(levelId: string, progress: ProgressListener | null): boolean;
}
