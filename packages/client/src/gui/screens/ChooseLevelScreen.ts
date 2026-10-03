/**
 * 1:1 移植自 src/client/gui/screens/ChooseLevelScreen.h 与 .cpp（B8e）。
 *
 * 一个只有两件事的基类：init 时把世界列表读进来，外加一个"名字撞了就往后加横线"的去重
 * （`World` → `World-` → `World--` …）。目前唯一的子类是 `SimpleChooseLevelScreen`（新建世界界面）。
 *
 * 注意它和 `SelectWorldScreen::loadLevelSource` **是两套几乎一样的代码**（C++ 里就是两份），
 * 只有一个差别：这里不做 `TempLevelId` 的过滤。照抄，不抽公共函数。
 */
import type { LevelSummaryList } from '@mcpe/world';
import { levelSummaryLess } from '@mcpe/world';
import { Screen } from '../Screen';

export class ChooseLevelScreen extends Screen {
  /** C++ 里是 private；子类不用它，只有 getUniqueLevelName 自己看 */
  private levels: LevelSummaryList = [];

  protected override initScreen(): void {
    this.loadLevelSource();
  }

  private loadLevelSource(): void {
    const levelSource = this.minecraft.getLevelSource()!;
    levelSource.getLevelList(this.levels);
    // 和 SelectWorldScreen 一样：C++ 的 std::sort 不稳定（同 lastPlayed 的次序不保证），
    // JS 的 sort 是稳定的，结果只会更确定。
    this.levels.sort((a, b) => (levelSummaryLess(a, b) ? -1 : levelSummaryLess(b, a) ? 1 : 0));
  }

  protected getUniqueLevelName(level: string): string {
    const set = new Set<string>();
    for (let i = 0; i < this.levels.length; ++i) set.add(this.levels[i]!.id);
    let s = level;
    while (set.has(s)) s += '-';
    return s;
  }
}
