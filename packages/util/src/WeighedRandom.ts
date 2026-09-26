// 1:1 移植自 src/util/WeighedRandom.h（S1）。C++ 的模板函数写成泛型静态方法；带不带 totalWeight 的两个重载合成可选参数。
import type { Random } from './Random.js';

/** C++ 的嵌套类 WeighedRandom::WeighedRandomItem（也可用 WeighedRandom.WeighedRandomItem 取到） */
export class WeighedRandomItem {
  randomWeight: number;

  constructor(randomWeight = -128) {
    this.randomWeight = randomWeight;
  }

  isValid(): boolean {
    return this.randomWeight >= 0;
  }
}

type WeighedRandomItemT = WeighedRandomItem;

export class WeighedRandom {
  static readonly WeighedRandomItem = WeighedRandomItem;

  static getTotalWeight(items: readonly WeighedRandomItem[]): number {
    let totalWeight = 0;
    for (const it of items) totalWeight += it.randomWeight;
    return totalWeight;
  }

  static getRandomItem<T extends WeighedRandomItem>(random: Random, items: readonly T[], totalWeight = WeighedRandom.getTotalWeight(items)): T | null {
    let selection = random.nextInt(totalWeight);
    for (const it of items) {
      selection -= it.randomWeight;
      if (selection < 0) {
        return it;
      }
    }
    return null;
  }

  static getRandomItemIndex(random: Random, items: readonly WeighedRandomItem[], totalWeight = WeighedRandom.getTotalWeight(items)): number {
    let selection = random.nextInt(totalWeight);
    for (let i = 0; i < items.length; ++i) {
      selection -= items[i]!.randomWeight;
      if (selection < 0) {
        return i;
      }
    }
    return -1;
  }
}

// C++ 的嵌套类型：同名命名空间只放类型别名，让 WeighedRandom::WeighedRandomItem 在 TS 里照样写成 WeighedRandom.WeighedRandomItem（作类型用）；作值用走类上的同名静态属性。
// eslint-disable-next-line @typescript-eslint/no-namespace -- 只含类型，编译后不产生任何代码
export declare namespace WeighedRandom {
  type WeighedRandomItem = WeighedRandomItemT;
}
