/**
 * 1:1 移植自 src/client/sound/SoundRepository.h（整个类内联在头文件里，约 30 行）。
 *
 * "游戏内名字 → 一段或多段音频"的注册表。一个名字可以挂多个**变体**
 * （比如 `step.stone` 挂了 4 个），取的时候随机挑一个 —— 这样脚步声不会听着像复读机。
 *
 * 【照抄的两处】
 *   1. `get` 用的是 **`Mth::random(n)`**（模块级、按启动时间播种的那个），
 *      **不是** `Entity.sharedRandom`。别图省事换成 `Random` 实例。
 *   2. 找不到时的日志原文是 `"Couldn't find a sound with id: %s\n"` ——
 *      照抄这句话（场景脚本要靠它认出"某个名字没注册"）。
 *
 * 【R10：`add` 的两个重载合成一个】C++ 是
 *   `add(const string&, const SoundDesc&)` 和 `add(const string&, SoundDesc&)`，
 *   后者只是想额外干一件事：**把 `sound.name` 回写成注册名**，然后转调前者。
 *   TS 没有 const 引用，两个签名在类型上完全一样、没法区分，所以合成一个 =
 *   **非 const 那一版的行为**（加进去 + 回写 name）。`SoundEngine::init` 里 100 条
 *   `sounds.add("…", SA_xxx)` 传的都是非 const 全局，走的本来就是这条路。
 *
 * 【R10：`get(name, sound)` 出参 → 返回值】C++ 是"写进出参 + 返回 bool"，
 *   TS 按仓库惯例改成 `SoundDesc | null`（先例：`RegionFile.ts` 的 `BitStream | null`）。
 */
import { LOGI } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import { SoundDesc } from './SoundDesc';

export class SoundRepository {
  /** C++ `std::map<std::string, SoundList> map;`（`SoundList` = `vector<SoundDesc>`） */
  private readonly map = new Map<string, SoundDesc[]>();

  /**
   * C++ `bool get(const std::string& name, SoundDesc& sound)`
   * —— 找到就**随机挑一个变体**返回；找不到记一行日志并返回 null。
   */
  get(name: string): SoundDesc | null {
    const list = this.map.get(name);
    if (list === undefined) {
      LOGI(`Couldn't find a sound with id: ${name}\n`);
      return null;
    }
    return list[Mth.random(list.length)]!;
  }

  /**
   * C++ `void add(const std::string& name, SoundDesc& sound)`（非 const 那版，见文件头）
   */
  add(name: string, sound: SoundDesc): void {
    if (!sound.isValid()) return;

    const list = this.map.get(name);
    if (list === undefined) {
      // C++：造一个新 list、push 进去、insert 进 map
      this.map.set(name, [sound]);
    } else {
      list.push(sound);
    }

    sound.name = name;
  }

  /** 只给测试看：某个名字挂了几个变体 */
  _variantsForTest(name: string): number {
    return this.map.get(name)?.length ?? 0;
  }
}
