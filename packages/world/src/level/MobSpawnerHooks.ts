/**
 * ADAPTED(ESM)：MobSpawner 的注入槽（运行时叶子模块，只用 import type，编译后不产生值导入）。
 * RandomLevelSource 需要调 MobSpawner::postProcessSpawnMobs（RandomLevelSource.cpp:507-508），
 * 但值导入 MobSpawner 会经 MobFactory → 各种生物类形成加载循环；
 * 由 MobSpawner 模块加载时把函数填进来（同 PITFALLS 第 31 条）。
 */
import type { Random } from '@mcpe/util';
import type { Biome } from './biome/Biome';
import type { Level } from './Level';

export const MobSpawnerHooks: {
  postProcessSpawnMobs:
    | ((
        level: Level,
        biome: Biome,
        xo: number,
        zo: number,
        w: number,
        h: number,
        random: Random,
      ) => void)
    | null;
} = { postProcessSpawnMobs: null };
